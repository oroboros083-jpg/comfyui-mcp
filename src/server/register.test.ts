import { test } from "node:test";
import assert from "node:assert/strict";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { defineTool, noArgs, TOOL_PREFIX } from "./register.js";

interface Registered {
  name: string;
  config: {
    title?: string;
    description?: string;
    annotations?: Record<string, unknown>;
    outputSchema?: unknown;
  };
  handler: (input: unknown) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
}

/**
 * defineTool only ever calls registerTool, so a recorder stands in for the
 * server. What is under test is the shaping defineTool applies on the way
 * through: the name prefix, the annotations, and the error wrapper.
 */
function recorder(): { server: McpServer; tools: Registered[] } {
  const tools: Registered[] = [];
  const server = {
    registerTool: (name: string, config: Registered["config"], handler: Registered["handler"]) => {
      tools.push({ name, config, handler });
    },
  } as unknown as McpServer;
  return { server, tools };
}

test("defineTool prefixes the tool name with the service", () => {
  const { server, tools } = recorder();

  defineTool(server, {
    name: "get_status",
    description: "d",
    schema: noArgs,
    annotations: {
      title: "Get Status",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: () => ({ content: [{ type: "text", text: "ok" }] }),
  });

  assert.equal(tools[0].name, `${TOOL_PREFIX}get_status`);
});

test("a read-only tool is published as non-destructive", () => {
  const { server, tools } = recorder();

  defineTool(server, {
    name: "list_things",
    description: "d",
    schema: noArgs,
    annotations: {
      title: "List Things",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: () => ({ content: [{ type: "text", text: "ok" }] }),
  });

  // destructiveHint defaults to true in the MCP spec, so leaving it unset
  // would advertise a read-only tool as destructive.
  assert.equal(tools[0].config.annotations?.destructiveHint, false);
});

test("a writing tool defaults to destructive unless it says otherwise", () => {
  const { server, tools } = recorder();

  defineTool(server, {
    name: "write_thing",
    description: "d",
    schema: noArgs,
    annotations: {
      title: "Write Thing",
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: () => ({ content: [{ type: "text", text: "ok" }] }),
  });

  assert.equal(tools[0].config.annotations?.destructiveHint, true);
});

test("an explicit destructiveHint is not overwritten", () => {
  const { server, tools } = recorder();

  defineTool(server, {
    name: "append_thing",
    description: "d",
    schema: noArgs,
    annotations: {
      title: "Append Thing",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: () => ({ content: [{ type: "text", text: "ok" }] }),
  });

  assert.equal(tools[0].config.annotations?.destructiveHint, false);
});

test("every tool publishes all four behaviour hints", () => {
  const { server, tools } = recorder();

  defineTool(server, {
    name: "anything",
    description: "d",
    schema: noArgs,
    annotations: {
      title: "Anything",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: () => ({ content: [{ type: "text", text: "ok" }] }),
  });

  const annotations = tools[0].config.annotations ?? {};
  for (const hint of [
    "readOnlyHint",
    "destructiveHint",
    "idempotentHint",
    "openWorldHint",
  ]) {
    assert.equal(typeof annotations[hint], "boolean", `${hint} is published`);
  }
});

test("a throwing handler is reported as a tool error, not a protocol error", async () => {
  const { server, tools } = recorder();

  defineTool(server, {
    name: "explodes",
    description: "d",
    schema: z.object({}).strict(),
    annotations: {
      title: "Explodes",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: () => {
      throw new Error("underlying failure");
    },
  });

  const result = await tools[0].handler({});

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /comfyui_explodes failed: underlying failure/);
});
