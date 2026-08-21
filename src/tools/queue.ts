import { z } from "zod";
import { ComfyUIClient } from "../client/comfyui.js";

export const getQueueSchema = z.object({}).strict();

export async function getQueue(client: ComfyUIClient): Promise<string> {
  const queue = await client.getQueue();

  const running = queue.queue_running.map((item) => ({
    number: item[0],
    promptId: item[1],
  }));

  const pending = queue.queue_pending.map((item) => ({
    number: item[0],
    promptId: item[1],
  }));

  return JSON.stringify(
    {
      running: running.length,
      pending: pending.length,
      runningJobs: running,
      pendingJobs: pending,
    },
    null,
    2
  );
}

export const cancelJobSchema = z.object({
  promptId: z
    .string()
    .optional()
    .describe("Specific prompt ID to cancel. If not provided, cancels all jobs."),
}).strict();

export type CancelJobInput = z.infer<typeof cancelJobSchema>;

export async function cancelJob(
  client: ComfyUIClient,
  input: CancelJobInput
): Promise<string> {
  await client.cancelQueue(input.promptId);

  if (input.promptId) {
    return JSON.stringify({ success: true, cancelled: input.promptId });
  }
  return JSON.stringify({ success: true, message: "All jobs cancelled" });
}

export const interruptSchema = z.object({}).strict();

export async function interrupt(client: ComfyUIClient): Promise<string> {
  await client.interrupt();
  return JSON.stringify({ success: true, message: "Current job interrupted" });
}

export const getHistorySchema = z.object({
  promptId: z.string().optional().describe("Specific prompt ID to get history for"),
  limit: z.number().optional().default(10).describe("Maximum number of entries to return"),
}).strict();

export type GetHistoryInput = z.infer<typeof getHistorySchema>;

export async function getHistory(
  client: ComfyUIClient,
  input: GetHistoryInput
): Promise<string> {
  const history = await client.getHistory(input.promptId);

  if (input.promptId) {
    const entry = history[input.promptId];
    if (!entry) {
      return JSON.stringify({ error: "Prompt not found in history" });
    }
    return JSON.stringify(
      {
        promptId: input.promptId,
        status: entry.status.status_str,
        completed: entry.status.completed,
        outputs: entry.outputs,
      },
      null,
      2
    );
  }

  // Return limited history
  const entries = Object.entries(history)
    .slice(0, input.limit)
    .map(([promptId, entry]) => ({
      promptId,
      status: entry.status.status_str,
      completed: entry.status.completed,
      hasOutputs: Object.keys(entry.outputs).length > 0,
    }));

  return JSON.stringify({ entries, total: Object.keys(history).length }, null, 2);
}
