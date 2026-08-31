import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, isAbsolute, basename, relative as relativePath } from "node:path";
import sharp from "sharp";

import {
  collectOutputImages,
  collectTextOutputs,
  workflowPromptFor,
  generateReadableFilename,
  writeUnique,
  TEXT_OUTPUT_KEYS,
} from "./outputs.js";
import { ComfyUIClient } from "../client/comfyui.js";

/**
 * These pin the three behaviours that had drifted between the sync and async
 * copies of this logic. Each was silently wrong on one of the two paths.
 */

let png: Buffer;
let outDir: string;

before(async () => {
  png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .png()
    .toBuffer();
  outDir = mkdtempSync(join(tmpdir(), "comfyui-outputs-test-"));
});

after(() => rmSync(outDir, { recursive: true, force: true }));

/** A client that serves the same small PNG for any requested image. */
function stubClient(): ComfyUIClient {
  return {
    getImage: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
  } as unknown as ComfyUIClient;
}

const OUTPUTS = { "9": { images: [{ filename: "ComfyUI_00001_.png", subfolder: "", type: "output" }] } };
const WORKFLOW = { "1": { class_type: "CLIPTextEncode", inputs: { text: "a red square" } } };

/** The same directory expressed relative to the process cwd. */
function relativeTo(dir: string): string {
  return relativePath(process.cwd(), dir);
}

function freshDir(): string {
  return mkdtempSync(join(outDir, "run-"));
}

test("an image can carry both a path and inline data", async () => {
  // The async copy treated these as exclusive, so it never returned a path
  // alongside base64 - though outputModeSchema documents "path + inline data".
  const dir = freshDir();
  const images = await collectOutputImages(
    stubClient(),
    OUTPUTS,
    { outputMode: "base64" },
    WORKFLOW,
    dir,
    1024 * 1024
  );

  assert.equal(images.length, 1);
  assert.ok(images[0].path, "saved to disk");
  assert.ok(images[0].data, "and inlined");
  assert.ok(existsSync(images[0].path!), "the file it names really exists");
});

test("outputMode 'file' saves without inlining", async () => {
  const dir = freshDir();
  const [image] = await collectOutputImages(
    stubClient(),
    OUTPUTS,
    { outputMode: "file" },
    WORKFLOW,
    dir,
    1024 * 1024
  );

  assert.ok(image.path);
  assert.equal(image.data, undefined);
});

test("outputMode 'auto' inlines a small image and still writes it", async () => {
  const dir = freshDir();
  const [image] = await collectOutputImages(
    stubClient(),
    OUTPUTS,
    { outputMode: "auto" },
    WORKFLOW,
    dir,
    1024 * 1024 // the 8x8 png is far below this
  );

  assert.ok(image.path, "auto still saves");
  assert.ok(image.data, "and inlines, because it is small");
});

test("outputMode 'auto' omits inline data for an image over the threshold", async () => {
  const dir = freshDir();
  const [image] = await collectOutputImages(
    stubClient(),
    OUTPUTS,
    { outputMode: "auto" },
    WORKFLOW,
    dir,
    1 // everything is "large"
  );

  assert.ok(image.path);
  assert.equal(image.data, undefined);
});

test("imageFormat is honoured by the file written to disk", async () => {
  // The async copy wrote the raw buffer and took the extension from ComfyUI's
  // own filename, so this option was silently ignored for saved files.
  const dir = freshDir();
  const [image] = await collectOutputImages(
    stubClient(),
    OUTPUTS,
    { outputMode: "file", imageFormat: "webp" },
    WORKFLOW,
    dir,
    1024 * 1024
  );

  assert.match(image.path!, /\.webp$/, "named for the requested format");

  const written = readFileSync(image.path!);
  const meta = await sharp(written).metadata();
  assert.equal(meta.format, "webp", "and actually converted, not raw PNG bytes");
});

test("the saved file is named after the prompt", async () => {
  const dir = freshDir();
  const [image] = await collectOutputImages(
    stubClient(),
    OUTPUTS,
    { outputMode: "file" },
    WORKFLOW,
    dir,
    1024 * 1024
  );

  assert.match(image.filename, /a-red-square/);
  assert.equal(readdirSync(dir).length, 1);
});

test("every output node's images are collected, not just the first", async () => {
  const dir = freshDir();
  const images = await collectOutputImages(
    stubClient(),
    {
      "9": { images: [{ filename: "a.png", subfolder: "", type: "output" }] },
      "12": { images: [{ filename: "b.png", subfolder: "", type: "output" }] },
    },
    { outputMode: "file" },
    WORKFLOW,
    dir,
    1024 * 1024
  );

  assert.equal(images.length, 2);
  assert.equal(new Set(images.map((i) => i.path)).size, 2, "distinct filenames");
});

test("a workflow with no text node still produces a usable name", async () => {
  assert.equal(workflowPromptFor({ "1": { class_type: "KSampler", inputs: {} } }), "custom-workflow");
  // Punctuation is stripped when sanitising, so the fallback lands as
  // "customworkflow" - still recognisable, which is all the name is for.
  assert.match(generateReadableFilename("custom-workflow", "workflow", 0, ".png"), /customworkflow/);
});


test("the returned path is absolute even when outputDir is relative", async () => {
  // The shipped default outputDir is "./outputs", and outputModeSchema
  // promises "absolute paths returned". join() left it relative, resolved
  // against the server process's cwd - which for a stdio server launched by
  // a client is not the agent's, so the agent could not open the file.
  const relative = relativeTo(freshDir());

  const [image] = await collectOutputImages(
    stubClient(),
    OUTPUTS,
    { outputMode: "file" },
    WORKFLOW,
    relative,
    1024 * 1024
  );

  assert.ok(image.path, "a path was returned");
  assert.equal(isAbsolute(image.path!), true, image.path);
  assert.ok(existsSync(image.path!), "and it names a real file");
});

test("two runs of the same prompt in the same second do not overwrite", async () => {
  // The readable name has one-second resolution and only carries an index
  // from the second image of a batch, so a retry or a second seed landing in
  // the same second produced the same name and writeFile clobbered it. The
  // caller got two entries with identical paths, one of which no longer held
  // the bytes it named.
  const dir = freshDir();

  const first = await collectOutputImages(
    stubClient(), OUTPUTS, { outputMode: "file" }, WORKFLOW, dir, 1024 * 1024
  );
  const second = await collectOutputImages(
    stubClient(), OUTPUTS, { outputMode: "file" }, WORKFLOW, dir, 1024 * 1024
  );

  assert.notEqual(first[0].path, second[0].path, "distinct paths");
  assert.ok(existsSync(first[0].path!), "the first file survives");
  assert.ok(existsSync(second[0].path!), "and the second exists too");
  assert.equal(readdirSync(dir).length, 2);
});

test("writeUnique takes a free name as-is", async () => {
  const dir = freshDir();

  const written = await writeUnique(dir, "nothing-here.png", Buffer.from("a"));

  assert.equal(written, join(dir, "nothing-here.png"));
});

test("writeUnique never overwrites, even under concurrency", async () => {
  // The check and the create are one operation, so racing writers cannot
  // both see the same name free. An existsSync probe would be separated
  // from the write by the image conversion's awaits.
  const dir = freshDir();

  const paths = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      writeUnique(dir, "same-name.png", Buffer.from(`payload ${i}`))
    )
  );

  assert.equal(new Set(paths).size, 20, "every writer got its own path");
  assert.equal(readdirSync(dir).length, 20, "and every file survives");

  // Each file still holds the bytes its own writer wrote.
  const contents = new Set(paths.map((p) => readFileSync(p, "utf8")));
  assert.equal(contents.size, 20);
});

test("the reported filename matches the file actually written", async () => {
  // uniquePath may append -2 on a collision; a `filename` still carrying the
  // original name would disagree with basename(path) in exactly the case
  // the uniqueness handling exists for.
  const dir = freshDir();

  const first = await collectOutputImages(
    stubClient(), OUTPUTS, { outputMode: "file" }, WORKFLOW, dir, 1024 * 1024
  );
  const second = await collectOutputImages(
    stubClient(), OUTPUTS, { outputMode: "file" }, WORKFLOW, dir, 1024 * 1024
  );

  for (const [image] of [first, second]) {
    assert.equal(
      image.filename,
      basename(image.path!),
      `${image.filename} vs ${image.path}`
    );
  }
});

// --- text collection ------------------------------------------------------

/**
 * A finished prompt's outputs, shaped as ComfyUI records them: one entry per
 * OUTPUT_NODE, holding whatever that node put in its `ui` dict.
 *
 * Node "2" is a WD14 tagger, node "4" a caption preview, node "5" a logging
 * node of the kind that makes unscoped collection a context leak, and node
 * "9" a SaveImage.
 */
function mixedOutputs(): Record<string, unknown> {
  return {
    "2": { tags: ["1girl, solo, looking_back, cowboy_shot"] },
    "4": { text: ["A woman in a red coat glances back over her shoulder."] },
    "5": {
      text: [
        "[INFO] loading model...\n".repeat(200) +
          "[INFO] sampler: euler | scheduler: simple | seed: 883120",
      ],
    },
    "9": { images: [{ filename: "ComfyUI_00001_.png", subfolder: "", type: "output" }] },
  };
}

// --- the guard the design rests on ---------------------------------------

test("no fromNodes collects nothing at all", () => {
  // This is the regression that matters: every caller that existed before
  // text collection must behave exactly as it did.
  assert.deepEqual(collectTextOutputs(mixedOutputs()), []);
  assert.deepEqual(collectTextOutputs(mixedOutputs(), {}), []);
  assert.deepEqual(collectTextOutputs(mixedOutputs(), { fromNodes: [] }), []);
});

test("only the named node's text comes back", () => {
  const collected = collectTextOutputs(mixedOutputs(), { fromNodes: ["2"] });

  assert.equal(collected.length, 1);
  assert.equal(collected[0]!.nodeId, "2");
  assert.equal(collected[0]!.key, "tags");
  assert.match(collected[0]!.text, /looking_back/);
});

test("a noisy logging node is not collected even though it is string-valued", () => {
  // Node 5 emits under "text", the same key the caption uses. Nothing about
  // the value distinguishes it - only the fact that nobody asked for it.
  const collected = collectTextOutputs(mixedOutputs(), { fromNodes: ["2", "4"] });

  assert.equal(collected.length, 2);
  assert.ok(!collected.some((entry) => entry.nodeId === "5"));
  assert.ok(!collected.some((entry) => /\[INFO\]/.test(entry.text)));
});

test("a key outside the allowlist is not collected even from a named node", () => {
  const collected = collectTextOutputs(
    { "2": { tags: ["1girl"], debug: ["internal state dump"], seeds: ["883120"] } },
    { fromNodes: ["2"] }
  );

  assert.deepEqual(collected.map((entry) => entry.key), ["tags"]);
});

test("the allowlist is small and deliberate", () => {
  // Widening this is how "collect text" turns back into "collect everything",
  // so a change here should be a conscious one.
  assert.deepEqual([...TEXT_OUTPUT_KEYS], ["text", "tags", "caption", "string"]);
});

// --- caps -----------------------------------------------------------------

test("an oversized value is truncated and flagged, not passed through whole", () => {
  const long = "x".repeat(9000);
  const collected = collectTextOutputs({ "2": { text: [long] } }, {
    fromNodes: ["2"],
    maxPerNode: 100,
  });

  assert.equal(collected[0]!.truncated, true);
  assert.ok(collected[0]!.text.length < 200);
  // Silently clipped text reads as complete text, so it has to say so.
  assert.match(collected[0]!.text, /TRUNCATED/);
});

test("the total cap stops collection across nodes", () => {
  const collected = collectTextOutputs(
    { "1": { text: ["a".repeat(80)] }, "2": { text: ["b".repeat(80)] } },
    { fromNodes: ["1", "2"], maxPerNode: 100, maxTotal: 100 }
  );

  const total = collected.reduce((n, entry) => n + entry.text.length, 0);
  assert.ok(total <= 160, `collected ${total} characters against a 100 cap`);
});

test("a value repeated within a node is returned once", () => {
  const collected = collectTextOutputs(
    { "2": { text: ["a caption"], caption: ["a caption"] } },
    { fromNodes: ["2"] }
  );

  assert.equal(collected.length, 1);
});

// --- shapes ---------------------------------------------------------------

test("a bare string is read as well as a list of them", () => {
  const collected = collectTextOutputs(
    { "2": { tags: "1girl, solo" }, "3": { text: ["one", "two"] } },
    { fromNodes: ["2", "3"] }
  );

  assert.deepEqual(collected.map((entry) => entry.text), ["1girl, solo", "one", "two"]);
});

test("empty and whitespace values are dropped", () => {
  const collected = collectTextOutputs({ "2": { text: ["", "   ", "real"] } }, {
    fromNodes: ["2"],
  });

  assert.deepEqual(collected.map((entry) => entry.text), ["real"]);
});

test("an image-only node named for text yields nothing", () => {
  // SaveImage has no text keys; naming it should be a no-op, not a crash.
  assert.deepEqual(collectTextOutputs(mixedOutputs(), { fromNodes: ["9"] }), []);
});

test("a node id that does not exist is a no-op", () => {
  assert.deepEqual(collectTextOutputs(mixedOutputs(), { fromNodes: ["99"] }), []);
});
