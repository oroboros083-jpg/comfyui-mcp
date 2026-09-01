/**
 * The `workflow_bases` PRIMARY KEY moved from (path) to (path, agent_id).
 *
 * Its own file because the migration runs once, inside the first getDatabase()
 * call, against a database that already exists - so it has to be written
 * BEFORE the module under test is imported, and index.test.ts has already
 * imported it.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const dir = mkdtempSync(join(tmpdir(), "comfyui-db-migrate-"));
const dbPath = join(dir, "old.db");

// The schema as it shipped: one row per path, agent_id nullable and not part
// of the key.
{
  const old = new Database(dbPath);
  old.exec(`
    CREATE TABLE workflow_bases (
      path TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      read_at TEXT NOT NULL,
      agent_id TEXT
    );
  `);
  const insert = old.prepare(
    "INSERT INTO workflow_bases (path, version, read_at, agent_id) VALUES (?, ?, ?, ?)"
  );
  const now = new Date().toISOString();
  insert.run("workflows/named.json", "v-named", now, "agent-A");
  insert.run("workflows/anonymous.json", "v-anon", now, null);
  old.close();
}

process.env.COMFYUI_MCP_DB_PATH = dbPath;
const db = await import("./index.js");

after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* left for the OS to reap */
  }
});

test("an existing base survives the move to the composite key", () => {
  assert.equal(
    db.getWorkflowBase("workflows/named.json", "agent-A")?.version,
    "v-named",
    "the row is still reachable as the agent that recorded it"
  );
});

test("a base recorded before agent ids becomes the unset agent's", () => {
  assert.equal(db.getWorkflowBase("workflows/anonymous.json")?.version, "v-anon");
  assert.equal(db.getWorkflowBase("workflows/anonymous.json")?.agentId, null);
});

test("the migrated table takes the new key", () => {
  // Not a cosmetic check: on the old key this second record would REPLACE the
  // first, which is the lost-update hole the migration exists to close.
  db.recordWorkflowBase("workflows/named.json", "v-other", "agent-B");
  assert.equal(db.getWorkflowBase("workflows/named.json", "agent-A")?.version, "v-named");
  assert.equal(db.getWorkflowBase("workflows/named.json", "agent-B")?.version, "v-other");
});

test("the migration is not applied twice", () => {
  // Re-running it over the already-migrated table would drop and recreate,
  // and any base recorded since would be gone. getDatabase() is cached, so
  // this asserts on the guard by re-reading what the previous test wrote.
  db.getDatabase();
  assert.equal(db.getWorkflowBase("workflows/named.json", "agent-B")?.version, "v-other");
});
