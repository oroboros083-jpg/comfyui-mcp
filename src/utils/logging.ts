/**
 * MCP Logging Protocol Implementation
 *
 * Provides structured logging that integrates with the MCP logging protocol
 * while maintaining stderr fallback for compatibility.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";

/**
 * Logging levels supported by MCP protocol (RFC 5424 syslog levels)
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
 * Numeric priority for each logging level
 */
const LOG_LEVEL_PRIORITY: Record<LoggingLevel, number> = {
  debug: 0,
  info: 1,
  notice: 2,
  warning: 3,
  error: 4,
  critical: 5,
  alert: 6,
  emergency: 7,
};

// Module state
let serverInstance: Server | null = null;
let currentLevel: LoggingLevel = "info";

/**
 * Initialize the logging system with a server instance
 */
export function initLogging(server: Server, level: LoggingLevel = "info"): void {
  serverInstance = server;
  currentLevel = level;
}

/**
 * Set the current logging level
 */
export function setLogLevel(level: LoggingLevel): void {
  currentLevel = level;
}

/**
 * Check if a message at the given level should be logged
 */
function shouldLog(level: LoggingLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
}

/**
 * Log a message at the specified level
 *
 * @param level - The logging level
 * @param message - The message to log
 * @param data - Optional additional data to include
 * @param logger - Optional logger name (defaults to "comfyui-mcp")
 */
export async function log(
  level: LoggingLevel,
  message: string,
  data?: unknown,
  logger: string = "comfyui-mcp"
): Promise<void> {
  // Always write to stderr for debugging (MCP uses stdout for protocol)
  const timestamp = new Date().toISOString();
  const dataStr = data !== undefined ? ` ${JSON.stringify(data)}` : "";
  console.error(`[${timestamp}] [${level.toUpperCase()}] [${logger}] ${message}${dataStr}`);

  // Send MCP logging notification if level is high enough and server is connected
  if (serverInstance && shouldLog(level)) {
    try {
      await serverInstance.sendLoggingMessage({
        level,
        logger,
        data: data !== undefined ? { message, ...data as object } : message,
      });
    } catch {
      // Ignore logging errors - stderr is our fallback
    }
  }
}

/**
 * Log a debug message
 */
export function debug(
  message: string,
  data?: unknown,
  logger?: string
): Promise<void> {
  return log("debug", message, data, logger);
}

/**
 * Log an info message
 */
export function info(
  message: string,
  data?: unknown,
  logger?: string
): Promise<void> {
  return log("info", message, data, logger);
}

/**
 * Log a warning message
 */
export function warning(
  message: string,
  data?: unknown,
  logger?: string
): Promise<void> {
  return log("warning", message, data, logger);
}

/**
 * Log an error message
 */
export function error(
  message: string,
  data?: unknown,
  logger?: string
): Promise<void> {
  return log("error", message, data, logger);
}
