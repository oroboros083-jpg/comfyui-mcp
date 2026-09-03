import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

import { renderSvg, renderSvgSchema, sanitizeSvg } from "./svg.js";

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

test("a root stroke-width is not mistaken for the root's width", async () => {
  // \b matches after a hyphen, so `stroke-width=` counted as `width=` and
  // the root never received explicit dimensions.
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" stroke-width="2" viewBox="0 0 50 50">' +
    '<line x1="0" y1="0" x2="50" y2="50" stroke="black"/></svg>';

  const result = await renderSvg(input({ svg, width: 400, height: 400 }));

  assert.equal(result.success, true, result.error);
  assert.deepEqual(await size(result.buffer!), { width: 400, height: 400 });
});

test("render dimensions are bounded, so a bad argument cannot exhaust memory", () => {
  // These reach sharp's resize directly. Unbounded, 100000x100000 asks for
  // 10^10 pixels and takes the process with it; a negative or fractional
  // value threw from inside sharp and surfaced through the handler's
  // "check the SVG markup" hint, which named the wrong problem.
  const svg = "<svg/>";
  for (const bad of [100000, -5, 0.5, 0]) {
    assert.equal(
      renderSvgSchema.safeParse({ svg, width: bad, height: 768 }).success,
      false,
      `width ${bad} must be rejected`
    );
    assert.equal(
      renderSvgSchema.safeParse({ svg, width: 768, height: bad }).success,
      false,
      `height ${bad} must be rejected`
    );
  }

  assert.equal(renderSvgSchema.safeParse({ svg }).success, true, "the default still parses");
  assert.equal(
    renderSvgSchema.safeParse({ svg, width: 1024, height: 512 }).success,
    true,
    "an ordinary size still parses"
  );
});

// --- sanitising -----------------------------------------------------------
//
// Nothing below is a live hole on the linked librsvg, which refuses external
// resources outright - see sanitizeSvg's own comment for the measurement.
// These pin the sanitiser's own claims, so a future libvips that does load
// them does not find the check already walked past.

test("an external href is blanked, quoted either way", () => {
  assert.match(sanitizeSvg('<image href="file:///etc/passwd"/>'), /href=""/);
  assert.match(sanitizeSvg("<image xlink:href='http://example.com/x.png'/>"), /href=""/);
});

test("an unquoted href is blanked too", () => {
  // The pattern required quotes, so this was left exactly as written.
  assert.match(sanitizeSvg("<image href=file:///etc/passwd />"), /href=""/);
});

test("a character-encoded scheme does not walk past the check", () => {
  // "&#102;ile:" is file: to any conforming parser, and was not file: to a
  // regex reading the raw attribute text.
  assert.match(sanitizeSvg('<image href="&#102;ile:///etc/passwd"/>'), /href=""/);
  assert.match(sanitizeSvg('<image href="&#x68;ttp://example.com/x.png"/>'), /href=""/);
});

test("a DOCTYPE is removed, internal subset and all", () => {
  const result = sanitizeSvg(
    '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/hostname">]><svg><text>&xxe;</text></svg>'
  );

  assert.equal(/<!DOCTYPE/i.test(result), false);
  assert.equal(/ENTITY/.test(result), false);
  assert.match(result, /<svg>/);
});

test("self-contained references are left alone", () => {
  // Fragments and data: URIs are the legitimate embedding cases; blanking
  // them would break every <use> in a real document.
  const fragment = '<use href="#icon"/>';
  assert.equal(sanitizeSvg(fragment), fragment);

  const data = '<image href="data:image/png;base64,iVBORw0KGgo="/>';
  assert.equal(sanitizeSvg(data), data);
});
