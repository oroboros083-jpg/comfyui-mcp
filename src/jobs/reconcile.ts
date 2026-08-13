import { ComfyUIClient } from "../client/comfyui.js";
import { JobManager, Job } from "./manager.js";
import { processImageForTransfer } from "../utils/image.js";

/**
 * A job is orphaned when this process lost track of its execution: either
 * ComfyUI died while it was running, or the MCP server itself was restarted
 * while the job was in flight. Both leave a row stuck in "working" forever,
 * and the WebSocket close path marks in-flight prompts failed with this
 * marker. Neither is authoritative - ComfyUI's /history is.
 */
const DISCONNECT_MARKER = "ComfyUI disconnected before this execution finished";

export interface ReconcileSummary {
  checked: number;
  completed: number;
  failed: number;
  stillRunning: number;
}

function isOrphanCandidate(job: Job): boolean {
  if (job.status === "working") return true;
  return job.status === "failed" && (job.error ?? "").includes(DISCONNECT_MARKER);
}

/**
 * Reconcile jobs whose real outcome is unknown against ComfyUI's queue and
 * history. Called after a successful (re)connect, so tasks never sit in
 * "working" reporting phantom in-flight work.
 */
export async function reconcileOrphanedJobs(
  client: ComfyUIClient,
  jobManager: JobManager
): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = {
    checked: 0,
    completed: 0,
    failed: 0,
    stillRunning: 0,
  };

  const candidates = jobManager.listJobs().filter(isOrphanCandidate);
  if (candidates.length === 0) return summary;

  // Anything ComfyUI still has queued or running is genuinely in flight and
  // must be left alone (it survives a client reconnect, just not our progress
  // stream).
  const queuedPromptIds = new Set<string>();
  try {
    const queue = await client.getQueue();
    for (const entry of [...queue.queue_running, ...queue.queue_pending]) {
      if (typeof entry[1] === "string") queuedPromptIds.add(entry[1]);
    }
  } catch {
    // Queue unavailable - fall through to history, which is the stronger signal.
  }

  for (const job of candidates) {
    summary.checked++;

    if (queuedPromptIds.has(job.promptId)) {
      summary.stillRunning++;
      continue;
    }

    let historyEntry;
    try {
      const history = await client.getHistory(job.promptId);
      historyEntry = history[job.promptId];
    } catch {
      // Can't reach history for this prompt; leave the job untouched rather
      // than guessing, and try again on the next reconnect.
      continue;
    }

    if (historyEntry?.status?.completed && historyEntry.outputs) {
      try {
        const images = await collectImages(client, historyEntry.outputs);
        jobManager.completeJob(job.taskId, {
          success: true,
          promptId: job.promptId,
          outputs: historyEntry.outputs,
          images,
        });
        summary.completed++;
        continue;
      } catch {
        // Outputs exist but couldn't be fetched - record that specifically.
        jobManager.failJob(
          job.taskId,
          "ComfyUI restarted; this generation completed but its outputs could no longer be retrieved."
        );
        summary.failed++;
        continue;
      }
    }

    jobManager.failJob(
      job.taskId,
      historyEntry
        ? `ComfyUI restarted while this generation was running; it did not finish (${historyEntry.status?.status_str ?? "unknown status"}).`
        : "ComfyUI restarted while this generation was running; it did not finish and is no longer in ComfyUI's queue or history."
    );
    summary.failed++;
  }

  return summary;
}

async function collectImages(
  client: ComfyUIClient,
  outputs: Record<string, unknown>
): Promise<Array<{ filename: string; data?: string; mimeType?: string }>> {
  const images: Array<{ filename: string; data?: string; mimeType?: string }> = [];

  for (const output of Object.values(outputs)) {
    const nodeOutput = output as {
      images?: Array<{ filename: string; subfolder: string; type: string }>;
    };
    if (!nodeOutput.images) continue;

    for (const img of nodeOutput.images) {
      const imageData = await client.getImage(img.filename, img.subfolder, img.type);
      const processed = await processImageForTransfer(Buffer.from(imageData), {
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

  return images;
}
