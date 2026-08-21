import { z } from "zod";
import { ComfyUIClient } from "../client/comfyui.js";
import {
  processImageForTransfer,
  DEFAULT_TRANSFER_OPTIONS,
  ImageProcessingOptions,
} from "../utils/image.js";

export const outputModeSchema = z
  .enum(["base64", "file", "auto"])
  .default("auto")
  .describe(
    "Images are always saved to disk with absolute paths returned. This controls base64 inclusion: 'file' = path only, 'base64' = path + inline data, 'auto' = path + inline if small"
  );

export const imageFormatSchema = z
  .enum(["jpeg", "png", "webp"])
  .default("jpeg")
  .describe("Output image format (jpeg is smallest, png is lossless, webp is modern)");

export const imageQualitySchema = z
  .number()
  .min(1)
  .max(100)
  .default(85)
  .describe("Image quality for JPEG/WebP (1-100, higher = better quality but larger)");

export const runWorkflowSchema = z.object({
  workflow: z
    .record(z.unknown())
    .describe("The ComfyUI workflow JSON (API format)"),
  outputMode: outputModeSchema,
  imageFormat: imageFormatSchema.optional(),
  imageQuality: imageQualitySchema.optional(),
  sync: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, wait for workflow to complete and return results directly (blocking). Default is async (non-blocking)."),
  name: z
    .string()
    .optional()
    .describe("Descriptive name for this generation (e.g., 'beach_sunset_v2', 'logo_blue_variant'). Use clear, searchable names to find it later with get_generation_by_name."),
}).strict();

export type RunWorkflowInput = z.infer<typeof runWorkflowSchema>;

// Defined in outputs.ts, which owns the shape; re-exported because
// jobs/manager.ts and the tool modules import it from here.
export type { RunWorkflowResult, OutputImage } from "./outputs.js";

export const getImageSchema = z.object({
  filename: z
    .string()
    .describe("The filename of the image to retrieve (e.g., 'ComfyUI_00001_.png')"),
  subfolder: z
    .string()
    .optional()
    .default("")
    .describe("Subfolder within the output directory"),
  type: z
    .enum(["output", "input", "temp"])
    .optional()
    .default("output")
    .describe("Type of image location"),
  imageFormat: imageFormatSchema.optional(),
  imageQuality: imageQualitySchema.optional(),
}).strict();

export type GetImageInput = z.infer<typeof getImageSchema>;

export interface GetImageResult {
  success: boolean;
  filename: string;
  data?: string; // base64
  mimeType?: string;
  error?: string;
}

/**
 * Retrieve a generated image as base64 (processed for efficient transfer)
 */
export async function getImage(
  client: ComfyUIClient,
  input: GetImageInput
): Promise<GetImageResult> {
  try {
    const imageData = await client.getImage(
      input.filename,
      input.subfolder || "",
      input.type || "output"
    );
    const imageBuffer = Buffer.from(imageData);

    // Build processing options from input or use defaults
    const processingOptions: ImageProcessingOptions = {
      format: input.imageFormat || DEFAULT_TRANSFER_OPTIONS.format,
      quality: input.imageQuality || DEFAULT_TRANSFER_OPTIONS.quality,
    };

    // Process image for efficient transfer
    const processed = await processImageForTransfer(imageBuffer, processingOptions);

    // Determine output extension based on format
    const formatExtensions: Record<string, string> = {
      jpeg: ".jpg",
      png: ".png",
      webp: ".webp",
    };
    const ext = formatExtensions[processingOptions.format || "jpeg"];
    const outputFilename = input.filename.replace(/\.[^.]+$/, ext);

    return {
      success: true,
      filename: outputFilename,
      data: processed.data,
      mimeType: processed.mimeType,
    };
  } catch (error) {
    return {
      success: false,
      filename: input.filename,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
