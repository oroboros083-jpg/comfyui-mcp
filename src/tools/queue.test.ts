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
  getHistorySchema,
  cancelJob,
  interrupt,
} from "./queue.js";
import { ResponseFormat, paginatedOutputSchema } from "../utils/response.js";

/**
 * These tools front two unbounded ComfyUI endpoints, so the client is stubbed
 * rather than reached: what is being tested is the paging and shaping done on
 * this side, which is the part that decides how much context a call costs.
 */
function stubClient(over: {
  queue?: QueueStatus;
  history?: Record<string, HistoryEntry>;
  clientId?: string;
  onCancel?: (promptId?: string | string[]) => void;
  onInterrupt?: () => void;
}): ComfyUIClient {
  return {
    getQueue: async () => over.queue ?? { queue_running: [], queue_pending: [] },
    getHistory: async () => over.history ?? {},
    getClientId: () => over.clientId ?? "me",
    cancelQueue: async (promptId?: string | string[]) => over.onCancel?.(promptId),
    interrupt: async () => over.onInterrupt?.(),
  } as unknown as ComfyUIClient;
}

/** A queue tuple carrying an explicit submitter. */
function ownedTuple(
  i: number,
  tag: string,
  clientId?: string
): QueueStatus["queue_running"][number] {
  return [
    i,
    `${tag}-${i}`,
    null,
    clientId === undefined ? null : { client_id: clientId },
    null,
  ];
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
    order: "newest",
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
    order: "newest",
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
    order: "newest",
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
        order: "newest",
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
    order: "newest",
    offset: 0,
    response_format: ResponseFormat.MARKDOWN,
  });

  assert.match(renderHistory(result), /offset: 10/);
});

test("every getQueue page satisfies the declared outputSchema", async () => {
  // get_queue declares an outputSchema, and the SDK fails the whole call when
  // a response does not match it - including on the branches that are easy to
  // forget. Each of these is one of those branches.
  const schema = paginatedOutputSchema("jobs");

  const cases: Array<[string, QueueStatus, number]> = [
    ["empty queue", queueOf(0, 0), 0],
    ["single page", queueOf(1, 3), 0],
    ["first of many", queueOf(1, 100), 0],
    ["final page", queueOf(1, 30), 25],
  ];

  for (const [label, queue, offset] of cases) {
    const page = await getQueue(stubClient({ queue }), {
      limit: 25,
      offset,
      response_format: ResponseFormat.JSON,
    });
    assert.equal(schema.safeParse(page).success, true, label);
  }
});

test("getHistory leads with the newest run, not the oldest ComfyUI remembers", async () => {
  // /history is a dict appended to in execution order and retained up to
  // 10000 entries, so paging it directly returned the oldest prompts the
  // instance still remembers. The common question - the one
  // PromptNotFoundError's hint sends the caller here to answer - is about a
  // run just submitted.
  const history = Object.fromEntries(
    Array.from({ length: 90 }, (_, i) => [`p${i}`, entry("success", {})])
  );

  const result = await getHistory(stubClient({ history }), {
    limit: 3,
    offset: 0,
    order: "newest",
    response_format: ResponseFormat.JSON,
  });

  assert.ok(!isHistoryDetail(result));
  assert.deepEqual(
    result.entries.map((e) => e.promptId),
    ["p89", "p88", "p87"]
  );
  assert.equal(result.total, 90, "paging still spans everything");
});

test("getHistory can still walk history in execution order", async () => {
  const history = Object.fromEntries(
    Array.from({ length: 90 }, (_, i) => [`p${i}`, entry("success", {})])
  );

  const result = await getHistory(stubClient({ history }), {
    limit: 3,
    offset: 0,
    order: "oldest",
    response_format: ResponseFormat.JSON,
  });

  assert.ok(!isHistoryDetail(result));
  assert.deepEqual(
    result.entries.map((e) => e.promptId),
    ["p0", "p1", "p2"]
  );
});

test("getHistory defaults to newest without being asked", async () => {
  const history = Object.fromEntries(
    Array.from({ length: 5 }, (_, i) => [`p${i}`, entry("success", {})])
  );

  const parsed = getHistorySchema.parse({});
  const result = await getHistory(stubClient({ history }), parsed);

  assert.ok(!isHistoryDetail(result));
  assert.equal(result.entries[0].promptId, "p4");
});

// ---------------------------------------------------------------------------
// Ownership - which jobs are this agent's, on a ComfyUI others are also using
// ---------------------------------------------------------------------------

test("getQueue marks its own jobs and other clients' jobs apart", async () => {
  const client = stubClient({
    clientId: "agent-a",
    queue: {
      queue_running: [ownedTuple(0, "run", "agent-a")],
      queue_pending: [ownedTuple(1, "pend", "agent-b"), ownedTuple(2, "pend", "agent-a")],
    },
  });
  const result = await getQueue(client, { limit: 50, offset: 0, response_format: ResponseFormat.JSON });

  assert.equal(result.mine, 2);
  assert.equal(result.foreign, 1);
  assert.deepEqual(
    result.jobs.map((j) => [j.promptId, j.mine]),
    [["run-0", true], ["pend-1", false], ["pend-2", true]]
  );
});

test("a job submitted without a client_id is not claimed as ours", async () => {
  const client = stubClient({
    clientId: "agent-a",
    queue: { queue_running: [], queue_pending: [ownedTuple(0, "pend")] },
  });
  const result = await getQueue(client, { limit: 50, offset: 0, response_format: ResponseFormat.JSON });

  assert.equal(result.jobs[0].mine, false, "unknown owner is not us");
  assert.equal(result.jobs[0].clientId, undefined);
  assert.equal(result.foreign, 1);
});

test("a bulk cancel leaves other clients' jobs alone by default", async () => {
  const cancelled: (string | string[] | undefined)[] = [];
  const client = stubClient({
    clientId: "agent-a",
    onCancel: (id) => cancelled.push(id),
    queue: {
      queue_running: [],
      queue_pending: [
        ownedTuple(0, "pend", "agent-a"),
        ownedTuple(1, "pend", "agent-b"),
        ownedTuple(2, "pend", "agent-a"),
      ],
    },
  });

  const result = await cancelJob(client, { scope: "mine" });

  // One request carrying both of our ids, not one request per id: /queue's
  // `delete` takes a list, and a per-id sweep was fifty round trips to cancel
  // fifty jobs. The scoping this test exists for is unchanged - agent-b's
  // pend-1 is still absent.
  assert.deepEqual(cancelled, [["pend-0", "pend-2"]], "only our own ids, in one call");
  assert.equal(result.cancelled, 2);
  assert.equal(result.left_alone, 1);
});

test("a bulk cancel with nothing of ours sends no delete at all", async () => {
  // `{delete: []}` is a request that asks ComfyUI to do nothing; the guard on
  // length is what keeps it off the wire.
  const cancelled: (string | string[] | undefined)[] = [];
  const client = stubClient({
    clientId: "agent-a",
    onCancel: (id) => cancelled.push(id),
    queue: { queue_running: [], queue_pending: [ownedTuple(0, "pend", "agent-b")] },
  });

  const result = await cancelJob(client, { scope: "mine" });

  assert.deepEqual(cancelled, [], "no request issued");
  assert.equal(result.cancelled, 0);
  assert.equal(result.left_alone, 1);
});

test("scope 'all' clears the whole queue in one call", async () => {
  const cancelled: (string | string[] | undefined)[] = [];
  const client = stubClient({
    clientId: "agent-a",
    onCancel: (id) => cancelled.push(id),
    queue: { queue_running: [], queue_pending: [ownedTuple(0, "pend", "agent-b")] },
  });

  const result = await cancelJob(client, { scope: "all" });

  assert.deepEqual(cancelled, [undefined], "one unscoped clear, not a per-id sweep");
  assert.equal(result.cancelled, "all");
});

test("cancelling one job by id does not consult ownership", async () => {
  const cancelled: (string | string[] | undefined)[] = [];
  const client = stubClient({
    clientId: "agent-a",
    onCancel: (id) => cancelled.push(id),
    queue: { queue_running: [], queue_pending: [ownedTuple(0, "pend", "agent-b")] },
  });

  await cancelJob(client, { promptId: "pend-0", scope: "mine" });
  assert.deepEqual(cancelled, ["pend-0"]);
});

test("interrupt refuses to kill another client's running job", async () => {
  let interrupted = false;
  const client = stubClient({
    clientId: "agent-a",
    onInterrupt: () => (interrupted = true),
    queue: { queue_running: [ownedTuple(0, "run", "agent-b")], queue_pending: [] },
  });

  await assert.rejects(() => interrupt(client), /submitted by agent-b/);
  assert.equal(interrupted, false, "nothing was interrupted");
});

test("interrupt proceeds on another client's job once confirmed", async () => {
  let interrupted = false;
  const client = stubClient({
    clientId: "agent-a",
    onInterrupt: () => (interrupted = true),
    queue: { queue_running: [ownedTuple(0, "run", "agent-b")], queue_pending: [] },
  });

  const result = await interrupt(client, { confirm_foreign: true });
  assert.equal(interrupted, true);
  assert.equal(result.interrupted, "foreign");
});

test("interrupt does not gate our own running job", async () => {
  let interrupted = false;
  const client = stubClient({
    clientId: "agent-a",
    onInterrupt: () => (interrupted = true),
    queue: { queue_running: [ownedTuple(0, "run", "agent-a")], queue_pending: [] },
  });

  const result = await interrupt(client);
  assert.equal(interrupted, true);
  assert.equal(result.interrupted, "mine");
});

test("interrupt does not gate an idle queue", async () => {
  const client = stubClient({ clientId: "agent-a", onInterrupt: () => {} });
  const result = await interrupt(client);
  assert.equal(result.interrupted, "unknown");
});

test("interrupt gates a running job that carries no client_id", async () => {
  // "nothing running" and "running, but we cannot say whose" were the same
  // "unknown" state, and only "foreign" was gated - so a render submitted by a
  // bare curl against /prompt, which sends no client_id, was discarded without
  // anyone being asked. ComfyUI has one global /interrupt, so this gate is the
  // only place the scoping can live.
  let interrupted = false;
  const client = stubClient({
    clientId: "agent-a",
    onInterrupt: () => (interrupted = true),
    // ownedTuple with no clientId emits a null extra_data, i.e. no submitter.
    queue: { queue_running: [ownedTuple(0, "run")], queue_pending: [] },
  });

  await assert.rejects(() => interrupt(client), /no client_id/);
  assert.equal(interrupted, false, "someone else's render survived");
});

test("interrupt proceeds on an unattributed job once confirmed", async () => {
  let interrupted = false;
  const client = stubClient({
    clientId: "agent-a",
    onInterrupt: () => (interrupted = true),
    queue: { queue_running: [ownedTuple(0, "run")], queue_pending: [] },
  });

  const result = await interrupt(client, { confirm_foreign: true });
  assert.equal(interrupted, true);
  assert.equal(result.interrupted, "unattributed");
});
