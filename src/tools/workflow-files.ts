import { z } from "zod";
import { realpath, readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "path";

/**
 * NOTE ON HTTP: these call ComfyUI directly with plain `fetch`, NOT
 * `safeFetch`. safeFetch is the SSRF guard for UNTRUSTED urls and it refuses
 * loopback on purpose ("Refusing to fetch localhost") -- which is precisely
 * where ComfyUI lives, so routing these through it makes every call throw.
 * The base url here is the discovered ComfyUI instance, the same trusted
 * target ComfyUIClient talks to. Do not "fix" this back to safeFetch.
 */

/**
 * Reading and writing ComfyUI workflow files without fighting the human.
 *
 * A workflow file is usually open in a browser tab while something else is
 * rewriting it, and three things follow that are invisible from outside the
 * browser:
 *
 *   - the tab keeps showing the OLD graph, because ComfyUI restores a
 *     workflow from cached session state rather than re-reading disk
 *   - with Comfy.Workflow.AutoSave on, that stale tab writes itself back
 *     and silently reverts the file minutes later
 *   - unsaved hand edits are destroyed by the write, and since they never
 *     reached disk there is nothing to diff and nothing to recover
 *
 * So writing a workflow is not "write the file". It is:
 *
 *     flush  ->  read + diff  ->  write  ->  reload
 *
 * These tools do that for you. The ComfyUI-TabBridge custom node supplies
 * the flush/reload/state endpoints; without it the write still works, it
 * just cannot see or steer tabs.
 */

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const listOpenWorkflowsSchema = z.object({});

export const flushWorkflowSchema = z.object({
  path: z
    .string()
    .describe(
      "Workflow path as ComfyUI knows it, relative to the user directory, " +
        "e.g. 'workflows/Shared/pipeline.json'"
    ),
  wait_seconds: z
    .number()
    .min(0)
    .max(30)
    .optional()
    .describe("How long to wait for the tab to finish saving. Default 4."),
});

export const reloadWorkflowSchema = z.object({
  path: z.string().describe("Workflow path relative to the user directory"),
  save_first: z
    .boolean()
    .optional()
    .describe(
      "Save the tab's unsaved changes before reloading. Default true. " +
        "Setting this false DISCARDS whatever the human had not saved."
    ),
});

export const readWorkflowSchema = z.object({
  path: z
    .string()
    .describe(
      "Workflow path relative to the user directory, or an absolute path " +
        "inside a granted directory"
    ),
});

export const writeWorkflowSchema = z.object({
  path: z
    .string()
    .describe(
      "Workflow path relative to the user directory (e.g. " +
        "'workflows/Shared/pipeline.json'), or an absolute path inside a " +
        "directory granted via workflowWriteDirs in the MCP config."
    ),
  workflow: z
    .record(z.unknown())
    .describe("The full workflow JSON (UI format, with nodes and links)"),
  skip_flush: z
    .boolean()
    .optional()
    .describe(
      "Skip asking open tabs to save first. Leave this alone: flushing is " +
        "what makes the human's unsaved edits visible in the returned diff " +
        "instead of being destroyed by this write."
    ),
  skip_reload: z
    .boolean()
    .optional()
    .describe(
      "Skip telling open tabs to re-read afterwards. Leave this alone, or " +
        "the tab keeps showing the old graph and may autosave it back over " +
        "what you just wrote."
    ),
});

export type ListOpenWorkflowsInput = z.infer<typeof listOpenWorkflowsSchema>;
export type FlushWorkflowInput = z.infer<typeof flushWorkflowSchema>;
export type ReloadWorkflowInput = z.infer<typeof reloadWorkflowSchema>;
export type ReadWorkflowInput = z.infer<typeof readWorkflowSchema>;
export type WriteWorkflowInput = z.infer<typeof writeWorkflowSchema>;

// ---------------------------------------------------------------------------
// Where writes are allowed
// ---------------------------------------------------------------------------

/**
 * Is this a plain workflow path (inside ComfyUI's user directory)?
 *
 * These go through ComfyUI's own userdata API, which refuses traversal
 * itself -- verified: '../../../../escaped.json' returns 403 and writes
 * nothing. That makes the default safe by construction rather than by a
 * check in this file that could be wrong.
 */
export function isUserdataPath(p: string): boolean {
  return !isAbsolute(p) && !p.includes("..") && !/^[a-zA-Z]:/.test(p);
}

/**
 * Is `target` inside `dir`?
 *
 * Uses relative() rather than a string prefix so that a grant of
 * "...\Shared" does not also authorise "...\SharedSecrets". Both paths must
 * already be canonical -- see resolveGrantedPath, which realpaths them:
 * on this setup MySSD is a junction, so the same folder has two spellings
 * and a textual comparison is trivially fooled.
 */
function isInside(dir: string, target: string): boolean {
  const rel = relative(dir, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export class WriteNotPermittedError extends Error {}

/**
 * Resolve an absolute path against the granted directories.
 *
 * Note there is deliberately NO tool that adds to this list. A permission an
 * agent can grant itself is not a permission; the list is edited by the
 * human in the MCP config file, out of band.
 */
export async function resolveGrantedPath(
  target: string,
  grantedDirs: string[]
): Promise<string> {
  if (extname(target).toLowerCase() !== ".json") {
    throw new WriteNotPermittedError(
      `Refusing to write ${extname(target) || "a file with no extension"}: ` +
        "these tools only write .json workflows."
    );
  }
  if (!grantedDirs.length) {
    throw new WriteNotPermittedError(
      `"${target}" is outside ComfyUI's user directory and no directories are ` +
        "granted. Add it to workflowWriteDirs in the MCP config file to allow " +
        "writing there, or pass a path relative to the user directory instead."
    );
  }

  // Canonicalise BOTH sides. The file itself may not exist yet, so realpath
  // its parent -- which must exist -- and rebuild.
  const abs = resolve(target);
  const parent = dirname(abs);
  if (!existsSync(parent)) {
    throw new WriteNotPermittedError(`Directory does not exist: ${parent}`);
  }
  const realParent = await realpath(parent);
  const realTarget = realParent + sep + abs.slice(parent.length + 1);

  for (const dir of grantedDirs) {
    if (!existsSync(dir)) continue;
    const realDir = await realpath(dir);
    if (isInside(realDir, realTarget)) return realTarget;
  }
  throw new WriteNotPermittedError(
    `"${target}" is not inside any granted directory. Granted: ` +
      `${grantedDirs.join(", ") || "(none)"}. Add it to workflowWriteDirs in ` +
      "the MCP config file to allow writing there."
  );
}

// ---------------------------------------------------------------------------
// Diffing, so a human's edits are reported rather than silently replaced
// ---------------------------------------------------------------------------

interface WorkflowNodeLike {
  id?: number | string;
  type?: string;
  widgets_values?: unknown[];
  inputs?: Array<{ name?: string; link?: number | null }>;
}

/**
 * A diff is always oriented THEIRS relative to YOURS: "theirs" is the file as
 * it currently sits on disk (the human's), "yours" is the graph about to be
 * written over it.
 *
 * The names say which is which on purpose. A bare "896 -> 1024" does not tell
 * the reader which side is the human's, and guessing wrong means folding the
 * value they had just REPLACED back into the generator -- reintroducing the
 * exact edit this path exists to preserve. The rendered summary carries the
 * same legend for the same reason.
 */
export interface WorkflowDiff {
  any: boolean;
  onlyInTheirs: Array<{ id: unknown; type?: string }>;
  onlyInYours: Array<{ id: unknown; type?: string }>;
  widgetChanges: Array<{
    id: unknown;
    type?: string;
    index: number;
    yours: unknown;
    theirs: unknown;
  }>;
  linkChanges: Array<{ id: unknown; type?: string }>;
  summary: string;
}

function shorten(v: unknown, limit = 70): string {
  const s = JSON.stringify(v) ?? String(v);
  return s.length <= limit ? s : `${s.slice(0, limit - 3)}...`;
}

/**
 * What the file on disk (`current`, "theirs") has that the graph about to be
 * written (`candidate`, "yours") does not.
 *
 * Node POSITIONS are ignored on purpose: auto-layout rewrites every one of
 * them, and so does anyone tidying the canvas. Treating that as an edit
 * would make this fire constantly and get ignored. Only nodes, links and
 * widget values count.
 */
export function diffWorkflows(current: unknown, candidate: unknown): WorkflowDiff {
  const nodesOf = (w: unknown): Map<unknown, WorkflowNodeLike> => {
    const list = (w as { nodes?: WorkflowNodeLike[] })?.nodes ?? [];
    return new Map(list.map((n) => [n.id, n]));
  };
  const cur = nodesOf(current);
  const cand = nodesOf(candidate);

  const onlyInTheirs: WorkflowDiff["onlyInTheirs"] = [];
  const onlyInYours: WorkflowDiff["onlyInYours"] = [];
  const widgetChanges: WorkflowDiff["widgetChanges"] = [];
  const linkChanges: WorkflowDiff["linkChanges"] = [];

  // Deliberately not "added"/"removed": a node in theirs and not yours is
  // usually one they ADDED, but a node in yours and not theirs is just as
  // often one your generator is adding as one they deleted. The presence
  // claim is observable; the intent behind it is not.
  for (const [id, n] of cur) if (!cand.has(id)) onlyInTheirs.push({ id, type: n.type });
  for (const [id, n] of cand) if (!cur.has(id)) onlyInYours.push({ id, type: n.type });

  for (const [id, c] of cur) {
    const g = cand.get(id);
    if (!g || c.type !== g.type) continue;
    const cv = c.widgets_values ?? [];
    const gv = g.widgets_values ?? [];
    const len = Math.max(cv.length, gv.length);
    for (let i = 0; i < len; i++) {
      if (JSON.stringify(cv[i]) !== JSON.stringify(gv[i])) {
        widgetChanges.push({ id, type: c.type, index: i, yours: gv[i], theirs: cv[i] });
      }
    }
    // Only real wires. ComfyUI's saved format lists every widget as an input
    // with link null while a generator does not, and comparing those reports
    // every node in the graph as rewired.
    const wires = (n: WorkflowNodeLike) =>
      JSON.stringify(
        (n.inputs ?? [])
          .filter((i) => i.link !== null && i.link !== undefined)
          .map((i) => [i.name, i.link])
          .sort()
      );
    if (wires(c) !== wires(g)) linkChanges.push({ id, type: c.type });
  }

  const lines: string[] = [];
  for (const n of onlyInTheirs) lines.push(`  THEIRS ONLY  ${n.type} (id ${n.id})`);
  for (const n of onlyInYours) lines.push(`  YOURS ONLY   ${n.type} (id ${n.id})`);
  for (const w of widgetChanges)
    lines.push(
      `  WIDGET       ${w.type} (id ${w.id}) [${w.index}]: ` +
        `yours ${shorten(w.yours)} | theirs ${shorten(w.theirs)}`
    );
  for (const l of linkChanges) lines.push(`  REWIRED      ${l.type} (id ${l.id})`);

  const any =
    onlyInTheirs.length + onlyInYours.length + widgetChanges.length + linkChanges.length >
    0;
  const legend =
    "THEIRS = the file on disk now (the human's). YOURS = what you are about " +
    "to write over it.\n";
  return {
    any,
    onlyInTheirs,
    onlyInYours,
    widgetChanges,
    linkChanges,
    summary: any ? legend + lines.join("\n") : "no changes",
  };
}

// ---------------------------------------------------------------------------
// TabBridge + userdata calls
// ---------------------------------------------------------------------------

export interface TabState {
  clients: number;
  open_workflows: Array<{
    path: string;
    filename?: string;
    modified: boolean;
    active_in_any_client: boolean;
  }>;
  stale_after_seconds?: number;
}

const NO_BRIDGE =
  "ComfyUI-TabBridge is not installed or ComfyUI needs restarting, so open " +
  "tabs cannot be seen or steered. Writes still work, but a tab holding this " +
  "workflow will keep showing the old graph and may autosave it back.";

export async function getTabState(baseUrl: string): Promise<TabState | null> {
  try {
    const res = await fetch(`${baseUrl}/tabs/state`);
    if (!res.ok) return null;
    return (await res.json()) as TabState;
  } catch {
    return null;
  }
}

async function postBridge(
  baseUrl: string,
  route: string,
  body: Record<string, unknown>
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Ask tabs to save, then wait for the workflow to stop being dirty.
 *
 * Fire-and-forget by nature -- the server cannot await a browser -- so this
 * polls the reported state instead. A tab with nothing to save never writes,
 * so a timeout is the normal quiet case rather than a failure.
 */
export async function flushWorkflow(
  baseUrl: string,
  path: string,
  waitSeconds = 4
): Promise<{ requested: boolean; wasModified: boolean; settled: boolean }> {
  const before = await getTabState(baseUrl);
  const entry = before?.open_workflows.find((w) => w.path === path);
  const wasModified = !!entry?.modified;
  const requested = await postBridge(baseUrl, "/tabs/flush", { path });
  if (!requested || !wasModified) {
    return { requested, wasModified, settled: !wasModified };
  }
  const deadline = Date.now() + waitSeconds * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    const now = await getTabState(baseUrl);
    const e = now?.open_workflows.find((w) => w.path === path);
    if (!e?.modified) return { requested, wasModified, settled: true };
  }
  return { requested, wasModified, settled: false };
}

export async function reloadWorkflow(
  baseUrl: string,
  path: string,
  saveFirst = true
): Promise<boolean> {
  return postBridge(baseUrl, "/tabs/reload", { path, save_first: saveFirst });
}

export async function readWorkflowFile(
  baseUrl: string,
  path: string,
  grantedDirs: string[]
): Promise<unknown | null> {
  if (isUserdataPath(path)) {
    // Cache-busted: a plain GET can return a stale copy, which defeats the
    // point of reading before a write.
    const url = `${baseUrl}/api/userdata/${encodeURIComponent(path)}?t=${Date.now()}`;
    const res = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  }
  const real = await resolveGrantedPath(path, grantedDirs);
  if (!existsSync(real)) return null;
  return JSON.parse(await readFile(real, "utf-8")) as unknown;
}

export async function writeWorkflowFile(
  baseUrl: string,
  path: string,
  workflow: unknown,
  grantedDirs: string[]
): Promise<string> {
  const blob = JSON.stringify(workflow, null, 2);
  if (isUserdataPath(path)) {
    const url = `${baseUrl}/api/userdata/${encodeURIComponent(path)}?overwrite=true`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: blob,
    });
    if (!res.ok) {
      throw new Error(`ComfyUI refused the write: ${res.status} ${res.statusText}`);
    }
    return path;
  }
  const real = await resolveGrantedPath(path, grantedDirs);
  await mkdir(dirname(real), { recursive: true });
  await writeFile(real, blob, "utf-8");
  return real;
}

export const BRIDGE_MISSING_HINT = NO_BRIDGE;
