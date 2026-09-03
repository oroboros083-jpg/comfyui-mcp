import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerSetupTools } from "./tools/setup.js";
import { registerDiscoveryTools } from "./tools/discovery.js";
import { registerGenerationTools } from "./tools/generation.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerLibraryTools } from "./tools/library.js";
import { registerWorkspaceTools } from "./tools/workspace.js";
import { ServerContext } from "../context.js";

/**
 * Nothing may point an agent at a `comfyui_*` tool that does not exist.
 *
 * `instructions.test.ts` already enforces this for the handshake text. This
 * widens it to EVERY tool description and every error hint, which is where the
 * rot actually accumulated: pruning twelve tools left roughly forty dangling
 * references scattered through hints in `src/tools/**`, none of which any test
 * or the compiler could see, because they are ordinary strings.
 *
 * A hint naming a tool that was deleted is worse than a hint naming none: it
 * spends the agent's next call on a tool that will not resolve, at the one
 * moment the hint exists to be acted on.
 */

function registeredToolNames(): Set<string> {
  const names: string[] = [];
  const server = {
    registerTool: (name: string) => {
      names.push(name);
    },
  } as unknown as McpServer;

  const context = () => ({}) as ServerContext;
  registerSetupTools(server, context);
  registerDiscoveryTools(server);
  registerGenerationTools(server, context);
  registerTaskTools(server, context);
  registerLibraryTools(server, context);
  registerWorkspaceTools(server);
  return new Set(names);
}

/** Every .ts source file under src/, excluding tests. */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
      found.push(path);
    }
  }
  return found;
}

test("no source file mentions a comfyui_ tool that is not registered", () => {
  const registered = registeredToolNames();

  // Run over the TypeScript sources rather than dist: the strings are the
  // point, and reading them from source means a stale dist cannot mask a
  // dangling reference (which is exactly how a deleted module's test kept
  // "passing" during this prune).
  const root = fileURLToPath(new URL("../../src", import.meta.url));
  const offenders: string[] = [];

  for (const file of sourceFiles(root)) {
    const text = readFileSync(file, "utf-8");
    // Not preceded by `/`: HuggingFace paths like
    // `stable-cascade/tree/main/comfyui_checkpoints` are directory names, not
    // tool references, and no tool name is ever written after a slash.
    for (const match of new Set(text.match(/(?<!\/)\bcomfyui_[a-z_]+/g) ?? [])) {
      if (!registered.has(match)) {
        offenders.push(`${file.slice(root.length + 1)}: ${match}`);
      }
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    "these name a comfyui_ tool that no longer exists - point them at the " +
      "official Comfy MCP's equivalent, or at the tool that replaced them"
  );
});

/**
 * Strip the blocks that are allowed to name a removed tool.
 *
 * The README has to be able to document a removal - its migration table is
 * nothing but removed names, and that table is the reason an upgrader is not
 * stranded. So the allowance is explicit and bounded by markers rather than
 * inferred from context, and everything outside them is held to the same
 * standard as the source.
 */
function withoutAllowedBlocks(text: string): string {
  return text.replace(
    /<!--\s*tool-references:allow-removed[\s\S]*?<!--\s*\/tool-references:allow-removed\s*-->/g,
    ""
  );
}

test("the README does not send a reader to a comfyui_ tool that was removed", () => {
  // The source guard above is what `68f7ffe` added after pruning twelve tools
  // left ~40 dangling references. It scans src/ only - and the README, which
  // is where a new user starts, still named 13 removed tools across 42
  // references after that sweep. Same defect, wider blast radius: the doc is
  // read before any tool is called.
  const registered = registeredToolNames();
  const readme = fileURLToPath(new URL("../../README.md", import.meta.url));
  const text = withoutAllowedBlocks(readFileSync(readme, "utf-8"));

  const offenders = [...new Set(text.match(/(?<!\/)\bcomfyui_[a-z_]+/g) ?? [])]
    .filter((name) => !registered.has(name))
    .sort();

  assert.deepEqual(
    offenders,
    [],
    "the README names comfyui_ tools that no longer exist - repoint them at " +
      "the official Comfy MCP's equivalent, or document the removal inside a " +
      "<!-- tool-references:allow-removed --> block"
  );
});

test("no eval suite asks for a comfyui_ tool that was removed", () => {
  // The two guards above cover src/ and README.md. `evals/` fell between
  // them, and both suites drifted: evals/README.md named five removed tools
  // and evals/live-instance.xml named four more. An eval that calls a tool
  // which no longer exists does not fail loudly - it scores the model down
  // for a question nothing could have answered, so the suite reports a
  // regression that is really a stale question.
  //
  // The allow-removed escape applies to the .md files only, and the asymmetry
  // is the point. Prose here has the same job the README's migration table
  // has - evals/README.md explains why the live suite was deleted, which
  // means naming the four tools it was built on. A suite has no such job: an
  // .xml file that names a tool means to call it, so it gets no escape. The
  // marker is an HTML comment and a suite header is already an XML comment,
  // so nesting one inside would not be well-formed anyway.
  const registered = registeredToolNames();
  const dir = fileURLToPath(new URL("../../evals", import.meta.url));
  const offenders: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!/\.(xml|md)$/.test(entry.name)) continue;
    const raw = readFileSync(join(dir, entry.name), "utf-8");
    const text = entry.name.endsWith(".md") ? withoutAllowedBlocks(raw) : raw;
    for (const match of new Set(text.match(/(?<!\/)\bcomfyui_[a-z_]+/g) ?? [])) {
      if (!registered.has(match)) offenders.push(`${entry.name}: ${match}`);
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    "an eval suite names comfyui_ tools that no longer exist - repoint the " +
      "question at a registered tool, or at the official Comfy MCP's equivalent"
  );
});
