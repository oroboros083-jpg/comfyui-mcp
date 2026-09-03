import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse, basename } from "node:path";

import {
  resolveGrantedPath,
  WriteNotPermittedError,
  WorkflowUnreadableError,
  diffWorkflows,
  readWorkflowFile,
} from "./workflow-files.js";

/** The filesystem root on this platform: "C:\\" on Windows, "/" elsewhere. */
const ROOT = parse(process.cwd()).root;

test("a target directly on the filesystem root keeps its own name", async () => {
  // dirname() returns a root WITH its trailing separator, so the old
  // `realParent + sep + abs.slice(parent.length + 1)` rebuild ate the first
  // character: "C:\pipeline.json" resolved to "C:\\ipeline.json". That still
  // passed the containment check, so the write went to a file the caller never
  // named and the mangled path was reported back as if it were correct.
  const target = join(ROOT, "pipeline.json");

  const resolved = await resolveGrantedPath(target, [ROOT]);

  assert.equal(basename(resolved), "pipeline.json");
  assert.equal(resolved, join(realpathSync(ROOT), "pipeline.json"));
});

test("an ordinary nested target still resolves", async () => {
  const dir = mkdtempSync(join(tmpdir(), "comfyui-paths-test-"));
  try {
    const target = join(dir, "pipeline.json");
    const resolved = await resolveGrantedPath(target, [dir]);

    assert.equal(basename(resolved), "pipeline.json");
    assert.equal(resolved, join(realpathSync(dir), "pipeline.json"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a sibling directory sharing a name prefix is not authorised", async () => {
  const parent = mkdtempSync(join(tmpdir(), "comfyui-paths-test-"));
  try {
    const granted = join(parent, "Shared");
    const sneaky = join(parent, "SharedSecrets", "pipeline.json");

    await assert.rejects(
      () => resolveGrantedPath(sneaky, [granted]),
      (err: unknown) => err instanceof WriteNotPermittedError
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("only .json is written, whatever the grant says", async () => {
  await assert.rejects(
    () => resolveGrantedPath(join(ROOT, "notes.txt"), [ROOT]),
    (err: unknown) =>
      err instanceof WriteNotPermittedError && /only write \.json/.test(err.message)
  );
});

// ---------------------------------------------------------------------------
// Diffing across subgraphs
//
// An official gallery template is typically ONE subgraph instance at the top
// level with the whole pipeline inside it, so a diff that reads `nodes` alone
// sees three decorative nodes and reports "no changes" however much of the
// graph was rewritten.
// ---------------------------------------------------------------------------

/** A workflow shaped like a modern template: everything inside a subgraph. */
function subgraphWorkflow(prompt: string, steps: number) {
  return {
    nodes: [
      { id: 9, type: "SaveImage", widgets_values: ["out"] },
      { id: 57, type: "8f0e-uuid", widgets_values: [] },
    ],
    definitions: {
      subgraphs: [
        {
          id: "8f0e-uuid",
          name: "Text to Image",
          nodes: [
            { id: 27, type: "CLIPTextEncode", widgets_values: [prompt] },
            { id: 3, type: "KSampler", widgets_values: [0, "randomize", steps] },
          ],
        },
      ],
    },
  };
}

test("a widget edit inside a subgraph is seen", () => {
  const diff = diffWorkflows(
    subgraphWorkflow("theirs prompt", 12),
    subgraphWorkflow("yours prompt", 8)
  );

  assert.equal(diff.any, true, "the change is detected at all");
  assert.equal(diff.widgetChanges.length, 2);
  assert.deepEqual(
    diff.widgetChanges.map((w) => [w.type, w.index, w.yours, w.theirs]),
    [
      ["CLIPTextEncode", 0, "yours prompt", "theirs prompt"],
      ["KSampler", 2, 8, 12],
    ]
  );
});

test("a subgraph node's summary line names the subgraph a human sees", () => {
  const diff = diffWorkflows(
    subgraphWorkflow("theirs prompt", 8),
    subgraphWorkflow("yours prompt", 8)
  );

  // The definition uuid appears nowhere in the UI, so the name is what makes
  // the line findable on the canvas.
  assert.match(diff.summary, /\[Text to Image\] CLIPTextEncode \(id 27\)/);
  assert.equal(diff.widgetChanges[0]?.subgraph, "Text to Image");
});

test("a top-level node is not labelled with a subgraph", () => {
  const theirs = subgraphWorkflow("p", 8);
  const yours = subgraphWorkflow("p", 8);
  yours.nodes[0].widgets_values = ["different"];

  const diff = diffWorkflows(theirs, yours);
  assert.equal(diff.widgetChanges.length, 1);
  assert.equal(diff.widgetChanges[0]?.subgraph, undefined);
  assert.match(diff.summary, /WIDGET {7}SaveImage \(id 9\)/);
});

test("an interior node id cannot collide with a top-level one", () => {
  // Both graphs have a node 9: SaveImage at the top and, here, a Note inside
  // the subgraph. Keyed by bare id, one would shadow the other and the diff
  // would compare unrelated nodes.
  const withInner = (text: string) => {
    const w = subgraphWorkflow("p", 8) as ReturnType<typeof subgraphWorkflow> & {
      definitions: { subgraphs: Array<{ nodes: unknown[] }> };
    };
    w.definitions.subgraphs[0].nodes.push({ id: 9, type: "Note", widgets_values: [text] });
    return w;
  };

  const diff = diffWorkflows(withInner("theirs note"), withInner("yours note"));
  assert.equal(diff.widgetChanges.length, 1, "only the Note differs");
  assert.equal(diff.widgetChanges[0]?.type, "Note");
  assert.equal(diff.onlyInTheirs.length, 0, "and nothing looks missing");
  assert.equal(diff.onlyInYours.length, 0);
});

test("a node added inside a subgraph is reported", () => {
  const theirs = subgraphWorkflow("p", 8) as ReturnType<typeof subgraphWorkflow> & {
    definitions: { subgraphs: Array<{ nodes: unknown[] }> };
  };
  theirs.definitions.subgraphs[0].nodes.push({ id: 41, type: "LoraLoader", widgets_values: [] });

  const diff = diffWorkflows(theirs, subgraphWorkflow("p", 8));
  assert.equal(diff.onlyInTheirs.length, 1);
  assert.equal(diff.onlyInTheirs[0]?.type, "LoraLoader");
  assert.match(diff.summary, /THEIRS ONLY {2}\[Text to Image\] LoraLoader/);
});

test("a workflow with no subgraphs still diffs as before", () => {
  const plain = (text: string) => ({ nodes: [{ id: 1, type: "Note", widgets_values: [text] }] });
  const diff = diffWorkflows(plain("theirs"), plain("yours"));
  assert.equal(diff.widgetChanges.length, 1);
  assert.equal(diff.widgetChanges[0]?.subgraph, undefined);
  assert.equal(diffWorkflows(plain("same"), plain("same")).any, false);
});

test("a node whose type changed is reported, not silently skipped", () => {
  // The comparison used to `continue` on a type mismatch. The id is in both
  // maps, so neither "only in" list caught it either, and a graph where a
  // sampler had been swapped and every widget value rewritten diffed as
  // "no changes" - to the reader deciding whether to force past a refusal.
  const diff = diffWorkflows(
    { nodes: [{ id: 1, type: "KSampler", widgets_values: [42, "x"] }] },
    { nodes: [{ id: 1, type: "KSamplerAdvanced", widgets_values: [999, "y"] }] }
  );

  assert.equal(diff.any, true);
  assert.equal(diff.typeChanges.length, 1);
  assert.equal(diff.typeChanges[0]?.theirs, "KSampler");
  assert.equal(diff.typeChanges[0]?.yours, "KSamplerAdvanced");
  assert.match(diff.summary, /RETYPED/);
  // Widget slots are not comparable across two node types, so they stay out.
  assert.equal(diff.widgetChanges.length, 0);
});

test("a retyped node inside a subgraph names the subgraph", () => {
  const at = (type: string) => ({
    nodes: [],
    definitions: {
      subgraphs: [{ id: "sg-1", name: "Sampling", nodes: [{ id: 7, type }] }],
    },
  });
  const diff = diffWorkflows(at("KSampler"), at("KSamplerAdvanced"));

  assert.equal(diff.typeChanges[0]?.subgraph, "Sampling");
  assert.match(diff.summary, /\[Sampling\]/);
});

test("an unchanged graph reports no type changes", () => {
  const same = { nodes: [{ id: 1, type: "KSampler", widgets_values: [42] }] };
  assert.deepEqual(diffWorkflows(same, same).typeChanges, []);
});

test("a non-404 failure is unreadable, not absent", async () => {
  // `null` means "not there", and "not there" is the one answer that lets a
  // write through with no base. A 500 or a 503 says nothing about whether the
  // file exists, so answering null to those turned the lost-update check off
  // exactly when ComfyUI was too unhealthy to answer.
  const original = globalThis.fetch;
  try {
    for (const status of [500, 503, 401]) {
      globalThis.fetch = (async () =>
        new Response("upstream is unwell", { status })) as typeof fetch;

      await assert.rejects(
        () => readWorkflowFile({ baseUrl: "http://x" }, "flow.json", []),
        WorkflowUnreadableError,
        `HTTP ${status} must refuse rather than read as absent`
      );
    }

    // A genuine 404 still means absent, so creating a new file keeps working.
    globalThis.fetch = (async () => new Response("", { status: 404 })) as typeof fetch;
    assert.equal(await readWorkflowFile({ baseUrl: "http://x" }, "flow.json", []), null);
  } finally {
    globalThis.fetch = original;
  }
});

test("a 200 carrying something that is not JSON is unreadable", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response("<html>login</html>", { status: 200 })) as typeof fetch;

    await assert.rejects(
      () => readWorkflowFile({ baseUrl: "http://x" }, "flow.json", []),
      WorkflowUnreadableError
    );
  } finally {
    globalThis.fetch = original;
  }
});
