import { GenerateImageInput, RunWorkflowInput, GenerateResult, RunWorkflowResult } from "../tools/generate.js";

export type JobStatus = "working" | "completed" | "failed" | "cancelled";

export interface JobRequest {
  type: "generate_image" | "run_workflow";
  input: GenerateImageInput | RunWorkflowInput;
}

export interface Job {
  taskId: string;
  promptId: string;
  status: JobStatus;
  statusMessage?: string;
  createdAt: string;
  lastUpdatedAt: string;
  result?: GenerateResult | RunWorkflowResult;
  error?: string;
  request: JobRequest;
}

/**
 * Manages async generation jobs.
 * Jobs persist for the lifetime of the server (no TTL cleanup).
 */
export class JobManager {
  private jobs: Map<string, Job> = new Map();
  private promptIdToTaskId: Map<string, string> = new Map();

  /**
   * Create a new job and track it.
   * Uses promptId as the taskId for simplicity (they're 1:1 anyway).
   */
  createJob(promptId: string, request: JobRequest): Job {
    const now = new Date().toISOString();
    const job: Job = {
      taskId: promptId, // Use promptId as taskId for simplicity
      promptId,
      status: "working",
      statusMessage: "Queued for generation",
      createdAt: now,
      lastUpdatedAt: now,
      request,
    };

    this.jobs.set(job.taskId, job);
    this.promptIdToTaskId.set(promptId, job.taskId);
    return job;
  }

  /**
   * Update an existing job with new values.
   */
  updateJob(taskId: string, updates: Partial<Omit<Job, "taskId" | "promptId" | "request" | "createdAt">>): Job | undefined {
    const job = this.jobs.get(taskId);
    if (!job) {
      return undefined;
    }

    const updatedJob: Job = {
      ...job,
      ...updates,
      lastUpdatedAt: new Date().toISOString(),
    };

    this.jobs.set(taskId, updatedJob);
    return updatedJob;
  }

  /**
   * Get a job by its task ID.
   */
  getJob(taskId: string): Job | undefined {
    return this.jobs.get(taskId);
  }

  /**
   * Get a job by its ComfyUI prompt ID.
   */
  getJobByPromptId(promptId: string): Job | undefined {
    const taskId = this.promptIdToTaskId.get(promptId);
    if (!taskId) {
      return undefined;
    }
    return this.jobs.get(taskId);
  }

  /**
   * List all jobs, optionally filtered by status.
   */
  listJobs(status?: JobStatus): Job[] {
    const jobs = Array.from(this.jobs.values());
    if (status) {
      return jobs.filter((j) => j.status === status);
    }
    return jobs;
  }

  /**
   * Delete a job by its task ID.
   */
  deleteJob(taskId: string): boolean {
    const job = this.jobs.get(taskId);
    if (!job) {
      return false;
    }
    this.promptIdToTaskId.delete(job.promptId);
    return this.jobs.delete(taskId);
  }

  /**
   * Get count of jobs by status.
   */
  getJobCounts(): Record<JobStatus, number> {
    const counts: Record<JobStatus, number> = {
      working: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const job of this.jobs.values()) {
      counts[job.status]++;
    }

    return counts;
  }

  /**
   * Mark a job as completed with its result.
   */
  completeJob(taskId: string, result: GenerateResult | RunWorkflowResult): Job | undefined {
    return this.updateJob(taskId, {
      status: "completed",
      statusMessage: "Generation complete",
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
   * Update job progress during generation.
   */
  updateProgress(taskId: string, value: number, max: number, nodeName?: string): Job | undefined {
    const message = nodeName
      ? `Step ${value}/${max} (${nodeName})`
      : `Step ${value}/${max}`;
    return this.updateJob(taskId, {
      statusMessage: message,
    });
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
