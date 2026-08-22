import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

import { renderSvg, renderSvgSchema } from "./svg.js";

/** Fill in the schema defaults the tool would apply. */
function input(overrides: Record<string, unknown>) {
  return renderSvgSchema.parse({ svg: "<svg/>", ...overrides });
}

async function size(png: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(png).metadata();
  return { width: meta.width!, height: meta.height! };
}

const BIG_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">' +
  '<rect x="0" y="0" width="1024" height="1024" fill="#3366cc"/></svg>';

test("an SVG larger than the requested size renders onto a background", async () => {
  // The background branch composited the raw SVG onto a width x height
  // canvas, so sharp threw "Image to composite must have same dimensions or
  // smaller" and the tool answered with the misleading "check the SVG markup
  // is well-formed" hint.
  const result = await renderSvg(
    input({ svg: BIG_SVG, background: "#ffffff", width: 768, height: 768 })
  );

  assert.equal(result.success, true, result.error);
  assert.deepEqual(await size(result.buffer!), { width: 768, height: 768 });
});

test("the same SVG still renders with a transparent background", async () => {
  const result = await renderSvg(input({ svg: BIG_SVG, width: 768, height: 768 }));

  assert.equal(result.success, true, result.error);
  assert.deepEqual(await size(result.buffer!), { width: 768, height: 768 });
});

test("a child element's width does not stop the root getting dimensions", async () => {
  // The old check was a bare substring match over the whole document, so a
  // `width=` on any child blocked the root's width/height. The separately
  // injected viewBox happened to mask it, so this pins the intended
  // behaviour rather than reproducing a visible failure.
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="0" y="0" width="10" height="10" fill="red"/></svg>';

  const result = await renderSvg(input({ svg, width: 640, height: 480 }));

  assert.equal(result.success, true, result.error);
  assert.deepEqual(await size(result.buffer!), { width: 640, height: 480 });
});

test("a root declaring only one of width/height still gets the other", async () => {
  // The pair was joined with &&, so declaring one meant neither was added -
  // again masked by the viewBox, and again pinned here.
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200">' +
    '<circle cx="50" cy="50" r="40" fill="green"/></svg>';

  const result = await renderSvg(input({ svg, width: 300, height: 300 }));

  assert.equal(result.success, true, result.error);
  assert.deepEqual(await size(result.buffer!), { width: 300, height: 300 });
});

test("an SVG that already declares its own size is honoured", async () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">' +
    '<rect width="100" height="100" fill="black"/></svg>';

  const result = await renderSvg(input({ svg, width: 100, height: 100 }));

  assert.equal(result.success, true, result.error);
  assert.deepEqual(await size(result.buffer!), { width: 100, height: 100 });
});

test("malformed markup is still reported as a failure", async () => {
  const result = await renderSvg(input({ svg: "not an svg at all" }));

  assert.equal(result.success, false);
});
