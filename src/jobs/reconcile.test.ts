import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import { completeJobFromHistory } from "./reconcile.js";
import type { Job, JobManager } from "./manager.js";
import type { RunWorkflowResult } from "../tools/outputs.js";
import type { ComfyUIClient } from "../client/comfyui.js";

let png: Buffer;
let outDir: string;

before(async () => {
  png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 90, b: 200 } },
  })
    .png()
    .toBuffer();
  outDir = mkdtempSync(join(tmpdir(), "comfyui-reconcile-test-"));
});

after(() => rmSync(outDir, { recursive: true, force: true }));

const OUTPUTS = {
  "9": { images: [{ filename: "ComfyUI_00001_.png", subfolder: "", type: "output" }] },
};

/** A ComfyUI whose history reports the prompt as finished, with outputs. */
function clientWithHistory(completed: boolean): ComfyUIClient {
  return {
    getHistory: async (promptId: string) => ({
      [promptId]: {
        status: { completed, status_str: completed ? "success" : "error", messages: [] },
        outputs: OUTPUTS,
      },
    }),
    getImage: async () =>
      png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
  } as unknown as ComfyUIClient;
}

/** Records what completeJob was handed, without touching SQLite. */
function recordingManager(): JobManager & { completed: RunWorkflowResult[] } {
  const completed: RunWorkflowResult[] = [];
  return {
    completed,
    completeJob: (_taskId: string, result: RunWorkflowResult) => {
      completed.push(result);
      return undefined;
    },
  } as unknown as JobManager & { completed: RunWorkflowResult[] };
}

function jobWith(outputMode: "base64" | "file" | "auto"): Job {
  return {
    taskId: "p1",
    promptId: "p1",
    status: "failed",
    createdAt: "",
    lastUpdatedAt: "",
    error: "ComfyUI disconnected before this execution finished",
    request: {
      type: "run_workflow",
      input: {
        workflow: { "1": { class_type: "CLIPTextEncode", inputs: { text: "a blue square" } } },
        outputMode,
        sync: false,
      },
    },
  } as unknown as Job;
}

test("a recovered job honours the outputMode it was run with", async () => {
  // The hand-rolled copy this replaced always inlined base64 and never wrote a
  // file, so a caller who asked for 'file' to keep images out of context got
  // every one of them back inline anyway.
  const dir = mkdtempSync(join(outDir, "file-"));
  const manager = recordingManager();

  const images = await completeJobFromHistory(
    clientWithHistory(true),
    manager,
    jobWith("file"),
    dir,
    1024 * 1024
  );

  assert.equal(images?.length, 1);
  assert.equal(images![0].data, undefined, "'file' does not inline");
  assert.ok(images![0].path, "and it does set a path");
  assert.ok(existsSync(images![0].path!), "the file it names really exists");
  assert.equal(manager.completed.length, 1, "the job was completed");
});

test("a recovered job can still inline when asked to", async () => {
  const dir = mkdtempSync(join(outDir, "b64-"));
  const images = await completeJobFromHistory(
    clientWithHistory(true),
    recordingManager(),
    jobWith("base64"),
    dir,
    1024 * 1024
  );

  assert.ok(images![0].data, "'base64' inlines");
  assert.ok(images![0].path, "alongside the path");
});

test("a prompt ComfyUI did not finish is reported as unrecovered", async () => {
  const dir = mkdtempSync(join(outDir, "none-"));
  const manager = recordingManager();

  const images = await completeJobFromHistory(
    clientWithHistory(false),
    manager,
    jobWith("auto"),
    dir,
    1024 * 1024
  );

  assert.equal(images, null, "null, so the caller keeps its own failure");
  assert.equal(manager.completed.length, 0, "and the job is not marked complete");
});
