/**
 * Turning a finished ComfyUI prompt into the images a tool returns.
 *
 * This was written twice - once in generate.ts for the sync path and once in
 * generate-async.ts for the async one - and the two copies drifted:
 *
 *  - The Docker escape hatch honouring a mounted OUTPUT_DIR existed only in
 *    the sync copy, so in Docker the async path silently saved nothing even
 *    with a volume configured.
 *  - The sync copy wrote the *processed* buffer, honouring imageFormat and
 *    imageQuality; the async copy wrote the raw bytes, so those two options
 *    were silently ignored for any file it saved.
 *  - The sync copy could return `path` and `data` together; the async copy
 *    treated them as exclusive. Both populate the same RunWorkflowResult.
 *
 * outputModeSchema is shared by both paths and documents the sync behaviour
 * ("Images are always saved to disk with absolute paths returned"), so the
 * sync semantics are the ones kept here and the async path now matches what
 * its own schema always claimed.
 */

import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { join, dirname, resolve, extname, basename } from "path";

import { ComfyUIClient } from "../client/comfyui.js";
import {
  processImageForTransfer,
  ImageProcessingOptions,
  DEFAULT_TRANSFER_OPTIONS,
} from "../utils/image.js";

/** One image as returned to the caller. */
export interface OutputImage {
  filename: string;
  data?: string;
  mimeType?: string;
  path?: string;
}

export interface RunWorkflowResult {
  success: boolean;
  promptId: string;
  outputs: Record<string, unknown>;
  images: OutputImage[];
  error?: string;
}

/** Options this module needs from the caller's tool input. */
export interface OutputOptions {
  outputMode?: "base64" | "file" | "auto";
  imageFormat?: "jpeg" | "png" | "webp";
  imageQuality?: number;
}

const FORMAT_EXTENSIONS: Record<string, string> = {
  jpeg: ".jpg",
  png: ".png",
  webp: ".webp",
};

export function isRunningInDocker(): boolean {
  return existsSync("/.dockerenv") || process.env.DOCKER === "true";
}

/**
 * Whether writing output files should be skipped.
 *
 * Inside Docker a write usually lands in a container layer nobody will look
 * at - unless OUTPUT_DIR is set, which means the user mounted a volume for
 * exactly this. The async path used a bare isRunningInDocker() and so ignored
 * the mount.
 */
export function shouldSkipFileSaving(): boolean {
  if (!isRunningInDocker()) return false;
  return !process.env.OUTPUT_DIR;
}

/**
 * A path that is not already taken, by appending -2, -3 and so on.
 *
 * The readable filename has one-second resolution and only carries an index
 * from the second image of a batch, so two runs of the same prompt landing in
 * the same second produced the same name and writeFile silently overwrote.
 * The caller was handed two OutputImage entries with identical `path` values,
 * one of which no longer held the bytes it named.
 */
export function uniquePath(candidate: string): string {
  if (!existsSync(candidate)) return candidate;

  const dir = dirname(candidate);
  const ext = extname(candidate);
  const stem = basename(candidate, ext);

  for (let n = 2; n < 1000; n++) {
    const next = join(dir, `${stem}-${n}${ext}`);
    if (!existsSync(next)) return next;
  }
  return candidate;
}

/** A filename a human can recognise later, from the prompt and the date. */
export function generateReadableFilename(
  prompt: string,
  workflowType: string,
  index: number,
  extension: string
): string {
  const cleanPrompt = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 50)
    .replace(/-+$/, "");

  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .substring(0, 19);

  const parts = [cleanPrompt || workflowType, timestamp];
  if (index > 0) parts.push(String(index));

  return `${parts.join("_")}${extension}`;
}

/**
 * The positive prompt from a workflow, for naming files after it.
 *
 * Best-effort: a workflow with no CLIPTextEncode still needs a name.
 */
export function workflowPromptFor(workflow: Record<string, unknown>): string {
  for (const node of Object.values(workflow)) {
    const nodeObj = node as { class_type?: string; inputs?: { text?: string } };
    if (nodeObj.class_type === "CLIPTextEncode" && nodeObj.inputs?.text) {
      return nodeObj.inputs.text;
    }
  }
  return "custom-workflow";
}

/**
 * Download every image a finished prompt produced, save it, and decide
 * whether to inline it as base64.
 *
 * Saving and inlining are separate decisions, which is what `outputMode`
 * has always documented: the file is written unless Docker says otherwise,
 * and `outputMode` controls only whether the bytes also travel inline.
 */
export async function collectOutputImages(
  client: ComfyUIClient,
  outputs: Record<string, unknown>,
  input: OutputOptions,
  workflow: Record<string, unknown>,
  outputDir: string,
  sizeThreshold: number
): Promise<OutputImage[]> {
  const workflowPrompt = workflowPromptFor(workflow);
  const skipFileSave = shouldSkipFileSaving();

  const processingOptions: ImageProcessingOptions = {
    format: input.imageFormat || DEFAULT_TRANSFER_OPTIONS.format,
    quality: input.imageQuality || DEFAULT_TRANSFER_OPTIONS.quality,
  };
  const ext = FORMAT_EXTENSIONS[processingOptions.format || "jpeg"];

  const images: OutputImage[] = [];
  let imageIndex = 0;

  for (const output of Object.values(outputs)) {
    const nodeOutput = output as {
      images?: Array<{ filename: string; subfolder: string; type: string }>;
    };
    if (!nodeOutput.images) continue;

    for (const img of nodeOutput.images) {
      const imageBuffer = Buffer.from(
        await client.getImage(img.filename, img.subfolder, img.type)
      );
      const readableFilename = generateReadableFilename(
        workflowPrompt,
        "workflow",
        imageIndex,
        ext
      );

      // Processed once and reused: converting twice for an image that is both
      // saved and inlined is the most expensive thing on this path.
      let processed: { data: string; mimeType: string } | undefined;
      const process = async () => {
        processed ??= await processImageForTransfer(imageBuffer, processingOptions);
        return processed;
      };

      let absolutePath: string | undefined;
      if (!skipFileSave) {
        // resolve(), not join(): outputMode's own description promises
        // "absolute paths returned", and the shipped default outputDir is
        // "./outputs". A relative path is resolved against the MCP server
        // process's cwd, which for a stdio server launched by a client is
        // not the agent's - so the agent could not open the file it was
        // handed.
        const outputPath = uniquePath(resolve(outputDir, readableFilename));
        const outputDirPath = dirname(outputPath);
        if (!existsSync(outputDirPath)) {
          await mkdir(outputDirPath, { recursive: true });
        }
        // The converted bytes, so the file on disk is in the requested
        // format. The async path used to write the raw buffer here.
        await writeFile(outputPath, Buffer.from((await process()).data, "base64"));
        absolutePath = outputPath;
      }

      const includeBase64 =
        skipFileSave || // nothing was written, so the bytes must travel inline
        input.outputMode === "base64" ||
        (input.outputMode === "auto" && imageBuffer.length <= sizeThreshold);

      if (includeBase64) {
        const { data, mimeType } = await process();
        images.push({ filename: readableFilename, path: absolutePath, data, mimeType });
      } else {
        images.push({ filename: readableFilename, path: absolutePath });
      }

      imageIndex++;
    }
  }

  return images;
}
