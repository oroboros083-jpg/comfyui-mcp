import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

import { getFontBase64 } from "./fonts.js";

/**
 * getFontBase64 reads the real cache directory (~/.comfyui-mcp/fonts), so
 * these write throwaway files into it and remove exactly those again. The
 * names are deliberately unlikely to collide with a font a human downloaded.
 */
const FONTS_DIR = join(homedir(), ".comfyui-mcp", "fonts");
const PLAIN = "zztestface_400.ttf";
const DECORATIVE = "zztestface_decorative_400.ttf";

let scratch: string;

before(() => {
  scratch = mkdtempSync(join(tmpdir(), "comfyui-fonts-test-"));
  mkdirSync(FONTS_DIR, { recursive: true });
  // Content is irrelevant; only the filename matching is under test.
  writeFileSync(join(FONTS_DIR, DECORATIVE), "decorative");
});

after(() => {
  for (const f of [PLAIN, DECORATIVE]) {
    try {
      rmSync(join(FONTS_DIR, f), { force: true });
    } catch {
      /* nothing to clean */
    }
  }
  rmSync(scratch, { recursive: true, force: true });
});

test("a font name does not prefix-match a longer family", async () => {
  // "Cinzel" used to resolve to cinzel_decorative_400.woff2 whenever the
  // decorative face was cached and the plain one was not, so the SVG rendered
  // in the wrong typeface under the right family name and reported success.
  assert.equal(await getFontBase64("ZZTestface"), null);
});

test("the exact family still resolves, with or without a weight suffix", async () => {
  assert.notEqual(await getFontBase64("ZZTestface Decorative"), null);

  writeFileSync(join(FONTS_DIR, PLAIN), "plain");
  const plain = await getFontBase64("ZZTestface");
  assert.notEqual(plain, null, "now that it exists it is found");
  assert.equal(plain?.format, "truetype");
});
