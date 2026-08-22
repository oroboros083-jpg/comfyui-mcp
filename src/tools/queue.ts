/**
 * ComfyUI's queue and generation history.
 *
 * These tools front two endpoints that have no server-side paging: `/queue`
 * returns every queued job and `/history` returns every prompt ComfyUI still
 * remembers. Both are unbounded, so paging happens here - a busy instance can
 * hold hundreds of entries, and none of them are worth a context window.
 */

import { z } from "zod";

import { ComfyUIClient } from "../client/comfyui.js";
import {
  PageEnvelope,
  paginate,
  paginationFields,
  responseFormatField,
} from "../utils/response.js";
import { renderListing } from "../utils/render.js";
import { ToolError } from "../utils/errors.js";

/** One queued job, flattened from ComfyUI's positional tuple. */
export interface QueuedJob {
  position: number;
  promptId: string;
  state: "running" | "pending";
}

/** One history row. Identifies a prompt; `promptId` fetches its detail. */
export interface HistoryRow {
  promptId: string;
  status: string;
  completed: boolean;
  hasOutputs: boolean;
}

// === get_queue ===

export const getQueueSchema = z
  .object({
    ...paginationFields,
    response_format: responseFormatField,
  })
  .strict();

export type GetQueueInput = z.infer<typeof getQueueSchema>;

/**
 * The paginated envelope with the page held under `jobs` rather than `items`,
 * so the response names what it carries and carries it exactly once.
 */
export type QueueResult = PageEnvelope & {
  running: number;
  pending: number;
  jobs: QueuedJob[];
};

export async function getQueue(
  client: ComfyUIClient,
  input: GetQueueInput
): Promise<QueueResult> {
  const queue = await client.getQueue();

  // Running first: it is what the caller almost always wants, and putting it
  // on page one means the common case never needs a second call.
  const jobs: QueuedJob[] = [
    ...queue.queue_running.map(([position, promptId]) => ({
      position,
      promptId,
      state: "running" as const,
    })),
    ...queue.queue_pending.map(([position, promptId]) => ({
      position,
      promptId,
      state: "pending" as const,
    })),
  ];

  const { items, ...envelope } = paginate(jobs, input.limit, input.offset);

  return {
    ...envelope,
    running: queue.queue_running.length,
    pending: queue.queue_pending.length,
    jobs: items,
  };
}

export function renderQueue(result: QueueResult): string {
  return renderListing({
    title: "ComfyUI Queue",
    facets: { running: result.running, pending: result.pending },
    rows: result.jobs.map(
      (job) => `- **${job.state}** #${job.position} - \`${job.promptId}\``
    ),
    page: result,
    empty: "Queue is empty. Nothing running, nothing pending.",
  });
}

// === cancel_job ===

export const cancelJobSchema = z
  .object({
    promptId: z
      .string()
      .min(1, "promptId must not be empty")
      .optional()
      .describe(
        "Prompt ID of the queued job to cancel. Omit to clear the entire queue."
      ),
  })
  .strict();

export type CancelJobInput = z.infer<typeof cancelJobSchema>;

export interface CancelJobResult {
  success: true;
  cancelled: string | "all";
  message: string;
}

export async function cancelJob(
  client: ComfyUIClient,
  input: CancelJobInput
): Promise<CancelJobResult> {
  await client.cancelQueue(input.promptId);

  return input.promptId
    ? {
        success: true,
        cancelled: input.promptId,
        message: `Removed ${input.promptId} from the queue. A job already running is unaffected - use comfyui_interrupt for that.`,
      }
    : {
        success: true,
        cancelled: "all",
        message:
          "Cleared every pending job from the queue. A job already running is unaffected - use comfyui_interrupt for that.",
      };
}

// === interrupt ===

export interface InterruptResult {
  success: true;
  message: string;
}

export async function interrupt(client: ComfyUIClient): Promise<InterruptResult> {
  await client.interrupt();
  return {
    success: true,
    message:
      "Interrupted the running job; its output is discarded. Pending jobs are untouched - use comfyui_cancel_job to clear those.",
  };
}

// === get_history ===

export const getHistorySchema = z
  .object({
    promptId: z
      .string()
      .min(1, "promptId must not be empty")
      .optional()
      .describe(
        "Fetch one prompt's full detail, including its output files. Omit for a paginated listing."
      ),
    order: z
      .enum(["newest", "oldest"])
      .optional()
      .default("newest")
      .describe(
        "Which end of ComfyUI's history to page from. Defaults to 'newest', " +
          "because the usual question is about a run just submitted; 'oldest' " +
          "walks the history in execution order."
      ),
    ...paginationFields,
    response_format: responseFormatField,
  })
  .strict();

export type GetHistoryInput = z.infer<typeof getHistorySchema>;

export interface HistoryDetail {
  promptId: string;
  status: string;
  completed: boolean;
  outputs: Record<string, unknown>;
}

export type HistoryListing = PageEnvelope & { entries: HistoryRow[] };

export type HistoryResult = HistoryDetail | HistoryListing;

/** Raised when a specific promptId is not in ComfyUI's history. */
export class PromptNotFoundError extends ToolError {
  constructor(public readonly promptId: string) {
    super(
      `No prompt ${promptId} in ComfyUI's history`,
      "Call comfyui_get_history without a promptId to list the ids ComfyUI still remembers."
    );
  }
}

export async function getHistory(
  client: ComfyUIClient,
  input: GetHistoryInput
): Promise<HistoryResult> {
  const history = await client.getHistory(input.promptId);

  if (input.promptId) {
    const entry = history[input.promptId];
    // ComfyUI answers /history/<unknown-id> with an empty object rather than a
    // 404, so a missing key is the only signal that the id is wrong.
    if (!entry) throw new PromptNotFoundError(input.promptId);

    return {
      promptId: input.promptId,
      status: entry.status.status_str,
      completed: entry.status.completed,
      outputs: entry.outputs,
    };
  }

  const rows: HistoryRow[] = Object.entries(history).map(([promptId, entry]) => ({
    promptId,
    status: entry.status.status_str,
    completed: entry.status.completed,
    hasOutputs: Object.keys(entry.outputs).length > 0,
  }));

  // ComfyUI's /history is a dict appended to in execution order and retained
  // up to 10000 entries, so Object.entries is oldest-first. Paging that
  // directly meant the default page returned the oldest prompts the instance
  // still remembers - and the common question, including the one
  // PromptNotFoundError's hint sends the caller here to answer, is about a
  // run just submitted. getQueue beside this orders running-first for the
  // same reason.
  if (input.order === "newest") rows.reverse();

  const { items, ...envelope } = paginate(rows, input.limit, input.offset);
  return { ...envelope, entries: items };
}

export function isHistoryDetail(result: HistoryResult): result is HistoryDetail {
  return "outputs" in result;
}

export function renderHistory(result: HistoryResult): string {
  if (isHistoryDetail(result)) {
    const nodes = Object.keys(result.outputs);
    return [
      `# Prompt ${result.promptId}`,
      "",
      `- **Status**: ${result.status}`,
      `- **Completed**: ${result.completed ? "yes" : "no"}`,
      `- **Output nodes**: ${nodes.length ? nodes.join(", ") : "none"}`,
    ].join("\n");
  }

  return renderListing({
    title: "Generation History",
    rows: result.entries.map((row) => {
      const outputs = row.hasOutputs ? "has outputs" : "no outputs";
      return `- \`${row.promptId}\` - ${row.status} (${outputs})`;
    }),
    page: result,
    empty: "ComfyUI's history is empty.",
    next: "Pass a promptId to see one prompt's output files.",
  });
}
