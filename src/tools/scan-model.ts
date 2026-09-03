/**
 * Answering "is this model file safe to load?" before ComfyUI loads it.
 *
 * A `.ckpt`, `.pt`, `.pth` or `.bin` is a pickle, and `torch.load` on a pickle
 * imports and calls whatever the file names. That has been the way to get code
 * onto a machine through a model share since the format existed, and neither
 * ComfyUI nor comfy-cli checks: `download_model` fetches, and the next graph
 * that names the file loads it.
 *
 * `.safetensors` was designed to close this - it is a length-prefixed JSON
 * header and raw tensor bytes, with no execution path at all - so the most
 * useful thing this tool often does is say "there is a .safetensors of this
 * beside it, use that instead".
 *
 * WHAT A CLEAN RESULT MEANS. "No known-dangerous import" is not "safe". The
 * signature lists are the published exploit primitives, and a novel one is by
 * definition not on them. Treat `safe` as "nothing known is wrong here",
 * `suspicious` as "read the imports yourself before loading", and `dangerous`
 * as settled.
 */

import { z } from "zod";
import { open, stat } from "fs/promises";
import type { FileHandle } from "fs/promises";
import { existsSync } from "fs";
import { basename, extname, resolve } from "path";

import { ToolError } from "../utils/errors.js";
import { responseFormatField } from "../utils/response.js";
import { looksLikePickle, scanPickle, PickleScan } from "./scan/pickle.js";
import { listZipEntries, looksLikeZip, readZipEntry, ZipReadError } from "./scan/zip.js";
import {
  classifyImport,
  danglingDangerousConstants,
  Severity,
} from "./scan/signatures.js";

/**
 * Extensions this tool will open.
 *
 * A path allowlist, not a convenience: the tool takes an absolute path from
 * the agent and opens it, so without this it is a general local-file reader.
 * It reports import names and never file contents, but the bound belongs here
 * anyway - the same reason `extract_workflow` accepts only `.png`.
 */
const MODEL_EXTENSIONS = new Set([
  ".ckpt",
  ".pt",
  ".pth",
  ".bin",
  ".pkl",
  ".pickle",
  ".safetensors",
  ".sft",
  ".gguf",
]);

/** How much of a raw pickle to read. The stream is at the front of the file. */
const MAX_PICKLE_BYTES = 32 * 1024 * 1024;
/** Bytes needed to tell the formats apart. */
const HEAD_BYTES = 4096;
/**
 * Cap on a safetensors header before it is parsed. Real headers run to a few
 * MB even on large models; past this the length is more likely crafted than
 * real, and refusing routes the file to the pickle walk rather than trusting
 * it.
 */
const MAX_SAFETENSORS_HEADER_BYTES = 16 * 1024 * 1024;
/** Entries reported per archive; a checkpoint has one per tensor. */
const MAX_ENTRIES_REPORTED = 20;
/**
 * Pickle members walked in one archive.
 *
 * torch.save writes exactly one, but the format does not require that and a
 * scanner that reads only the first is trivially evaded. Past this the file
 * is not a checkpoint, and the ones not read are reported rather than
 * quietly dropped.
 */
const MAX_PICKLE_MEMBERS = 8;

/**
 * Members that unpickle when something loads this archive.
 *
 * `data.pkl` is what torch.save writes; TorchScript writes `constants.pkl`
 * beside compiled code, and nothing stops a hand-built archive naming its
 * pickle anything at all. `.pkl` is an accepted extension for this tool, so
 * a ZIP holding `evil.pkl` used to scan clean on the grounds that it had no
 * `data.pkl`.
 */
const PICKLE_MEMBER = /\.(?:pkl|pickle)$/i;

/**
 * TorchScript's compiled Python. `torch.load` does not run it, but
 * `torch.jit.load` compiles it, so an archive carrying it is not the inert
 * bag of tensors that "nothing here unpickles" implied.
 */
const CODE_MEMBER = /(?:^|\/)code\/.*\.py$/i;
/** Ordinary imports listed before the rest are counted instead. */
const MAX_BENIGN_LISTED = 40;

export const scanModelSchema = z
  .object({
    path: z
      .string()
      .describe(
        "Absolute path to the model file to scan. Must be one of " +
          `${[...MODEL_EXTENSIONS].join(", ")} - this tool opens local files and will not read anything else.`
      ),
    response_format: responseFormatField,
  })
  .strict();

export type ScanModelInput = z.infer<typeof scanModelSchema>;

export type ModelFileFormat =
  | "safetensors"
  | "gguf"
  | "pickle"
  | "torch-zip"
  | "unrecognised";

export type ScanVerdict = "safe" | "suspicious" | "dangerous";

export interface ScanFinding {
  severity: Severity;
  /** "posix.system", or the bare module where the pairing could not be resolved. */
  target: string;
  reason: string;
}

export interface ScanModelResult {
  path: string;
  format: ModelFileFormat;
  verdict: ScanVerdict;
  /** One line saying what the verdict means for this file. */
  summary: string;
  findings: ScanFinding[];
  /** Imports that matched nothing in either list, capped. */
  ordinaryImports: string[];
  ordinaryImportCount: number;
  /** Set when the pickle walk stopped before the stream ended. */
  incomplete?: string;
  /** For a torch ZIP: which member carried the pickle, and what else is inside. */
  pickleEntry?: string;
  /** Every pickle member walked, when the archive holds more than one. */
  pickleEntries?: string[];
  /** TorchScript source members. Not unpickled, but not inert either. */
  codeEntries?: string[];
  entryCount?: number;
  /** Present when a .safetensors of the same name sits beside a pickle. */
  saferAlternative?: string;
}

export class ModelFileError extends ToolError {}

/** A `.safetensors` beside `foo.ckpt` makes the whole question go away. */
function saferAlternativeFor(path: string): string | undefined {
  const withoutExtension = path.slice(0, path.length - extname(path).length);
  for (const candidate of [`${withoutExtension}.safetensors`, `${withoutExtension}.sft`]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Is this a safetensors file?
 *
 * The format opens with a little-endian u64 header length followed by that
 * many bytes of JSON. Checking that the JSON parses is what separates it from
 * a file that merely starts with eight plausible bytes - and it has to be an
 * actual parse, not a look at the first byte. A pickle prefixed with a
 * plausible length and a '{' answered this yes, and because scanModel tests
 * safetensors first and returns early, the walk never ran: a 46-byte file
 * naming posix.system + REDUCE reported "safe, nothing to scan".
 *
 * Reads past `head` when it must, because HEAD_BYTES is 4096 and a real header
 * is routinely larger. A file that fails any of these checks falls through to
 * the ZIP and pickle branches, which is the safe direction: the cost of being
 * wrong here is a scan that did not happen.
 */
async function isSafetensors(
  handle: FileHandle,
  head: Buffer,
  fileSize: number
): Promise<boolean> {
  if (head.length < 9) return false;
  const headerLength = Number(head.readBigUInt64LE(0));
  if (headerLength <= 0 || headerLength + 8 > fileSize) return false;
  // Cheap reject before spending a read: the header is a JSON object.
  if (head[8] !== 0x7b) return false; // '{'
  if (headerLength > MAX_SAFETENSORS_HEADER_BYTES) return false;

  const header = Buffer.alloc(headerLength);
  const { bytesRead } = await handle.read(header, 0, headerLength, 8);
  if (bytesRead !== headerLength) return false;

  try {
    const parsed = JSON.parse(header.toString("utf-8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function isGguf(head: Buffer): boolean {
  return head.length >= 4 && head.subarray(0, 4).toString("latin1") === "GGUF";
}

/** Turn a walked pickle into findings. */
function findingsFor(scan: PickleScan): {
  findings: ScanFinding[];
  ordinary: string[];
  ordinaryCount: number;
} {
  const findings: ScanFinding[] = [];
  const seen = new Set<string>();
  const ordinary: string[] = [];

  for (const imported of scan.imports) {
    const target = `${imported.module}.${imported.name}`;
    if (seen.has(target)) continue;
    seen.add(target);

    const verdict = classifyImport(imported.module, imported.name);
    if (verdict) {
      findings.push({ severity: verdict.severity, target, reason: verdict.reason });
    } else {
      ordinary.push(target);
    }
  }

  // The backstop for a stream that deliberately breaks STACK_GLOBAL's pairing:
  // the module name is still in the file as a string constant.
  const alreadyFlagged = new Set(findings.map((f) => f.target.split(".")[0]));
  for (const module of danglingDangerousConstants(scan.constants)) {
    if (alreadyFlagged.has(module)) continue;
    findings.push({
      severity: "dangerous",
      target: module,
      reason:
        `the name '${module}' appears as a string constant without a resolvable import. ` +
        "A pickle that assembles its imports on the stack to hide them is doing so on purpose",
    });
  }

  findings.sort(bySeverity);

  return {
    findings,
    ordinary: ordinary.slice(0, MAX_BENIGN_LISTED),
    ordinaryCount: ordinary.length,
  };
}

/** Dangerous first; the caller reads top down and may stop early. */
function bySeverity(a: ScanFinding, b: ScanFinding): number {
  return a.severity === b.severity ? 0 : a.severity === "dangerous" ? -1 : 1;
}

/**
 * Fold several walked members into one scan.
 *
 * The verdict is about the archive, not about a member, so imports and
 * constants pool - including for the dangling-constant backstop, which is
 * why constants are merged rather than scanned per member. Truncation is
 * sticky: one member that stopped early means the answer covers less than
 * the file, whatever the others did.
 */
function mergeScans(scans: PickleScan[], unread: string[]): PickleScan {
  const merged: PickleScan = {
    imports: scans.flatMap((s) => s.imports),
    constants: [...new Set(scans.flatMap((s) => s.constants))],
    calls: scans.reduce((sum, s) => sum + s.calls, 0),
    truncated: false,
  };

  const stopped = scans.find((s) => s.truncated);
  if (stopped) {
    merged.truncated = true;
    merged.stoppedBecause = stopped.stoppedBecause;
  }
  if (unread.length) {
    merged.truncated = true;
    merged.stoppedBecause =
      `${unread.length} further pickle member${unread.length === 1 ? "" : "s"} ` +
      `went unread past the cap of ${MAX_PICKLE_MEMBERS} (${unread.join(", ")})` +
      (merged.stoppedBecause ? `; ${merged.stoppedBecause}` : "");
  }

  return merged;
}

function verdictFor(findings: ScanFinding[]): ScanVerdict {
  if (findings.some((f) => f.severity === "dangerous")) return "dangerous";
  if (findings.length) return "suspicious";
  return "safe";
}

function summaryFor(
  result: Omit<ScanModelResult, "summary">,
  scan?: PickleScan
): string {
  const name = basename(result.path);

  if (result.format === "safetensors") {
    return `${name} is a safetensors file: a JSON header and raw tensor bytes, with no code path to execute. Nothing to scan.`;
  }
  if (result.format === "gguf") {
    return `${name} is GGUF: a binary tensor container with no embedded code. Nothing to scan.`;
  }

  const dangerous = result.findings.filter((f) => f.severity === "dangerous");
  const alternative = result.saferAlternative
    ? ` A safetensors build sits beside it at ${result.saferAlternative} - load that instead.`
    : "";

  if (dangerous.length) {
    return (
      `${name} names ${dangerous.length} import${dangerous.length === 1 ? "" : "s"} ` +
      `that would run code or reach the network when torch.load unpickles it. Do not load it.${alternative}`
    );
  }
  if (result.findings.length) {
    return (
      `${name} names imports or members that are unusual in a tensor file but not proof of ` +
      `anything - read them before loading.${alternative}`
    );
  }

  const incomplete = scan?.truncated
    ? ` The walk did not reach the end of the stream (${scan.stoppedBecause}), so this covers only what was read.`
    : "";
  return (
    `${name} names nothing on the known-dangerous list. That is not the same as safe: ` +
    `the list is of published exploit primitives, and a novel one is not on it.${incomplete}${alternative}`
  );
}

export async function scanModel(input: ScanModelInput): Promise<ScanModelResult> {
  const path = resolve(input.path);
  const extension = extname(path).toLowerCase();

  if (!MODEL_EXTENSIONS.has(extension)) {
    throw new ModelFileError(
      `Refusing to open ${extension || "a file with no extension"}: this tool reads model files only.`,
      `Accepted extensions: ${[...MODEL_EXTENSIONS].join(", ")}.`
    );
  }
  if (!existsSync(path)) {
    throw new ModelFileError(
      `No such file: ${path}`,
      "The official Comfy MCP's search_models lists what is installed and where."
    );
  }

  const { size } = await stat(path);
  const handle = await open(path, "r");
  try {
    const head = Buffer.alloc(Math.min(HEAD_BYTES, size));
    if (head.length) await handle.read(head, 0, head.length, 0);

    const saferAlternative = saferAlternativeFor(path);

    if (await isSafetensors(handle, head, size)) {
      const base = {
        path,
        format: "safetensors" as const,
        verdict: "safe" as const,
        findings: [],
        ordinaryImports: [],
        ordinaryImportCount: 0,
      };
      return { ...base, summary: summaryFor(base) };
    }

    if (isGguf(head)) {
      const base = {
        path,
        format: "gguf" as const,
        verdict: "safe" as const,
        findings: [],
        ordinaryImports: [],
        ordinaryImportCount: 0,
      };
      return { ...base, summary: summaryFor(base) };
    }

    if (looksLikeZip(head)) {
      let entries;
      try {
        entries = await listZipEntries(handle, size);
      } catch (error) {
        throw new ModelFileError(
          `${basename(path)} starts like a ZIP but its directory could not be read: ` +
            `${error instanceof Error ? error.message : String(error)}`,
          "A truncated or partially downloaded checkpoint reads this way. Re-download it and scan again."
        );
      }

      // torch.save writes one "<prefix>/data.pkl", but nothing about the
      // format requires that: TorchScript writes constants.pkl beside
      // compiled code, and a hand-built archive can name its pickle whatever
      // it likes. Every pickle member is walked, data.pkl first so it stays
      // the one reported as `pickleEntry`.
      const isPrimary = (name: string) => name === "data.pkl" || name.endsWith("/data.pkl");
      const pickleMembers = entries
        .filter((e) => PICKLE_MEMBER.test(e.name))
        .sort((a, b) => Number(isPrimary(b.name)) - Number(isPrimary(a.name)));

      const codeMembers = entries.filter((e) => CODE_MEMBER.test(e.name));
      const codeEntries = codeMembers.slice(0, MAX_ENTRIES_REPORTED).map((e) => e.name);
      const codeFindings: ScanFinding[] = codeEntries.map((name) => ({
        severity: "suspicious" as const,
        target: name,
        reason:
          "TorchScript source. torch.load does not run it, but torch.jit.load compiles it, " +
          "so this archive carries code whatever its pickles say",
      }));

      if (!pickleMembers.length) {
        const base = {
          path,
          format: "torch-zip" as const,
          verdict: verdictFor(codeFindings),
          findings: codeFindings,
          ordinaryImports: [],
          ordinaryImportCount: 0,
          entryCount: entries.length,
          ...(codeEntries.length ? { codeEntries } : {}),
        };
        const members = entries
          .slice(0, MAX_ENTRIES_REPORTED)
          .map((e) => e.name)
          .join(", ");
        return {
          ...base,
          saferAlternative,
          summary: codeFindings.length
            ? `${basename(path)} is a ZIP of ${entries.length} members with nothing to unpickle, ` +
              `but it carries ${codeMembers.length} TorchScript source member${
                codeMembers.length === 1 ? "" : "s"
              } that torch.jit.load would compile. Members: ${members}.`
            : `${basename(path)} is a ZIP of ${entries.length} members with no pickle in it, so ` +
              `nothing here unpickles. Members: ${members}.`,
        };
      }

      const walked = pickleMembers.slice(0, MAX_PICKLE_MEMBERS);
      const scans: PickleScan[] = [];
      for (const member of walked) {
        let pickleBytes: Buffer;
        try {
          pickleBytes = await readZipEntry(handle, member, MAX_PICKLE_BYTES);
        } catch (error) {
          throw new ModelFileError(
            `Could not read ${member.name}: ${
              error instanceof ZipReadError ? error.message : String(error)
            }`,
            "Scanning cannot say anything about this file. Treat it as unscanned rather than clean."
          );
        }
        scans.push(scanPickle(pickleBytes));
      }

      const scan = mergeScans(
        scans,
        pickleMembers.slice(MAX_PICKLE_MEMBERS).map((e) => e.name)
      );
      const { findings, ordinary, ordinaryCount } = findingsFor(scan);
      const all = [...findings, ...codeFindings].sort(bySeverity);
      const names = walked.map((e) => e.name);
      const base = {
        path,
        format: "torch-zip" as const,
        verdict: verdictFor(all),
        findings: all,
        ordinaryImports: ordinary,
        ordinaryImportCount: ordinaryCount,
        incomplete: scan.truncated ? scan.stoppedBecause : undefined,
        pickleEntry: names[0],
        ...(names.length > 1 ? { pickleEntries: names } : {}),
        ...(codeEntries.length ? { codeEntries } : {}),
        entryCount: entries.length,
        saferAlternative,
      };
      return { ...base, summary: summaryFor(base, scan) };
    }

    if (looksLikePickle(head)) {
      const length = Math.min(size, MAX_PICKLE_BYTES);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, 0);

      const scan = scanPickle(buffer);
      const { findings, ordinary, ordinaryCount } = findingsFor(scan);
      const base = {
        path,
        format: "pickle" as const,
        verdict: verdictFor(findings),
        findings,
        ordinaryImports: ordinary,
        ordinaryImportCount: ordinaryCount,
        incomplete: scan.truncated ? scan.stoppedBecause : undefined,
        saferAlternative,
      };
      return { ...base, summary: summaryFor(base, scan) };
    }

    throw new ModelFileError(
      `${basename(path)} is not a format this scanner recognises - not safetensors, GGUF, a ZIP, or a pickle stream.`,
      "Treat it as unscanned rather than clean. A partially downloaded file is the usual cause."
    );
  } finally {
    await handle.close();
  }
}

export function renderScanModel(result: ScanModelResult): string {
  const badge =
    result.verdict === "dangerous"
      ? "DANGEROUS"
      : result.verdict === "suspicious"
        ? "SUSPICIOUS"
        : "no known-dangerous imports";

  const lines = [
    `# Scan: ${basename(result.path)}`,
    "",
    `**${badge}** — ${result.format}`,
    "",
    result.summary,
  ];

  if (result.findings.length) {
    lines.push("", "## Findings", "");
    for (const finding of result.findings) {
      lines.push(`- **${finding.target}** (${finding.severity}) — ${finding.reason}`);
    }
  }

  if (result.ordinaryImportCount) {
    const shown = result.ordinaryImports.join(", ");
    const rest =
      result.ordinaryImportCount > result.ordinaryImports.length
        ? ` (+${result.ordinaryImportCount - result.ordinaryImports.length} more)`
        : "";
    lines.push("", `Ordinary imports: ${shown}${rest}`);
  }

  if (result.incomplete) {
    lines.push("", `Walk stopped early: ${result.incomplete}. Findings cover only what was read.`);
  }

  return lines.join("\n");
}
