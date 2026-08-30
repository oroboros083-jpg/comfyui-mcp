import { test } from "node:test";
import assert from "node:assert/strict";

import { ToolError, hintFor, describeError } from "./errors.js";
import { requestFailureHint } from "../client/comfyui.js";
import { PromptNotFoundError } from "../tools/queue.js";
import { NoTypeFilterError } from "../tools/models.js";

test("a ToolError carries its remedy alongside its message", () => {
  const err = new ToolError("it broke", "call comfyui_reconnect");
  assert.equal(err.message, "it broke");
  assert.equal(err.hint, "call comfyui_reconnect");
  assert.ok(err instanceof Error, "still an Error, so existing catches work");
});

test("a subclass reports its own name", () => {
  // The name is used in logs; `new.target` keeps it correct without every
  // subclass having to set it by hand.
  assert.equal(new PromptNotFoundError("abc").name, "PromptNotFoundError");
  assert.equal(new NoTypeFilterError().name, "NoTypeFilterError");
});

test("the existing error classes now carry hints themselves", () => {
  // These used to be mapped to a hint by a try/catch in the registration
  // layer, one per class. Carrying it here is what let those go.
  assert.match(hintFor(new PromptNotFoundError("abc")) ?? "", /comfyui_get_history/);
  assert.match(hintFor(new NoTypeFilterError()) ?? "", /outputType/);
});

test("hintFor tolerates anything that is not a ToolError", () => {
  assert.equal(hintFor(new Error("plain")), undefined);
  assert.equal(hintFor("a string"), undefined);
  assert.equal(hintFor(null), undefined);
  assert.equal(hintFor(undefined), undefined);
});

test("describeError folds the hint in for paths with only a message", () => {
  const described = describeError(new ToolError("it broke", "do the thing"));
  assert.match(described, /it broke/);
  assert.match(described, /Hint: do the thing/);
});

test("describeError leaves a plain error alone", () => {
  assert.equal(describeError(new Error("plain")), "plain");
  assert.equal(describeError("just a string"), "just a string");
});

test("HTTP failures get advice specific to the status", () => {
  // "Failed to get queue: 404" told the agent nothing, and a 401 needs a
  // different response from a 500.
  assert.match(requestFailureHint(401), /COMFYUI_API_KEY/);
  assert.match(requestFailureHint(403), /COMFYUI_API_KEY/);
  assert.match(requestFailureHint(404), /older than this server expects|custom node/);
  assert.match(requestFailureHint(413), /smaller/);
  assert.match(requestFailureHint(500), /console log/);
  assert.match(requestFailureHint(503), /console log/);
  assert.match(requestFailureHint(400), /nodes|comfyui_get_status/);
});

test("every status maps to a non-empty next step", () => {
  for (const status of [400, 401, 403, 404, 409, 413, 429, 500, 502, 503]) {
    assert.ok(requestFailureHint(status).length > 20, `status ${status}`);
  }
});
