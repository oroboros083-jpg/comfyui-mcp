import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, isAbsolute, relative as relativePath } from "node:path";
import sharp from "sharp";

import {
  collectOutputImages,
  shouldSkipFileSaving,
  workflowPromptFor,
  generateReadableFilename,
  uniquePath,
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

test("Docker skips file saving only when no OUTPUT_DIR is mounted", () => {
  // The async copy used a bare in-Docker check, so a configured volume mount
  // was ignored and nothing was ever written.
  const priorDocker = process.env.DOCKER;
  const priorOutput = process.env.OUTPUT_DIR;
  try {
    delete process.env.DOCKER;
    delete process.env.OUTPUT_DIR;
    assert.equal(shouldSkipFileSaving(), false, "not in Docker: always save");

    process.env.DOCKER = "true";
    assert.equal(shouldSkipFileSaving(), true, "in Docker with no mount: skip");

    process.env.OUTPUT_DIR = "/outputs";
    assert.equal(shouldSkipFileSaving(), false, "in Docker with a mount: save");
  } finally {
    if (priorDocker === undefined) delete process.env.DOCKER;
    else process.env.DOCKER = priorDocker;
    if (priorOutput === undefined) delete process.env.OUTPUT_DIR;
    else process.env.OUTPUT_DIR = priorOutput;
  }
});

test("when nothing is saved the bytes still travel inline", async () => {
  const priorDocker = process.env.DOCKER;
  try {
    process.env.DOCKER = "true";
    delete process.env.OUTPUT_DIR;

    const dir = freshDir();
    const [image] = await collectOutputImages(
      stubClient(),
      OUTPUTS,
      { outputMode: "file" }, // asked for file-only, but no file is possible
      WORKFLOW,
      dir,
      1024 * 1024
    );

    assert.equal(image.path, undefined, "nothing written");
    assert.ok(image.data, "so the image is inlined regardless of outputMode");
    assert.equal(readdirSync(dir).length, 0);
  } finally {
    if (priorDocker === undefined) delete process.env.DOCKER;
    else process.env.DOCKER = priorDocker;
  }
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

test("uniquePath leaves a free name alone", () => {
  const dir = freshDir();
  const free = join(dir, "nothing-here.png");

  assert.equal(uniquePath(free), free);
});
