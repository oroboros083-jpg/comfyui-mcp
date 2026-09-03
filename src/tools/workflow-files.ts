import { ToolError } from "../utils/errors.js";
import { z } from "zod";
import { realpath, readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "path";

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
 * Every step of that is implicit and non-optional. read_workflow flushes
 * before it reads, so the version it records as the write's base includes the
 * human's unsaved work; write_workflow flushes again (they can edit between
 * the two), checks, writes, and reloads. There is deliberately no way to skip
 * a step: the opt-out arguments that used to exist only turned the safety off,
 * and their own descriptions said to leave them alone.
 *
 * The ComfyUI-TabBridge custom node supplies the flush/reload/state endpoints;
 * without it the write still works, it just cannot see or steer tabs.
 */

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const listOpenWorkflowsSchema = z.object({}).strict();

export const readWorkflowSchema = z.object({
  path: z
    .string()
    .describe(
      "Workflow path relative to the user directory, or an absolute path " +
        "inside a granted directory"
    ),
}).strict();

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
  expected_version: z
    .string()
    .optional()
    .describe(
      "The `version` comfyui_read_workflow returned for this path. The write " +
        "is refused if the file no longer matches it, which is how an edit " +
        "made by a human or another agent since your read is caught instead " +
        "of overwritten. Usually unnecessary: the version from your last read " +
        "of this path is remembered and used automatically. Pass it to be " +
        "explicit, or when the read happened in a different process."
    ),
  force: z
    .boolean()
    .optional()
    .describe(
      "Write even though the file changed since you read it, or even though " +
        "you never read it. This DESTROYS whatever the other writer did, so " +
        "use it only after reading the reported conflict and deciding their " +
        "change should not survive."
    ),
}).strict();

export type ListOpenWorkflowsInput = z.infer<typeof listOpenWorkflowsSchema>;
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
  // join, not realParent + sep + abs.slice(parent.length + 1): dirname()
  // returns a root WITH its trailing separator ("C:\", "/"), so slicing past
  // it ate the first character of the filename and "C:\pipeline.json" resolved
  // to "C:\\ipeline.json" - a path that still passed the containment check and
  // was written to, then reported back as if it were the requested one.
  const realTarget = join(realParent, basename(abs));

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
  onlyInTheirs: Array<{ id: unknown; type?: string; subgraph?: string }>;
  onlyInYours: Array<{ id: unknown; type?: string; subgraph?: string }>;
  widgetChanges: Array<{
    id: unknown;
    type?: string;
    subgraph?: string;
    index: number;
    yours: unknown;
    theirs: unknown;
  }>;
  linkChanges: Array<{ id: unknown; type?: string; subgraph?: string }>;
  /**
   * One node id, two different node types. Its own category because it is
   * neither an added nor a removed node - the id is on both sides - and the
   * widget comparison below cannot speak about it, since widget slot 3 of a
   * KSampler and slot 3 of a KSamplerAdvanced are not the same field.
   */
  typeChanges: Array<{ id: unknown; subgraph?: string; yours?: string; theirs?: string }>;
  summary: string;
}

function shorten(v: unknown, limit = 70): string {
  const s = JSON.stringify(v) ?? String(v);
  return s.length <= limit ? s : `${s.slice(0, limit - 3)}...`;
}

/** A node plus where it lives, so the summary can say which subgraph it is in. */
interface PlacedNode {
  node: WorkflowNodeLike;
  subgraph?: string;
}

/**
 * Every node in the file, top level and subgraph interiors alike.
 *
 * Reading `nodes` alone was blind to the whole modern template format: a
 * ComfyUI subgraph keeps its interior under `definitions.subgraphs[].nodes`,
 * and an official gallery template is typically ONE subgraph instance at the
 * top level with the entire pipeline inside it. So the official Comfy MCP
 * editing a prompt or a step count through `set_workflow_slot` changed
 * nothing this diff could see, and the write was refused - correctly, the
 * refusal goes on the content hash - with "no changes" as its explanation, at
 * the exact moment the reader is deciding whether to force past it.
 *
 * Keyed `<subgraph id>/<node id>`, the same shape comfy-cli addresses these
 * by, so an interior node cannot collide with a top-level one. Definitions
 * live in one flat list at the root even when subgraphs nest, so this needs
 * no recursion.
 */
function nodesOf(w: unknown): Map<string, PlacedNode> {
  const out = new Map<string, PlacedNode>();
  for (const n of (w as { nodes?: WorkflowNodeLike[] })?.nodes ?? []) {
    out.set(String(n.id), { node: n });
  }

  const subgraphs =
    (
      w as {
        definitions?: {
          subgraphs?: Array<{ id?: string; name?: string; nodes?: WorkflowNodeLike[] }>;
        };
      }
    )?.definitions?.subgraphs ?? [];
  for (const sub of subgraphs) {
    // The name is what a human recognises; the id is the fallback when a
    // subgraph has none.
    const label = sub.name ?? String(sub.id ?? "subgraph");
    for (const n of sub.nodes ?? []) {
      out.set(`${sub.id}/${n.id}`, { node: n, subgraph: label });
    }
  }
  return out;
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
  const cur = nodesOf(current);
  const cand = nodesOf(candidate);

  const onlyInTheirs: WorkflowDiff["onlyInTheirs"] = [];
  const onlyInYours: WorkflowDiff["onlyInYours"] = [];
  const widgetChanges: WorkflowDiff["widgetChanges"] = [];
  const linkChanges: WorkflowDiff["linkChanges"] = [];
  const typeChanges: WorkflowDiff["typeChanges"] = [];

  // Deliberately not "added"/"removed": a node in theirs and not yours is
  // usually one they ADDED, but a node in yours and not theirs is just as
  // often one your generator is adding as one they deleted. The presence
  // claim is observable; the intent behind it is not.
  const place = (p: PlacedNode) => (p.subgraph ? { subgraph: p.subgraph } : {});

  for (const [key, p] of cur)
    if (!cand.has(key)) onlyInTheirs.push({ id: p.node.id, type: p.node.type, ...place(p) });
  for (const [key, p] of cand)
    if (!cur.has(key)) onlyInYours.push({ id: p.node.id, type: p.node.type, ...place(p) });

  for (const [key, placed] of cur) {
    const other = cand.get(key);
    if (!other) continue;
    const c = placed.node;
    const g = other.node;
    // A retyped node used to be dropped here entirely: the id is in both maps
    // so neither "only in" list caught it, and the `continue` skipped the
    // widget and link comparison too - so swapping KSampler for
    // KSamplerAdvanced with every value different reported "no changes" to
    // the reader deciding whether to force past a refusal. Record it, then
    // still skip: the widget slots are not comparable across two node types.
    if (c.type !== g.type) {
      typeChanges.push({ id: c.id, ...place(placed), yours: g.type, theirs: c.type });
      continue;
    }
    const id = c.id;
    const cv = c.widgets_values ?? [];
    const gv = g.widgets_values ?? [];
    const len = Math.max(cv.length, gv.length);
    for (let i = 0; i < len; i++) {
      if (JSON.stringify(cv[i]) !== JSON.stringify(gv[i])) {
        widgetChanges.push({
          id,
          type: c.type,
          ...place(placed),
          index: i,
          yours: gv[i],
          theirs: cv[i],
        });
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
    if (wires(c) !== wires(g))
      linkChanges.push({ id, type: c.type, ...place(placed) });
  }

  // A node inside a subgraph is named by the subgraph a human sees on the
  // canvas, not by the definition uuid, which appears nowhere in the UI.
  const where = (n: { subgraph?: string }) => (n.subgraph ? `[${n.subgraph}] ` : "");

  const lines: string[] = [];
  for (const n of onlyInTheirs)
    lines.push(`  THEIRS ONLY  ${where(n)}${n.type} (id ${n.id})`);
  for (const n of onlyInYours)
    lines.push(`  YOURS ONLY   ${where(n)}${n.type} (id ${n.id})`);
  for (const w of widgetChanges)
    lines.push(
      `  WIDGET       ${where(w)}${w.type} (id ${w.id}) [${w.index}]: ` +
        `yours ${shorten(w.yours)} | theirs ${shorten(w.theirs)}`
    );
  for (const l of linkChanges)
    lines.push(`  REWIRED      ${where(l)}${l.type} (id ${l.id})`);
  for (const t of typeChanges)
    lines.push(
      `  RETYPED      ${where(t)}(id ${t.id}): yours ${t.yours} | theirs ${t.theirs}`
    );

  const any =
    onlyInTheirs.length +
      onlyInYours.length +
      widgetChanges.length +
      linkChanges.length +
      typeChanges.length >
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
    typeChanges,
    summary: any ? legend + lines.join("\n") : "no changes",
  };
}

// ---------------------------------------------------------------------------
// TabBridge + userdata calls
// ---------------------------------------------------------------------------

/**
 * Which ComfyUI to talk to, and how to authenticate to it.
 *
 * These calls used to take a bare base url and send no Authorization header,
 * unlike ComfyUIClient. Against an instance with an API key configured every
 * one of them got a 401 and swallowed it: list_open_workflows reported
 * "TabBridge is not installed" when it was installed and working, and
 * read_workflow answered { found: false } for a workflow that exists - which
 * left write_workflow with nothing to diff, so it overwrote the human's file
 * and reported no changes. That is exactly the loss this module exists to
 * prevent, so the credential travels with the target rather than being
 * something each call site can forget.
 *
 * A key that is merely *wrong* is caught earlier: every one of these tools is
 * connection-gated, and the gate's health probe fails on the 401 first.
 */
export interface ComfyUITarget {
  baseUrl: string;
  apiKey?: string;
}

function targetHeaders(
  target: ComfyUITarget,
  extra: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (target.apiKey) headers["Authorization"] = `Bearer ${target.apiKey}`;
  return headers;
}

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

export async function getTabState(target: ComfyUITarget): Promise<TabState | null> {
  try {
    const res = await fetch(`${target.baseUrl}/tabs/state`, {
      headers: targetHeaders(target),
    });
    if (!res.ok) return null;
    return (await res.json()) as TabState;
  } catch {
    return null;
  }
}

async function postBridge(
  target: ComfyUITarget,
  route: string,
  body: Record<string, unknown>
): Promise<boolean> {
  try {
    const res = await fetch(`${target.baseUrl}${route}`, {
      method: "POST",
      headers: targetHeaders(target, { "Content-Type": "application/json" }),
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
  target: ComfyUITarget,
  path: string,
  waitSeconds = 4
): Promise<{ requested: boolean; wasModified: boolean; settled: boolean }> {
  const before = await getTabState(target);
  const entry = before?.open_workflows.find((w) => w.path === path);
  const wasModified = !!entry?.modified;
  const requested = await postBridge(target, "/tabs/flush", { path });
  if (!requested || !wasModified) {
    return { requested, wasModified, settled: !wasModified };
  }
  const deadline = Date.now() + waitSeconds * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    const now = await getTabState(target);
    const e = now?.open_workflows.find((w) => w.path === path);
    if (!e?.modified) return { requested, wasModified, settled: true };
  }
  return { requested, wasModified, settled: false };
}

export async function reloadWorkflow(
  target: ComfyUITarget,
  path: string,
  saveFirst = true
): Promise<boolean> {
  return postBridge(target, "/tabs/reload", { path, save_first: saveFirst });
}

/**
 * The file exists (or might) but could not be read.
 *
 * The third state a safe write needs. `null` used to mean both "absent" and
 * "unreadable", and absent is the one state that lets a write through without
 * a base - so a 500 or a 503 from ComfyUI during a write turned the whole
 * lost-update check off and the human's workflow was overwritten. Refusing on
 * "could not tell" is the only answer that cannot destroy anything.
 */
export class WorkflowUnreadableError extends ToolError {
  constructor(message: string) {
    super(
      message,
      "This is not the same as the file being missing, so the write was refused rather than " +
        "treated as creating a new file. Call comfyui_get_status to check ComfyUI is healthy and " +
        "try again; pass force: true only to overwrite a file you could not read."
    );
  }
}

export async function readWorkflowFile(
  target: ComfyUITarget,
  path: string,
  grantedDirs: string[]
): Promise<unknown | null> {
  if (isUserdataPath(path)) {
    // Cache-busted: a plain GET can return a stale copy, which defeats the
    // point of reading before a write.
    const url = `${target.baseUrl}/api/userdata/${encodeURIComponent(path)}?t=${Date.now()}`;
    const res = await fetch(url, {
      headers: targetHeaders(target, { "Cache-Control": "no-cache" }),
    });
    // Only a 404 is evidence of absence. Every other failure - 500, 503, a 401
    // from an instance with a key configured - says nothing about whether the
    // file is there, and answering `null` to those is what let a write proceed
    // as if it were creating the file.
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new WorkflowUnreadableError(
        `ComfyUI could not serve "${path}": ${res.status} ${res.statusText}.`
      );
    }
    try {
      return (await res.json()) as unknown;
    } catch {
      throw new WorkflowUnreadableError(
        `"${path}" came back from ComfyUI as something that is not JSON.`
      );
    }
  }
  const real = await resolveGrantedPath(path, grantedDirs);
  if (!existsSync(real)) return null;
  const raw = await readFile(real, "utf-8");
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new WorkflowUnreadableError(`"${path}" is on disk but does not parse as JSON.`);
  }
}

export async function writeWorkflowFile(
  target: ComfyUITarget,
  path: string,
  workflow: unknown,
  grantedDirs: string[]
): Promise<string> {
  const blob = JSON.stringify(workflow, null, 2);
  if (isUserdataPath(path)) {
    const url = `${target.baseUrl}/api/userdata/${encodeURIComponent(path)}?overwrite=true`;
    const res = await fetch(url, {
      method: "POST",
      headers: targetHeaders(target, { "Content-Type": "application/json" }),
      body: blob,
    });
    if (!res.ok) {
      throw new ToolError(
        `ComfyUI refused the write: ${res.status} ${res.statusText}`,
        "The path may be outside ComfyUI's userdata directory, or the file may be open and locked. comfyui_list_open_workflows shows what is open."
      );
    }
    return path;
  }
  const real = await resolveGrantedPath(path, grantedDirs);
  await mkdir(dirname(real), { recursive: true });
  await writeFile(real, blob, "utf-8");
  return real;
}

export const BRIDGE_MISSING_HINT = NO_BRIDGE;
