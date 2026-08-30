import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerSetupTools } from "./tools/setup.js";
import { registerDiscoveryTools } from "./tools/discovery.js";
import { registerGenerationTools } from "./tools/generation.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerLibraryTools } from "./tools/library.js";
import { registerWorkspaceTools } from "./tools/workspace.js";
import { ServerContext } from "../context.js";

/**
 * Nothing may point an agent at a `comfyui_*` tool that does not exist.
 *
 * `instructions.test.ts` already enforces this for the handshake text. This
 * widens it to EVERY tool description and every error hint, which is where the
 * rot actually accumulated: pruning twelve tools left roughly forty dangling
 * references scattered through hints in `src/tools/**`, none of which any test
 * or the compiler could see, because they are ordinary strings.
 *
 * A hint naming a tool that was deleted is worse than a hint naming none: it
 * spends the agent's next call on a tool that will not resolve, at the one
 * moment the hint exists to be acted on.
 */

function registeredToolNames(): Set<string> {
  const names: string[] = [];
  const server = {
    registerTool: (name: string) => {
      names.push(name);
    },
  } as unknown as McpServer;

  const context = () => ({}) as ServerContext;
  registerSetupTools(server, context);
  registerDiscoveryTools(server);
  registerGenerationTools(server, context);
  registerTaskTools(server, context);
  registerLibraryTools(server, context);
  registerWorkspaceTools(server);
  return new Set(names);
}

/** Every .ts source file under src/, excluding tests. */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
      found.push(path);
    }
  }
  return found;
}

test("no source file mentions a comfyui_ tool that is not registered", () => {
  const registered = registeredToolNames();

  // Run over the TypeScript sources rather than dist: the strings are the
  // point, and reading them from source means a stale dist cannot mask a
  // dangling reference (which is exactly how a deleted module's test kept
  // "passing" during this prune).
  const root = new URL("../../src", import.meta.url).pathname;
  const offenders: string[] = [];

  for (const file of sourceFiles(root)) {
    const text = readFileSync(file, "utf-8");
    // Not preceded by `/`: HuggingFace paths like
    // `stable-cascade/tree/main/comfyui_checkpoints` are directory names, not
    // tool references, and no tool name is ever written after a slash.
    for (const match of new Set(text.match(/(?<!\/)\bcomfyui_[a-z_]+/g) ?? [])) {
      if (!registered.has(match)) {
        offenders.push(`${file.slice(root.length + 1)}: ${match}`);
      }
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    "these name a comfyui_ tool that no longer exists - point them at the " +
      "official Comfy MCP's equivalent, or at the tool that replaced them"
  );
});
