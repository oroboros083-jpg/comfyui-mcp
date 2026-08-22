import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import sharp from "sharp";

import { analyzeUserOutputs } from "./outputs.js";

let dir: string;

before(() => {
  dir = mkdtempSync(join(tmpdir(), "comfyui-analysis-test-"));
});

after(() => rmSync(dir, { recursive: true, force: true }));

/** A PNG tEXt chunk: length, type, keyword\0text, crc over type+data. */
function textChunk(keyword: string, text: string): Buffer {
  const type = Buffer.from("tEXt", "latin1");
  const data = Buffer.concat([
    Buffer.from(keyword, "latin1"),
    Buffer.from([0]),
    Buffer.from(text, "latin1"),
  ]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])) >>> 0);
  return Buffer.concat([length, type, data, crc]);
}

/**
 * A PNG carrying ComfyUI's API-format graph in a tEXt chunk, the way ComfyUI
 * writes its own outputs.
 */
async function pngWithWorkflow(): Promise<Buffer> {
  const png = await sharp({
    create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const prompt = JSON.stringify({
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sdxl.safetensors" } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: "a small test image" } },
  });

  // Insert after the 8-byte signature and the 25-byte IHDR chunk.
  const headerEnd = 8 + 25;
  return Buffer.concat([
    png.subarray(0, headerEnd),
    textChunk("prompt", prompt),
    png.subarray(headerEnd),
  ]);
}

test("an embedded workflow is read out of an output PNG", async () => {
  // Covers the whole read -> parse -> mine path, which had no test at all.
  // Small on purpose: a Buffer handed over as `.buffer` rather than as its own
  // view is only wrong when the allocation is larger than the file, which is
  // what readFileSync's shared pool does to anything under 32 KB.
  const png = await pngWithWorkflow();
  assert.ok(png.length < 4096, `fixture should be small, got ${png.length} bytes`);

  writeFileSync(join(dir, "small.png"), png);

  const prefs = await analyzeUserOutputs(dir);

  assert.equal(prefs.totalImagesAnalyzed, 1);
  assert.equal(prefs.imagesWithWorkflows, 1, "the embedded workflow was found");
  assert.equal(prefs.uniqueWorkflows, 1);
  assert.ok(
    prefs.modelUsage.some((m) => m.name === "sdxl.safetensors"),
    "and its model was extracted"
  );
});

test("a PNG with no embedded workflow is counted but not mined", async () => {
  const plain = await sharp({
    create: { width: 1, height: 1, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .png()
    .toBuffer();

  const bare = mkdtempSync(join(dir, "bare-"));
  writeFileSync(join(bare, "plain.png"), plain);

  const prefs = await analyzeUserOutputs(bare);

  assert.equal(prefs.totalImagesAnalyzed, 1);
  assert.equal(prefs.imagesWithWorkflows, 0);
});

/** A PNG carrying only ComfyUI's UI-format graph, which many tools embed. */
async function pngWithUiWorkflow(): Promise<Buffer> {
  const png = await sharp({
    create: { width: 1, height: 1, channels: 3, background: { r: 4, g: 5, b: 6 } },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();

  // The UI format's top-level values are arrays, which passed the old
  // `typeof node !== "object"` guard and then had no class_type.
  const workflow = JSON.stringify({
    last_node_id: 2,
    nodes: [{ id: 1, type: "KSampler", widgets_values: [123, "fixed", 20] }],
    links: [[1, 1, 0, 2, 0, "MODEL"]],
  });

  const headerEnd = 8 + 25;
  return Buffer.concat([
    png.subarray(0, headerEnd),
    textChunk("workflow", workflow),
    png.subarray(headerEnd),
  ]);
}

test("a UI-format workflow does not take the whole analysis down", async () => {
  // describeWorkflow runs after the per-file try/catch, so a single such PNG
  // rejected analyzeUserOutputs wholesale and get_user_preferences answered
  // "available: false" from then on. The API-format sibling must still be
  // mined.
  const mixed = mkdtempSync(join(dir, "mixed-"));
  writeFileSync(join(mixed, "ui.png"), await pngWithUiWorkflow());
  writeFileSync(join(mixed, "api.png"), await pngWithWorkflow());

  const prefs = await analyzeUserOutputs(mixed);

  assert.equal(prefs.totalImagesAnalyzed, 2);
  assert.equal(prefs.imagesWithWorkflows, 1, "only the API-format one is analysable");
  assert.equal(prefs.uniqueWorkflows, 1);
  assert.ok(
    prefs.modelUsage.some((m) => m.name === "sdxl.safetensors"),
    "the readable file was still mined"
  );
});

test("a UI-format workflow on its own yields an empty but valid result", async () => {
  const uiOnly = mkdtempSync(join(dir, "ui-only-"));
  writeFileSync(join(uiOnly, "ui.png"), await pngWithUiWorkflow());

  const prefs = await analyzeUserOutputs(uiOnly);

  assert.equal(prefs.totalImagesAnalyzed, 1);
  assert.equal(prefs.imagesWithWorkflows, 0);
  assert.deepEqual(prefs.workflowTemplates, []);
});
