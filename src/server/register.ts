/**
 * Shared plumbing for the per-domain tool modules.
 *
 * Every tool is registered through `defineTool`, which exists to make three
 * things impossible to forget: the service prefix on the name, the
 * annotations, and the connection gate for tools that need a live ComfyUI.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ensureConnected } from "./connection.js";
import { errorResult, ToolResult } from "../utils/response.js";

/**
 * Tool names carry the service prefix so this server can sit alongside others
 * without `get_status` or `interrupt` colliding with someone else's.
 */
export const TOOL_PREFIX = "comfyui_";

export interface ToolAnnotations {
  title: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolSpec<S extends z.ZodTypeAny> {
  /** Bare name, without the service prefix. */
  name: string;
  description: string;
  schema: S;
  annotations: ToolAnnotations;
  /**
   * Shape of `structuredContent`, for clients that consume the typed channel.
   *
   * Declaring this makes the SDK validate every response against it, so only
   * set it where the shape is genuinely stable - the paginated envelope is,
   * a free-form guide is not.
   */
  outputSchema?: z.ZodTypeAny;
  /**
   * Gate the handler behind a live ComfyUI connection. The gate rediscovers a
   * moved or restarted instance and fails with an actionable message when it
   * is genuinely gone, so handlers can assume they are connected.
   */
  requiresConnection?: boolean;
  handler: (input: z.infer<S>) => Promise<ToolResult> | ToolResult;
}

/**
 * Register one tool.
 *
 * Errors are reported inside the result (`isError`) rather than thrown, per
 * the MCP guidance that tool failures are results and not protocol errors -
 * a thrown error tells the agent nothing it can act on.
 */
export function defineTool<S extends z.ZodTypeAny>(
  server: McpServer,
  spec: ToolSpec<S>
): void {
  server.registerTool(
    `${TOOL_PREFIX}${spec.name}`,
    {
      title: spec.annotations.title,
      description: spec.description,
      inputSchema: spec.schema,
      ...(spec.outputSchema ? { outputSchema: spec.outputSchema } : {}),
      annotations: spec.annotations,
    },
    (async (input: z.infer<S>) => {
      try {
        if (spec.requiresConnection) await ensureConnected();
        return await spec.handler(input);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(`${spec.name} failed: ${message}`);
      }
    }) as never
  );
}

/** Convenience for the many tools that take no arguments. */
export const noArgs = z.object({}).strict();
