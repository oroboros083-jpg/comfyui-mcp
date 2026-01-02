import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

/**
 * Get the database file path.
 * Uses ~/.comfyui-mcp/data.db by default, or COMFYUI_MCP_DB_PATH env var.
 */
function getDatabasePath(): string {
  if (process.env.COMFYUI_MCP_DB_PATH) {
    return process.env.COMFYUI_MCP_DB_PATH;
  }
  const dataDir = join(homedir(), ".comfyui-mcp");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  return join(dataDir, "data.db");
}

let db: Database.Database | null = null;

/**
 * Get the database instance, creating it if necessary.
 */
export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = getDatabasePath();
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    initializeSchema(db);
  }
  return db;
}

/**
 * Initialize the database schema.
 */
function initializeSchema(database: Database.Database): void {
  // Jobs table for async generation tracking
  database.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      task_id TEXT PRIMARY KEY,
      prompt_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'working',
      status_message TEXT,
      created_at TEXT NOT NULL,
      last_updated_at TEXT NOT NULL,
      result TEXT,
      error TEXT,
      request TEXT NOT NULL,
      name TEXT UNIQUE
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_name ON jobs(name) WHERE name IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_jobs_prompt_id ON jobs(prompt_id);
  `);

  // Notes table for agent learning/memory
  database.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notes_topic ON notes(topic);
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      topic, content, tags,
      content='notes',
      content_rowid='id'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(rowid, topic, content, tags)
      VALUES (NEW.id, NEW.topic, NEW.content, NEW.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, topic, content, tags)
      VALUES ('delete', OLD.id, OLD.topic, OLD.content, OLD.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, topic, content, tags)
      VALUES ('delete', OLD.id, OLD.topic, OLD.content, OLD.tags);
      INSERT INTO notes_fts(rowid, topic, content, tags)
      VALUES (NEW.id, NEW.topic, NEW.content, NEW.tags);
    END;
  `);
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ============================================================================
// Job Operations
// ============================================================================

export interface JobRow {
  task_id: string;
  prompt_id: string;
  status: string;
  status_message: string | null;
  created_at: string;
  last_updated_at: string;
  result: string | null;
  error: string | null;
  request: string;
  name: string | null;
}

export function insertJob(job: {
  taskId: string;
  promptId: string;
  status: string;
  statusMessage?: string;
  createdAt: string;
  lastUpdatedAt: string;
  result?: unknown;
  error?: string;
  request: unknown;
  name?: string;
}): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT INTO jobs (task_id, prompt_id, status, status_message, created_at, last_updated_at, result, error, request, name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    job.taskId,
    job.promptId,
    job.status,
    job.statusMessage ?? null,
    job.createdAt,
    job.lastUpdatedAt,
    job.result ? JSON.stringify(job.result) : null,
    job.error ?? null,
    JSON.stringify(job.request),
    job.name ?? null
  );
}

export function updateJob(
  taskId: string,
  updates: {
    status?: string;
    statusMessage?: string;
    result?: unknown;
    error?: string;
    name?: string | null;
  }
): JobRow | null {
  const database = getDatabase();
  const now = new Date().toISOString();

  const setClauses: string[] = ["last_updated_at = ?"];
  const values: (string | null)[] = [now];

  if (updates.status !== undefined) {
    setClauses.push("status = ?");
    values.push(updates.status);
  }
  if (updates.statusMessage !== undefined) {
    setClauses.push("status_message = ?");
    values.push(updates.statusMessage);
  }
  if (updates.result !== undefined) {
    setClauses.push("result = ?");
    values.push(JSON.stringify(updates.result));
  }
  if (updates.error !== undefined) {
    setClauses.push("error = ?");
    values.push(updates.error);
  }
  if (updates.name !== undefined) {
    setClauses.push("name = ?");
    values.push(updates.name);
  }

  values.push(taskId);

  const stmt = database.prepare(`
    UPDATE jobs SET ${setClauses.join(", ")} WHERE task_id = ?
  `);
  stmt.run(...values);

  return getJobById(taskId);
}

export function getJobById(taskId: string): JobRow | null {
  const database = getDatabase();
  const stmt = database.prepare("SELECT * FROM jobs WHERE task_id = ?");
  return (stmt.get(taskId) as JobRow) ?? null;
}

export function getJobByPromptId(promptId: string): JobRow | null {
  const database = getDatabase();
  const stmt = database.prepare("SELECT * FROM jobs WHERE prompt_id = ?");
  return (stmt.get(promptId) as JobRow) ?? null;
}

export function getJobByName(name: string): JobRow | null {
  const database = getDatabase();
  const stmt = database.prepare("SELECT * FROM jobs WHERE name = ?");
  return (stmt.get(name) as JobRow) ?? null;
}

export function listJobs(status?: string): JobRow[] {
  const database = getDatabase();
  if (status) {
    const stmt = database.prepare("SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC");
    return stmt.all(status) as JobRow[];
  }
  const stmt = database.prepare("SELECT * FROM jobs ORDER BY created_at DESC");
  return stmt.all() as JobRow[];
}

export function deleteJob(taskId: string): boolean {
  const database = getDatabase();
  const stmt = database.prepare("DELETE FROM jobs WHERE task_id = ?");
  const result = stmt.run(taskId);
  return result.changes > 0;
}

export function getJobCounts(): Record<string, number> {
  const database = getDatabase();
  const stmt = database.prepare(`
    SELECT status, COUNT(*) as count FROM jobs GROUP BY status
  `);
  const rows = stmt.all() as Array<{ status: string; count: number }>;

  const counts: Record<string, number> = {
    working: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const row of rows) {
    counts[row.status] = row.count;
  }

  return counts;
}

export function setJobName(taskId: string, name: string): boolean {
  const database = getDatabase();

  // First, clear any existing job with this name
  const clearStmt = database.prepare("UPDATE jobs SET name = NULL WHERE name = ? AND task_id != ?");
  clearStmt.run(name, taskId);

  // Then set the name on the target job
  const stmt = database.prepare("UPDATE jobs SET name = ?, last_updated_at = ? WHERE task_id = ?");
  const result = stmt.run(name, new Date().toISOString(), taskId);
  return result.changes > 0;
}

export function clearJobName(taskId: string): boolean {
  const database = getDatabase();
  const stmt = database.prepare("UPDATE jobs SET name = NULL, last_updated_at = ? WHERE task_id = ?");
  const result = stmt.run(new Date().toISOString(), taskId);
  return result.changes > 0;
}

export function listNamedJobs(): Array<{ name: string; taskId: string }> {
  const database = getDatabase();
  const stmt = database.prepare("SELECT name, task_id FROM jobs WHERE name IS NOT NULL");
  const rows = stmt.all() as Array<{ name: string; task_id: string }>;
  return rows.map(r => ({ name: r.name, taskId: r.task_id }));
}

// ============================================================================
// Notes Operations
// ============================================================================

export interface NoteRow {
  id: number;
  topic: string;
  content: string;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: number;
  topic: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    topic: row.topic,
    content: row.content,
    tags: row.tags ? JSON.parse(row.tags) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function saveNote(topic: string, content: string, tags: string[] = []): Note {
  const database = getDatabase();
  const now = new Date().toISOString();
  const tagsJson = tags.length > 0 ? JSON.stringify(tags) : null;

  const stmt = database.prepare(`
    INSERT INTO notes (topic, content, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(topic, content, tagsJson, now, now);

  return {
    id: result.lastInsertRowid as number,
    topic,
    content,
    tags,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateNote(id: number, updates: { topic?: string; content?: string; tags?: string[] }): Note | null {
  const database = getDatabase();
  const now = new Date().toISOString();

  const setClauses: string[] = ["updated_at = ?"];
  const values: (string | number | null)[] = [now];

  if (updates.topic !== undefined) {
    setClauses.push("topic = ?");
    values.push(updates.topic);
  }
  if (updates.content !== undefined) {
    setClauses.push("content = ?");
    values.push(updates.content);
  }
  if (updates.tags !== undefined) {
    setClauses.push("tags = ?");
    values.push(updates.tags.length > 0 ? JSON.stringify(updates.tags) : null);
  }

  values.push(id);

  const stmt = database.prepare(`UPDATE notes SET ${setClauses.join(", ")} WHERE id = ?`);
  const result = stmt.run(...values);

  if (result.changes === 0) return null;
  return getNoteById(id);
}

export function getNoteById(id: number): Note | null {
  const database = getDatabase();
  const stmt = database.prepare("SELECT * FROM notes WHERE id = ?");
  const row = stmt.get(id) as NoteRow | undefined;
  return row ? rowToNote(row) : null;
}

export function getNotesByTopic(topic: string): Note[] {
  const database = getDatabase();
  const stmt = database.prepare("SELECT * FROM notes WHERE topic = ? ORDER BY updated_at DESC");
  const rows = stmt.all(topic) as NoteRow[];
  return rows.map(rowToNote);
}

export function getAllNotes(limit = 100): Note[] {
  const database = getDatabase();
  const stmt = database.prepare("SELECT * FROM notes ORDER BY updated_at DESC LIMIT ?");
  const rows = stmt.all(limit) as NoteRow[];
  return rows.map(rowToNote);
}

export function searchNotes(query: string, limit = 50): Note[] {
  const database = getDatabase();
  // Use FTS5 for full-text search
  const stmt = database.prepare(`
    SELECT notes.* FROM notes
    JOIN notes_fts ON notes.id = notes_fts.rowid
    WHERE notes_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `);
  const rows = stmt.all(query, limit) as NoteRow[];
  return rows.map(rowToNote);
}

export function deleteNote(id: number): boolean {
  const database = getDatabase();
  const stmt = database.prepare("DELETE FROM notes WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

export function getTopics(): string[] {
  const database = getDatabase();
  const stmt = database.prepare("SELECT DISTINCT topic FROM notes ORDER BY topic");
  const rows = stmt.all() as Array<{ topic: string }>;
  return rows.map(r => r.topic);
}

export function getNotesByTag(tag: string): Note[] {
  const database = getDatabase();
  // Search for tag in JSON array
  const stmt = database.prepare(`
    SELECT * FROM notes
    WHERE tags LIKE ?
    ORDER BY updated_at DESC
  `);
  const rows = stmt.all(`%"${tag}"%`) as NoteRow[];
  return rows.map(rowToNote);
}
