import { test } from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "./config.js";

/** Restore whatever the ambient environment had, so tests do not leak. */
async function withEnv<T>(
  vars: Record<string, string | undefined>,
  run: () => Promise<T>
): Promise<T> {
  const previous = new Map(Object.keys(vars).map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return await run();
  } finally {
    for (const [k, v] of previous) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("COMFYUI_API_KEY reaches the config", async () => {
  // requestFailureHint tells the caller to set this on a 401/403. It was never
  // read, so following that advice changed nothing.
  const config = await withEnv({ COMFYUI_API_KEY: "sk-test-key" }, loadConfig);
  assert.equal(config.comfyui.apiKey, "sk-test-key");
});

test("COMFYUI_URL still overrides the config file", async () => {
  const config = await withEnv({ COMFYUI_URL: "http://127.0.0.1:9999" }, loadConfig);
  assert.equal(config.comfyui.url, "http://127.0.0.1:9999");
});

test("an absent API key stays absent rather than becoming empty string", async () => {
  const config = await withEnv({ COMFYUI_API_KEY: undefined }, loadConfig);
  assert.notEqual(config.comfyui.apiKey, "");
});
