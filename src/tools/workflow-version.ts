/**
 * A version token for a workflow file, so a write can tell "I changed this"
 * apart from "someone else changed this".
 *
 * `write_workflow` used to diff the file on disk against the graph about to
 * replace it and write regardless. That diff cannot gate anything: the two
 * sides always differ on a real edit, because differing is the point of
 * writing. Distinguishing a FOREIGN change needs three states, not two -
 *
 *     base    the file as it was when this agent read it
 *     theirs  the file as it is on disk right now
 *     yours   the graph about to be written
 *
 * - and a foreign change is `theirs !== base`. `base` is what this module
 * mints: a hash the caller carries from `read_workflow` to `write_workflow`.
 *
 * WHY NOT `hashWorkflowStructure` (analysis/hash.ts). That one runs
 * `normalizeWorkflow` first, which deliberately replaces prompts, seeds and
 * filenames with placeholders so two runs of the same graph hash alike. It is
 * the right tool for "is this the same pipeline" and exactly the wrong one
 * here: a human retyping the prompt is the single most likely edit we are
 * trying not to destroy, and structural hashing calls it no change at all.
 *
 * Only the canonical key ordering is shared, via `sortObjectKeys`.
 */

import { createHash } from "crypto";

import { sortObjectKeys } from "../analysis/hash.js";

/**
 * Hex characters kept from the sha256.
 *
 * 32 (128 bits), where `hashWorkflowStructure` keeps 16. That one labels a
 * pipeline and a collision costs a mislabelled analytics row; a collision here
 * silently overwrites a human's unsaved work, because two different files
 * would compare equal and the write would be allowed through. The extra 16
 * characters are free next to that.
 */
const VERSION_HEX_CHARS = 32;

/**
 * A stable, exact version token for a workflow.
 *
 * Key order and whitespace do not affect it - the value survives the
 * JSON round trip through `writeWorkflowFile`, which re-serializes with
 * two-space indentation, so a file written and read back yields the token it
 * was written with. Any change to a value, node, or link does affect it.
 */
export function workflowVersion(workflow: unknown): string {
  const canonical = JSON.stringify(sortObjectKeys(workflow));
  return createHash("sha256").update(canonical).digest("hex").slice(0, VERSION_HEX_CHARS);
}

/** Where a `base` came from, so a refusal can say what it compared against. */
export type BaseSource = "argument" | "recorded" | "none";

/** The verdict for one write, and the reason behind it. */
export type WriteVerdict =
  | { allowed: true; reason: "new_file" | "unchanged" | "forced" }
  | { allowed: false; reason: "changed" | "no_base" };

/**
 * Should this write proceed?
 *
 * Split from the tool handler so the whole policy is one pure function with
 * one table of cases, testable without a ComfyUI or a filesystem.
 *
 * `force` short-circuits everything - it is the only way past a refusal, and
 * naming it `forced` rather than folding it into the allowed reasons keeps the
 * response honest about why the write happened.
 */
export function decideWrite(opts: {
  /** Does the file already exist on disk? */
  exists: boolean;
  /** The caller's base, from an argument or a recorded read. */
  base: string | null;
  /** The version of what is on disk right now. */
  theirs: string | null;
  force?: boolean;
}): WriteVerdict {
  if (opts.force) return { allowed: true, reason: "forced" };

  // Nothing on disk to clobber. A first write needs no base, and demanding one
  // would make creating a workflow impossible without first reading a file
  // that does not exist.
  if (!opts.exists) return { allowed: true, reason: "new_file" };

  // The file exists and this agent never read it, so there is nothing to
  // compare against. Refusing here is what makes the check unconditional for
  // existing files: without it, "no base" would silently mean "no conflict".
  if (opts.base === null) return { allowed: false, reason: "no_base" };

  if (opts.theirs !== opts.base) return { allowed: false, reason: "changed" };

  return { allowed: true, reason: "unchanged" };
}
