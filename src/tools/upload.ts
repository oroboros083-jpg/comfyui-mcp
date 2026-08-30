/**
 * Getting an image *into* ComfyUI.
 *
 * Every img2img, inpainting, ControlNet and image-to-video workflow starts at
 * a LoadImage node, which reads a file from ComfyUI's own input directory -
 * not from the caller's disk, and not from the output directory where the
 * previous generation landed. Without this, an agent holding a photo or a
 * just-generated frame has no way to make it reachable by a workflow, and the
 * bundled ControlNet and i2v examples cannot be run at all.
 *
 * Two sources, because those are the two places an image actually comes from:
 * a local file the user pointed at, and an image ComfyUI already produced.
 * Neither routes the bytes through the model's context - a base64 source would
 * cost more context than the rest of the conversation.
 */

import { z } from "zod";
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import sharp from "sharp";

import { ComfyUIClient } from "../client/comfyui.js";
import { ToolError } from "../utils/errors.js";

/**
 * Refuse a file this big rather than streaming it into memory and letting
 * ComfyUI answer with a 413 several seconds later. Generous enough for any
 * still image, including 16-bit scans.
 */
export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

/** Extension to store under, per format sharp reports. */
const FORMAT_EXTENSIONS: Record<string, string> = {
  jpeg: ".jpg",
  png: ".png",
  webp: ".webp",
  gif: ".gif",
  avif: ".avif",
  tiff: ".tiff",
  heif: ".heif",
};

export const uploadImageSchema = z
  .object({
    path: z
      .string()
      .optional()
      .describe(
        "Absolute path to an image file on this machine, e.g. '/home/me/photo.jpg'. " +
          "Exactly one of 'path' or 'from_output' is required."
      ),
    from_output: z
      .object({
        filename: z
          .string()
          .describe("Filename as ComfyUI reported it, e.g. 'ComfyUI_00012_.png'"),
        subfolder: z
          .string()
          .optional()
          .default("")
          .describe("Subfolder the image sits in, if any"),
        type: z
          .enum(["output", "input", "temp"])
          .optional()
          .default("output")
          .describe("Which ComfyUI directory to copy from"),
      })
      .strict()
      .optional()
      .describe(
        "An image ComfyUI already has - a previous generation - to copy into the input " +
          "directory. Use this to feed a result back in for upscaling, refinement or video. " +
          "Exactly one of 'path' or 'from_output' is required."
      ),
    filename: z
      .string()
      .optional()
      .describe(
        "Name to store it under. Defaults to the source filename. An image extension is " +
          "added if missing; any directory part is ignored - use 'subfolder' for that."
      ),
    subfolder: z
      .string()
      .optional()
      .default("")
      .describe("Subfolder within the input directory to store it in, e.g. 'refs'"),
    overwrite: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Replace an existing file of the same name. When false (the default) ComfyUI stores " +
          "the upload under a deduplicated name instead - use the returned 'reference'."
      ),
  })
  .strict();

export type UploadImageInput = z.infer<typeof uploadImageSchema>;

export interface UploadImageResult {
  /** Name ComfyUI actually stored it under, which differs when it deduplicated. */
  filename: string;
  subfolder: string;
  type: string;
  /** The exact string to put in a LoadImage node's `image` input. */
  reference: string;
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
  hint: string;
}

/**
 * A subfolder, or a refusal.
 *
 * ComfyUI answers a traversing path with a bare 400, which reaches the agent
 * as "Failed to upload image: 400 Bad Request" and explains nothing.
 */
export function normalizeSubfolder(subfolder: string): string {
  const trimmed = subfolder.trim().replace(/^[/\\]+|[/\\]+$/g, "");
  if (!trimmed) return "";

  const segments = trimmed.split(/[/\\]+/);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new ToolError(
      `Subfolder '${subfolder}' walks outside ComfyUI's input directory.`,
      "Pass a plain relative name such as 'refs', or omit 'subfolder' entirely."
    );
  }
  return segments.join("/");
}

/**
 * The name to store under: the caller's choice or the source's, stripped of
 * any directory part, and carrying an extension that matches the actual bytes.
 *
 * The extension is not cosmetic - ComfyUI's frontend picks the thumbnailer by
 * it, and a LoadImage entry with no extension does not appear in the picker
 * the human uses to check what the agent uploaded.
 */
export function storedName(requested: string | undefined, sourceName: string, format: string): string {
  const chosen = basename((requested ?? sourceName).trim());
  if (!chosen || chosen === "." || chosen === "..") {
    throw new ToolError(
      `'${requested ?? sourceName}' is not a usable filename.`,
      "Pass 'filename' as a plain name such as 'reference.png'."
    );
  }

  const wanted = FORMAT_EXTENSIONS[format] ?? ".png";
  return extname(chosen) ? chosen : `${chosen}${wanted}`;
}

/** What a LoadImage node needs: 'name.png', or 'sub/name.png' inside a subfolder. */
export function buildReference(subfolder: string, filename: string): string {
  return subfolder ? `${subfolder}/${filename}` : filename;
}

/** Read a local file, refusing early what ComfyUI would refuse late. */
async function readLocalImage(path: string): Promise<{ bytes: Buffer; sourceName: string }> {
  let size: number;
  try {
    const info = await stat(path);
    if (!info.isFile()) {
      throw new ToolError(
        `'${path}' is not a file.`,
        "Pass the path to an image file, not a directory."
      );
    }
    size = info.size;
  } catch (cause) {
    if (cause instanceof ToolError) throw cause;
    throw new ToolError(
      `Cannot read '${path}': ${cause instanceof Error ? cause.message : String(cause)}`,
      "Check the path is absolute and the file exists on the machine running this server."
    );
  }

  if (size > MAX_UPLOAD_BYTES) {
    throw new ToolError(
      `'${path}' is ${Math.round(size / 1024 / 1024)}MB, over the ${MAX_UPLOAD_BYTES / 1024 / 1024}MB upload limit.`,
      "Resize or re-encode the image first; ComfyUI works from pixels, not from print resolution."
    );
  }

  return { bytes: await readFile(path), sourceName: basename(path) };
}

/**
 * Upload an image into ComfyUI's input directory and report what to call it.
 */
export async function uploadImage(
  client: ComfyUIClient,
  input: UploadImageInput
): Promise<UploadImageResult> {
  if (!input.path === !input.from_output) {
    throw new ToolError(
      input.path
        ? "Pass either 'path' or 'from_output', not both."
        : "No image to upload: neither 'path' nor 'from_output' was given.",
      "Use 'path' for a file on disk, or 'from_output' with the filename comfyui_get_task_result " +
        "reported to reuse an image ComfyUI already made."
    );
  }

  let bytes: Buffer;
  let sourceName: string;

  if (input.path) {
    ({ bytes, sourceName } = await readLocalImage(input.path));
  } else {
    const source = input.from_output!;
    const fetched = await client.getImage(source.filename, source.subfolder, source.type);
    bytes = Buffer.from(fetched);
    sourceName = basename(source.filename);

    // The same ceiling as a local file, so the limit means one thing. A video
    // that large would fail the decode below anyway - LoadImage reads stills.
    if (bytes.length > MAX_UPLOAD_BYTES) {
      throw new ToolError(
        `'${sourceName}' is ${Math.round(bytes.length / 1024 / 1024)}MB, over the ${MAX_UPLOAD_BYTES / 1024 / 1024}MB upload limit.`,
        "Downscale it in a workflow first, or fetch it with comfyui_get_image and upload a re-encoded copy."
      );
    }
  }

  // Decoding also validates: a PDF or a truncated download reaching ComfyUI
  // comes back as a 500 from deep inside PIL, which names neither the file
  // nor the problem.
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(bytes).metadata();
  } catch (cause) {
    throw new ToolError(
      `'${sourceName}' is not a readable image.`,
      "ComfyUI loads raster images (PNG, JPEG, WebP). Convert the file first, or build one with comfyui_render_svg.",
      { cause }
    );
  }

  const format = metadata.format ?? "";
  if (format === "svg") {
    throw new ToolError(
      `'${sourceName}' is an SVG, which ComfyUI's LoadImage node cannot read.`,
      "Use comfyui_render_svg instead - it rasterizes the markup and uploads the PNG in one step."
    );
  }
  if (!metadata.width || !metadata.height) {
    throw new ToolError(
      `'${sourceName}' has no readable dimensions.`,
      "The file may be truncated. Re-export it as a PNG or JPEG and try again."
    );
  }

  const subfolder = normalizeSubfolder(input.subfolder);
  const filename = storedName(input.filename, sourceName, format);

  const uploaded = await client.uploadImage(bytes, filename, input.overwrite, subfolder);
  const reference = buildReference(uploaded.subfolder, uploaded.name);

  return {
    filename: uploaded.name,
    subfolder: uploaded.subfolder,
    type: uploaded.type,
    reference,
    width: metadata.width,
    height: metadata.height,
    format,
    sizeBytes: bytes.length,
    hint:
      `Set a LoadImage node's "image" input to "${reference}". ` +
      `comfyui_recommend_workflow({ category: "controlnet" }) has graphs that start from one.`,
  };
}
