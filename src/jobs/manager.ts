import { RunWorkflowInput, RunWorkflowResult } from "../tools/generate.js";
import * as db from "../db/index.js";
import { ProgressStats } from "../db/index.js";

export type JobStatus = "working" | "completed" | "failed" | "cancelled";

export interface JobRequest {
  type: "run_workflow";
  input: RunWorkflowInput;
}

export interface Job {
  taskId: string;
  promptId: string;
  status: JobStatus;
  statusMessage?: string;
  createdAt: string;
  lastUpdatedAt: string;
  result?: RunWorkflowResult;
  error?: string;
  request: JobRequest;
  name?: string;
  progressStats?: ProgressStats;
}

/**
 * Convert a database row to a Job object.
 */
function rowToJob(row: db.JobRow): Job {
  return {
    taskId: row.task_id,
    promptId: row.prompt_id,
    status: row.status as JobStatus,
    statusMessage: row.status_message ?? undefined,
    createdAt: row.created_at,
    lastUpdatedAt: row.last_updated_at,
    result: row.result ? JSON.parse(row.result) : undefined,
    error: row.error ?? undefined,
    request: JSON.parse(row.request),
    name: row.name ?? undefined,
    progressStats: row.progress_stats ? JSON.parse(row.progress_stats) : undefined,
  };
}

/**
 * Manages async generation jobs with SQLite persistence.
 * Jobs persist across server restarts.
 */
export class JobManager {
  /**
   * Create a new job and track it.
   * Uses promptId as the taskId for simplicity (they're 1:1 anyway).
   */
  createJob(promptId: string, request: JobRequest, name?: string): Job {
    const now = new Date().toISOString();
    const job: Job = {
      taskId: promptId,
      promptId,
      status: "working",
      statusMessage: "Queued for generation",
      createdAt: now,
      lastUpdatedAt: now,
      request,
      name,
    };

    db.insertJob({
      taskId: job.taskId,
      promptId: job.promptId,
      status: job.status,
      statusMessage: job.statusMessage,
      createdAt: job.createdAt,
      lastUpdatedAt: job.lastUpdatedAt,
      request: job.request,
      name: job.name,
    });

    return job;
  }

  /**
   * Update an existing job with new values.
   */
  updateJob(taskId: string, updates: Partial<Omit<Job, "taskId" | "promptId" | "request" | "createdAt">>): Job | undefined {
    const row = db.updateJob(taskId, {
      status: updates.status,
      statusMessage: updates.statusMessage,
      result: updates.result,
      error: updates.error,
      name: updates.name,
      progressStats: updates.progressStats,
    });

    return row ? rowToJob(row) : undefined;
  }

  /**
   * Get a job by its task ID.
   */
  getJob(taskId: string): Job | undefined {
    const row = db.getJobById(taskId);
    return row ? rowToJob(row) : undefined;
  }

  /**
   * Get a job by its ComfyUI prompt ID.
   */
  getJobByPromptId(promptId: string): Job | undefined {
    const row = db.getJobByPromptId(promptId);
    return row ? rowToJob(row) : undefined;
  }

  /**
   * Get a job by its user-assigned name.
   */
  getJobByName(name: string): Job | undefined {
    const row = db.getJobByName(name);
    return row ? rowToJob(row) : undefined;
  }

  /**
   * List all jobs, optionally filtered by status.
   */
  listJobs(status?: JobStatus): Job[] {
    const rows = db.listJobs(status);
    return rows.map(rowToJob);
  }

  /**
   * Delete a job by its task ID.
   */
  deleteJob(taskId: string): boolean {
    return db.deleteJob(taskId);
  }

  /**
   * Get count of jobs by status.
   */
  getJobCounts(): Record<JobStatus, number> {
    const counts = db.getJobCounts();
    return {
      working: counts.working ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      cancelled: counts.cancelled ?? 0,
    };
  }

  /**
   * Mark a job as completed with its result.
   */
  completeJob(taskId: string, result: RunWorkflowResult): Job | undefined {
    return this.updateJob(taskId, {
      status: "completed",
      statusMessage: "Workflow complete",
      result,
    });
  }

  /**
   * Mark a job as failed with an error message.
   */
  failJob(taskId: string, error: string): Job | undefined {
    return this.updateJob(taskId, {
      status: "failed",
      statusMessage: error,
      error,
    });
  }

  /**
   * Mark a job as cancelled.
   */
  cancelJob(taskId: string): Job | undefined {
    return this.updateJob(taskId, {
      status: "cancelled",
      statusMessage: "Generation cancelled",
    });
  }

  /**
   * Update job progress during generation with timing stats.
   */
  updateProgress(taskId: string, value: number, max: number, nodeName?: string): Job | undefined {
    const row = db.updateJobProgress(taskId, value, max, nodeName);
    return row ? rowToJob(row) : undefined;
  }

  /**
   * Set or update the name for a job.
   * Names are unique - setting a name that exists elsewhere will move it to this job.
   */
  setName(taskId: string, name: string): boolean {
    return db.setJobName(taskId, name);
  }

  /**
   * Clear the name from a job.
   */
  clearName(taskId: string): boolean {
    return db.clearJobName(taskId);
  }

  /**
   * List all named jobs.
   */
  listNames(): Array<{ name: string; taskId: string }> {
    return db.listNamedJobs();
  }
}

// Global singleton instance
let jobManagerInstance: JobManager | null = null;

/**
 * Get the global job manager instance.
 */
export function getJobManager(): JobManager {
  if (!jobManagerInstance) {
    jobManagerInstance = new JobManager();
  }
  return jobManagerInstance;
}
