/**
 * Server context for managing MCP server state
 * Replaces global variables with a structured context object
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ComfyUIClient, ObjectInfo } from "./client/comfyui.js";
import { ComfyUIWebSocket } from "./client/websocket.js";
import { Capabilities } from "./capabilities/index.js";
import { Config } from "./config.js";
import { JobManager } from "./jobs/manager.js";

/**
 * Logging levels supported by MCP protocol
 */
export type LoggingLevel =
  | "debug"
  | "info"
  | "notice"
  | "warning"
  | "error"
  | "critical"
  | "alert"
  | "emergency";

/**
 * Session-level defaults for image generation
 * These persist until the server restarts
 */
export interface SessionDefaults {
  model?: string;
  sampler?: string;
  scheduler?: string;
  steps?: number;
  cfg?: number;
  width?: number;
  height?: number;
  negativePrompt?: string;
  imageFormat?: "jpeg" | "png" | "webp";
  imageQuality?: number;
  outputMode?: "base64" | "file" | "auto";
}

/**
 * Server context containing all state needed for MCP operations
 */
export interface ServerContext {
  // MCP Server instance
  server: Server;

  // Configuration
  config: Config;

  // ComfyUI connection state
  client: ComfyUIClient | null;
  ws: ComfyUIWebSocket | null;
  capabilities: Capabilities | null;
  objectInfo: ObjectInfo | null;

  // Discovery state
  discoveredUrl: string | null;
  discoverySource: string | null;
  comfyuiPath: string | null;

  // Job management
  jobManager: JobManager;

  // Logging configuration
  loggingLevel: LoggingLevel;

  // Session defaults for image generation
  sessionDefaults: SessionDefaults;
}

/**
 * Create a new server context with default values
 */
export function createContext(
  server: Server,
  config: Config,
  jobManager: JobManager
): ServerContext {
  return {
    server,
    config,
    client: null,
    ws: null,
    capabilities: null,
    objectInfo: null,
    discoveredUrl: null,
    discoverySource: null,
    comfyuiPath: null,
    jobManager,
    loggingLevel: "info",
    sessionDefaults: {},
  };
}

/**
 * Check if ComfyUI is fully connected
 */
export function isConnected(ctx: ServerContext): boolean {
  return (
    ctx.client !== null &&
    ctx.ws !== null &&
    ctx.capabilities !== null &&
    ctx.objectInfo !== null
  );
}

/**
 * Get ComfyUI installation path for downloads
 */
export function getComfyUIPath(ctx: ServerContext): string {
  if (ctx.comfyuiPath) return ctx.comfyuiPath;
  return ctx.config?.outputDir || "./";
}
