#!/usr/bin/env node
/**
 * The standalone entry point: every tool this server has.
 *
 * Use this when it is the only ComfyUI-facing MCP server mounted. If the
 * official Comfy MCP (`Comfy-Org/comfy-mcp`) is mounted too, `companion.ts`
 * (`comfyui-mcp-companion`) drops the handful of tools it does better, so the
 * agent is not choosing between two answers to the same question.
 */

import { start } from "./server/bootstrap.js";
import { error as logError } from "./utils/logging.js";

start("standalone").catch((err) => {
  logError(`Fatal error: ${err}`);
  process.exit(1);
});
