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
 * For desktop app installs, user data is in ~/Documents/ComfyUI
 */
export function getComfyUIPath(ctx: ServerContext): string {
  // For desktop app, the app bundle is in /Applications but user data is in Documents
  if (ctx.comfyuiPath?.includes("ComfyUI.app")) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    const documentsPath = `${homeDir}/Documents/ComfyUI`;
    return documentsPath;
  }
  if (ctx.comfyuiPath) return ctx.comfyuiPath;
  return ctx.config?.outputDir || "./";
}
