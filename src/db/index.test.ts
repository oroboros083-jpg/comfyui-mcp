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

test("notes page in SQL, so total is the real count past any cap", () => {
  // The handlers read a 1000-row cap and sliced that, which made `total` the
  // cap: with more notes than the cap the response said has_more false and
  // the rest were unreachable. 1200 rows is enough to cross it.
  for (let i = 0; i < 1200; i++) {
    db.saveNote("bulk", `note ${i}`, ["t"]);
  }

  const first = db.listNotesPage(25, 0);
  assert.equal(first.total, 1200, "the real count, not the old 1000 cap");
  assert.equal(first.notes.length, 25);

  // A page starting past the old cap must still return rows.
  const late = db.listNotesPage(25, 1100);
  assert.equal(late.total, 1200);
  assert.equal(late.notes.length, 25, "rows past the old cap are reachable");
});

test("paging by topic reports that topic's total, not the whole table's", () => {
  db.saveNote("narrow", "only one of these", []);

  const page = db.listNotesPage(10, 0, "narrow");

  assert.equal(page.total, 1);
  assert.equal(page.notes.length, 1);
  assert.equal(page.notes[0].topic, "narrow");
});

test("a page past the end is empty rather than an error", () => {
  const page = db.listNotesPage(10, 99999, "narrow");

  assert.equal(page.notes.length, 0);
  assert.equal(page.total, 1);
});

test("search pages in SQL too", () => {
  db.saveNote("searchable", "distinctiveword appears here", []);
  db.saveNote("searchable", "distinctiveword again", []);

  const page = db.searchNotesPage("distinctiveword", 1, 0);

  assert.equal(page.total, 2, "both matches counted");
  assert.equal(page.notes.length, 1, "but only one returned");

  const second = db.searchNotesPage("distinctiveword", 1, 1);
  assert.equal(second.notes.length, 1);
  assert.notEqual(second.notes[0].id, page.notes[0].id);
});
