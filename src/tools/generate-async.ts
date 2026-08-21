import { ToolError } from "../utils/errors.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ComfyUIClient } from "../client/comfyui.js";
import { ComfyUIWebSocket, PromptResult } from "../client/websocket.js";
import { JobManager } from "../jobs/manager.js";
import {
  sendTaskStatusNotification,
  sendProgressNotification,
  sendCompletionNotification,
} from "../jobs/notifications.js";
import {
  RunWorkflowInput,
  RunWorkflowResult,
} from "./generate.js";
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
    throw new ToolError(
      `Workflow errors: ${JSON.stringify(queueResponse.node_errors)}`,
      "Run comfyui_validate_workflow on this workflow - it names the offending nodes and inputs before submission."
    );
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
      const result = await ws.waitForPrompt(promptId);

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
