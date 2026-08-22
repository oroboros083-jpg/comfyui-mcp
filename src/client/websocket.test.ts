import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ComfyUIWebSocket,
  DISCONNECT_MARKER,
  INTERRUPTED_MARKER,
  type ComfyUIMessage,
} from "./websocket.js";

/**
 * The message handler is private, but it is the whole surface under test here:
 * everything below is about what happens to a prompt's result depending on
 * when - relative to the messages - a waiter registers.
 */
function deliver(ws: ComfyUIWebSocket, message: ComfyUIMessage): void {
  (ws as unknown as { handleMessage(m: ComfyUIMessage): void }).handleMessage(message);
}

function executed(promptId: string, node: string, output: unknown): ComfyUIMessage {
  return {
    type: "executed",
    data: { node, prompt_id: promptId, output: output as Record<string, unknown> },
  };
}

function finished(promptId: string): ComfyUIMessage {
  return { type: "executing", data: { node: null, prompt_id: promptId } };
}

/** A socket that is never connected; only message handling is exercised. */
function socket(): ComfyUIWebSocket {
  return new ComfyUIWebSocket("ws://127.0.0.1:0/ws");
}

test("a prompt that finishes before its waiter registers is not lost", async () => {
  // runWorkflowAsync cannot call waitForPrompt until /prompt has returned an
  // id, and a fully cached prompt can execute inside that window. The result
  // used to be dropped, leaving a job "working" forever - waitForPrompt has no
  // timeout by design, so nothing ever freed it.
  const ws = socket();

  deliver(ws, executed("p1", "9", { images: [{ filename: "a.png" }] }));
  deliver(ws, finished("p1"));

  const result = await ws.waitForPrompt("p1");

  assert.equal(result.success, true);
  assert.equal(result.promptId, "p1");
  assert.deepEqual(result.outputs, { "9": { images: [{ filename: "a.png" }] } });
});

test("the normal ordering still resolves the waiter", async () => {
  const ws = socket();

  const pending = ws.waitForPrompt("p2");
  deliver(ws, executed("p2", "9", { images: [{ filename: "b.png" }] }));
  deliver(ws, finished("p2"));

  const result = await pending;
  assert.equal(result.success, true);
  assert.deepEqual(result.outputs, { "9": { images: [{ filename: "b.png" }] } });
});

test("an early execution_error also survives until claimed", async () => {
  const ws = socket();

  deliver(ws, {
    type: "execution_error",
    data: {
      prompt_id: "p3",
      node_id: "5",
      node_type: "KSampler",
      exception_message: "out of memory",
      exception_type: "RuntimeError",
      traceback: [],
    },
  });

  const result = await ws.waitForPrompt("p3");
  assert.equal(result.success, false);
  assert.equal(result.error, "out of memory");
});

test("a claimed result is not handed out twice", async () => {
  const ws = socket();

  deliver(ws, finished("p4"));
  await ws.waitForPrompt("p4");

  // The second wait must block rather than resolve from a stale entry: a
  // resubmitted prompt id has to wait for its own execution.
  let settled = false;
  void ws.waitForPrompt("p4").then(() => {
    settled = true;
  });
  await new Promise((r) => setImmediate(r));

  assert.equal(settled, false);
});

test("held results are bounded so another client cannot fill memory", async () => {
  const ws = socket();

  for (let i = 0; i < 50; i++) deliver(ws, finished(`other-${i}`));

  const held = (ws as unknown as { unclaimed: Map<string, unknown> }).unclaimed;
  assert.ok(held.size <= 32, `held ${held.size} results`);
  assert.equal(held.has("other-49"), true, "the newest is kept");
  assert.equal(held.has("other-0"), false, "the oldest is dropped");
});

test("disconnect fails in-flight prompts with the marker reconcile keys on", async () => {
  // refreshConnection tears the socket down while a generation is running -
  // get_status, reconnect and start_comfyui all reach it. ComfyUI carries on
  // rendering regardless, so the waiter has to fail with the one wording
  // jobs/reconcile.ts recognises. disconnect() used to say "WebSocket
  // disconnected" instead, and those runs were never reconciled: the images
  // landed in ComfyUI's output folder and the job stayed failed forever.
  const ws = socket();

  const pending = ws.waitForPrompt("p5");
  ws.disconnect();

  await assert.rejects(pending, (error: Error) => {
    assert.equal(error.message.includes(DISCONNECT_MARKER), true, error.message);
    return true;
  });
});

test("an interrupted prompt settles its waiter instead of hanging forever", async () => {
  // comfyui_interrupt makes ComfyUI emit execution_interrupted and nothing
  // else. The switch ignored it, so the waiter was never settled - and
  // waitForPrompt has no timeout by design - leaving a sync run blocked
  // forever and the job row stuck on "working".
  const ws = socket();

  const pending = ws.waitForPrompt("p6");
  deliver(ws, {
    type: "execution_interrupted",
    data: { prompt_id: "p6", node_id: "3", node_type: "KSampler" },
  });

  const result = await pending;

  assert.equal(result.success, false);
  assert.equal(result.promptId, "p6");
  assert.equal(result.error, INTERRUPTED_MARKER);
});

test("an interrupted prompt is not mistaken for a disconnect", async () => {
  // reconcile hunts ComfyUI's history for anything carrying the disconnect
  // marker. An interrupted run genuinely did not finish, so it must not
  // carry that wording or reconcile would keep trying to complete it.
  assert.notEqual(INTERRUPTED_MARKER, DISCONNECT_MARKER);
  assert.equal(INTERRUPTED_MARKER.includes(DISCONNECT_MARKER), false);
});

test("interrupting releases the prompt's partial outputs", async () => {
  // `outputs` has no cap, unlike `unclaimed`; settle() is the only thing
  // that deletes an entry, so an unhandled interrupt retained every
  // partial output until the socket dropped.
  const ws = socket();

  deliver(ws, executed("p7", "9", { images: [{ filename: "partial.png" }] }));
  deliver(ws, { type: "execution_interrupted", data: { prompt_id: "p7" } });

  const held = (ws as unknown as { outputs: Map<string, unknown> }).outputs;
  assert.equal(held.has("p7"), false);
});
