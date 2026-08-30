#!/usr/bin/env node
/**
 * Entry point.
 *
 * This server is a COMPANION to the official Comfy MCP
 * (`Comfy-Org/comfy-mcp`) and expects to be mounted alongside it. It carries
 * only the tools that server does worse or cannot do at all; installing
 * ComfyUI, managing models and custom nodes, and server lifecycle are all
 * deliberately absent, because that server does them better.
 */

import { start } from "./server/bootstrap.js";
import { error as logError } from "./utils/logging.js";

start().catch((err) => {
  logError(`Fatal error: ${err}`);
  process.exit(1);
});
