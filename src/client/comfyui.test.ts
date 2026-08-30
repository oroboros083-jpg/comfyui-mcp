import { test } from "node:test";
import assert from "node:assert/strict";

import { comboOptions, ComfyUIClient } from "./comfyui.js";
import { ToolError } from "../utils/errors.js";

/**
 * ComfyUI serves both combo-input formats from a single instance - core nodes
 * still use the legacy one while others have moved to the tagged one. Reading
 * only the legacy form reports an installed model as missing rather than
 * failing, which is why each shape is pinned here.
 */

test("comboOptions reads the legacy [options, meta] form", () => {
  const spec = [["a.safetensors", "b.safetensors"], { tooltip: "pick one" }];
  assert.deepEqual(comboOptions(spec), ["a.safetensors", "b.safetensors"]);
});

test("comboOptions reads the current COMBO form", () => {
  // Verbatim shape served by UpscaleModelLoader on a stock desktop install.
  const spec = [
    "COMBO",
    { multiselect: false, options: ["RealESRGAN_x4plus.safetensors", "remacri_original.safetensors"] },
  ];
  assert.deepEqual(comboOptions(spec), [
    "RealESRGAN_x4plus.safetensors",
    "remacri_original.safetensors",
  ]);
});

test("comboOptions reports an empty combo as empty, not as absent data", () => {
  assert.deepEqual(comboOptions([[], {}]), []);
  assert.deepEqual(comboOptions(["COMBO", { options: [] }]), []);
});

test("comboOptions ignores a non-combo input rather than throwing", () => {
  // Loader fields are not always combos - INT/STRING/BOOLEAN inputs reach here
  // too when a node's shape differs from what the table assumes.
  assert.deepEqual(comboOptions(["INT", { default: 20, min: 1 }]), []);
  assert.deepEqual(comboOptions(["STRING", { multiline: true }]), []);
  assert.deepEqual(comboOptions(undefined), []);
  assert.deepEqual(comboOptions(null), []);
  assert.deepEqual(comboOptions([]), []);
  assert.deepEqual(comboOptions("COMBO"), []);
});

test("comboOptions drops non-string options", () => {
  // Some custom nodes put objects in a combo; those are not model filenames.
  assert.deepEqual(comboOptions([["a.safetensors", 3, null, "b.ckpt"], {}]), [
    "a.safetensors",
    "b.ckpt",
  ]);
  assert.deepEqual(
    comboOptions(["COMBO", { options: ["a.safetensors", { name: "x" }] }]),
    ["a.safetensors"]
  );
});

/** Swap global fetch for the duration of one test. */
async function withFetch<T>(
  stub: (url: string, init?: RequestInit) => Promise<Response>,
  body: () => Promise<T>
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = stub as unknown as typeof fetch;
  try {
    return await body();
  } finally {
    globalThis.fetch = original;
  }
}

const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

test("invalidateObjectInfo abandons the download already in flight", async () => {
  // A restart lands while /object_info is downloading. Clearing only the
  // cache let the older request write the pre-restart catalogue back after
  // the invalidation, so list_nodes and validate_workflow reported a newly
  // installed node as missing right after the reconnect meant to pick it up.
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let call = 0;

  const client = new ComfyUIClient("http://127.0.0.1:8188");

  await withFetch(
    async (url) => {
      if (!url.includes("/object_info")) return json({});
      call++;
      if (call === 1) {
        await gate;
        return json({ OldNode: { input: { required: {} } } });
      }
      return json({ NewNode: { input: { required: {} } } });
    },
    async () => {
      const first = client.getObjectInfo();
      client.invalidateObjectInfo();
      release();
      await first;

      const after = await client.getObjectInfo();
      assert.ok("NewNode" in after, "the post-restart catalogue is served");
      assert.equal("OldNode" in after, false, "not the one that was in flight");
    }
  );
});

test("concurrent readers still share one download", async () => {
  let calls = 0;
  const client = new ComfyUIClient("http://127.0.0.1:8188");

  await withFetch(
    async () => {
      calls++;
      return json({ KSampler: { input: { required: {} } } });
    },
    async () => {
      await Promise.all([client.getObjectInfo(), client.getObjectInfo(), client.getObjectInfo()]);
      assert.equal(calls, 1);
    }
  );
});

test("a network failure on submit carries the remedy", async () => {
  // queuePrompt was the last bare fetch, so ComfyUI stopping between the
  // health probe and the submit surfaced as an undecorated
  // "comfyui_run_workflow failed: fetch failed" with no hint.
  const client = new ComfyUIClient("http://127.0.0.1:8188");

  await withFetch(
    async () => {
      throw new TypeError("fetch failed");
    },
    async () => {
      await assert.rejects(client.queuePrompt({}), (err: unknown) => {
        assert.ok(err instanceof ToolError, `got ${String(err)}`);
        assert.match(err.message, /Could not reach ComfyUI/);
        assert.match(err.hint ?? "", /comfyui_get_status/);
        return true;
      });
    }
  );
});

test("a network failure on upload carries the remedy too", async () => {
  const client = new ComfyUIClient("http://127.0.0.1:8188");

  await withFetch(
    async () => {
      throw new TypeError("fetch failed");
    },
    async () => {
      await assert.rejects(
        client.uploadImage(Buffer.from([1, 2, 3]), "a.png"),
        (err: unknown) => err instanceof ToolError && /Could not reach ComfyUI/.test(err.message)
      );
    }
  );
});

test("ComfyUI's own validation errors are still preserved on submit", async () => {
  // The non-ok body is far more useful than the status, so send() must not
  // swallow it the way request() would.
  const client = new ComfyUIClient("http://127.0.0.1:8188");

  await withFetch(
    async () =>
      new Response('{"error":{"message":"KSampler.seed is required"}}', {
        status: 400,
        statusText: "Bad Request",
      }),
    async () => {
      await assert.rejects(client.queuePrompt({}), (err: unknown) => {
        assert.ok(err instanceof ToolError);
        assert.match(err.message, /KSampler\.seed is required/);
        assert.match(err.hint ?? "", /validate_workflow/);
        return true;
      });
    }
  );
});
