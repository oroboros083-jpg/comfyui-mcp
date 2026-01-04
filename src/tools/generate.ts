import { z } from "zod";
import { ComfyUIClient } from "../client/comfyui.js";
import { ComfyUIWebSocket } from "../client/websocket.js";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import {
  processImageForTransfer,
  DEFAULT_TRANSFER_OPTIONS,
  ImageProcessingOptions,
} from "../utils/image.js";

/**
 * Check if we're running inside a Docker container
 */
function isRunningInDocker(): boolean {
  return existsSync("/.dockerenv") || process.env.DOCKER === "true";
}

/**
 * Check if file saving should be skipped in Docker
 * Returns false (allow saving) if OUTPUT_DIR is explicitly set (indicates volume mount)
 */
function shouldSkipFileSaving(): boolean {
  if (!isRunningInDocker()) return false;
  // If OUTPUT_DIR is set, user has configured a volume mount
  return !process.env.OUTPUT_DIR;
}

/**
 * Generate a human-readable filename from prompt and metadata
 */
function generateReadableFilename(
  prompt: string,
  workflowType: string,
  index: number,
  extension: string
): string {
  // Clean and truncate prompt for filename
  const cleanPrompt = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // Remove special chars
    .replace(/\s+/g, "-") // Spaces to hyphens
    .substring(0, 50) // Limit length
    .replace(/-+$/, ""); // Remove trailing hyphens

  // Generate timestamp: YYYYMMDD-HHMMSS
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:T]/g, "")
    .substring(0, 15)
    .replace(/(\d{8})(\d{6})/, "$1-$2");

  // Build filename: prompt-snippet_model_timestamp_index.ext
  const parts = [cleanPrompt || "image", workflowType, timestamp];
  if (index > 0) {
    parts.push(String(index + 1));
  }

  return `${parts.join("_")}${extension}`;
}

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

export const timeoutSchema = z
  .number()
  .min(30000)
  .max(3600000)
  .default(300000)
  .describe(
    "Timeout in milliseconds (default: 300000 = 5 min). Increase for complex generations: SD1.5 ~30s, SDXL ~1-2min, Flux on CPU ~10-30min"
  );

export const runWorkflowSchema = z.object({
  workflow: z
    .record(z.unknown())
    .describe("The ComfyUI workflow JSON (API format)"),
  outputMode: outputModeSchema,
  imageFormat: imageFormatSchema.optional(),
  imageQuality: imageQualitySchema.optional(),
  timeout: timeoutSchema.optional(),
  sync: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, wait for workflow to complete and return results directly (blocking). Default is async (non-blocking)."),
  name: z
    .string()
    .optional()
    .describe("Descriptive name for this generation (e.g., 'beach_sunset_v2', 'logo_blue_variant'). Use clear, searchable names to find it later with get_generation_by_name."),
});

export type RunWorkflowInput = z.infer<typeof runWorkflowSchema>;

export interface RunWorkflowResult {
  success: boolean;
  promptId: string;
  outputs: Record<string, unknown>;
  images: Array<{
    filename: string;
    data?: string;
    mimeType?: string;
    path?: string;
  }>;
  error?: string;
}

export async function runWorkflow(
  client: ComfyUIClient,
  ws: ComfyUIWebSocket,
  input: RunWorkflowInput,
  outputDir: string,
  sizeThreshold: number,
  timeout: number = 300000
): Promise<RunWorkflowResult> {
  // Queue the prompt
  const queueResponse = await client.queuePrompt(input.workflow);

  if (Object.keys(queueResponse.node_errors).length > 0) {
    return {
      success: false,
      promptId: queueResponse.prompt_id,
      outputs: {},
      images: [],
      error: JSON.stringify(queueResponse.node_errors),
    };
  }

  // Wait for completion
  const result = await ws.waitForPrompt(queueResponse.prompt_id, timeout);

  if (!result.success) {
    return {
      success: false,
      promptId: result.promptId,
      outputs: result.outputs,
      images: [],
      error: result.error,
    };
  }

  // Try to extract a prompt from the workflow for readable naming
  let workflowPrompt = "custom-workflow";
  for (const node of Object.values(input.workflow)) {
    const nodeObj = node as { class_type?: string; inputs?: { text?: string } };
    if (nodeObj.class_type === "CLIPTextEncode" && nodeObj.inputs?.text) {
      workflowPrompt = nodeObj.inputs.text;
      break;
    }
  }

  // Extract outputs
  const images: RunWorkflowResult["images"] = [];
  let imageIndex = 0;

  for (const [_nodeId, output] of Object.entries(result.outputs)) {
    const nodeOutput = output as {
      images?: Array<{ filename: string; subfolder: string; type: string }>;
    };
    if (nodeOutput.images) {
      for (const img of nodeOutput.images) {
        const imageData = await client.getImage(
          img.filename,
          img.subfolder,
          img.type
        );
        const imageBuffer = Buffer.from(imageData);

        const skipFileSave = shouldSkipFileSaving();

        // Build processing options for format conversion
        const processingOptions: ImageProcessingOptions = {
          format: input.imageFormat || DEFAULT_TRANSFER_OPTIONS.format,
          quality: input.imageQuality || DEFAULT_TRANSFER_OPTIONS.quality,
        };

        // Determine output extension based on format
        const formatExtensions: Record<string, string> = {
          jpeg: ".jpg",
          png: ".png",
          webp: ".webp",
        };
        const ext = formatExtensions[processingOptions.format || "jpeg"];
        const readableFilename = generateReadableFilename(workflowPrompt, "workflow", imageIndex, ext);

        // Always save to disk (unless in Docker without configured volume mount)
        let absolutePath: string | undefined;
        if (!skipFileSave) {
          const outputPath = join(outputDir, readableFilename);
          const outputDirPath = dirname(outputPath);
          if (!existsSync(outputDirPath)) {
            await mkdir(outputDirPath, { recursive: true });
          }

          // Process and save in the requested format
          const processed = await processImageForTransfer(imageBuffer, processingOptions);
          const processedBuffer = Buffer.from(processed.data, "base64");
          await writeFile(outputPath, processedBuffer);
          absolutePath = outputPath;
        }

        // Determine if we should include base64 data
        const includeBase64 =
          skipFileSave || // Always include if no file saved
          input.outputMode === "base64" ||
          (input.outputMode === "auto" && imageBuffer.length <= sizeThreshold);

        if (includeBase64) {
          const processed = await processImageForTransfer(imageBuffer, processingOptions);
          images.push({
            filename: readableFilename,
            path: absolutePath,
            data: processed.data,
            mimeType: processed.mimeType,
          });
        } else {
          images.push({
            filename: readableFilename,
            path: absolutePath,
          });
        }
        imageIndex++;
      }
    }
  }

  return {
    success: true,
    promptId: result.promptId,
    outputs: result.outputs,
    images,
  };
}

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
});

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
