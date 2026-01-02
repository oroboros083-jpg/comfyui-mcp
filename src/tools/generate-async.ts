import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ComfyUIClient } from "../client/comfyui.js";
import { ComfyUIWebSocket, PromptResult } from "../client/websocket.js";
import { Capabilities } from "../capabilities/index.js";
import { ObjectInfo } from "../client/comfyui.js";
import { JobManager, Job } from "../jobs/manager.js";
import {
  sendTaskStatusNotification,
  sendProgressNotification,
  sendCompletionNotification,
} from "../jobs/notifications.js";
import {
  GenerateImageInput,
  RunWorkflowInput,
  GenerateResult,
  RunWorkflowResult,
} from "./generate.js";
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
 * Result returned immediately when starting an async generation.
 */
export interface AsyncGenerateResult {
  taskId: string;
  promptId: string;
  status: "working";
  statusMessage: string;
  pollInterval: number; // suggested polling interval in ms
  name?: string; // optional user-assigned name
}

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
  const cleanPrompt = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 50)
    .replace(/-+$/, "");

  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:T]/g, "")
    .substring(0, 15)
    .replace(/(\d{8})(\d{6})/, "$1-$2");

  const parts = [cleanPrompt || "image", workflowType, timestamp];
  if (index > 0) {
    parts.push(String(index + 1));
  }

  return `${parts.join("_")}${extension}`;
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

  const defaultSampler = capabilities.availableSamplers[0] || "euler";
  const defaultScheduler = capabilities.availableSchedulers[0] || "normal";

  if (workflowType === "flux") {
    return {
      workflow: buildFluxWorkflow(
        {
          prompt: input.prompt,
          unet: input.model,
          width: input.width,
          height: input.height,
          steps: input.steps || 20,
          guidance: input.cfg || 3.5,
          seed: input.seed,
          sampler: input.sampler || defaultSampler,
          scheduler: input.scheduler || "simple",
        },
        objectInfo
      ),
      type: "flux",
    };
  }

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

/**
 * Process completed generation results and update the job.
 */
async function processGenerationResult(
  client: ComfyUIClient,
  result: PromptResult,
  input: GenerateImageInput,
  workflowType: string,
  outputDir: string,
  sizeThreshold: number
): Promise<GenerateResult> {
  if (!result.success) {
    return {
      success: false,
      promptId: result.promptId,
      images: [],
      workflowType,
      error: result.error,
    };
  }

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

        const inDocker = isRunningInDocker();
        const shouldSaveToFile =
          !inDocker &&
          (input.outputMode === "file" ||
            (input.outputMode === "auto" && imageBuffer.length > sizeThreshold));

        if (shouldSaveToFile) {
          const ext = img.filename.match(/\.[^.]+$/)?.[0] || ".png";
          const readableFilename = generateReadableFilename(
            input.prompt,
            workflowType,
            imageIndex,
            ext
          );
          const outputPath = join(outputDir, readableFilename);
          const outputDirPath = dirname(outputPath);
          if (!existsSync(outputDirPath)) {
            await mkdir(outputDirPath, { recursive: true });
          }
          await writeFile(outputPath, imageBuffer);
          images.push({ filename: readableFilename, path: outputPath });
        } else {
          const processingOptions: ImageProcessingOptions = {
            format: input.imageFormat || DEFAULT_TRANSFER_OPTIONS.format,
            quality: input.imageQuality || DEFAULT_TRANSFER_OPTIONS.quality,
          };

          const processed = await processImageForTransfer(
            imageBuffer,
            processingOptions
          );

          const formatExtensions: Record<string, string> = {
            jpeg: ".jpg",
            png: ".png",
            webp: ".webp",
          };
          const ext = formatExtensions[processingOptions.format || "jpeg"];
          const readableFilename = generateReadableFilename(
            input.prompt,
            workflowType,
            imageIndex,
            ext
          );

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
    workflowType,
  };
}

/**
 * Start an async image generation.
 * Returns immediately with a task ID, while generation continues in the background.
 */
export async function generateImageAsync(
  server: Server,
  jobManager: JobManager,
  client: ComfyUIClient,
  ws: ComfyUIWebSocket,
  input: GenerateImageInput,
  capabilities: Capabilities,
  objectInfo: ObjectInfo,
  outputDir: string,
  sizeThreshold: number
): Promise<AsyncGenerateResult> {
  // Build workflow based on capabilities
  const { workflow, type } = buildWorkflow(input, capabilities, objectInfo);

  // Queue the prompt
  const queueResponse = await client.queuePrompt(workflow);

  if (Object.keys(queueResponse.node_errors).length > 0) {
    throw new Error(`Workflow errors: ${JSON.stringify(queueResponse.node_errors)}`);
  }

  const promptId = queueResponse.prompt_id;

  // Create job in manager
  const job = jobManager.createJob(promptId, {
    type: "generate_image",
    input,
  }, input.name);

  // Send initial notification
  await sendTaskStatusNotification(server, job);

  // Set up progress listener
  const progressHandler = (data: { value: number; max: number; prompt_id: string; node: string }) => {
    if (data.prompt_id === promptId) {
      const updatedJob = jobManager.updateProgress(promptId, data.value, data.max, data.node);
      if (updatedJob) {
        sendProgressNotification(server, updatedJob, {
          value: data.value,
          max: data.max,
          node: data.node,
        }).catch(() => {});
      }
    }
  };

  ws.on("progress", progressHandler);

  // Start background processing for completion
  // We don't await this - it runs in the background
  (async () => {
    try {
      // Wait for completion (this blocks in the background)
      const timeout = input.timeout || 300000;
      const result = await ws.waitForPrompt(promptId, timeout);

      // Process result
      const generateResult = await processGenerationResult(
        client,
        result,
        input,
        type,
        outputDir,
        sizeThreshold
      );

      // Update job
      if (generateResult.success) {
        jobManager.completeJob(promptId, generateResult);
      } else {
        jobManager.failJob(promptId, generateResult.error || "Unknown error");
      }

      // Send completion notification
      const completedJob = jobManager.getJob(promptId);
      if (completedJob) {
        await sendCompletionNotification(server, completedJob);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      jobManager.failJob(promptId, errorMessage);

      const failedJob = jobManager.getJob(promptId);
      if (failedJob) {
        await sendCompletionNotification(server, failedJob);
      }
    } finally {
      // Clean up listener
      ws.off("progress", progressHandler);
    }
  })();

  // Return immediately with task info
  return {
    taskId: job.taskId,
    promptId,
    status: "working",
    statusMessage: "Generation started",
    pollInterval: 1000, // Suggest 1 second polling
    name: input.name,
  };
}

/**
 * Start an async workflow run.
 * Returns immediately with a task ID, while the workflow continues in the background.
 */
export async function runWorkflowAsync(
  server: Server,
  jobManager: JobManager,
  client: ComfyUIClient,
  ws: ComfyUIWebSocket,
  input: RunWorkflowInput,
  outputDir: string,
  sizeThreshold: number
): Promise<AsyncGenerateResult> {
  // Queue the prompt
  const queueResponse = await client.queuePrompt(input.workflow);

  if (Object.keys(queueResponse.node_errors).length > 0) {
    throw new Error(`Workflow errors: ${JSON.stringify(queueResponse.node_errors)}`);
  }

  const promptId = queueResponse.prompt_id;

  // Create job in manager
  const job = jobManager.createJob(promptId, {
    type: "run_workflow",
    input,
  }, input.name);

  // Send initial notification
  await sendTaskStatusNotification(server, job);

  // Set up progress listener
  const progressHandler = (data: { value: number; max: number; prompt_id: string; node: string }) => {
    if (data.prompt_id === promptId) {
      const updatedJob = jobManager.updateProgress(promptId, data.value, data.max, data.node);
      if (updatedJob) {
        sendProgressNotification(server, updatedJob, {
          value: data.value,
          max: data.max,
          node: data.node,
        }).catch(() => {});
      }
    }
  };

  ws.on("progress", progressHandler);

  // Start background processing
  (async () => {
    try {
      const timeout = input.timeout || 300000;
      const result = await ws.waitForPrompt(promptId, timeout);

      // Process result (similar to runWorkflow but for async)
      const workflowResult = await processWorkflowResult(
        client,
        result,
        input,
        outputDir,
        sizeThreshold
      );

      if (workflowResult.success) {
        jobManager.completeJob(promptId, workflowResult);
      } else {
        jobManager.failJob(promptId, workflowResult.error || "Unknown error");
      }

      const completedJob = jobManager.getJob(promptId);
      if (completedJob) {
        await sendCompletionNotification(server, completedJob);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      jobManager.failJob(promptId, errorMessage);

      const failedJob = jobManager.getJob(promptId);
      if (failedJob) {
        await sendCompletionNotification(server, failedJob);
      }
    } finally {
      ws.off("progress", progressHandler);
    }
  })();

  return {
    taskId: job.taskId,
    promptId,
    status: "working",
    statusMessage: "Workflow started",
    pollInterval: 1000,
    name: input.name,
  };
}

/**
 * Process workflow result for async completion.
 */
async function processWorkflowResult(
  client: ComfyUIClient,
  result: PromptResult,
  input: RunWorkflowInput,
  outputDir: string,
  sizeThreshold: number
): Promise<RunWorkflowResult> {
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

        const inDocker = isRunningInDocker();
        const shouldSaveToFile =
          !inDocker &&
          (input.outputMode === "file" ||
            (input.outputMode === "auto" && imageBuffer.length > sizeThreshold));

        if (shouldSaveToFile) {
          const ext = img.filename.match(/\.[^.]+$/)?.[0] || ".png";
          const readableFilename = generateReadableFilename(
            workflowPrompt,
            "workflow",
            imageIndex,
            ext
          );
          const outputPath = join(outputDir, readableFilename);
          const outputDirPath = dirname(outputPath);
          if (!existsSync(outputDirPath)) {
            await mkdir(outputDirPath, { recursive: true });
          }
          await writeFile(outputPath, imageBuffer);
          images.push({ filename: readableFilename, path: outputPath });
        } else {
          const processingOptions: ImageProcessingOptions = {
            format: input.imageFormat || DEFAULT_TRANSFER_OPTIONS.format,
            quality: input.imageQuality || DEFAULT_TRANSFER_OPTIONS.quality,
          };

          const processed = await processImageForTransfer(
            imageBuffer,
            processingOptions
          );

          const formatExtensions: Record<string, string> = {
            jpeg: ".jpg",
            png: ".png",
            webp: ".webp",
          };
          const ext = formatExtensions[processingOptions.format || "jpeg"];
          const readableFilename = generateReadableFilename(
            workflowPrompt,
            "workflow",
            imageIndex,
            ext
          );

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
