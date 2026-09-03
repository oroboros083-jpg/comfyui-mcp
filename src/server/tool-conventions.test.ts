import { test } from "node:test";
import assert from "node:assert/strict";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { registerSetupTools } from "./tools/setup.js";
import { registerDiscoveryTools } from "./tools/discovery.js";
import { registerGenerationTools } from "./tools/generation.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerLibraryTools } from "./tools/library.js";
import { registerWorkspaceTools } from "./tools/workspace.js";
import { ServerContext } from "../context.js";

/**
 * Conventions that hold across the WHOLE tool surface, checked against the
 * registrations rather than by reading.
 *
 * `tool-references.test.ts` guards the other direction - that nothing names a
 * tool which does not exist. Neither it nor the compiler can see a tool that
 * exists and is shaped wrongly, and that is where drift accumulates: a schema
 * that quietly accepts typos, or a listing that grew a `limit` without the
 * `offset` to go with it. Both were found by hand once; this is so they are
 * not found by hand twice.
 */

interface Captured {
  name: string;
  inputSchema?: unknown;
}

function registeredTools(): Captured[] {
  const tools: Captured[] = [];
  const server = {
    registerTool: (name: string, config: { inputSchema?: unknown }) => {
      tools.push({ name, inputSchema: config.inputSchema });
    },
  } as unknown as McpServer;

  const context = () => ({}) as ServerContext;
  registerSetupTools(server, context);
  registerDiscoveryTools(server);
  registerGenerationTools(server, context);
  registerTaskTools(server, context);
  registerLibraryTools(server, context);
  registerWorkspaceTools(server);
  return tools;
}

/** The object a tool's input schema is, or null if it is not one. */
function asObjectSchema(schema: unknown): z.ZodObject<z.ZodRawShape> | null {
  return schema instanceof z.ZodObject ? schema : null;
}

test("every tool's input schema rejects unknown keys", () => {
  const offenders: string[] = [];

  for (const { name, inputSchema } of registeredTools()) {
    const object = asObjectSchema(inputSchema);
    if (!object) {
      offenders.push(`${name}: input schema is not a z.object`);
      continue;
    }
    // Without .strict() a misspelled argument is silently dropped, and the
    // tool runs with a default the caller did not choose - which reads as the
    // tool ignoring them rather than as the typo it is.
    if (object._def.unknownKeys !== "strict") {
      offenders.push(`${name}: schema is not .strict()`);
    }
  }

  assert.deepEqual(offenders, []);
});

test("a tool that pages declares limit, offset and response_format together", () => {
  const offenders: string[] = [];

  for (const { name, inputSchema } of registeredTools()) {
    const object = asObjectSchema(inputSchema);
    if (!object) continue;

    const keys = new Set(Object.keys(object.shape));
    const pages = keys.has("limit") || keys.has("offset");
    if (!pages) continue;

    // `limit` without `offset` is the shape that looks paginated and is not:
    // it caps the response and leaves everything past the cap unreachable.
    if (!keys.has("limit")) offenders.push(`${name}: has offset without limit`);
    if (!keys.has("offset")) offenders.push(`${name}: has limit without offset`);
    // Every listing renders through renderListing as well as returning JSON,
    // so the caller has to be able to ask for the other one.
    if (!keys.has("response_format")) {
      offenders.push(`${name}: paginated but takes no response_format`);
    }
  }

  assert.deepEqual(offenders, []);
});
