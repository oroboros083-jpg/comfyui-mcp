import { test } from "node:test";
import assert from "node:assert/strict";

import { ComfyUIClient, HistoryEntry, QueueStatus } from "../client/comfyui.js";
import {
  getQueue,
  getHistory,
  isHistoryDetail,
  PromptNotFoundError,
  renderQueue,
  renderHistory,
} from "./queue.js";
import { ResponseFormat } from "../utils/response.js";

/**
 * These tools front two unbounded ComfyUI endpoints, so the client is stubbed
 * rather than reached: what is being tested is the paging and shaping done on
 * this side, which is the part that decides how much context a call costs.
 */
function stubClient(over: {
  queue?: QueueStatus;
  history?: Record<string, HistoryEntry>;
}): ComfyUIClient {
  return {
    getQueue: async () => over.queue ?? { queue_running: [], queue_pending: [] },
    getHistory: async () => over.history ?? {},
  } as unknown as ComfyUIClient;
}

function entry(status: string, outputs: Record<string, never> | { n: never }): HistoryEntry {
  return {
    prompt: [0, "p", null, null, null],
    outputs: outputs as HistoryEntry["outputs"],
    status: { status_str: status, completed: status === "success", messages: [] },
  };
}

function queueOf(running: number, pending: number): QueueStatus {
  const tuple = (i: number, tag: string) =>
    [i, `${tag}-${i}`, null, null, null] as QueueStatus["queue_running"][number];
  return {
    queue_running: Array.from({ length: running }, (_, i) => tuple(i, "run")),
    queue_pending: Array.from({ length: pending }, (_, i) => tuple(i, "pend")),
  };
}

test("getQueue pages a long queue instead of dumping it", async () => {
  const client = stubClient({ queue: queueOf(1, 400) });

  const page = await getQueue(client, {
    limit: 25,
    offset: 0,
    response_format: ResponseFormat.JSON,
  });

  assert.equal(page.total, 401);
  assert.equal(page.jobs.length, 25);
  assert.equal(page.has_more, true);
  assert.equal(page.next_offset, 25);
});

test("getQueue counts the whole queue, not just the page", async () => {
  const client = stubClient({ queue: queueOf(2, 300) });

  const page = await getQueue(client, {
    limit: 10,
    offset: 0,
    response_format: ResponseFormat.JSON,
  });

  // The facets describe the queue; `jobs` describes the page. Conflating them
  // is the bug this guards against.
  assert.equal(page.running, 2);
  assert.equal(page.pending, 300);
  assert.equal(page.jobs.length, 10);
});

test("getQueue puts running jobs on the first page", async () => {
  const client = stubClient({ queue: queueOf(2, 100) });

  const page = await getQueue(client, {
    limit: 5,
    offset: 0,
    response_format: ResponseFormat.JSON,
  });

  assert.deepEqual(
    page.jobs.slice(0, 2).map((j) => j.state),
    ["running", "running"]
  );
  assert.equal(page.jobs[2].state, "pending");
});

test("getQueue carries the page exactly once", async () => {
  const client = stubClient({ queue: queueOf(1, 5) });

  const page = await getQueue(client, {
    limit: 25,
    offset: 0,
    response_format: ResponseFormat.JSON,
  });

  // `items` alongside `jobs` would put the same array in the response twice.
  assert.ok(!("items" in page));
});

test("getQueue reports an empty queue without a phantom page", async () => {
  const client = stubClient({ queue: queueOf(0, 0) });

  const page = await getQueue(client, {
    limit: 25,
    offset: 0,
    response_format: ResponseFormat.JSON,
  });

  assert.equal(page.total, 0);
  assert.equal(page.has_more, false);
  assert.equal(page.next_offset, undefined);
  assert.match(renderQueue(page), /empty/i);
});

test("getHistory lists identifying fields only, leaving outputs to the detail call", async () => {
  const history: Record<string, HistoryEntry> = {
    a: entry("success", { n: undefined as never }),
    b: entry("error", {}),
  };

  const result = await getHistory(stubClient({ history }), {
    limit: 25,
    offset: 0,
    response_format: ResponseFormat.JSON,
  });

  assert.ok(!isHistoryDetail(result));
  assert.equal(result.total, 2);
  assert.deepEqual(Object.keys(result.entries[0]).sort(), [
    "completed",
    "hasOutputs",
    "promptId",
    "status",
  ]);
});

test("getHistory pages rather than honouring only a limit", async () => {
  const history = Object.fromEntries(
    Array.from({ length: 90 }, (_, i) => [`p${i}`, entry("success", {})])
  );

  const result = await getHistory(stubClient({ history }), {
    limit: 20,
    offset: 60,
    response_format: ResponseFormat.JSON,
  });

  assert.ok(!isHistoryDetail(result));
  assert.equal(result.total, 90);
  assert.equal(result.entries.length, 20);
  assert.equal(result.offset, 60);
  assert.equal(result.has_more, true);
  assert.equal(result.next_offset, 80);
});

test("getHistory returns full outputs when asked for one prompt", async () => {
  const history = { abc: entry("success", { n: undefined as never }) };

  const result = await getHistory(stubClient({ history }), {
    promptId: "abc",
    limit: 25,
    offset: 0,
    response_format: ResponseFormat.JSON,
  });

  assert.ok(isHistoryDetail(result));
  assert.equal(result.promptId, "abc");
  assert.equal(result.completed, true);
});

test("getHistory raises an identifiable error for an unknown prompt", async () => {
  // ComfyUI answers /history/<unknown> with {}, so this must not be mistaken
  // for a successful empty result.
  await assert.rejects(
    () =>
      getHistory(stubClient({ history: {} }), {
        promptId: "missing",
        limit: 25,
        offset: 0,
        response_format: ResponseFormat.JSON,
      }),
    (err: unknown) =>
      err instanceof PromptNotFoundError && err.promptId === "missing"
  );
});

test("renderHistory tells the caller how to reach the next page", async () => {
  const history = Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => [`p${i}`, entry("success", {})])
  );

  const result = await getHistory(stubClient({ history }), {
    limit: 10,
    offset: 0,
    response_format: ResponseFormat.MARKDOWN,
  });

  assert.match(renderHistory(result), /offset: 10/);
});
