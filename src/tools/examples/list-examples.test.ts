import { test } from "node:test";
import assert from "node:assert/strict";

import { extractWorkflowFromPng } from "./list-examples.js";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Assemble a PNG out of raw chunks: length, type, data, CRC placeholder. */
function png(chunks: Array<{ type: string; data: number[] }>): ArrayBuffer {
  const bytes: number[] = [...PNG_SIGNATURE];

  for (const chunk of chunks) {
    const len = chunk.data.length;
    bytes.push((len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
    for (const c of chunk.type) bytes.push(c.charCodeAt(0));
    bytes.push(...chunk.data);
    bytes.push(0, 0, 0, 0); // CRC - the parser skips it without checking
  }

  return Uint8Array.from(bytes).buffer;
}

const utf8 = (s: string) => [...new TextEncoder().encode(s)];

/**
 * iTXt: keyword \0 compressionFlag compressionMethod language \0 translated \0 text
 *
 * The two flag bytes are fixed-width, not NUL-terminated fields - which is
 * exactly what the old NUL-counting loop got wrong.
 */
function itxt(
  keyword: string,
  text: string,
  opts: { flag?: number; language?: string; translated?: string } = {}
): { type: string; data: number[] } {
  const { flag = 0, language = "", translated = "" } = opts;
  return {
    type: "iTXt",
    data: [
      ...utf8(keyword),
      0,
      flag,
      0,
      ...utf8(language),
      0,
      ...utf8(translated),
      0,
      ...utf8(text),
    ],
  };
}

function text(keyword: string, value: string): { type: string; data: number[] } {
  return { type: "tEXt", data: [...utf8(keyword), 0, ...utf8(value)] };
}

const WORKFLOW = { "1": { class_type: "KSampler" } };

test("extractWorkflowFromPng reads a spec-correct iTXt chunk", async () => {
  const result = await extractWorkflowFromPng(
    png([itxt("prompt", JSON.stringify(WORKFLOW))])
  );

  assert.deepEqual(result?.prompt, WORKFLOW);
});

test("extractWorkflowFromPng reads iTXt carrying language and translated keyword", async () => {
  const result = await extractWorkflowFromPng(
    png([
      itxt("workflow", JSON.stringify(WORKFLOW), {
        language: "en",
        translated: "arbeitsablauf",
      }),
    ])
  );

  assert.deepEqual(result?.workflow, WORKFLOW);
});

test("extractWorkflowFromPng still reads tEXt chunks", async () => {
  const result = await extractWorkflowFromPng(
    png([text("prompt", JSON.stringify(WORKFLOW))])
  );

  assert.deepEqual(result?.prompt, WORKFLOW);
});

test("extractWorkflowFromPng reads both keys from one file", async () => {
  const result = await extractWorkflowFromPng(
    png([
      itxt("prompt", JSON.stringify(WORKFLOW)),
      text("workflow", JSON.stringify({ nodes: [] })),
    ])
  );

  assert.deepEqual(result?.prompt, WORKFLOW);
  assert.deepEqual(result?.workflow, { nodes: [] });
});

test("extractWorkflowFromPng reports nothing for a zlib-compressed iTXt chunk", async () => {
  // Flag 1 means deflated; decoding the bytes as UTF-8 would be noise.
  const result = await extractWorkflowFromPng(
    png([itxt("prompt", JSON.stringify(WORKFLOW), { flag: 1 })])
  );

  assert.equal(result?.prompt, undefined);
});

test("extractWorkflowFromPng rejects a file that is not a PNG", async () => {
  const notPng = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer;

  assert.equal(await extractWorkflowFromPng(notPng), null);
});

test("extractWorkflowFromPng survives a truncated iTXt chunk", async () => {
  // Keyword separator present, but the field NULs never arrive.
  const result = await extractWorkflowFromPng(
    png([{ type: "iTXt", data: [...utf8("prompt"), 0, 0, 0] }])
  );

  assert.equal(result?.prompt, undefined);
});
