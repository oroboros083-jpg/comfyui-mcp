import { test } from "node:test";
import assert from "node:assert/strict";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { INSTRUCTIONS } from "./instructions.js";
import { registerSetupTools } from "./tools/setup.js";
import { registerDiscoveryTools } from "./tools/discovery.js";
import { registerGenerationTools } from "./tools/generation.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerLibraryTools } from "./tools/library.js";
import { registerWorkspaceTools } from "./tools/workspace.js";
import { ServerContext } from "../context.js";

/**
 * Registration only ever calls registerTool, so a recorder stands in for a
 * live server - the same shape register.test.ts uses. Nothing here calls a
 * handler, so the context never has to be real.
 */
function registeredToolNames(): string[] {
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
  return names;
}

test("every tool the instructions name actually exists", () => {
  const registered = new Set(registeredToolNames());
  const mentioned = [...new Set(INSTRUCTIONS.match(/comfyui_[a-z_]+/g) ?? [])];

  assert.ok(mentioned.length > 0, "the instructions should name some tools");

  // An instruction block that names a renamed or deleted tool sends the agent
  // to something that is not there, at the one moment it has been told to
  // trust it. This is the only thing keeping the two in sync.
  const missing = mentioned.filter((name) => !registered.has(name));
  assert.deepEqual(missing, [], `instructions name tools that are not registered: ${missing}`);
});

test("the instructions stay small enough to ride every handshake", () => {
  // Not a style rule. This text is prepended to every session in every
  // client, so it competes directly with the conversation it is supposed to
  // help. 4KB is roughly a twentieth of the tool manifest and leaves room to
  // add a flow without anyone noticing the cost.
  assert.ok(
    INSTRUCTIONS.length < 4096,
    `instructions are ${INSTRUCTIONS.length} bytes; trim them or raise this deliberately`
  );
});
