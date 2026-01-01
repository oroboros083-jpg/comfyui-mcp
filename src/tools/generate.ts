import { z } from "zod";
import { ComfyUIClient, ObjectInfo } from "../client/comfyui.js";
import { ComfyUIWebSocket } from "../client/websocket.js";
import { Capabilities } from "../capabilities/index.js";
import { SessionDefaults } from "../context.js";
import {
  buildStandardTxt2Img,
  buildFluxWorkflow,
  selectWorkflowType,
  Workflow,
} from "../workflows/builder.js";
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
    "How to return the output: base64 (inline), file (save to disk), or auto (based on size)"
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

export const generateImageSchema = z.object({
  prompt: z.string().describe("The positive prompt describing what to generate"),
  negativePrompt: z
    .string()
    .optional()
    .default("")
    .describe("Negative prompt describing what to avoid (not used by Flux)"),
  model: z
    .string()
    .optional()
    .describe(
      "Model to use (checkpoint name, UNET name, etc). Use list_models to see available options."
    ),
  width: z.number().optional().default(1024).describe("Image width in pixels"),
  height: z.number().optional().default(1024).describe("Image height in pixels"),
  steps: z.number().optional().default(20).describe("Number of sampling steps"),
  cfg: z
    .number()
    .optional()
    .default(7)
    .describe("CFG scale / guidance (1-30, higher = more prompt adherence)"),
  seed: z
    .number()
    .optional()
    .default(-1)
    .describe("Random seed (-1 for random)"),
  sampler: z
    .string()
    .optional()
    .describe("Sampler name (auto-selected if not provided)"),
  scheduler: z
    .string()
    .optional()
    .describe("Scheduler (auto-selected if not provided)"),
  batchSize: z.number().optional().default(1).describe("Number of images to generate"),
  outputMode: outputModeSchema,
  imageFormat: imageFormatSchema.optional(),
  imageQuality: imageQualitySchema.optional(),
  timeout: timeoutSchema.optional(),
  sync: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, wait for generation to complete and return images directly (blocking). Default is async (non-blocking)."),
});

export type GenerateImageInput = z.infer<typeof generateImageSchema>;

/**
 * Apply session defaults to generation input
 * Explicit parameters take priority over session defaults
 */
export function applySessionDefaults(
  input: GenerateImageInput,
  defaults: SessionDefaults
): GenerateImageInput {
  return {
    ...input,
    model: input.model ?? defaults.model,
    sampler: input.sampler ?? defaults.sampler,
    scheduler: input.scheduler ?? defaults.scheduler,
    steps: input.steps ?? defaults.steps,
    cfg: input.cfg ?? defaults.cfg,
    width: input.width ?? defaults.width,
    height: input.height ?? defaults.height,
    negativePrompt: input.negativePrompt ?? defaults.negativePrompt,
    imageFormat: input.imageFormat ?? defaults.imageFormat,
    imageQuality: input.imageQuality ?? defaults.imageQuality,
    outputMode: input.outputMode ?? defaults.outputMode,
  };
}

export interface GenerateResult {
  success: boolean;
  promptId: string;
  images: Array<{
    filename: string;
    data?: string; // base64
    mimeType?: string; // e.g., "image/jpeg"
    path?: string; // file path
  }>;
  workflowType: string;
  error?: string;
}

/**
 * Build workflow dynamically based on available capabilities
 */
function buildWorkflow(
  input: GenerateImageInput,
  capabilities: Capabilities,
  objectInfo: ObjectInfo
): { workflow: Workflow; type: string } {
  const workflowType = selectWorkflowType(input.model, capabilities, objectInfo);

  // Get default sampler/scheduler from capabilities
  const defaultSampler =
    capabilities.availableSamplers[0] || "euler";
  const defaultScheduler =
    capabilities.availableSchedulers[0] || "normal";

  if (workflowType === "flux") {
    return {
      workflow: buildFluxWorkflow(
        {
          prompt: input.prompt,
          unet: input.model,
          width: input.width,
          height: input.height,
          steps: input.steps || 20,
          guidance: input.cfg || 3.5, // Flux uses lower guidance
          seed: input.seed,
          sampler: input.sampler || defaultSampler,
          scheduler: input.scheduler || "simple",
        },
        objectInfo
      ),
      type: "flux",
    };
  }

  // Standard SD 1.5 / SDXL workflow
  return {
    workflow: buildStandardTxt2Img(
      {
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        checkpoint: input.model,
        width: input.width,
        height: input.height,
        steps: input.steps,
        cfg: input.cfg,
        seed: input.seed,
        sampler: input.sampler || defaultSampler,
        scheduler: input.scheduler || defaultScheduler,
        batchSize: input.batchSize,
      },
      objectInfo
    ),
    type: "standard",
  };
}

export async function generateImage(
  client: ComfyUIClient,
  ws: ComfyUIWebSocket,
  input: GenerateImageInput,
  capabilities: Capabilities,
  objectInfo: ObjectInfo,
  outputDir: string,
  sizeThreshold: number,
  timeout: number = 300000
): Promise<GenerateResult> {
  // Build workflow based on capabilities
  const { workflow, type } = buildWorkflow(input, capabilities, objectInfo);

  // Queue the prompt
  const queueResponse = await client.queuePrompt(workflow);

  if (Object.keys(queueResponse.node_errors).length > 0) {
    return {
      success: false,
      promptId: queueResponse.prompt_id,
      images: [],
      workflowType: type,
      error: JSON.stringify(queueResponse.node_errors),
    };
  }

  // Wait for completion
  const result = await ws.waitForPrompt(queueResponse.prompt_id, timeout);

  if (!result.success) {
    return {
      success: false,
      promptId: result.promptId,
      images: [],
      workflowType: type,
      error: result.error,
    };
  }

  // Extract image outputs
  const images: GenerateResult["images"] = [];
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

        // In Docker, always use base64 since file paths aren't accessible to the host
        const inDocker = isRunningInDocker();
        const shouldSaveToFile =
          !inDocker && (
            input.outputMode === "file" ||
            (input.outputMode === "auto" && imageBuffer.length > sizeThreshold)
          );

        if (shouldSaveToFile) {
          // Generate human-readable filename
          const ext = img.filename.match(/\.[^.]+$/)?.[0] || ".png";
          const readableFilename = generateReadableFilename(input.prompt, type, imageIndex, ext);
          const outputPath = join(outputDir, readableFilename);
          const outputDirPath = dirname(outputPath);
          if (!existsSync(outputDirPath)) {
            await mkdir(outputDirPath, { recursive: true });
          }
          await writeFile(outputPath, imageBuffer);
          images.push({ filename: readableFilename, path: outputPath });
        } else {
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
          const readableFilename = generateReadableFilename(input.prompt, type, imageIndex, ext);

          images.push({
            filename: readableFilename,
            data: processed.data,
            mimeType: processed.mimeType,
          });
        }
        imageIndex++;
      }
    }
  }

  return {
    success: true,
    promptId: result.promptId,
    images,
    workflowType: type,
  };
}

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

        // In Docker, always use base64 since file paths aren't accessible to the host
        const inDocker = isRunningInDocker();
        const shouldSaveToFile =
          !inDocker && (
            input.outputMode === "file" ||
            (input.outputMode === "auto" && imageBuffer.length > sizeThreshold)
          );

        if (shouldSaveToFile) {
          // Generate human-readable filename
          const ext = img.filename.match(/\.[^.]+$/)?.[0] || ".png";
          const readableFilename = generateReadableFilename(workflowPrompt, "workflow", imageIndex, ext);
          const outputPath = join(outputDir, readableFilename);
          const outputDirPath = dirname(outputPath);
          if (!existsSync(outputDirPath)) {
            await mkdir(outputDirPath, { recursive: true });
          }
          await writeFile(outputPath, imageBuffer);
          images.push({ filename: readableFilename, path: outputPath });
        } else {
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
          const readableFilename = generateReadableFilename(workflowPrompt, "workflow", imageIndex, ext);

          images.push({
            filename: readableFilename,
            data: processed.data,
            mimeType: processed.mimeType,
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
