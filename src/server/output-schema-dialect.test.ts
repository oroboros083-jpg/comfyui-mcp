import { test } from "node:test";
import assert from "node:assert/strict";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { relaxOutputSchemaDialect, stripDialect } from "./output-schema-dialect.js";
import { defineTool, noArgs } from "./register.js";
import { paginatedOutputSchema, dataResult } from "../utils/response.js";

function serverWithPaginatedTool(): McpServer {
  const server = new McpServer(
    { name: "test", version: "0" },
    { capabilities: { tools: {} } }
  );

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
    outputSchema: paginatedOutputSchema("things", z.array(z.string())),
    handler: () =>
      dataResult({ total: 0, count: 0, offset: 0, things: [], has_more: false }),
  });

  return server;
}

/** Ask the server for its tool listing the way a client would. */
async function listTools(server: McpServer): Promise<{
  tools: Array<{ name: string; outputSchema?: Record<string, unknown> }>;
}> {
  const handlers = (
    server.server as unknown as {
      _requestHandlers: Map<string, (req: unknown, extra: unknown) => Promise<unknown>>;
    }
  )._requestHandlers;

  const handler = handlers.get("tools/list");
  assert.ok(handler, "the SDK registered a tools/list handler");

  return (await handler(
    { method: "tools/list", params: {} },
    { signal: new AbortController().signal }
  )) as { tools: Array<{ name: string; outputSchema?: Record<string, unknown> }> };
}

test("the SDK still stamps a dialect clients reject", async () => {
  // The guard this whole module exists for. If a future SDK stops emitting
  // draft-07 - or starts emitting 2020-12 - this fails and the workaround can
  // be deleted rather than left to rot.
  const listing = await listTools(serverWithPaginatedTool());
  const tool = listing.tools.find((t) => t.name === "comfyui_list_things");

  assert.ok(tool?.outputSchema, "the tool declares an output schema");
  assert.equal(
    tool.outputSchema.$schema,
    "http://json-schema.org/draft-07/schema#",
    "unwrapped, the SDK declares draft-07"
  );
});

test("relaxOutputSchemaDialect removes the dialect from the listing", async () => {
  const server = serverWithPaginatedTool();

  assert.equal(relaxOutputSchemaDialect(server), true, "the wrap took");

  const listing = await listTools(server);
  const tool = listing.tools.find((t) => t.name === "comfyui_list_things");

  assert.ok(tool?.outputSchema, "the schema is still declared");
  assert.equal(
    "$schema" in tool.outputSchema,
    false,
    "no dialect is asserted, so the client applies its own default"
  );
});

test("relaxing the dialect leaves the schema itself intact", async () => {
  const server = serverWithPaginatedTool();
  relaxOutputSchemaDialect(server);

  const listing = await listTools(server);
  const schema = listing.tools.find((t) => t.name === "comfyui_list_things")
    ?.outputSchema as { type?: string; required?: string[] };

  assert.equal(schema.type, "object");
  assert.deepEqual(schema.required?.sort(), [
    "count",
    "has_more",
    "offset",
    "things",
    "total",
  ]);
});

test("stripDialect tolerates listings it does not recognise", () => {
  // It runs on whatever the SDK hands back, so it must not throw on a shape
  // that has changed.
  assert.equal(stripDialect(null), 0);
  assert.equal(stripDialect({}), 0);
  assert.equal(stripDialect({ tools: [] }), 0);
  assert.equal(stripDialect({ tools: [{}] }), 0);
  assert.equal(stripDialect({ tools: [{ outputSchema: {} }] }), 0);
  assert.equal(stripDialect({ tools: [{ outputSchema: { $schema: "x" } }] }), 1);
});

test("relaxOutputSchemaDialect reports failure rather than throwing", () => {
  // If the SDK's internals move, the server must still start.
  const notAServer = { server: {} } as unknown as McpServer;
  assert.equal(relaxOutputSchemaDialect(notAServer), false);
});
