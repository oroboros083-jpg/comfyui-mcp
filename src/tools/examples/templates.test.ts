import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getTemplate,
  TemplateNotFoundError,
  TemplateIsExampleError,
} from "./templates.js";
import { ToolError } from "../../utils/errors.js";
import type { ComfyUIClient } from "../../client/comfyui.js";

/** An instance with one checkpoint, enough for the standard txt2img builder. */
function client(): ComfyUIClient {
  return {
    getObjectInfo: async () => ({
      CheckpointLoaderSimple: {
        name: "CheckpointLoaderSimple",
        display_name: "Load Checkpoint",
        category: "loaders",
        description: "",
        input: {
          required: { ckpt_name: ["COMBO", { options: ["sdxl.safetensors"] }] },
        },
        output: ["MODEL", "CLIP", "VAE"],
        output_name: ["MODEL", "CLIP", "VAE"],
        output_is_list: [false, false, false],
      },
    }),
  } as unknown as ComfyUIClient;
}

test("getTemplate returns a structured result, not a JSON string", async () => {
  // A tool returning a string cannot populate structuredContent, and a
  // renderer cannot be written over it without casting the typing away.
  const result = await getTemplate(client(), { templateId: "standard_txt2img" });

  assert.equal(typeof result, "object");
  assert.equal(result.templateId, "standard_txt2img");
  assert.equal(result.source, "builtin");
  assert.equal(typeof result.workflow, "object");
  assert.equal(
    result.workflow["1"] &&
      (result.workflow["1"] as { inputs: { ckpt_name: string } }).inputs.ckpt_name,
    "sdxl.safetensors",
    "and it built against the installed checkpoint"
  );
});

test("an unknown template id is a failure, not a success carrying an error", async () => {
  await assert.rejects(
    () => getTemplate(client(), { templateId: "no_such_template" }),
    (err: unknown) =>
      err instanceof TemplateNotFoundError &&
      /comfyui_search_templates/.test(err.hint ?? "")
  );
});

test("an example workflow id says which tool actually serves it", async () => {
  // The id form here matches how getTemplate slugifies EXAMPLE_WORKFLOWS names.
  const { EXAMPLE_WORKFLOWS } = await import("./data.js");
  const first = EXAMPLE_WORKFLOWS[0];
  const slug = first.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");

  await assert.rejects(
    () => getTemplate(client(), { templateId: slug }),
    (err: unknown) =>
      err instanceof TemplateIsExampleError &&
      /comfyui_get_example_workflow/.test(err.hint ?? "")
  );
});

test("a template needing a model that is not installed names the remedy", async () => {
  const bare = { getObjectInfo: async () => ({}) } as unknown as ComfyUIClient;

  await assert.rejects(
    () => getTemplate(bare, { templateId: "standard_txt2img" }),
    (err: unknown) =>
      err instanceof ToolError && /comfyui_get_download_url/.test(err.hint ?? "")
  );
});
