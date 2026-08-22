import { ComfyUIClient } from "../client/comfyui.js";
import { DISCONNECT_MARKER } from "../client/websocket.js";
import { JobManager, Job } from "./manager.js";
import { collectOutputImages, OutputImage } from "../tools/outputs.js";

/**
 * A job is orphaned when this process lost track of its execution: either
 * ComfyUI died while it was running, or the MCP server itself was restarted
 * while the job was in flight. Both leave a row stuck in "working" forever,
 * and every socket teardown marks in-flight prompts failed with this marker.
 * Neither is authoritative - ComfyUI's /history is.
 *
 * Imported rather than re-declared: a local copy is what let `disconnect()`
 * drift to its own wording, which this predicate then never matched.
 */
export { DISCONNECT_MARKER };

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
 * Complete a job from ComfyUI's history, if ComfyUI says it actually finished.
 *
 * Our record of a job is not authoritative - the process can be restarted, the
 * socket can drop mid-execution - but ComfyUI's history is. Returns the images
 * on success and null when history does not show the prompt complete, so the
 * caller can report the failure it already had.
 *
 * Outputs go through collectOutputImages, the same path a live run uses. Two
 * hand-rolled copies of that logic lived here and in server/tools/tasks.ts;
 * both hardcoded jpeg/85, always inlined base64, never wrote a file and never
 * set `path`, so a job recovered this way ignored the outputMode, imageFormat
 * and imageQuality the caller originally asked for.
 */
export async function completeJobFromHistory(
  client: ComfyUIClient,
  jobManager: JobManager,
  job: Job,
  outputDir: string,
  sizeThreshold: number
): Promise<OutputImage[] | null> {
  const history = await client.getHistory(job.promptId);
  const entry = history[job.promptId];
  if (!entry?.status?.completed || !entry.outputs) return null;

  const images = await collectOutputImages(
    client,
    entry.outputs,
    job.request.input,
    job.request.input.workflow,
    outputDir,
    sizeThreshold
  );

  jobManager.completeJob(job.taskId, {
    success: true,
    promptId: job.promptId,
    outputs: entry.outputs,
    images,
  });

  return images;
}

/**
 * Reconcile jobs whose real outcome is unknown against ComfyUI's queue and
 * history. Called after a successful (re)connect, so tasks never sit in
 * "working" reporting phantom in-flight work.
 */
export async function reconcileOrphanedJobs(
  client: ComfyUIClient,
  jobManager: JobManager,
  outputDir: string,
  sizeThreshold: number
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
        await completeJobFromHistory(client, jobManager, job, outputDir, sizeThreshold);
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
