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
      name TEXT UNIQUE,
      progress_stats TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_name ON jobs(name) WHERE name IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_jobs_prompt_id ON jobs(prompt_id);
  `);

  // Migration: Add progress_stats column if it doesn't exist
  try {
    database.exec(`ALTER TABLE jobs ADD COLUMN progress_stats TEXT`);
  } catch {
    // Column already exists, ignore
  }

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

  // What each workflow file looked like the last time this agent read it.
  //
  // This is the `base` of write_workflow's three-way check, and it lives in
  // SQLite rather than in a process-local Map so it survives a restart: an
  // agent that read a workflow, restarted, and wrote would otherwise have no
  // base and be refused for no reason. It is deliberately NOT a sidecar file
  // next to the workflow - these directories are the human's, and we add
  // nothing to them.
  //
  // Keyed by (path, agent_id), because the db is NOT per-instance: it defaults
  // to ~/.comfyui-mcp/data.db, which every server on the machine opens unless
  // the operator sets COMFYUI_MCP_DB_PATH. Keyed by path alone, two agents
  // shared one row - so agent B's write silently re-based agent A, and A's
  // next write sailed through comparing against B's version. That is the exact
  // lost update the three-way check exists to catch, and it went undetected in
  // the default configuration. Each agent must ask only "did it change since
  // *I* read it", which needs its own row whatever db it is in.
  //
  // agent_id is NOT NULL with '' standing in for "unset", because NULL is not
  // a key in SQLite: two NULL agent rows for one path both satisfy a composite
  // PRIMARY KEY and the upsert would duplicate instead of replacing.
  database.exec(`
    CREATE TABLE IF NOT EXISTS workflow_bases (
      path TEXT NOT NULL,
      agent_id TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY (path, agent_id)
    );
  `);
  migrateWorkflowBasesToPerAgentKey(database);

  // Who last wrote each workflow file THROUGH this server.
  //
  // Distinct from workflow_bases, which is per agent and says what an agent
  // last read. This is one global row per path, so a refused write can name
  // the agent whose change it would have destroyed - the question a conflict
  // actually raises is "who else is editing this", and only a shared row can
  // answer it. It covers agents on this machine only: a human in a browser
  // tab or the official Comfy MCP writes without passing through here, and a
  // conflict with no row is reported without naming anyone rather than
  // guessing.
  database.exec(`
    CREATE TABLE IF NOT EXISTS workflow_writers (
      path TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      written_at TEXT NOT NULL
    );
  `);
}

/**
 * Move a pre-existing `workflow_bases` off its path-only PRIMARY KEY.
 *
 * Rows are preserved: path was unique before, so (path, agent_id) cannot
 * collide. A row that predates agent ids gets '' and behaves as the base of
 * whichever agent has no id configured - the same agent that wrote it.
 */
function migrateWorkflowBasesToPerAgentKey(database: Database.Database): void {
  const sql = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'workflow_bases'")
    .get() as { sql: string } | undefined;
  if (!sql || sql.sql.includes("PRIMARY KEY (path, agent_id)")) return;

  database.exec(`
    BEGIN;
    CREATE TABLE workflow_bases_new (
      path TEXT NOT NULL,
      agent_id TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY (path, agent_id)
    );
    INSERT INTO workflow_bases_new (path, agent_id, version, read_at)
      SELECT path, COALESCE(agent_id, ''), version, read_at FROM workflow_bases;
    DROP TABLE workflow_bases;
    ALTER TABLE workflow_bases_new RENAME TO workflow_bases;
    COMMIT;
  `);
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
  progress_stats: string | null;
}

export interface ProgressStats {
  currentStep: number;
  totalSteps: number;
  currentNode: string | null;
  stepTimestamps: number[]; // Unix timestamps when each step completed
  avgStepTimeMs: number | null;
  estimatedRemainingMs: number | null;
  startedAt: number | null; // Unix timestamp when generation started
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
  // `name` is UNIQUE, and a reused one used to raise SQLITE_CONSTRAINT here -
  // which is *after* the prompt was queued in ComfyUI. The caller saw a tool
  // error and believed the run had failed, while ComfyUI generated it with no
  // job row and no task id to reach it by. setJobName already resolves a
  // collision by moving the name to the newer job; this does the same, so the
  // two agree on what naming means.
  const clearName = database.prepare("UPDATE jobs SET name = NULL WHERE name = ?");

  database.transaction(() => {
    if (job.name) clearName.run(job.name);
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
  })();
}

export function updateJob(
  taskId: string,
  updates: {
    status?: string;
    statusMessage?: string;
    result?: unknown;
    error?: string;
    name?: string | null;
    progressStats?: ProgressStats;
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
  if (updates.progressStats !== undefined) {
    setClauses.push("progress_stats = ?");
    values.push(JSON.stringify(updates.progressStats));
  }

  values.push(taskId);

  const stmt = database.prepare(`
    UPDATE jobs SET ${setClauses.join(", ")} WHERE task_id = ?
  `);
  stmt.run(...values);

  return getJobById(taskId);
}

/**
 * Update progress stats for a job with timing information.
 * Calculates average step time and estimated remaining time.
 */
export function updateJobProgress(
  taskId: string,
  currentStep: number,
  totalSteps: number,
  nodeName?: string
): JobRow | null {
  const now = Date.now();

  // Get existing progress stats
  const job = getJobById(taskId);
  if (!job) return null;

  let stats: ProgressStats;
  if (job.progress_stats) {
    stats = JSON.parse(job.progress_stats);
  } else {
    stats = {
      currentStep: 0,
      totalSteps,
      currentNode: null,
      stepTimestamps: [],
      avgStepTimeMs: null,
      estimatedRemainingMs: null,
      startedAt: now,
    };
  }

  // Update stats
  stats.currentStep = currentStep;
  stats.totalSteps = totalSteps;
  stats.currentNode = nodeName ?? null;

  // Record this step's timestamp (only if we advanced)
  if (currentStep > stats.stepTimestamps.length) {
    stats.stepTimestamps.push(now);
  }

  // Calculate average step time if we have at least 2 timestamps
  if (stats.stepTimestamps.length >= 2) {
    const firstTime = stats.startedAt ?? stats.stepTimestamps[0];
    const lastTime = stats.stepTimestamps[stats.stepTimestamps.length - 1];
    const elapsedMs = lastTime - firstTime;
    const completedSteps = stats.stepTimestamps.length;
    stats.avgStepTimeMs = Math.round(elapsedMs / completedSteps);

    // Estimate remaining time
    const remainingSteps = totalSteps - currentStep;
    stats.estimatedRemainingMs = Math.round(stats.avgStepTimeMs * remainingSteps);
  }

  // Update the job
  const statusMessage = nodeName
    ? `Step ${currentStep}/${totalSteps} (${nodeName})`
    : `Step ${currentStep}/${totalSteps}`;

  return updateJob(taskId, {
    statusMessage,
    progressStats: stats,
  });
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

/** One page of notes, with the real total rather than a capped one. */
export interface NotePage {
  notes: Note[];
  total: number;
}

/**
 * Page notes in SQL, optionally filtered by topic.
 *
 * The handlers used to read a 1000-row cap and slice it, which made `total`
 * the cap: with 1500 notes the response said total 1000 and has_more false,
 * so the agent was told it had seen everything and 500 were unreachable.
 * The two branches also disagreed - getNotesByTopic had no cap - so `total`
 * meant different things depending on which was taken.
 */
export function listNotesPage(
  limit: number,
  offset: number,
  topic?: string
): NotePage {
  const database = getDatabase();
  const where = topic ? "WHERE topic = ?" : "";
  const args: unknown[] = topic ? [topic] : [];

  const total = (
    database.prepare(`SELECT COUNT(*) AS n FROM notes ${where}`).get(...args) as { n: number }
  ).n;

  const rows = database
    .prepare(`SELECT * FROM notes ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, offset) as NoteRow[];

  return { notes: rows.map(rowToNote), total };
}

/** Page full-text search results in SQL, for the same reason. */
export function searchNotesPage(query: string, limit: number, offset: number): NotePage {
  const database = getDatabase();

  const total = (
    database
      .prepare(
        "SELECT COUNT(*) AS n FROM notes JOIN notes_fts ON notes.id = notes_fts.rowid WHERE notes_fts MATCH ?"
      )
      .get(query) as { n: number }
  ).n;

  const rows = database
    .prepare(
      `SELECT notes.* FROM notes
       JOIN notes_fts ON notes.id = notes_fts.rowid
       WHERE notes_fts MATCH ?
       ORDER BY rank
       LIMIT ? OFFSET ?`
    )
    .all(query, limit, offset) as NoteRow[];

  return { notes: rows.map(rowToNote), total };
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

// ============================================================================
// Custom Templates Operations
// ============================================================================

export interface TemplateRow {
  id: string;
  name: string;
  description: string;
  model_type: string;
  task_type: string;
  category: string;
  workflow: string;
  parameters: string | null;
  default_settings: string | null;
  required_nodes: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
  use_count: number;
}

export interface CustomTemplate {
  id: string;
  name: string;
  description: string;
  modelType: string;
  taskType: string;
  category: string;
  workflow: Record<string, unknown>;
  parameters?: Array<{ name: string; type: string; required: boolean; default?: unknown; description: string }>;
  defaultSettings?: Record<string, unknown>;
  requiredNodes?: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  useCount: number;
}

function rowToTemplate(row: TemplateRow): CustomTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    modelType: row.model_type,
    taskType: row.task_type,
    category: row.category,
    workflow: JSON.parse(row.workflow),
    parameters: row.parameters ? JSON.parse(row.parameters) : undefined,
    defaultSettings: row.default_settings ? JSON.parse(row.default_settings) : undefined,
    requiredNodes: row.required_nodes ? JSON.parse(row.required_nodes) : undefined,
    tags: row.tags ? JSON.parse(row.tags) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    useCount: row.use_count,
  };
}

export function initializeTemplatesTable(): void {
  const database = getDatabase();
  database.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      model_type TEXT NOT NULL DEFAULT 'any',
      task_type TEXT NOT NULL DEFAULT 'txt2img',
      category TEXT NOT NULL DEFAULT 'custom',
      workflow TEXT NOT NULL,
      parameters TEXT,
      default_settings TEXT,
      required_nodes TEXT,
      tags TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      use_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
    CREATE INDEX IF NOT EXISTS idx_templates_model_type ON templates(model_type);
    CREATE INDEX IF NOT EXISTS idx_templates_task_type ON templates(task_type);
    CREATE INDEX IF NOT EXISTS idx_templates_use_count ON templates(use_count DESC);
  `);
}

// Initialize templates table when module loads
try {
  initializeTemplatesTable();
} catch {
  // Table will be created on first use
}

export function saveTemplate(template: {
  id: string;
  name: string;
  description: string;
  modelType?: string;
  taskType?: string;
  category?: string;
  workflow: Record<string, unknown>;
  parameters?: Array<{ name: string; type: string; required: boolean; default?: unknown; description: string }>;
  defaultSettings?: Record<string, unknown>;
  requiredNodes?: string[];
  tags?: string[];
}): CustomTemplate {
  const database = getDatabase();
  initializeTemplatesTable();

  const now = new Date().toISOString();

  // Check if template with this ID exists
  const existingStmt = database.prepare("SELECT id FROM templates WHERE id = ?");
  const existing = existingStmt.get(template.id);

  if (existing) {
    // Update existing template
    const stmt = database.prepare(`
      UPDATE templates SET
        name = ?, description = ?, model_type = ?, task_type = ?, category = ?,
        workflow = ?, parameters = ?, default_settings = ?, required_nodes = ?,
        tags = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      template.name,
      template.description,
      template.modelType ?? "any",
      template.taskType ?? "txt2img",
      template.category ?? "custom",
      JSON.stringify(template.workflow),
      template.parameters ? JSON.stringify(template.parameters) : null,
      template.defaultSettings ? JSON.stringify(template.defaultSettings) : null,
      template.requiredNodes ? JSON.stringify(template.requiredNodes) : null,
      template.tags ? JSON.stringify(template.tags) : null,
      now,
      template.id
    );
  } else {
    // Insert new template
    const stmt = database.prepare(`
      INSERT INTO templates (id, name, description, model_type, task_type, category, workflow, parameters, default_settings, required_nodes, tags, created_at, updated_at, use_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);
    stmt.run(
      template.id,
      template.name,
      template.description,
      template.modelType ?? "any",
      template.taskType ?? "txt2img",
      template.category ?? "custom",
      JSON.stringify(template.workflow),
      template.parameters ? JSON.stringify(template.parameters) : null,
      template.defaultSettings ? JSON.stringify(template.defaultSettings) : null,
      template.requiredNodes ? JSON.stringify(template.requiredNodes) : null,
      template.tags ? JSON.stringify(template.tags) : null,
      now,
      now
    );
  }

  return getTemplateById(template.id)!;
}

export function getTemplateById(id: string): CustomTemplate | null {
  const database = getDatabase();
  initializeTemplatesTable();
  const stmt = database.prepare("SELECT * FROM templates WHERE id = ?");
  const row = stmt.get(id) as TemplateRow | undefined;
  return row ? rowToTemplate(row) : null;
}

export function listTemplates(options?: {
  modelType?: string;
  taskType?: string;
  category?: string;
  limit?: number;
}): CustomTemplate[] {
  const database = getDatabase();
  initializeTemplatesTable();

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (options?.modelType && options.modelType !== "any") {
    conditions.push("(model_type = ? OR model_type = 'any')");
    values.push(options.modelType);
  }
  if (options?.taskType && options.taskType !== "any") {
    conditions.push("task_type = ?");
    values.push(options.taskType);
  }
  if (options?.category) {
    conditions.push("category LIKE ?");
    values.push(`%${options.category}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = options?.limit ?? 50;
  values.push(limit);

  const stmt = database.prepare(`
    SELECT * FROM templates ${whereClause}
    ORDER BY use_count DESC, updated_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(...values) as TemplateRow[];
  return rows.map(rowToTemplate);
}

export function searchTemplatesInDb(query: string, limit = 50): CustomTemplate[] {
  const database = getDatabase();
  initializeTemplatesTable();

  const searchPattern = `%${query}%`;
  const stmt = database.prepare(`
    SELECT * FROM templates
    WHERE name LIKE ? OR description LIKE ? OR category LIKE ? OR tags LIKE ?
    ORDER BY use_count DESC, updated_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(searchPattern, searchPattern, searchPattern, searchPattern, limit) as TemplateRow[];
  return rows.map(rowToTemplate);
}

export function incrementTemplateUseCount(id: string): void {
  const database = getDatabase();
  initializeTemplatesTable();
  const stmt = database.prepare("UPDATE templates SET use_count = use_count + 1, updated_at = ? WHERE id = ?");
  stmt.run(new Date().toISOString(), id);
}

export function deleteTemplate(id: string): boolean {
  const database = getDatabase();
  initializeTemplatesTable();
  const stmt = database.prepare("DELETE FROM templates WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}


// ============================================================================
// Workflow Base State
// ============================================================================

/** What a workflow file looked like when this agent last read it. */
export interface WorkflowBase {
  path: string;
  version: string;
  readAt: string;
  agentId: string | null;
}

/**
 * Record the version a read observed, as the base for a later write.
 *
 * Upserts: the newest read wins, because that is the state the agent is now
 * reasoning about. An older base would refuse a write the agent has every
 * right to make.
 */
export function recordWorkflowBase(
  path: string,
  version: string,
  agentId?: string
): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT INTO workflow_bases (path, agent_id, version, read_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(path, agent_id) DO UPDATE SET
      version = excluded.version,
      read_at = excluded.read_at
  `);
  stmt.run(path, agentId ?? "", version, new Date().toISOString());
}

export interface WorkflowWriter {
  agentId: string;
  writtenAt: string;
}

/** Record that this agent wrote `path`, for a later conflict to name. */
export function recordWorkflowWriter(path: string, agentId: string): void {
  const database = getDatabase();
  database
    .prepare(
      `INSERT INTO workflow_writers (path, agent_id, written_at)
       VALUES (?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         agent_id = excluded.agent_id,
         written_at = excluded.written_at`
    )
    .run(path, agentId, new Date().toISOString());
}

/** Who last wrote `path` through this server, or null if nobody has. */
export function getWorkflowWriter(path: string): WorkflowWriter | null {
  const database = getDatabase();
  const row = database
    .prepare("SELECT agent_id, written_at FROM workflow_writers WHERE path = ?")
    .get(path) as { agent_id: string; written_at: string } | undefined;
  return row ? { agentId: row.agent_id, writtenAt: row.written_at } : null;
}

/**
 * The base this agent recorded for a path, or null if THIS agent has never
 * read it. Another agent's base for the same path is not an answer here: it
 * says what they were looking at, which is no evidence about what has changed
 * under us.
 */
export function getWorkflowBase(
  path: string,
  agentId?: string
): WorkflowBase | null {
  const database = getDatabase();
  const row = database
    .prepare(
      "SELECT path, version, read_at, agent_id FROM workflow_bases WHERE path = ? AND agent_id = ?"
    )
    .get(path, agentId ?? "") as
    | { path: string; version: string; read_at: string; agent_id: string }
    | undefined;
  if (!row) return null;
  return {
    path: row.path,
    version: row.version,
    readAt: row.read_at,
    agentId: row.agent_id === "" ? null : row.agent_id,
  };
}
