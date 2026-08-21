import { test } from "node:test";
import assert from "node:assert/strict";

import { bindContext, nextStepWhenDown, unreachableError } from "./connection.js";
import { ServerContext } from "../context.js";

/**
 * The guidance an agent sees when ComfyUI is down.
 *
 * This text is the server's main disclosure point for comfyui_start_comfyui:
 * it is what every connection-gated tool returns, and usually the first thing
 * read when nothing is running. It used to say "Start ComfyUI and call
 * comfyui_reconnect", naming the two tools that cannot resolve the situation
 * while omitting the one that can - so these assertions are about
 * discoverability, not wording.
 */
function bind(url: string): void {
  bindContext({ config: { comfyui: { url } } } as unknown as ServerContext);
}

test("guidance for a local ComfyUI names the tool that starts it", () => {
  bind("http://127.0.0.1:8188");
  const guidance = nextStepWhenDown();

  assert.match(guidance, /comfyui_start_comfyui/);
});

test("guidance does not stop at reconnect, which cannot help while nothing listens", () => {
  bind("http://127.0.0.1:8188");
  const guidance = nextStepWhenDown();

  // reconnect may still be mentioned as the follow-up to starting it by hand,
  // but it must not be the only tool offered.
  const startsAt = guidance.indexOf("comfyui_start_comfyui");
  const reconnectAt = guidance.indexOf("comfyui_reconnect");
  assert.ok(startsAt >= 0, "the start tool is named");
  assert.ok(
    reconnectAt === -1 || startsAt < reconnectAt,
    "the tool that resolves the problem is offered before the one that does not"
  );
});

test("the unreachable error carries both where it looked and what to do", () => {
  bind("http://127.0.0.1:8188");
  const message = unreachableError();

  assert.match(message, /not reachable/i);
  assert.match(message, /127\.0\.0\.1/, "names the URLs that were tried");
  assert.match(message, /comfyui_start_comfyui/, "names the next step");
});

test("a remote ComfyUI is not told to launch one locally", () => {
  // Starting a process here cannot help a ComfyUI on another host, so
  // advertising the tool would send the agent down a dead end.
  bind("http://192.168.1.50:8188");
  const guidance = nextStepWhenDown();

  assert.doesNotMatch(guidance, /comfyui_start_comfyui/);
  assert.match(guidance, /not this machine/i);
});

test("guidance still points somewhere useful when it cannot offer a launch", () => {
  bind("http://192.168.1.50:8188");
  assert.match(nextStepWhenDown(), /comfyui_reconnect/);
});
