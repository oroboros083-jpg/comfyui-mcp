#!/usr/bin/env node
/**
 * Link comfyui-tabbridge/ into ComfyUI's custom_nodes.
 *
 * Git stores the directory but never the link - a clone that could create
 * things outside its own tree would be a code-execution vector - so this is a
 * post-clone step by design rather than by omission. Running it is the whole
 * of that step.
 *
 *   node scripts/link-tabbridge.mjs            create or confirm the link
 *   node scripts/link-tabbridge.mjs --check    report only, change nothing
 *   node scripts/link-tabbridge.mjs --base-dir <path>
 *
 * Resolution order for ComfyUI's base directory: --base-dir, then
 * COMFYUI_BASE_DIR, then whatever a running ComfyUI reports in its own argv,
 * then the usual install locations.
 */

import { lstatSync, existsSync, readlinkSync, symlinkSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(REPO, "comfyui-tabbridge");
const LINK_NAME = "ComfyUI-TabBridge";
/** Read back through the link to prove it really resolves. */
const CANARY = "tab_bridge.py";

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
// indexOf returns -1 when absent, and args[-1 + 1] is args[0] - which silently
// takes the first flag as a path.
const baseDirAt = args.indexOf("--base-dir");
const baseDirArg = baseDirAt === -1 ? undefined : args[baseDirAt + 1];

const say = (msg) => console.log(msg);
const die = (msg, hint) => {
  console.error(`\n  ${msg}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
};

/** Ports discovery.ts scans, so this agrees with the server about where to look. */
const CANDIDATE_URLS = [
  process.env.COMFYUI_URL,
  "http://127.0.0.1:8188",
  "http://127.0.0.1:8000",
  "http://127.0.0.1:8189",
  "http://127.0.0.1:8190",
].filter(Boolean);

/**
 * Ask a running ComfyUI where it lives. /system_stats reports the argv it was
 * started with, which is exact and needs no process inspection - and matters
 * because --base-directory is often NOT where the models are.
 *
 * Two signals, in order: the explicit --base-directory when it was passed,
 * then the directory of the main.py in argv[0]. Only the first was read
 * before, and stock desktop and portable installs pass no such flag, so those
 * fell through to guessing at home-directory paths.
 */
async function baseDirFromRunningComfyUI() {
  for (const url of CANDIDATE_URLS) {
    try {
      const res = await fetch(`${url}/system_stats`, {
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) continue;
      const argv = (await res.json())?.system?.argv;
      if (!Array.isArray(argv)) continue;
      const i = argv.indexOf("--base-directory");
      if (i !== -1 && argv[i + 1]) return { dir: argv[i + 1], via: `running ComfyUI at ${url}` };

      // Stock desktop and portable installs do not pass --base-directory, so
      // the flag alone left them falling through to home-directory guesses.
      // argv[0] is the main.py ComfyUI was started with, and its directory is
      // the install root - checked for custom_nodes rather than assumed, so a
      // relative argv[0] or an unexpected layout just falls through.
      if (typeof argv[0] === "string" && argv[0]) {
        const root = dirname(resolve(argv[0]));
        if (existsSync(join(root, "custom_nodes"))) {
          return { dir: root, via: `running ComfyUI at ${url}` };
        }
      }
    } catch {
      // Not listening there, or too old to report argv.
    }
  }
  return null;
}

function baseDirFromCommonPaths() {
  const home = homedir();
  const candidates = [
    join(home, "Documents", "ComfyUI"),
    join(home, "ComfyUI"),
    join(home, "comfyui"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "custom_nodes"))) return { dir, via: "a common install location" };
  }
  return null;
}

async function resolveBaseDir() {
  if (baseDirArg) return { dir: baseDirArg, via: "--base-dir" };
  if (process.env.COMFYUI_BASE_DIR)
    return { dir: process.env.COMFYUI_BASE_DIR, via: "COMFYUI_BASE_DIR" };
  return (await baseDirFromRunningComfyUI()) ?? baseDirFromCommonPaths();
}

/** What is at `p`: a link (and where to), a real directory, or nothing. */
function inspect(p) {
  if (!existsSync(p)) {
    // A link whose target is gone still lstats, so check that too.
    try {
      lstatSync(p);
    } catch {
      return { kind: "absent" };
    }
  }
  const st = lstatSync(p);
  if (st.isSymbolicLink()) {
    let points = null;
    try {
      points = readlinkSync(p).replace(/\\+$/, "");
    } catch {
      /* unreadable target */
    }
    return { kind: "link", points };
  }
  return { kind: st.isDirectory() ? "directory" : "file" };
}

const same = (a, b) => a && b && resolve(a).toLowerCase() === resolve(b).toLowerCase();

// --- go -------------------------------------------------------------------

if (!existsSync(join(SOURCE, CANARY))) {
  die(
    `No ${CANARY} under ${SOURCE}.`,
    "Run this from a full checkout of the comfyui-mcp repo."
  );
}

const base = await resolveBaseDir();
if (!base) {
  die(
    "Could not find ComfyUI's base directory.",
    "Start ComfyUI and re-run, or pass --base-dir <path> / set COMFYUI_BASE_DIR.\n" +
      "  It is the path ComfyUI is started with as --base-directory, which is not\n" +
      "  necessarily where the models live."
  );
}

const customNodes = join(base.dir, "custom_nodes");
if (!existsSync(customNodes)) {
  die(
    `No custom_nodes directory under ${base.dir}.`,
    `Found that path via ${base.via}. Pass --base-dir if it is the wrong install.`
  );
}

const target = join(customNodes, LINK_NAME);
const found = inspect(target);

say(`  source : ${SOURCE}`);
say(`  target : ${target}`);
say(`  base   : ${base.dir}  (via ${base.via})`);
say("");

if (found.kind === "link" && same(found.points, SOURCE)) {
  say("  Already linked.");
} else if (found.kind === "link") {
  die(
    `A link is already there, pointing at ${found.points ?? "somewhere unreadable"}.`,
    "Remove it and re-run if you meant to repoint it at this checkout."
  );
} else if (found.kind === "directory") {
  die(
    "A real directory is already there - not a link.",
    "That is probably the copy this repo was made from. Check it holds nothing\n" +
      "  you need, remove it, then re-run. This script will not delete it for you."
  );
} else if (found.kind === "file") {
  die(`A file is in the way at ${target}.`, "Remove it and re-run.");
} else if (checkOnly) {
  die("Not linked.", "Run without --check to create it.");
} else {
  // 'junction' on Windows: unlike a symlink it needs neither admin rights nor
  // developer mode. Elsewhere a plain directory symlink.
  symlinkSync(SOURCE, target, platform() === "win32" ? "junction" : "dir");
  say("  Linked.");
}

// Prove it resolves, rather than trusting that the call returned.
const throughLink = readFileSync(join(target, CANARY));
const direct = readFileSync(join(SOURCE, CANARY));
if (!throughLink.equals(direct)) {
  die(
    `${CANARY} read through the link does not match the repo copy.`,
    "The link resolves somewhere unexpected. Inspect it before trusting it."
  );
}

say(`  Verified: ${CANARY} reads identically through the link.`);
say("");
say("  Restart ComfyUI to load it, then check:");
say("    curl <comfyui-url>/tabs/state");
