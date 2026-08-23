import { test } from "node:test";
import assert from "node:assert/strict";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerSetupTools } from "../server/tools/setup.js";
import { registerDiscoveryTools } from "../server/tools/discovery.js";
import { registerGenerationTools } from "../server/tools/generation.js";
import { registerTaskTools } from "../server/tools/tasks.js";
import { registerLibraryTools } from "../server/tools/library.js";
import { registerWorkspaceTools } from "../server/tools/workspace.js";
import type { ServerContext } from "../context.js";
import { listPrompts, getPrompt } from "./prompts.js";

/**
 * Every tool this server actually publishes.
 *
 * defineTool only ever calls registerTool, so a recorder collects the real
 * names - including the comfyui_ prefix it applies - without standing a
 * server up or touching ComfyUI.
 */
function registeredToolNames(): Set<string> {
  const names = new Set<string>();
  const server = {
    registerTool: (name: string) => {
      names.add(name);
    },
  } as unknown as McpServer;

  const ctx = (() => ({})) as unknown as () => ServerContext;

  registerSetupTools(server, ctx);
  registerDiscoveryTools(server);
  registerGenerationTools(server, ctx);
  registerTaskTools(server, ctx);
  registerLibraryTools(server, ctx);
  registerWorkspaceTools(server);

  return names;
}

/** Default arguments good enough to render each prompt. */
const PROMPT_ARGS: Record<string, Record<string, string>> = {
  "generate-image": { prompt: "a red square" },
  "setup-comfyui": { platform: "linux", model_type: "flux" },
  "run-example": { example_name: "Basic txt2img" },
  "learn-prompting": { model_type: "flux" },
};

test("every tool a prompt tells the model to call actually exists", async () => {
  // generate-image asked for `generate_image` and setup-comfyui for
  // `list_downloads`; neither is registered anywhere, and the rest were
  // named without the comfyui_ prefix defineTool applies. A client invoking
  // those prompts issued unknown-tool calls. run-example in the same file
  // had it right, so the two disagreed.
  const registered = registeredToolNames();
  assert.ok(registered.size > 20, `expected the real tool set, got ${registered.size}`);

  for (const prompt of listPrompts()) {
    const rendered = await getPrompt(prompt.name, PROMPT_ARGS[prompt.name] ?? {});
    const text = rendered.messages.map((m) => m.content.text).join("\n");

    // Any snake_case identifier the text tells the model to call.
    const mentioned = [
      ...text.matchAll(/\b(?:call|use|with)\s+`?([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`?/gi),
    ].map(([, name]) => name);

    for (const name of mentioned) {
      assert.ok(
        registered.has(name),
        `prompt "${prompt.name}" names ${name}, which is not a registered tool`
      );
    }
  }
});

test("every prompt renders without throwing", async () => {
  for (const prompt of listPrompts()) {
    const rendered = await getPrompt(prompt.name, PROMPT_ARGS[prompt.name] ?? {});
    assert.ok(rendered.messages.length > 0, prompt.name);
  }
});
