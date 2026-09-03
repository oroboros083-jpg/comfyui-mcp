/**
 * ComfyUI's own queue, and this server's task tracking on top of it.
 *
 * The two are distinct: a "job" is ComfyUI's prompt, a "task" is our record of
 * it, which survives an MCP server restart. Cancelling one is not cancelling
 * the other, which is why the tools say so explicitly.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { defineTool } from "../register.js";
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
  interruptSchema,
  getHistorySchema,
  getHistory,
  renderHistory,
  isHistoryDetail,
} from "../../tools/queue.js";
import { completeJobFromHistory } from "../../jobs/reconcile.js";
import { ServerContext } from "../../context.js";
import { imagesToContent } from "./generation.js";

const taskIdSchema = z
  .object({ taskId: z.string().min(1).describe("The task ID returned by comfyui_run_workflow") })
  .strict();

/**
 * A task named either way.
 *
 * Every run through comfyui_run_workflow gets a name, so both spellings always
 * resolve, and an agent that kept "the logo draft" rather than a uuid is not
 * stuck. This replaces a separate get_generation_by_name tool whose only real
 * difference was the lookup - everything after it was a second, drifted copy of
 * get_task_result.
 */
const taskRefSchema = z
  .object({
    task: z
      .string()
      .min(1)
      .describe(
        "The task ID from comfyui_run_workflow, or the name that run was given. " +
          "Ids are tried first, so a name that looks like an id still resolves."
      ),
  })
  .strict();

/** Resolve a task reference to a job, by id first and then by name. */
function resolveJob(c: ServerContext, ref: string) {
  return c.jobManager.getJob(ref) ?? c.jobManager.getJobByName(ref);
}

export function registerTaskTools(server: McpServer, ctx: () => ServerContext): void {
  defineTool(server, {
    name: "get_queue",
    description:
      "Get ComfyUI's current queue: what is running now and what is pending. Reads ComfyUI's own " +
      "/queue, so it reflects EVERY job on the instance whoever submitted it - this server, another " +
      "agent, the official Comfy MCP, or a human in a browser tab. Paginated, running jobs first.\n\n" +
      "Prefer this over the official Comfy MCP's `job(action=\"queue\")`, which lists only what " +
      "comfy-cli itself submitted. This is the only cross-server view of what is actually running.\n\n" +
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
      "Cancel QUEUED ComfyUI jobs. Only works for jobs that have not started. To stop a job that is " +
      "actively generating, use comfyui_interrupt instead.\n\n" +
      "'promptId' cancels that one job. OMITTING IT IS A BULK CANCEL, not a no-op: 'scope' then " +
      "decides how wide. The default scope 'mine' cancels every pending job this agent submitted and " +
      "leaves everyone else's alone; scope: 'all' clears the whole queue including work submitted by " +
      "other agents and by anyone using the ComfyUI web UI, so ask the user before passing it.\n\n" +
      "Returns: { success, cancelled, left_alone?, message } - 'cancelled' is the prompt id for a " +
      "single cancel, or the number of jobs removed for a bulk one, and 'left_alone' counts the " +
      "foreign jobs a 'mine' cancel deliberately kept.",
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
      "output. For jobs that are queued but not yet started, use comfyui_cancel_job instead.\n\n" +
      "ComfyUI has one interrupt and it stops whatever is running, which on a shared instance may not " +
      "be yours. This refuses when the running job belongs to another client and reports who owns it; " +
      "confirm_foreign: true proceeds, and should follow the user actually agreeing.",
    schema: interruptSchema,
    requiresConnection: true,
    annotations: {
      title: "Interrupt Running Job",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) => {
      const { client } = await ensureConnected();
      return dataResult(await interrupt(client, input));
    },
  });

  defineTool(server, {
    name: "get_history",
    description:
      "Get ComfyUI's generation history. Without 'promptId' this lists prompts - id, status, and " +
      "whether outputs exist - paginated. With 'promptId' it returns that one prompt's full detail " +
      "including its output files.\n\n" +
      "Reads ComfyUI's own /history, so it covers every prompt the instance ran, including ones this " +
      "server never submitted.\n\n" +
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
      // PromptNotFoundError carries its own hint; defineTool surfaces it.
      const result = await getHistory(client, input);
      return formattedResult(
        input.response_format,
        result,
        () => renderHistory(result),
        isHistoryDetail(result)
          ? "This prompt produced an unusually large output set."
          : "Page with 'offset'."
      );
    },
  });

  // === Task tracking ===

  defineTool(server, {
    name: "get_task",
    description:
      "Get the status of an async generation task: current step, total steps, average step time, " +
      "estimated time remaining, and a suggested poll interval derived from actual generation speed. " +
      "Poll at the suggested interval rather than tighter - the work is GPU-bound either way.\n\n" +
      "Accepts the task id or the name the run was given.\n\n" +
      "The official Comfy MCP's `job(...)` cannot poll these: it reads comfy-cli's own job state " +
      "files, which exist only for runs comfy-cli itself submitted.",
    schema: taskRefSchema,
    requiresConnection: false,
    annotations: {
      title: "Get Task Status",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: (input) => {
      const job = resolveJob(ctx(), input.task);
      if (!job) {
        return errorResult(
          `No task found for: ${input.task}`,
          "Use comfyui_list_tasks to see known task ids and names."
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
      "Get the images from a finished generation. Accepts either the task id or the name the run was " +
      "given - every run through comfyui_run_workflow has one, so 'the logo draft' is retrievable " +
      "without having kept its id.\n\n" +
      "If the task is still running, reports that instead of blocking - poll comfyui_get_task first. " +
      "If it was recorded as failed, asks ComfyUI whether it actually finished before reporting the " +
      "failure, because a dropped socket or a restarted server marks a job failed while ComfyUI goes " +
      "on to complete it.\n\n" +
      "The official Comfy MCP's `fetch_outputs` will also return this prompt's files - it falls back " +
      "to ComfyUI's history - but only the files. The run's name, its status history and its text " +
      "outputs exist only here.",
    schema: taskRefSchema,
    requiresConnection: false,
    annotations: {
      title: "Get Task Result",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (input) => {
      const c = ctx();
      const job = resolveJob(c, input.task);
      if (!job) {
        return errorResult(
          `No task found for: ${input.task}`,
          "Use comfyui_list_tasks to see known task ids and names."
        );
      }
      const label = job.name ? `"${job.name}"` : job.taskId;

      if (job.status === "working") {
        return dataResult({
          taskId: job.taskId,
          name: job.name,
          status: job.status,
          statusMessage: job.statusMessage,
          hint: "Still in progress. Poll comfyui_get_task for progress and a suggested interval.",
        });
      }

      if (job.status === "failed") {
        // Our record of a failure is not authoritative - a dropped socket or a
        // restarted server marks a job failed while ComfyUI goes on to finish
        // it. Ask ComfyUI before reporting the failure. This recovery used to
        // exist only on get_generation_by_name, so it fired only for runs that
        // happened to have been named.
        const recovered = c.client
          ? await completeJobFromHistory(
              c.client,
              c.jobManager,
              job,
              c.config.outputDir,
              c.config.outputSizeThreshold
            ).catch(() => null)
          : null;

        if (recovered) {
          return imagesToContent(
            `Task ${label} recovered from ComfyUI's history. ${recovered.length} image(s).`,
            recovered
          );
        }

        return errorResult(
          `Task ${label} failed: ${job.error}`,
          "Validate the workflow first - write it with comfyui_write_workflow, then run the official Comfy MCP's validate_workflow on that path - then " +
            "comfyui_run_workflow to try again."
        );
      }
      if (job.status === "cancelled") {
        return errorResult(
          `Task ${label} was cancelled.`,
          "Submit it again with comfyui_run_workflow."
        );
      }
      if (!job.result) {
        return errorResult(
          `Task ${label} completed but no result was recorded.`,
          "The workflow may have no output node. " +
            "comfyui_get_history has what ComfyUI itself recorded for this prompt."
        );
      }

      return imagesToContent(
        `Task ${label} completed. Generated ${job.result.images.length} image(s).`,
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
        await cancelJob(client, { promptId: job.promptId, scope: "mine" });
      } catch {
        // Already finished or gone in ComfyUI; stop tracking it either way.
      }

      c.jobManager.cancelJob(input.taskId);
      return dataResult({ cancelled: true, taskId: input.taskId });
    },
  });

}
