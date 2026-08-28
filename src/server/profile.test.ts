import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { setProfile, getProfile, isOmitted, COMPANION_OMITS } from "./profile.js";
import { TOOL_PREFIX } from "./register.js";
import { registerSetupTools } from "./tools/setup.js";
import { registerDiscoveryTools } from "./tools/discovery.js";
import { registerGenerationTools } from "./tools/generation.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerLibraryTools } from "./tools/library.js";
import { registerWorkspaceTools } from "./tools/workspace.js";
import { ServerContext } from "../context.js";

function namesFor(profile: "standalone" | "companion"): string[] {
  setProfile(profile);
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
  return names;
}

// The profile is process-global, so a test that changes it must put it back
// or it decides the outcome of every test that runs after it.
afterEach(() => setProfile("standalone"));

test("standalone registers everything", () => {
  const names = namesFor("standalone");
  for (const bare of COMPANION_OMITS.keys()) {
    assert.ok(
      names.includes(`${TOOL_PREFIX}${bare}`),
      `${bare} should be present in standalone`
    );
  }
});

test("companion omits exactly the delegated tools", () => {
  const standalone = new Set(namesFor("standalone"));
  const companion = new Set(namesFor("companion"));

  const dropped = [...standalone].filter((n) => !companion.has(n)).sort();
  const expected = [...COMPANION_OMITS.keys()].map((b) => `${TOOL_PREFIX}${b}`).sort();

  assert.deepEqual(dropped, expected, "the gate drops the list and nothing else");
  assert.ok(companion.size > 0 && companion.size < standalone.size);
});

test("every omitted name is a tool that actually exists", () => {
  // A stale entry here would silently omit nothing, and the profile would
  // quietly stop doing what its documentation claims.
  const standalone = new Set(namesFor("standalone"));
  const unknown = [...COMPANION_OMITS.keys()].filter(
    (bare) => !standalone.has(`${TOOL_PREFIX}${bare}`)
  );
  assert.deepEqual(unknown, [], `COMPANION_OMITS names tools that do not exist: ${unknown}`);
});

test("the queue tools survive companion mode", () => {
  // Not an incidental pass. Their job(action="queue") lists what comfy-cli
  // submitted; ours reads ComfyUI's real queue and sees every job whoever
  // sent it. Dropping ours would remove the only cross-server view, so if
  // someone adds it to COMPANION_OMITS this should stop them.
  const companion = new Set(namesFor("companion"));
  for (const name of ["get_queue", "interrupt", "cancel_job"]) {
    assert.ok(
      companion.has(`${TOOL_PREFIX}${name}`),
      `${name} must stay: it answers something the official server cannot`
    );
  }
});

test("isOmitted only bites under companion", () => {
  const [first] = [...COMPANION_OMITS.keys()];
  setProfile("standalone");
  assert.equal(isOmitted(first), false);
  setProfile("companion");
  assert.equal(isOmitted(first), true);
  assert.equal(isOmitted("get_status"), false, "unlisted tools are never omitted");
});

test("the profile defaults to standalone", () => {
  assert.equal(getProfile(), "standalone");
});
