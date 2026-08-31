import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

import { scanModel, ModelFileError, renderScanModel } from "./scan-model.js";
import { scanPickle } from "./scan/pickle.js";
import { ResponseFormat } from "../utils/response.js";

/**
 * Fixtures are assembled byte by byte rather than checked in.
 *
 * Two reasons. A pickle that names `posix.system` is a working exploit
 * primitive, and a repository is not where one belongs even as a test file.
 * And the interesting thing about each fixture is which OPCODES it uses -
 * writing them out states that directly, where a binary blob would hide it.
 */

// --- pickle construction --------------------------------------------------

const PROTO = (version: number) => Buffer.from([0x80, version]);
const STOP = Buffer.from([0x2e]);
const REDUCE = Buffer.from([0x52]);
const EMPTY_TUPLE = Buffer.from([0x29]);
const MEMOIZE = Buffer.from([0x94]);
const EMPTY_DICT = Buffer.from([0x7d]);

/** `c<module>\n<name>\n` - the plain protocol-0 import. */
function global_(module: string, name: string): Buffer {
  return Buffer.from(`c${module}\n${name}\n`, "latin1");
}

/** SHORT_BINUNICODE: a 1-byte length then the text. Protocol 4. */
function shortUnicode(value: string): Buffer {
  const bytes = Buffer.from(value, "utf-8");
  return Buffer.concat([Buffer.from([0x8c, bytes.length]), bytes]);
}

/** BINUNICODE: a 4-byte length then the text. Protocol 1. */
function binUnicode(value: string): Buffer {
  const bytes = Buffer.from(value, "utf-8");
  const header = Buffer.alloc(5);
  header[0] = 0x58;
  header.writeUInt32LE(bytes.length, 1);
  return Buffer.concat([header, bytes]);
}

/** The two strings, then STACK_GLOBAL - how protocol 4 names an import. */
function stackGlobal(module: string, name: string): Buffer {
  return Buffer.concat([shortUnicode(module), shortUnicode(name), Buffer.from([0x93])]);
}

const BINPUT = (slot: number) => Buffer.from([0x71, slot]);
const BINGET = (slot: number) => Buffer.from([0x68, slot]);

// --- ZIP construction -----------------------------------------------------

/**
 * A minimal single-member ZIP, in the shape `torch.save` writes.
 *
 * Deliberately not built with a library: the reader under test parses this
 * format by hand, and a fixture built by hand from the spec is an independent
 * check on it rather than two wrappers around the same assumption.
 */
function zipWith(entries: Array<{ name: string; data: Buffer; deflate?: boolean }>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf-8");
    const stored = entry.deflate ? deflateRawSync(entry.data) : entry.data;
    const method = entry.deflate ? 8 : 0;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt32LE(0, 14); // crc, unchecked by the reader
    localHeader.writeUInt32LE(stored.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt32LE(stored.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt32LE(offset, 42);

    locals.push(localHeader, nameBytes, stored);
    central.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + stored.length;
  }

  const localBlock = Buffer.concat(locals);
  const centralBlock = Buffer.concat(central);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBlock.length, 12);
  eocd.writeUInt32LE(localBlock.length, 16);

  return Buffer.concat([localBlock, centralBlock, eocd]);
}

// --- harness --------------------------------------------------------------

let scratch: string | undefined;

function fixture(name: string, contents: Buffer): string {
  scratch ??= mkdtempSync(join(tmpdir(), "comfyui-scan-test-"));
  const path = join(scratch, name);
  writeFileSync(path, contents);
  return path;
}

test.after(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

/** A checkpoint's ordinary preamble: a rebuild helper and a dict. */
const ORDINARY_PICKLE = Buffer.concat([
  PROTO(2),
  global_("collections", "OrderedDict"),
  EMPTY_TUPLE,
  REDUCE,
  global_("torch._utils", "_rebuild_tensor_v2"),
  EMPTY_DICT,
  STOP,
]);

// --- the opcode walker ----------------------------------------------------

test("a plain GLOBAL is read as an import", () => {
  const scan = scanPickle(Buffer.concat([PROTO(2), global_("posix", "system"), STOP]));

  assert.equal(scan.protocol, 2);
  assert.deepEqual(
    scan.imports.map((i) => `${i.module}.${i.name}`),
    ["posix.system"]
  );
});

test("STACK_GLOBAL is resolved from the two strings that precede it", () => {
  const scan = scanPickle(Buffer.concat([PROTO(4), stackGlobal("os", "system"), STOP]));

  assert.deepEqual(
    scan.imports.map((i) => `${i.module}.${i.name}`),
    ["os.system"]
  );
  assert.equal(scan.imports[0]!.via, "STACK_GLOBAL");
});

test("STACK_GLOBAL is resolved through the memo, not just adjacency", () => {
  // The obvious evasion: push the strings early, memoize them, and only get
  // them back at the point of use. Adjacency alone reads this as unresolved.
  const scan = scanPickle(
    Buffer.concat([
      PROTO(4),
      shortUnicode("os"),
      BINPUT(1),
      shortUnicode("system"),
      BINPUT(2),
      EMPTY_DICT,
      BINGET(1),
      BINGET(2),
      Buffer.from([0x93]),
      STOP,
    ])
  );

  assert.deepEqual(
    scan.imports.map((i) => `${i.module}.${i.name}`),
    ["os.system"]
  );
});

test("argument widths are honoured, so a payload cannot desync the walk", () => {
  // The failure this guards: a length read wrongly leaves the cursor inside
  // data, every opcode after it is garbage, and a file with a real exploit in
  // it scans clean. The tensor name here contains a byte that IS the GLOBAL
  // opcode, so a reader that skipped the payload badly would invent an import.
  const scan = scanPickle(
    Buffer.concat([
      PROTO(4),
      binUnicode("cfake\nmodule\nweight.0.bias"),
      global_("torch._utils", "_rebuild_tensor_v2"),
      STOP,
    ])
  );

  assert.deepEqual(
    scan.imports.map((i) => `${i.module}.${i.name}`),
    ["torch._utils._rebuild_tensor_v2"],
    "the string payload must not be read as opcodes"
  );
});

test("an unknown opcode stops the walk rather than guessing its width", () => {
  const scan = scanPickle(Buffer.concat([PROTO(2), Buffer.from([0xff]), STOP]));

  assert.equal(scan.truncated, true);
  assert.match(scan.stoppedBecause ?? "", /unknown opcode 0xff/);
});

test("a truncated argument stops the walk", () => {
  // A half-written SHORT_BINUNICODE: the length says 200, the file ends.
  const scan = scanPickle(Buffer.concat([PROTO(4), Buffer.from([0x8c, 200]), Buffer.from("abc")]));

  assert.equal(scan.truncated, true);
  assert.match(scan.stoppedBecause ?? "", /truncated/);
});

// --- verdicts -------------------------------------------------------------

test("a checkpoint naming os.system is dangerous, and says why", async () => {
  const path = fixture(
    "malicious.ckpt",
    Buffer.concat([PROTO(2), global_("posix", "system"), EMPTY_TUPLE, REDUCE, STOP])
  );

  const result = await scanModel({ path, response_format: ResponseFormat.JSON });

  assert.equal(result.format, "pickle");
  assert.equal(result.verdict, "dangerous");
  assert.equal(result.findings[0]!.target, "posix.system");
  assert.match(result.findings[0]!.reason, /runs commands/);
  assert.match(result.summary, /Do not load it/);
});

test("an ordinary checkpoint reports safe without claiming proof", async () => {
  const path = fixture("ordinary.ckpt", ORDINARY_PICKLE);

  const result = await scanModel({ path, response_format: ResponseFormat.JSON });

  assert.equal(result.verdict, "safe");
  assert.deepEqual(result.findings, []);
  assert.ok(result.ordinaryImports.includes("collections.OrderedDict"));
  // The claim has to stay honest: the list is of published primitives.
  assert.match(result.summary, /not the same as safe/);
});

test("torch.load inside a checkpoint is dangerous even though torch is expected", async () => {
  // EXPECTED must not override DANGEROUS: `torch` is ordinary, `torch.load`
  // is a second unpickle hidden inside the first.
  const path = fixture(
    "nested.pt",
    Buffer.concat([PROTO(2), global_("torch", "load"), EMPTY_TUPLE, REDUCE, STOP])
  );

  const result = await scanModel({ path, response_format: ResponseFormat.JSON });

  assert.equal(result.verdict, "dangerous");
  assert.equal(result.findings[0]!.target, "torch.load");
});

test("glue modules are suspicious, not dangerous", async () => {
  const path = fixture(
    "glue.pt",
    Buffer.concat([PROTO(2), global_("functools", "partial"), EMPTY_TUPLE, REDUCE, STOP])
  );

  const result = await scanModel({ path, response_format: ResponseFormat.JSON });

  assert.equal(result.verdict, "suspicious");
  assert.match(result.summary, /not proof of anything/);
});

test("a dangerous module name left as a bare constant is still reported", async () => {
  // The residual evasion: break STACK_GLOBAL's pairing so the module cannot
  // be attributed. The string still has to be in the file.
  const path = fixture(
    "hidden.pt",
    Buffer.concat([
      PROTO(4),
      shortUnicode("subprocess"),
      MEMOIZE,
      EMPTY_DICT,
      STOP,
    ])
  );

  const result = await scanModel({ path, response_format: ResponseFormat.JSON });

  assert.equal(result.verdict, "dangerous");
  assert.equal(result.findings[0]!.target, "subprocess");
  assert.match(result.findings[0]!.reason, /string constant/);
});

// --- containers -----------------------------------------------------------

test("safetensors is reported safe by format, with nothing scanned", async () => {
  const header = Buffer.from(JSON.stringify({ __metadata__: { format: "pt" } }), "utf-8");
  const length = Buffer.alloc(8);
  length.writeBigUInt64LE(BigInt(header.length));
  const path = fixture("model.safetensors", Buffer.concat([length, header, Buffer.alloc(64)]));

  const result = await scanModel({ path, response_format: ResponseFormat.JSON });

  assert.equal(result.format, "safetensors");
  assert.equal(result.verdict, "safe");
  assert.match(result.summary, /no code path to execute/);
});

test("a torch ZIP is scanned through its data.pkl", async () => {
  const path = fixture(
    "model.pt",
    zipWith([
      { name: "archive/data.pkl", data: Buffer.concat([PROTO(2), global_("os", "popen"), STOP]) },
      { name: "archive/data/0", data: Buffer.alloc(128) },
    ])
  );

  const result = await scanModel({ path, response_format: ResponseFormat.JSON });

  assert.equal(result.format, "torch-zip");
  assert.equal(result.pickleEntry, "archive/data.pkl");
  assert.equal(result.entryCount, 2);
  assert.equal(result.verdict, "dangerous");
});

test("a deflated data.pkl is inflated before scanning", async () => {
  // torch.save stores rather than deflates, but zipfile-written archives in
  // the wild do deflate, and a reader that only handled stored members would
  // report those as unscannable.
  const path = fixture(
    "deflated.pt",
    zipWith([
      {
        name: "data.pkl",
        data: Buffer.concat([PROTO(2), global_("os", "system"), STOP, Buffer.alloc(4096)]),
        deflate: true,
      },
    ])
  );

  const result = await scanModel({ path, response_format: ResponseFormat.JSON });

  assert.equal(result.verdict, "dangerous");
});

test("a ZIP with no data.pkl has nothing to unpickle", async () => {
  const path = fixture("weights.bin", zipWith([{ name: "config.json", data: Buffer.from("{}") }]));

  const result = await scanModel({ path, response_format: ResponseFormat.JSON });

  assert.equal(result.verdict, "safe");
  assert.match(result.summary, /no data\.pkl/);
});

// --- what it refuses ------------------------------------------------------

test("a safetensors sibling is named, because loading it makes the question moot", async () => {
  const header = Buffer.from(JSON.stringify({}), "utf-8");
  const length = Buffer.alloc(8);
  length.writeBigUInt64LE(BigInt(header.length));
  fixture("twin.safetensors", Buffer.concat([length, header]));
  const path = fixture("twin.ckpt", ORDINARY_PICKLE);

  const result = await scanModel({ path, response_format: ResponseFormat.JSON });

  assert.match(result.saferAlternative ?? "", /twin\.safetensors$/);
  assert.match(result.summary, /load that instead/);
});

test("it opens model extensions only, so it is not a general file reader", async () => {
  const path = fixture("secrets.env", Buffer.from("TOKEN=hunter2"));

  await assert.rejects(
    () => scanModel({ path, response_format: ResponseFormat.JSON }),
    (error: unknown) =>
      error instanceof ModelFileError && /reads model files only/.test(error.message)
  );
});

test("an unrecognised format is an error, not a clean bill of health", async () => {
  const path = fixture("garbage.ckpt", Buffer.from([0xff, 0xfe, 0xfd, 0xfc, 0xfb]));

  await assert.rejects(
    () => scanModel({ path, response_format: ResponseFormat.JSON }),
    (error: unknown) =>
      error instanceof ModelFileError && /unscanned rather than clean/.test(error.hint ?? "")
  );
});

test("a missing file names the tool that lists what is installed", async () => {
  await assert.rejects(
    () => scanModel({ path: join(tmpdir(), "definitely-absent.ckpt"), response_format: ResponseFormat.JSON }),
    (error: unknown) => error instanceof ModelFileError && /search_models/.test(error.hint ?? "")
  );
});

// --- rendering ------------------------------------------------------------

test("the markdown view leads with the verdict", async () => {
  const path = fixture(
    "render.ckpt",
    Buffer.concat([PROTO(2), global_("posix", "system"), EMPTY_TUPLE, REDUCE, STOP])
  );

  const rendered = renderScanModel(await scanModel({ path, response_format: ResponseFormat.JSON }));

  assert.match(rendered, /\*\*DANGEROUS\*\*/);
  assert.match(rendered, /posix\.system/);
});
