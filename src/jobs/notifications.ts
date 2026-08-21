import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Job } from "./manager.js";
import { warning } from "../utils/logging.js";

/**
 * Send a task status notification to connected clients.
 * This uses MCP's experimental tasks notification format.
 */
export async function sendTaskStatusNotification(
  server: Server,
  job: Job
): Promise<void> {
  try {
    // Use the generic notification method with the tasks/status format
    await server.notification({
      method: "notifications/tasks/status",
      params: {
        taskId: job.taskId,
        status: job.status,
        ttl: null, // No expiration - results persist until server restart
        createdAt: job.createdAt,
        lastUpdatedAt: job.lastUpdatedAt,
        statusMessage: job.statusMessage,
      },
    } as never); // Type assertion needed for experimental notification type
  } catch (error) {
    // Log but don't throw - notifications are best-effort
    warning(`Failed to send task status notification: ${error}`, undefined, "notifications");
  }
}

/**
 * Send a progress notification for a running task.
 * This is sent when ComfyUI reports progress on a generation.
 */
export async function sendProgressNotification(
  server: Server,
  job: Job,
  progress: { value: number; max: number; node?: string }
): Promise<void> {
  // Update the status message with progress info
  const statusMessage = progress.node
    ? `Step ${progress.value}/${progress.max} (${progress.node})`
    : `Step ${progress.value}/${progress.max}`;

  try {
    await server.notification({
      method: "notifications/tasks/status",
      params: {
        taskId: job.taskId,
        status: "working",
        ttl: null,
        createdAt: job.createdAt,
        lastUpdatedAt: new Date().toISOString(),
        statusMessage,
      },
    } as never);
  } catch (error) {
    warning(`Failed to send progress notification: ${error}`, undefined, "notifications");
  }
}

/**
 * Send a completion notification for a finished task.
 */
export async function sendCompletionNotification(
  server: Server,
  job: Job
): Promise<void> {
  try {
    await server.notification({
      method: "notifications/tasks/status",
      params: {
        taskId: job.taskId,
        status: job.status,
        ttl: null,
        createdAt: job.createdAt,
        lastUpdatedAt: job.lastUpdatedAt,
        statusMessage: job.statusMessage,
      },
    } as never);
  } catch (error) {
    warning(`Failed to send completion notification: ${error}`, undefined, "notifications");
  }
}
