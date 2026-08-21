/**
 * ComfyUI's own queue, and this server's task tracking on top of it.
 *
 * The two are distinct: a "job" is ComfyUI's prompt, a "task" is our record of
 * it, which survives an MCP server restart. Cancelling one is not cancelling
 * the other, which is why the tools say so explicitly.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { defineTool, noArgs } from "../register.js";
import { ensureConnected } from "../connection.js";
import {
  dataResult,
  errorResult,
  formattedResult,
  paginate,
  paginationFields,
  paginatedOutputSchema,
  responseFormatField,
} from "../../utils/response.js";
import { renderListing } from "../../utils/render.js";
import {
  getQueueSchema,
  getQueue,
  renderQueue,
  cancelJobSchema,
  cancelJob,
  interrupt,
  getHistorySchema,
  getHistory,
  renderHistory,
  isHistoryDetail,
  PromptNotFoundError,
} from "../../tools/queue.js";
import { processImageForTransfer } from "../../utils/image.js";
import { ServerContext } from "../../context.js";
import { imagesToContent } from "./generation.js";

const taskIdSchema = z
  .object({ taskId: z.string().min(1).describe("The task ID returned by comfyui_run_workflow") })
  .strict();

export function registerTaskTools(server: McpServer, ctx: () => ServerContext): void {
  defineTool(server, {
    name: "get_queue",
    description:
      "Get ComfyUI's current queue: what is running now and what is pending. Reflects everything " +
      "queued on the instance, including work submitted outside this server. Paginated, running " +
      "jobs first.\n\n" +
      "Returns: { total, count, offset, running, pending, jobs: [{ position, promptId, state }], " +
      "has_more, next_offset }, where 'running'/'pending' count the whole queue and 'jobs' is this " +
      "page of it.",
    schema: getQueueSchema,
    requiresConnection: true,
    annotations: {
      title: "Get Queue Status",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    outputSchema: paginatedOutputSchema("jobs"),
    handler: async (input) => {
      const { client } = await ensureConnected();
      const result = await getQueue(client, input);
      return formattedResult(
        input.response_format,
        result,
        () => renderQueue(result),
        "Page with 'offset'."
      );
    },
  });

  defineTool(server, {
    name: "cancel_job",
    description:
      "Cancel a QUEUED ComfyUI job by prompt ID. Only works for jobs that have not started. To stop a " +
      "job that is actively generating, use comfyui_interrupt instead.",
    schema: cancelJobSchema,
    requiresConnection: true,
    annotations: {
      title: "Cancel Queued Job",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) => {
      const { client } = await ensureConnected();
      return dataResult(
        (await cancelJob(client, input))
      );
    },
  });

  defineTool(server, {
    name: "interrupt",
    description:
      "Interrupt the job ComfyUI is currently running. Stops generation in progress and discards its " +
      "output. For jobs that are queued but not yet started, use comfyui_cancel_job instead.",
    schema: noArgs,
    requiresConnection: true,
    annotations: {
      title: "Interrupt Running Job",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async () => {
      const { client } = await ensureConnected();
      return dataResult((await interrupt(client)));
    },
  });

  defineTool(server, {
    name: "get_history",
    description:
      "Get ComfyUI's generation history. Without 'promptId' this lists prompts - id, status, and " +
      "whether outputs exist - paginated. With 'promptId' it returns that one prompt's full detail " +
      "including its output files.\n\n" +
      "Listing returns: { total, count, offset, entries: [{ promptId, status, completed, hasOutputs }], " +
      "has_more, next_offset }\n" +
      "Detail returns: { promptId, status, completed, outputs }\n\n" +
      "Errors: reports a not-found message naming the id if the prompt is not in ComfyUI's history.",
    schema: getHistorySchema,
    requiresConnection: true,
    annotations: {
      title: "Get Generation History",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) => {
      const { client } = await ensureConnected();
      try {
        const result = await getHistory(client, input);
        return formattedResult(
          input.response_format,
          result,
          () => renderHistory(result),
          isHistoryDetail(result)
            ? "This prompt produced an unusually large output set."
            : "Page with 'offset'."
        );
      } catch (error) {
        if (error instanceof PromptNotFoundError) {
          return errorResult(
            error.message,
            "Call comfyui_get_history without a promptId to list the ids ComfyUI still remembers."
          );
        }
        throw error;
      }
    },
  });

  // === Task tracking ===

  defineTool(server, {
    name: "get_task",
    description:
      "Get the status of an async generation task: current step, total steps, average step time, " +
      "estimated time remaining, and a suggested poll interval derived from actual generation speed. " +
      "Poll at the suggested interval rather than tighter - the work is GPU-bound either way.",
    schema: taskIdSchema,
    requiresConnection: false,
    annotations: {
      title: "Get Task Status",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: (input) => {
      const job = ctx().jobManager.getJob(input.taskId);
      if (!job) {
        return errorResult(
          `Task not found: ${input.taskId}`,
          "Use comfyui_list_tasks to see known task IDs."
        );
      }

      const response: Record<string, unknown> = {
        taskId: job.taskId,
        promptId: job.promptId,
        status: job.status,
        statusMessage: job.statusMessage,
        createdAt: job.createdAt,
        lastUpdatedAt: job.lastUpdatedAt,
        error: job.error,
        name: job.name,
      };

      if (job.progressStats) {
        response.progress = {
          currentStep: job.progressStats.currentStep,
          totalSteps: job.progressStats.totalSteps,
          currentNode: job.progressStats.currentNode,
          avgStepTimeMs: job.progressStats.avgStepTimeMs,
          estimatedRemainingMs: job.progressStats.estimatedRemainingMs,
        };

        // Poll at half a step, clamped - fast enough to feel responsive,
        // slow enough not to spin on a long diffusion step.
        if (job.progressStats.avgStepTimeMs) {
          response.suggestedPollIntervalMs = Math.max(
            500,
            Math.min(10000, Math.round(job.progressStats.avgStepTimeMs / 2))
          );
        }
      }

      return dataResult(response);
    },
  });

  defineTool(server, {
    name: "get_task_result",
    description:
      "Get the result of a completed generation task, returning its images. If the task is still " +
      "running, reports that instead of blocking - poll comfyui_get_task first.",
    schema: taskIdSchema,
    requiresConnection: false,
    annotations: {
      title: "Get Task Result",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: (input) => {
      const job = ctx().jobManager.getJob(input.taskId);
      if (!job) {
        return errorResult(
          `Task not found: ${input.taskId}`,
          "Use comfyui_list_tasks to see known task IDs."
        );
      }

      if (job.status === "working") {
        return dataResult({
          taskId: job.taskId,
          status: job.status,
          statusMessage: job.statusMessage,
          hint: "Still in progress. Poll comfyui_get_task for progress and a suggested interval.",
        });
      }

      if (job.status === "failed") {
        return errorResult(
          `Task failed: ${job.error}`,
          "Run comfyui_validate_workflow on the workflow to find structural problems, then " +
            "comfyui_run_workflow to try again."
        );
      }
      if (job.status === "cancelled") {
        return errorResult(
          "Task was cancelled.",
          "Submit it again with comfyui_run_workflow."
        );
      }
      if (!job.result) {
        return errorResult(
          "Task completed but no result was recorded.",
          "The workflow may have no output node - comfyui_validate_workflow warns about that. " +
            "comfyui_get_history has what ComfyUI itself recorded for this prompt."
        );
      }

      return imagesToContent(
        `Task ${job.taskId} completed. Generated ${job.result.images.length} image(s).`,
        job.result.images
      );
    },
  });

  defineTool(server, {
    name: "list_tasks",
    description:
      "List generation tasks tracked by this server, newest first, with a count by status. Filter with " +
      "'status' and page with 'limit'/'offset'.\n\n" +
      "Returns: { summary: {<status>: count}, total, count, offset, tasks, has_more, next_offset }",
    schema: z
      .object({
        status: z
          .enum(["working", "completed", "failed", "cancelled"])
          .optional()
          .describe("Only return tasks in this state"),
        ...paginationFields,
        response_format: responseFormatField,
      })
      .strict(),
    requiresConnection: false,
    annotations: {
      title: "List Tasks",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: (input) => {
      const c = ctx();
      const jobs = c.jobManager.listJobs(input.status);
      const { items, ...envelope } = paginate(jobs, input.limit, input.offset);

      const tasks = items.map((j) => ({
        taskId: j.taskId,
        status: j.status,
        statusMessage: j.statusMessage,
        createdAt: j.createdAt,
        lastUpdatedAt: j.lastUpdatedAt,
        name: j.name,
      }));

      const data = { summary: c.jobManager.getJobCounts(), ...envelope, tasks };

      return formattedResult(input.response_format, data, () =>
        renderListing({
          title: input.status ? `Tasks (${input.status})` : "Tasks",
          facets: c.jobManager.getJobCounts(),
          rows: tasks.map(
            (t) =>
              `- \`${t.taskId}\` **${t.status}**${t.name ? ` - ${t.name}` : ""}` +
              `${t.statusMessage ? ` - ${t.statusMessage}` : ""}`
          ),
          page: envelope,
          empty: input.status
            ? `No tasks in state '${input.status}'.`
            : "No tasks tracked yet. comfyui_run_workflow records one per run.",
          next: "Call comfyui_get_task_result with a task id for its output.",
        })
      );
    },
  });

  defineTool(server, {
    name: "cancel_task",
    description:
      "Cancel an async generation task. For a task still queued in ComfyUI this cancels the underlying " +
      "job. For one already generating this only stops tracking it - use comfyui_interrupt to actually " +
      "stop the generation.",
    schema: taskIdSchema,
    requiresConnection: true,
    annotations: {
      title: "Cancel Task",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) => {
      const { client } = await ensureConnected();
      const c = ctx();
      const job = c.jobManager.getJob(input.taskId);

      if (!job) {
        return errorResult(
          `Task not found: ${input.taskId}`,
          "Use comfyui_list_tasks to see known task IDs."
        );
      }
      if (job.status !== "working") {
        return errorResult(
          `Task is not running (status: ${job.status}).`,
          job.status === "completed"
            ? "Nothing to cancel. Use comfyui_get_task_result to fetch its output."
            : "Nothing to cancel. Use comfyui_list_tasks to see what is still working."
        );
      }

      try {
        await cancelJob(client, { promptId: job.promptId });
      } catch {
        // Already finished or gone in ComfyUI; stop tracking it either way.
      }

      c.jobManager.cancelJob(input.taskId);
      return dataResult({ cancelled: true, taskId: input.taskId });
    },
  });

  defineTool(server, {
    name: "name_generation",
    description:
      "Assign a descriptive name to an existing generation so it can be retrieved later by name. Use " +
      "names that describe the content ('landscape_sunset_warm', 'logo_draft_2'), not the ordering.",
    schema: z
      .object({
        taskId: z.string().min(1).describe("The task ID to name"),
        name: z
          .string()
          .min(1)
          .describe("Descriptive name, e.g. 'hero_banner_blue' or 'product_shot_v3'"),
      })
      .strict(),
    requiresConnection: false,
    annotations: {
      title: "Name Generation",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: (input) => {
      const c = ctx();
      if (!c.jobManager.getJob(input.taskId)) {
        return errorResult(
          `Task not found: ${input.taskId}`,
          "Use comfyui_list_tasks to see known task IDs."
        );
      }
      if (!c.jobManager.setName(input.taskId, input.name)) {
        return errorResult(
          `Could not set name for task: ${input.taskId}`,
          "The name may already be taken. Try another, or check comfyui_list_tasks for the names in use."
        );
      }

      return dataResult({
        taskId: input.taskId,
        name: input.name,
        hint: `Retrieve with comfyui_get_generation_by_name({ name: "${input.name}" }).`,
      });
    },
  });

  defineTool(server, {
    name: "get_generation_by_name",
    description:
      "Retrieve a generation by the name assigned via comfyui_run_workflow's 'name' or " +
      "comfyui_name_generation. Returns images, the same as comfyui_get_task_result.\n\n" +
      "If the task was recorded as timed out but ComfyUI actually finished it, this recovers the " +
      "output from ComfyUI's history rather than reporting a failure.",
    schema: z
      .object({ name: z.string().min(1).describe("The name assigned to the generation") })
      .strict(),
    requiresConnection: false,
    annotations: {
      title: "Get Generation by Name",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (input) => {
      const c = ctx();
      const job = c.jobManager.getJobByName(input.name);
      if (!job) {
        return errorResult(
          `No generation found with name: ${input.name}`,
          "Use comfyui_list_tasks to see tracked generations."
        );
      }

      if (job.status === "working") {
        return dataResult({
          name: job.name,
          taskId: job.taskId,
          status: job.status,
          statusMessage: job.statusMessage,
          hint: "Still in progress. Poll comfyui_get_task with this taskId.",
        });
      }

      if (job.status === "failed") {
        // A timeout on our side does not mean ComfyUI failed - it may have
        // finished after we stopped waiting. Check before reporting failure.
        const recovered = job.error?.includes("timed out")
          ? await recoverTimedOutJob(c, job.promptId, job.taskId)
          : null;

        if (recovered) {
          return imagesToContent(
            `Generation "${input.name}" recovered from timeout. ${recovered.length} image(s).`,
            recovered
          );
        }

        return errorResult(
          `Generation "${input.name}" failed: ${job.error}`,
          "Run comfyui_validate_workflow on the workflow to find structural problems, then " +
            "comfyui_run_workflow to try again."
        );
      }

      if (job.status === "cancelled") {
        return errorResult(
          `Generation "${input.name}" was cancelled.`,
          "Submit it again with comfyui_run_workflow."
        );
      }
      if (!job.result) {
        return errorResult(
          `Generation "${input.name}" completed but no result was recorded.`,
          "The workflow may have no output node - comfyui_validate_workflow warns about that."
        );
      }

      return imagesToContent(
        `Generation "${input.name}" (task ${job.taskId}) completed. ${job.result.images.length} image(s).`,
        job.result.images
      );
    },
  });
}

/**
 * Pull a job's output from ComfyUI's history after our own wait timed out.
 * Returns null when it genuinely did not complete.
 */
async function recoverTimedOutJob(
  c: ServerContext,
  promptId: string,
  taskId: string
): Promise<Array<{ filename: string; data?: string; mimeType?: string }> | null> {
  if (!c.client) return null;

  try {
    const history = await c.client.getHistory(promptId);
    const entry = history[promptId];
    if (!entry?.status?.completed || !entry.outputs) return null;

    const images: Array<{ filename: string; data?: string; mimeType?: string }> = [];
    for (const output of Object.values(entry.outputs)) {
      const nodeOutput = output as {
        images?: Array<{ filename: string; subfolder: string; type: string }>;
      };
      for (const img of nodeOutput.images ?? []) {
        const raw = await c.client.getImage(img.filename, img.subfolder, img.type);
        const processed = await processImageForTransfer(Buffer.from(raw), {
          format: "jpeg",
          quality: 85,
        });
        images.push({
          filename: img.filename,
          data: processed.data,
          mimeType: processed.mimeType,
        });
      }
    }

    c.jobManager.completeJob(taskId, {
      success: true,
      promptId,
      outputs: entry.outputs,
      images,
    });

    return images;
  } catch {
    return null;
  }
}
