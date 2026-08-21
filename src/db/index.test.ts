import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point the module at a scratch database before it is loaded: getDatabase()
// resolves the path once and caches the handle.
const dir = mkdtempSync(join(tmpdir(), "comfyui-db-test-"));
process.env.COMFYUI_MCP_DB_PATH = join(dir, "test.db");

const db = await import("./index.js");

after(() => {
  // Windows will not unlink the open SQLite handle; the temp dir is disposable
  // either way, so a failure here is not a test failure.
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* left for the OS to reap */
  }
});

function insert(taskId: string, name?: string): void {
  const now = new Date().toISOString();
  db.insertJob({
    taskId,
    promptId: taskId,
    status: "working",
    createdAt: now,
    lastUpdatedAt: now,
    request: { type: "run_workflow", input: { workflow: {} } },
    name,
  });
}

test("a reused job name moves to the newer job instead of throwing", () => {
  // `name` is UNIQUE, and the constraint used to fire here - after the prompt
  // had already been queued in ComfyUI. The caller got a tool error and
  // believed the run failed, while ComfyUI generated it with no job row and no
  // task id to reach it by.
  insert("first", "hero_banner");

  assert.doesNotThrow(() => insert("second", "hero_banner"));

  assert.equal(db.getJobByName("hero_banner")?.task_id, "second", "the newer job owns it");
  assert.equal(db.getJobById("first")?.name, null, "the older one gives it up");
  assert.equal(db.getJobById("first")?.status, "working", "but is otherwise untouched");
});

test("naming behaves the same whether it comes from insert or setJobName", () => {
  insert("third", "shared_name");
  insert("fourth");
  db.setJobName("fourth", "shared_name");

  assert.equal(db.getJobByName("shared_name")?.task_id, "fourth");
  assert.equal(db.getJobById("third")?.name, null);
});

test("unnamed jobs are unaffected by the collision handling", () => {
  insert("fifth");
  insert("sixth");

  assert.equal(db.getJobById("fifth")?.name, null);
  assert.equal(db.getJobById("sixth")?.name, null);
});
