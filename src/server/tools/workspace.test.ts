import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Point the db module at a scratch database before anything imports it:
// getDatabase() resolves the path once and caches the handle.
const dir = mkdtempSync(join(tmpdir(), "comfyui-workspace-test-"));
process.env.COMFYUI_MCP_DB_PATH = join(dir, "test.db");

const db = await import("../../db/index.js");
const { registerWorkspaceTools } = await import("./workspace.js");

after(() => {
  // Windows will not unlink the open SQLite handle; the temp dir is
  // disposable either way, so a failure here is not a test failure.
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* left for the OS to reap */
  }
});

interface ToolResult {
  isError?: boolean;
  content: Array<{ text: string }>;
}

type Handler = (input: Record<string, unknown>) => Promise<ToolResult> | ToolResult;

function handlerFor(name: string): Handler {
  const handlers = new Map<string, Handler>();
  const server = {
    registerTool: (registered: string, _config: unknown, handler: Handler) => {
      handlers.set(registered, handler);
    },
  } as unknown as McpServer;

  registerWorkspaceTools(server);
  const handler = handlers.get(name);
  assert.ok(handler, `${name} is not registered`);
  return handler;
}

async function listTopics(input: Record<string, unknown>): Promise<{
  total: number;
  count: number;
  offset: number;
  has_more: boolean;
  next_offset?: number;
  topics: Array<{ topic: string; count: number }>;
}> {
  const result = await handlerFor("comfyui_list_topics")({
    response_format: "json",
    ...input,
  });
  assert.notEqual(result.isError, true, result.content[0]?.text);
  return JSON.parse(result.content[0].text);
}

test("list_topics reports the real topic total, not the page size", async () => {
  // Five topics, one of them with two notes, so `count` on a row is the note
  // count and `total` on the envelope is the topic count - they differ.
  for (const topic of ["alpha", "beta", "gamma", "delta", "epsilon"]) {
    db.saveNote(topic, `a note about ${topic}`, []);
  }
  db.saveNote("alpha", "a second note about alpha", []);

  const page = await listTopics({ limit: 2, offset: 0 });

  assert.equal(page.total, 5);
  assert.equal(page.count, 2);
  assert.equal(page.has_more, true);
  assert.equal(page.next_offset, 2);
});

test("list_topics pages to the end and stops", async () => {
  const first = await listTopics({ limit: 3, offset: 0 });
  const last = await listTopics({ limit: 3, offset: 3 });

  assert.equal(first.count, 3);
  assert.equal(last.count, 2);
  assert.equal(last.has_more, false);
  // The final page must not advertise an offset there is nothing at.
  assert.equal(last.next_offset, undefined);

  // Every topic is reachable across the two pages, which is the property the
  // unpaginated version could not lose and this one could.
  const seen = [...first.topics, ...last.topics].map((t) => t.topic);
  assert.deepEqual(seen.slice().sort(), [
    "alpha",
    "beta",
    "delta",
    "epsilon",
    "gamma",
  ]);
});

test("list_topics carries each topic's note count", async () => {
  const page = await listTopics({ limit: 50, offset: 0 });
  const alpha = page.topics.find((t) => t.topic === "alpha");

  assert.equal(alpha?.count, 2);
});
