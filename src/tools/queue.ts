/**
 * ComfyUI's queue and generation history.
 *
 * These tools front two endpoints that have no server-side paging: `/queue`
 * returns every queued job and `/history` returns every prompt ComfyUI still
 * remembers. Both are unbounded, so paging happens here - a busy instance can
 * hold hundreds of entries, and none of them are worth a context window.
 */

import { z } from "zod";

import { ComfyUIClient, QueueStatus } from "../client/comfyui.js";
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
  /**
   * Who submitted it, as ComfyUI recorded it. Undefined for a job whose
   * submitter sent no client_id - the ComfyUI web UI does, but a bare curl
   * against /prompt need not.
   */
  clientId?: string;
  /**
   * Did this agent submit it?
   *
   * False covers three different strangers - another instance of this server,
   * the official Comfy MCP (whose jobs arrive under comfy-cli's own id), and
   * a human in a browser tab. They are not distinguished here because the
   * only decision that depends on it is the same for all three: do not cancel
   * it without being told to.
   */
  mine: boolean;
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
  /** Counted over the whole queue, not the page, so they answer "is anyone else using this ComfyUI". */
  mine: number;
  foreign: number;
  jobs: QueuedJob[];
};

export async function getQueue(
  client: ComfyUIClient,
  input: GetQueueInput
): Promise<QueueResult> {
  const queue = await client.getQueue();
  const me = client.getClientId();

  const flatten = (
    rows: QueueStatus["queue_running"],
    state: "running" | "pending"
  ): QueuedJob[] =>
    rows.map(([position, promptId, , extra]) => {
      const clientId = extra?.client_id;
      return {
        position,
        promptId,
        state,
        ...(clientId === undefined ? {} : { clientId }),
        mine: clientId === me,
      };
    });

  // Running first: it is what the caller almost always wants, and putting it
  // on page one means the common case never needs a second call.
  const jobs: QueuedJob[] = [
    ...flatten(queue.queue_running, "running"),
    ...flatten(queue.queue_pending, "pending"),
  ];

  const { items, ...envelope } = paginate(jobs, input.limit, input.offset);

  return {
    ...envelope,
    running: queue.queue_running.length,
    pending: queue.queue_pending.length,
    mine: jobs.filter((j) => j.mine).length,
    foreign: jobs.filter((j) => !j.mine).length,
    jobs: items,
  };
}

export function renderQueue(result: QueueResult): string {
  return renderListing({
    title: "ComfyUI Queue",
    facets: {
      running: result.running,
      pending: result.pending,
      mine: result.mine,
      foreign: result.foreign,
    },
    rows: result.jobs.map(
      (job) =>
        `- **${job.state}** #${job.position} - \`${job.promptId}\`` +
        (job.mine ? "" : ` (${job.clientId ?? "another client"})`)
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
        "Prompt ID of the queued job to cancel. Omit to cancel in bulk, which " +
          "`scope` then controls."
      ),
    scope: z
      .enum(["mine", "all"])
      .optional()
      .default("mine")
      .describe(
        "Which jobs a bulk cancel removes. 'mine' (the default) cancels only " +
          "jobs this agent submitted. 'all' clears the whole queue INCLUDING " +
          "work submitted by other agents and by anyone using the ComfyUI web " +
          "UI - ask before using it. Ignored when promptId is given."
      ),
  })
  .strict();

export type CancelJobInput = z.infer<typeof cancelJobSchema>;

export interface CancelJobResult {
  success: true;
  cancelled: string | number;
  /** Foreign jobs a "mine" bulk cancel deliberately left alone. */
  left_alone?: number;
  message: string;
}

const RUNNING_NOTE =
  "A job already running is unaffected - use comfyui_interrupt for that.";

export async function cancelJob(
  client: ComfyUIClient,
  input: CancelJobInput
): Promise<CancelJobResult> {
  if (input.promptId) {
    await client.cancelQueue(input.promptId);
    return {
      success: true,
      cancelled: input.promptId,
      message: `Removed ${input.promptId} from the queue. ${RUNNING_NOTE}`,
    };
  }

  // A bare "clear the queue" used to wipe everything, which on a shared
  // ComfyUI destroys work this agent never submitted and cannot give back.
  // The default now names its own jobs one at a time; clearing outright is a
  // separate thing the caller has to ask for.
  if (input.scope === "all") {
    await client.cancelQueue();
    return {
      success: true,
      cancelled: "all",
      message: `Cleared every pending job, including jobs submitted by others. ${RUNNING_NOTE}`,
    };
  }

  const queue = await client.getQueue();
  const me = client.getClientId();
  const pending = queue.queue_pending.map(([, promptId, , extra]) => ({
    promptId,
    mine: extra?.client_id === me,
  }));
  const mine = pending.filter((j) => j.mine);

  // One request, not one per job: /queue's `delete` takes a list. Guarded on
  // length so an agent that owns nothing pending does not POST `{delete: []}`.
  if (mine.length) await client.cancelQueue(mine.map((j) => j.promptId));

  const foreign = pending.length - mine.length;
  return {
    success: true,
    cancelled: mine.length,
    ...(foreign ? { left_alone: foreign } : {}),
    message:
      `Cancelled ${mine.length} pending job(s) submitted by this agent` +
      (foreign
        ? `, and left ${foreign} belonging to another client alone. Pass scope: "all" to clear those too.`
        : ".") +
      ` ${RUNNING_NOTE}`,
  };
}

// === interrupt ===

export const interruptSchema = z
  .object({
    confirm_foreign: z
      .boolean()
      .optional()
      .describe(
        "Interrupt even when the running job was submitted by someone else. " +
          "Their render is discarded and cannot be recovered, so pass this " +
          "only once the user has actually agreed."
      ),
  })
  .strict();

export type InterruptInput = z.infer<typeof interruptSchema>;

export interface InterruptResult {
  success: true;
  /**
   * Who owned the job this stopped. "unattributed" is a real running job whose
   * submitter sent no client_id - distinct from "unknown", which is an idle
   * queue with nothing to own. Collapsing the two is what let someone else's
   * render be discarded ungated, so they stay separate.
   */
  interrupted: "mine" | "foreign" | "unattributed" | "unknown";
  message: string;
}

/**
 * ComfyUI has exactly one /interrupt and it stops whatever is running, so
 * there is no way to scope this at the API. The scoping has to be a check
 * before the call: read who owns the running job, and refuse if it is not
 * ours unless the caller says otherwise.
 *
 * Deliberately shaped like the official Comfy MCP's confirm_kill_untracked
 * gate, which solves the same problem - do not destroy a process you did not
 * start without asking - and has already been through real use.
 */
export async function interrupt(
  client: ComfyUIClient,
  input: InterruptInput = {}
): Promise<InterruptResult> {
  const queue = await client.getQueue();
  const running = queue.queue_running[0];
  const owner = running?.[3]?.client_id;
  const me = client.getClientId();
  // Three distinct situations, not two. An idle queue has nothing to own and
  // is safe to interrupt; a running job with no client_id is still somebody's
  // render - a bare curl against /prompt sends none - and it was going through
  // ungated because it shared the "unknown" label with the idle case.
  const ownership: InterruptResult["interrupted"] =
    running === undefined
      ? "unknown"
      : owner === undefined
        ? "unattributed"
        : owner === me
          ? "mine"
          : "foreign";

  if ((ownership === "foreign" || ownership === "unattributed") && !input.confirm_foreign) {
    throw new ToolError(
      ownership === "foreign"
        ? `The job currently running (${running?.[1]}) was submitted by ${owner}, not by this agent. ` +
          "Interrupting it would discard their render."
        : `The job currently running (${running?.[1]}) carries no client_id, so it was not submitted ` +
          "by this agent and this server cannot say whose it is. Interrupting it would discard their render.",
      "Ask the user before interrupting someone else's job, then call again with " +
        "confirm_foreign: true. comfyui_get_queue shows who owns what."
    );
  }

  await client.interrupt();
  return {
    success: true,
    interrupted: ownership,
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
