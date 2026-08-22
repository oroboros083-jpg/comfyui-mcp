import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import {
  uploadImage,
  normalizeSubfolder,
  storedName,
  buildReference,
  MAX_UPLOAD_BYTES,
} from "./upload.js";
import { ComfyUIClient } from "../client/comfyui.js";
import { ToolError } from "../utils/errors.js";

let dir: string;
let pngPath: string;
let png: Buffer;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "comfyui-upload-test-"));
  png = await sharp({
    create: { width: 64, height: 32, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
  pngPath = join(dir, "photo.png");
  writeFileSync(pngPath, png);
});

after(() => rmSync(dir, { recursive: true, force: true }));

/** A client that records what it was asked to upload and echoes ComfyUI's reply. */
function stubClient(
  calls: Array<{ filename: string; overwrite: boolean; subfolder: string; bytes: number }>,
  reply?: { name: string; subfolder: string; type: string }
): ComfyUIClient {
  return {
    uploadImage: async (
      image: Buffer,
      filename: string,
      overwrite: boolean,
      subfolder: string
    ) => {
      calls.push({ filename, overwrite, subfolder, bytes: image.length });
      return reply ?? { name: filename, subfolder, type: "input" };
    },
    getImage: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
  } as unknown as ComfyUIClient;
}

test("a local file is uploaded and reported with the dimensions the caller needs", async () => {
  const calls: Parameters<typeof stubClient>[0] = [];
  const result = await uploadImage(stubClient(calls), {
    path: pngPath,
    subfolder: "",
    overwrite: false,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].filename, "photo.png");
  assert.equal(calls[0].bytes, png.length);
  assert.equal(result.reference, "photo.png");
  // Sizing the latent is the first thing an agent does with an input image,
  // so the upload answers it rather than forcing a second round trip.
  assert.equal(result.width, 64);
  assert.equal(result.height, 32);
  assert.equal(result.format, "png");
  assert.match(result.hint, /LoadImage/);
});

test("the name ComfyUI stored is the one reported, not the one requested", async () => {
  // With overwrite off, ComfyUI keeps the existing file and deduplicates the
  // upload. A workflow built from the requested name would then load the
  // wrong image - the previous one - and look like it simply ignored the new
  // upload.
  const calls: Parameters<typeof stubClient>[0] = [];
  const result = await uploadImage(
    stubClient(calls, { name: "photo (1).png", subfolder: "refs", type: "input" }),
    { path: pngPath, filename: "photo.png", subfolder: "refs", overwrite: false }
  );

  assert.equal(result.filename, "photo (1).png");
  assert.equal(result.reference, "refs/photo (1).png");
});

test("an image ComfyUI already made can be fed back in without leaving the server", async () => {
  const calls: Parameters<typeof stubClient>[0] = [];
  const result = await uploadImage(stubClient(calls), {
    from_output: { filename: "ComfyUI_00012_.png", subfolder: "", type: "output" },
    subfolder: "",
    overwrite: false,
  });

  assert.equal(calls[0].filename, "ComfyUI_00012_.png");
  assert.equal(result.reference, "ComfyUI_00012_.png");
});

test("neither source, or both, fails by naming the two sources", async () => {
  const calls: Parameters<typeof stubClient>[0] = [];

  await assert.rejects(
    uploadImage(stubClient(calls), { subfolder: "", overwrite: false }),
    (err: unknown) => {
      assert.ok(err instanceof ToolError);
      assert.match(err.hint ?? "", /from_output/);
      return true;
    }
  );

  await assert.rejects(
    uploadImage(stubClient(calls), {
      path: pngPath,
      from_output: { filename: "a.png", subfolder: "", type: "output" },
      subfolder: "",
      overwrite: false,
    }),
    (err: unknown) => err instanceof ToolError && /not both/.test(err.message)
  );

  assert.equal(calls.length, 0, "nothing should have been uploaded");
});

test("a missing path is refused here rather than becoming a ComfyUI 500", async () => {
  const calls: Parameters<typeof stubClient>[0] = [];
  await assert.rejects(
    uploadImage(stubClient(calls), {
      path: join(dir, "nope.png"),
      subfolder: "",
      overwrite: false,
    }),
    (err: unknown) => err instanceof ToolError && /Cannot read/.test(err.message)
  );
  assert.equal(calls.length, 0);
});

test("a file that is not an image names the tool that makes one", async () => {
  const notAnImage = join(dir, "notes.txt");
  writeFileSync(notAnImage, "these are not pixels");

  const calls: Parameters<typeof stubClient>[0] = [];
  await assert.rejects(
    uploadImage(stubClient(calls), { path: notAnImage, subfolder: "", overwrite: false }),
    (err: unknown) => {
      assert.ok(err instanceof ToolError);
      assert.match(err.hint ?? "", /comfyui_render_svg/);
      return true;
    }
  );
  assert.equal(calls.length, 0);
});

test("SVG is redirected to the tool that can rasterize it", async () => {
  const svgPath = join(dir, "shape.svg");
  writeFileSync(
    svgPath,
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'
  );

  const calls: Parameters<typeof stubClient>[0] = [];
  await assert.rejects(
    uploadImage(stubClient(calls), { path: svgPath, subfolder: "", overwrite: false }),
    (err: unknown) => {
      assert.ok(err instanceof ToolError);
      assert.match(err.hint ?? "", /comfyui_render_svg/);
      return true;
    }
  );
  assert.equal(calls.length, 0);
});

test("a subfolder that walks upwards is refused with the reason", () => {
  assert.equal(normalizeSubfolder("  /refs/  "), "refs");
  assert.equal(normalizeSubfolder("a\\b"), "a/b");
  assert.equal(normalizeSubfolder(""), "");

  // ComfyUI answers this with a bare 400 that explains nothing.
  assert.throws(
    () => normalizeSubfolder("../../etc"),
    (err: unknown) => err instanceof ToolError && /outside/.test(err.message)
  );
});

test("a stored name always carries an extension matching the bytes", () => {
  assert.equal(storedName(undefined, "photo.png", "png"), "photo.png");
  assert.equal(storedName("reference", "photo.png", "jpeg"), "reference.jpg");
  assert.equal(storedName("reference.png", "photo.jpg", "jpeg"), "reference.png");
  // A directory part in 'filename' is the caller reaching for 'subfolder'.
  assert.equal(storedName("nested/reference.png", "photo.png", "png"), "reference.png");
  assert.throws(() => storedName("..", "photo.png", "png"), ToolError);
});

test("the reference is what LoadImage expects, subfolder included", () => {
  assert.equal(buildReference("", "a.png"), "a.png");
  assert.equal(buildReference("refs", "a.png"), "refs/a.png");
});

test("the size limit is stated in the units the error reports", () => {
  assert.equal(MAX_UPLOAD_BYTES % (1024 * 1024), 0);
});
