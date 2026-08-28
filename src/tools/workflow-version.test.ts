import test from "node:test";
import assert from "node:assert/strict";

import { workflowVersion, decideWrite } from "./workflow-version.js";
import { hashWorkflowStructure } from "../analysis/hash.js";

// ---------------------------------------------------------------------------
// The hash
// ---------------------------------------------------------------------------

test("key order does not change the version", () => {
  const a = { nodes: [{ id: 1, type: "KSampler", widgets_values: [42] }], links: [] };
  const b = { links: [], nodes: [{ widgets_values: [42], type: "KSampler", id: 1 }] };
  assert.equal(workflowVersion(a), workflowVersion(b));
});

test("whitespace does not change the version", () => {
  const wf = { nodes: [{ id: 1, type: "KSampler" }] };
  // What writeWorkflowFile does, then what readWorkflowFile does.
  const roundTripped = JSON.parse(JSON.stringify(wf, null, 2));
  assert.equal(workflowVersion(wf), workflowVersion(roundTripped));
});

test("a prompt edit changes the version - the case structural hashing misses", () => {
  const before = {
    "1": { class_type: "CLIPTextEncode", inputs: { text: "a cat" } },
  };
  const after = {
    "1": { class_type: "CLIPTextEncode", inputs: { text: "a dog" } },
  };

  assert.notEqual(
    workflowVersion(before),
    workflowVersion(after),
    "a retyped prompt must register as a change"
  );

  // The reason this module exists rather than reusing hashWorkflowStructure:
  // that one normalizes the prompt away and calls these two identical.
  assert.equal(
    hashWorkflowStructure(before as never),
    hashWorkflowStructure(after as never),
    "guard: structural hashing is still prompt-blind, so it cannot gate a write"
  );
});

test("a seed edit changes the version", () => {
  const before = { "1": { class_type: "KSampler", inputs: { seed: 1 } } };
  const after = { "1": { class_type: "KSampler", inputs: { seed: 2 } } };
  assert.notEqual(workflowVersion(before), workflowVersion(after));
});

test("adding a node changes the version", () => {
  const before = { nodes: [{ id: 1, type: "KSampler" }] };
  const after = { nodes: [{ id: 1, type: "KSampler" }, { id: 2, type: "VAEDecode" }] };
  assert.notEqual(workflowVersion(before), workflowVersion(after));
});

test("the version is stable across calls", () => {
  const wf = { nodes: [{ id: 1, type: "KSampler", widgets_values: [1, "x", null] }] };
  assert.equal(workflowVersion(wf), workflowVersion(wf));
});

// ---------------------------------------------------------------------------
// The write policy
// ---------------------------------------------------------------------------

test("a new file needs no base", () => {
  const v = decideWrite({ exists: false, base: null, theirs: null });
  assert.deepEqual(v, { allowed: true, reason: "new_file" });
});

test("an unchanged file with a matching base is written", () => {
  const v = decideWrite({ exists: true, base: "abc", theirs: "abc" });
  assert.deepEqual(v, { allowed: true, reason: "unchanged" });
});

test("a file changed under us is refused", () => {
  const v = decideWrite({ exists: true, base: "abc", theirs: "def" });
  assert.deepEqual(v, { allowed: false, reason: "changed" });
});

test("an existing file with no base is refused - the always-check rule", () => {
  const v = decideWrite({ exists: true, base: null, theirs: "abc" });
  assert.deepEqual(v, { allowed: false, reason: "no_base" });
});

test("force overrides a foreign change", () => {
  const v = decideWrite({ exists: true, base: "abc", theirs: "def", force: true });
  assert.deepEqual(v, { allowed: true, reason: "forced" });
});

test("force overrides a missing base", () => {
  const v = decideWrite({ exists: true, base: null, theirs: "abc", force: true });
  assert.deepEqual(v, { allowed: true, reason: "forced" });
});

test("force on a new file still reports new_file semantics as forced", () => {
  // Not a behaviour anyone should rely on, but the reason must stay truthful:
  // the write happened because force was set, and that is what is reported.
  const v = decideWrite({ exists: false, base: null, theirs: null, force: true });
  assert.deepEqual(v, { allowed: true, reason: "forced" });
});
