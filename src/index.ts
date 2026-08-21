#!/usr/bin/env node
/**
 * ComfyUI MCP server.
 *
 * Exposes ComfyUI - image, video and audio generation - as MCP tools. The
 * server is self-configuring: it discovers a running ComfyUI, detects what
 * that instance can do, and adapts its workflows to the models installed.
 *
 * It starts and stays useful whether or not ComfyUI is running; the setup and
 * library tools exist precisely for the case where it is not.
 *
 * This file is wiring only. Tools live in server/tools/, the connection
 * lifecycle in server/connection.ts.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  SetLevelRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { loadConfig } from "./config.js";
import { createContext, ServerContext } from "./context.js";
import { getJobManager } from "./jobs/manager.js";
import {
  bindContext,
  initializeComfyUI,
  reconcileAfterConnect,
  ensureConnected,
} from "./server/connection.js";
import { registerSetupTools } from "./server/tools/setup.js";
import { registerDiscoveryTools } from "./server/tools/discovery.js";
import { registerGenerationTools } from "./server/tools/generation.js";
import { registerTaskTools } from "./server/tools/tasks.js";
import { registerLibraryTools } from "./server/tools/library.js";
import { registerWorkspaceTools } from "./server/tools/workspace.js";
import {
  getStaticResources,
  getDynamicResources,
  readResource,
} from "./handlers/resources.js";
import { listPrompts, getPrompt } from "./handlers/prompts.js";
import {
  initLogging,
  setLogLevel,
  LoggingLevel,
  info,
  error as logError,
} from "./utils/logging.js";

// Single source of truth for all server state. Assigned in main() before
// anything can reach it; the accessor below is what the tool modules close
// over so they never capture an undefined value at module load.
let ctx: ServerContext;
const context = (): ServerContext => ctx;

const server = new McpServer(
  {
    name: "comfyui-mcp-server",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
      logging: {},
    },
  }
);

registerSetupTools(server, context);
registerDiscoveryTools(server);
registerGenerationTools(server, context);
registerTaskTools(server, context);
registerLibraryTools(server);
registerWorkspaceTools(server);

/**
 * Resources and prompts stay on the low-level handlers rather than
 * registerResource/registerPrompt: the resource set is enumerated from live
 * ComfyUI state (model lists change when the instance does), which the static
 * registration API does not model.
 */
const lowLevel = server.server;

lowLevel.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [...getStaticResources(), ...getDynamicResources(ctx)],
}));

lowLevel.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  // ComfyUI-backed resources go through the same gate as tools, so a restarted
  // ComfyUI is rediscovered instead of being reported as "not connected".
  // readResource reports the disconnected case itself, so failures fall through.
  if (uri.startsWith("comfyui://models/") || uri === "comfyui://capabilities") {
    await ensureConnected().catch(() => {});
  }
  return await readResource(ctx, uri);
});

lowLevel.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: listPrompts(),
}));

lowLevel.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return await getPrompt(ctx, name, args || {});
});

lowLevel.setRequestHandler(SetLevelRequestSchema, async (request) => {
  const { level } = request.params;
  setLogLevel(level as LoggingLevel);
  info(`Logging level set to: ${level}`);
  return {};
});

async function main(): Promise<void> {
  const config = await loadConfig();

  ctx = createContext(lowLevel, config, getJobManager());
  bindContext(ctx);

  initLogging(lowLevel, "info");

  if (await initializeComfyUI()) {
    // Jobs outlive this process, so anything left "working" in the database
    // was interrupted by a restart on one side or the other.
    await reconcileAfterConnect();
  }

  // Serve regardless of ComfyUI's state - the setup tools are how the user
  // gets from "not installed" to "running".
  await server.connect(new StdioServerTransport());

  info("ComfyUI MCP server started");
  if (!ctx.client) {
    info("ComfyUI is not connected. Setup and library tools are still available.");
  }
}

main().catch((err) => {
  logError(`Fatal error: ${err}`);
  process.exit(1);
});
