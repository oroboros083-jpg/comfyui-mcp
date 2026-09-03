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

test("FTS syntax characters are searched for literally, not as operators", () => {
  // These used to reach MATCH raw, so SQLite raised `fts5: syntax error` and
  // the agent got an untranslated database message with no next step.
  db.saveNote("punctuation", "quoted and starred and hyphenated text", []);

  // Each of these carries at least one real word, so it is a search that must
  // simply run - the operators around it are searched for as text.
  for (const query of ['say "hello"', "a -b", "NEAR", "x AND", "foo*", "quoted*", "-hyphenated"]) {
    assert.doesNotThrow(
      () => db.searchNotesPage(query, 10, 0),
      `'${query}' must not raise a syntax error`
    );
  }

  // Punctuation alone is a different case: there is nothing to search for, and
  // that is reported as an actionable error rather than a database one.
  for (const query of ['"', "*", "-", "((" ]) {
    assert.throws(
      () => db.searchNotesPage(query, 10, 0),
      (err: unknown) => err instanceof db.EmptySearchQueryError,
      `'${query}' should be refused with guidance, not an FTS syntax error`
    );
  }
});

test("multi-word search stays an AND of terms, not a phrase", () => {
  // Quoting the whole query would make this an adjacency search, which would
  // silently narrow every existing multi-word search.
  db.saveNote("andsemantics", "alpha something in between omega", []);

  assert.equal(db.searchNotesPage("alpha omega", 10, 0).total, 1, "non-adjacent terms still match");
});

test("a search with no searchable word is refused with guidance", () => {
  assert.throws(
    () => db.searchNotesPage("!!! ???", 10, 0),
    (err: unknown) => err instanceof db.EmptySearchQueryError
  );
});

test("toFtsQuery escapes an embedded quote rather than closing the term", () => {
  assert.equal(db.toFtsQuery('say "hi" now'), '"say" "hi" "now"');
  assert.equal(db.toFtsQuery("plain"), '"plain"');
  assert.equal(db.toFtsQuery("---"), "");
});

test("topics carry their note counts", () => {
  // comfyui_list_topics is described as reporting a count per topic, and an
  // agent uses it to decide which topic is worth fetching.
  db.saveNote("counted", "one", []);
  db.saveNote("counted", "two", []);
  db.saveNote("counted-once", "only", []);

  const topics = db.getTopics();
  const counted = topics.find((t) => t.topic === "counted");
  const once = topics.find((t) => t.topic === "counted-once");

  assert.equal(counted?.count, 2);
  assert.equal(once?.count, 1);
  assert.deepEqual(
    [...topics].map((t) => t.topic).sort(),
    topics.map((t) => t.topic),
    "ordered by topic"
  );
});

// ---------------------------------------------------------------------------
// Workflow base state - the `base` of write_workflow's three-way check
// ---------------------------------------------------------------------------

test("a base round-trips", () => {
  db.recordWorkflowBase("workflows/a.json", "v1", "agent-1");
  const base = db.getWorkflowBase("workflows/a.json", "agent-1");
  assert.equal(base?.version, "v1");
  assert.equal(base?.agentId, "agent-1");
  assert.ok(base?.readAt, "readAt is stamped");
});

test("an unread path has no base", () => {
  assert.equal(db.getWorkflowBase("workflows/never-read.json", "agent-1"), null);
});

test("re-recording a path replaces that agent's base rather than duplicating it", () => {
  db.recordWorkflowBase("workflows/b.json", "v1", "agent-1");
  db.recordWorkflowBase("workflows/b.json", "v2", "agent-1");
  const base = db.getWorkflowBase("workflows/b.json", "agent-1");
  assert.equal(base?.version, "v2", "the newest read wins");
});

test("bases are per path, not global", () => {
  db.recordWorkflowBase("workflows/c.json", "vc");
  db.recordWorkflowBase("workflows/d.json", "vd");
  assert.equal(db.getWorkflowBase("workflows/c.json")?.version, "vc");
  assert.equal(db.getWorkflowBase("workflows/d.json")?.version, "vd");
});

test("agentId is optional", () => {
  db.recordWorkflowBase("workflows/e.json", "ve");
  assert.equal(db.getWorkflowBase("workflows/e.json")?.agentId, null);
});

// The default db is ~/.comfyui-mcp/data.db, which every server on the machine
// opens. Keyed by path alone, agent B's read re-based agent A, and A's next
// write then compared against B's version and sailed through - the exact lost
// update the three-way check exists to catch.
test("two agents keep separate bases for one path", () => {
  db.recordWorkflowBase("workflows/shared.json", "vA", "agent-A");
  db.recordWorkflowBase("workflows/shared.json", "vB", "agent-B");

  assert.equal(db.getWorkflowBase("workflows/shared.json", "agent-A")?.version, "vA");
  assert.equal(db.getWorkflowBase("workflows/shared.json", "agent-B")?.version, "vB");
});

test("an agent that never read a path has no base, whoever else has", () => {
  db.recordWorkflowBase("workflows/theirs.json", "vB", "agent-B");
  assert.equal(
    db.getWorkflowBase("workflows/theirs.json", "agent-A"),
    null,
    "another agent's base is not evidence about what changed under us"
  );
});

test("the unset agent id is its own key, not a wildcard", () => {
  db.recordWorkflowBase("workflows/unset.json", "vNamed", "agent-A");
  assert.equal(db.getWorkflowBase("workflows/unset.json"), null);

  db.recordWorkflowBase("workflows/unset.json", "vAnon");
  db.recordWorkflowBase("workflows/unset.json", "vAnon2");
  assert.equal(db.getWorkflowBase("workflows/unset.json")?.version, "vAnon2", "the anonymous row upserts rather than duplicating");
  assert.equal(db.getWorkflowBase("workflows/unset.json", "agent-A")?.version, "vNamed", "and does not disturb a named agent's row");
});

// ---------------------------------------------------------------------------
// Last writer - who a refused write lost to
// ---------------------------------------------------------------------------

test("a path with no writer names nobody", () => {
  assert.equal(db.getWorkflowWriter("workflows/untouched.json"), null);
});

test("the writer record is global, not per agent", () => {
  // The point of the table: workflow_bases is keyed by agent and so always
  // reports the caller back at itself. A conflict has to name someone ELSE.
  db.recordWorkflowWriter("workflows/contested.json", "agent-A");
  db.recordWorkflowWriter("workflows/contested.json", "agent-B");

  const writer = db.getWorkflowWriter("workflows/contested.json");
  assert.equal(writer?.agentId, "agent-B", "the newest writer wins");
  assert.ok(writer?.writtenAt, "writtenAt is stamped");
});

test("the writer and the base are independent records", () => {
  db.recordWorkflowBase("workflows/both.json", "v1", "agent-A");
  db.recordWorkflowWriter("workflows/both.json", "agent-B");

  assert.equal(db.getWorkflowBase("workflows/both.json", "agent-A")?.version, "v1");
  assert.equal(db.getWorkflowWriter("workflows/both.json")?.agentId, "agent-B");
});
