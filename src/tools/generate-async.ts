/**
 * Submitting a workflow to ComfyUI and tracking it to completion.
 *
 * There is one path. A synchronous run is this path plus a wait on the
 * returned `completion` promise - it was previously a second implementation
 * that duplicated ~120 lines and had drifted from this one in three
 * user-visible ways (see outputs.ts).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";

import { ToolError } from "../utils/errors.js";
import { ComfyUIClient } from "../client/comfyui.js";
import { ComfyUIWebSocket } from "../client/websocket.js";
import { JobManager } from "../jobs/manager.js";
import {
  sendTaskStatusNotification,
  sendProgressNotification,
  sendCompletionNotification,
} from "../jobs/notifications.js";
import { RunWorkflowInput } from "./generate.js";
import { collectOutputImages, collectTextOutputs, RunWorkflowResult } from "./outputs.js";

/**
 * Result returned immediately when starting a generation.
 */
export interface AsyncGenerateResult {
  taskId: string;
  promptId: string;
  status: "working";
  statusMessage: string;
  pollInterval: number; // suggested polling interval in ms
  name?: string; // optional user-assigned name
}

export interface StartedWorkflow {
  /** What the tool hands back to the caller. Plain data, safe to serialise. */
  task: AsyncGenerateResult;
  /**
   * Resolves once generation has finished and its outputs are collected.
   *
   * Kept off `task` deliberately: `task` is serialised into the tool
   * response, and a promise on it would reach the wire as `{}`. A sync run
   * awaits this and then reads the finished job.
   */
  completion: Promise<void>;
}

/**
 * Queue a workflow, refusing it up front if ComfyUI reports node errors.
 */
async function submitWorkflow(
  client: ComfyUIClient,
  workflow: Record<string, unknown>
): Promise<string> {
  const queueResponse = await client.queuePrompt(workflow);

  if (Object.keys(queueResponse.node_errors).length > 0) {
    throw new ToolError(
      `Workflow errors: ${JSON.stringify(queueResponse.node_errors)}`,
      "Run comfyui_validate_workflow on this workflow - it names the offending nodes and inputs before submission."
    );
  }

  return queueResponse.prompt_id;
}

/**
 * Start a workflow and track it.
 *
 * Returns as soon as ComfyUI accepts the prompt. Generation continues in the
 * background, reporting progress through MCP notifications and recording its
 * outcome on the job - which is how a caller polls it with comfyui_get_task.
 */
export async function runWorkflowAsync(
  server: Server,
  jobManager: JobManager,
  client: ComfyUIClient,
  ws: ComfyUIWebSocket,
  input: RunWorkflowInput,
  outputDir: string,
  sizeThreshold: number
): Promise<StartedWorkflow> {
  const promptId = await submitWorkflow(client, input.workflow);

  const job = jobManager.createJob(
    promptId,
    { type: "run_workflow", input },
    input.name
  );

  await sendTaskStatusNotification(server, job);

  const progressHandler = (data: {
    value: number;
    max: number;
    prompt_id: string;
    node: string;
  }) => {
    if (data.prompt_id !== promptId) return;
    const updatedJob = jobManager.updateProgress(
      promptId,
      data.value,
      data.max,
      data.node
    );
    if (updatedJob) {
      sendProgressNotification(server, updatedJob, {
        value: data.value,
        max: data.max,
        node: data.node,
      }).catch(() => {});
    }
  };

  ws.on("progress", progressHandler);

  const completion = (async () => {
    try {
      const result = await ws.waitForPrompt(promptId);

      if (!result.success) {
        jobManager.failJob(promptId, result.error || "Unknown error");
      } else {
        const workflowResult: RunWorkflowResult = {
          success: true,
          promptId: result.promptId,
          outputs: result.outputs,
          images: await collectOutputImages(
            client,
            result.outputs,
            input,
            input.workflow,
            outputDir,
            sizeThreshold
          ),
        };

        // Opt-in, and by node id. With `collectText` absent this returns [],
        // so the field stays off the result entirely and every existing
        // caller sees exactly what it saw before.
        const texts = collectTextOutputs(result.outputs, { fromNodes: input.collectText });
        if (texts.length) workflowResult.texts = texts;

        jobManager.completeJob(promptId, workflowResult);
      }

      const completedJob = jobManager.getJob(promptId);
      if (completedJob) await sendCompletionNotification(server, completedJob);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      jobManager.failJob(promptId, errorMessage);

      const failedJob = jobManager.getJob(promptId);
      if (failedJob) await sendCompletionNotification(server, failedJob);
    } finally {
      ws.off("progress", progressHandler);
    }
  })();

  // A sync caller awaits this; an async one does not, so an unhandled
  // rejection must not escape. Every failure is already recorded on the job.
  completion.catch(() => {});

  return {
    task: {
      taskId: job.taskId,
      promptId,
      status: "working",
      statusMessage: "Workflow started",
      pollInterval: 1000,
      name: input.name,
    },
    completion,
  };
}
