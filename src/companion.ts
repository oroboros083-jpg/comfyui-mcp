#!/usr/bin/env node
/**
 * The companion entry point: for running alongside the official Comfy MCP.
 *
 * Identical to `index.ts` except that it does not register the tools
 * `Comfy-Org/comfy-mcp` does better - install, server lifecycle, and model
 * download. See `server/profile.ts` for the list and the reasoning, including
 * why the queue tools are deliberately NOT on it.
 *
 * Both servers can be mounted at once; that is the configuration this exists
 * for. Mounting this one alone is legal but leaves no way to install ComfyUI
 * or start it, which is what `comfyui-mcp` is for.
 */

import { start } from "./server/bootstrap.js";
import { error as logError } from "./utils/logging.js";

start("companion").catch((err) => {
  logError(`Fatal error: ${err}`);
  process.exit(1);
});
