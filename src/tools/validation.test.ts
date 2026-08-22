import { test } from "node:test";
import assert from "node:assert/strict";

import { validateWorkflow, similarOptions } from "./validation.js";
import { ResponseFormat } from "../utils/response.js";
import type { ComfyUIClient, ObjectInfo } from "../client/comfyui.js";

function node(overrides: Record<string, unknown>): ObjectInfo[string] {
  return {
    name: "N",
    display_name: "N",
    category: "testing",
    description: "",
    input: { required: {}, optional: {} },
    output: [],
    output_name: [],
    output_is_list: [],
    ...overrides,
  } as unknown as ObjectInfo[string];
}

function clientReturning(objectInfo: ObjectInfo): ComfyUIClient {
  return { getObjectInfo: async () => objectInfo } as unknown as ComfyUIClient;
}

const base = { response_format: ResponseFormat.JSON } as const;

function warnings(result: { warnings: Array<{ type: string }> }): string[] {
  return result.warnings.map((w) => w.type);
}

test("a custom video sink counts as an output node", async () => {
  // VHS_VideoCombine is the standard video output from ComfyUI-VideoHelperSuite
  // and contains neither "Save" nor "Preview", so the old name heuristic warned
  // that a working video workflow might produce nothing retrievable.
  const client = clientReturning({
    VHS_VideoCombine: node({ name: "VHS_VideoCombine", output_node: true }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: { "1": { class_type: "VHS_VideoCombine", inputs: {} } },
  });

  assert.equal(warnings(result).includes("no_output_node"), false);
});

test("a workflow that really has no sink is still warned about", async () => {
  const client = clientReturning({
    KSampler: node({ name: "KSampler", output_node: false, output: ["LATENT"] }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: { "1": { class_type: "KSampler", inputs: {} } },
  });

  assert.equal(warnings(result).includes("no_output_node"), true);
});

test("SaveImage is recognised through the flag as before", async () => {
  const client = clientReturning({
    SaveImage: node({ name: "SaveImage", output_node: true }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: { "1": { class_type: "SaveImage", inputs: {} } },
  });

  assert.equal(warnings(result).includes("no_output_node"), false);
});

test("a build that does not publish the flag falls back to the name", async () => {
  // output_node absent entirely - very old ComfyUI.
  const client = clientReturning({
    SaveImage: node({ name: "SaveImage" }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: { "1": { class_type: "SaveImage", inputs: {} } },
  });

  assert.equal(warnings(result).includes("no_output_node"), false);
});

test("a COMBO output does not take validate_workflow down", async () => {
  // The output slot arrives as its array of options; a bare toUpperCase on
  // it threw TypeError and failed the whole call, which is the crash
  // outputTypeName was written to stop.
  const client = clientReturning({
    ComboSource: node({
      name: "ComboSource",
      output: [["euler", "dpmpp_2m"]],
      output_name: ["sampler"],
    }),
    SaveImage: node({ name: "SaveImage", output: [], output_name: [] }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: {
      "1": { class_type: "ComboSource", inputs: {} },
      "2": { class_type: "SaveImage", inputs: {} },
    },
  });

  assert.equal(Array.isArray(result.errors), true);
  assert.equal(
    result.errors.some((e) => e.type === "unknown_node"),
    false
  );
});

test("a node that declares no output array is not a crash either", async () => {
  const client = clientReturning({
    Odd: node({ name: "Odd", output: undefined, output_name: undefined }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: { "1": { class_type: "Odd", inputs: {} } },
  });

  assert.equal(Array.isArray(result.errors), true);
});

/**
 * A value that is not among a combo's options is the failure this tool exists
 * to catch: ComfyUI answers it from /prompt with "Value not in list", naming
 * neither which installed file was meant nor what to call next.
 */

function errors(result: { errors: Array<{ type: string; message: string }> }) {
  return result.errors;
}

test("a checkpoint that is not installed is caught before submitting", async () => {
  const client = clientReturning({
    CheckpointLoaderSimple: node({
      name: "CheckpointLoaderSimple",
      output_node: false,
      output: ["MODEL", "CLIP", "VAE"],
      input: {
        required: { ckpt_name: [["sd_xl_base_1.0.safetensors", "v1-5-pruned-emaonly.ckpt"]] },
        optional: {},
      },
    }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sd_xl_base.safetensors" } },
    },
  });

  assert.equal(result.valid, false);
  const found = errors(result).find((e) => e.type === "invalid_value");
  assert.ok(found, "expected an invalid_value error");
  // The near-match is the remedy: the agent retries with this name.
  assert.match(found.message, /sd_xl_base_1\.0\.safetensors/);
});

test("an unrecognisable value names the tool that lists the real ones", async () => {
  const client = clientReturning({
    CheckpointLoaderSimple: node({
      name: "CheckpointLoaderSimple",
      output_node: false,
      output: ["MODEL"],
      input: { required: { ckpt_name: [["v1-5-pruned-emaonly.ckpt"]] }, optional: {} },
    }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "juggernautXL.safetensors" } },
    },
  });

  const found = errors(result).find((e) => e.type === "invalid_value");
  assert.ok(found);
  assert.match(found.message, /comfyui_list_models/);
  // The whole option list is never pasted into the message.
  assert.ok(found.message.length < 400, `message was ${found.message.length} chars`);
});

test("an input with nothing installed says so instead of suggesting nothing", async () => {
  const client = clientReturning({
    UNETLoader: node({
      name: "UNETLoader",
      output_node: false,
      output: ["MODEL"],
      input: { required: { unet_name: [[]] }, optional: {} },
    }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: { "1": { class_type: "UNETLoader", inputs: { unet_name: "flux1-dev.safetensors" } } },
  });

  const found = errors(result).find((e) => e.type === "invalid_value");
  assert.ok(found);
  assert.match(found.message, /comfyui_get_model_guide/);
});

test("a correct value is not reported at all", async () => {
  const client = clientReturning({
    KSampler: node({
      name: "KSampler",
      output_node: false,
      output: ["LATENT"],
      input: { required: { sampler_name: [["euler", "dpmpp_2m"]] }, optional: {} },
    }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: { "1": { class_type: "KSampler", inputs: { sampler_name: "dpmpp_2m" } } },
  });

  assert.deepEqual(errors(result), []);
});

test("an image not in the listing warns, and points at the upload tool", async () => {
  // LoadImage validates its own filename and accepts more than object_info
  // lists - a file inside a subfolder never appears there - so erroring here
  // would fail a workflow that runs.
  const client = clientReturning({
    LoadImage: node({
      name: "LoadImage",
      output_node: false,
      output: ["IMAGE", "MASK"],
      input: { required: { image: [["already_there.png"], { image_upload: true }] }, optional: {} },
    }),
    PreviewImage: node({ name: "PreviewImage", output_node: true }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: {
      "1": { class_type: "LoadImage", inputs: { image: "refs/photo.png" } },
      "2": { class_type: "PreviewImage", inputs: { images: ["1", 0] } },
    },
  });

  assert.equal(result.valid, true, "a subfolder reference must not fail validation");
  const warned = result.warnings.find((w) => w.type === "unverified_file");
  assert.ok(warned, "expected an unverified_file warning");
  assert.match(warned.message, /comfyui_upload_image/);
});

test("an optional input is checked the same way a required one is", async () => {
  const client = clientReturning({
    LoraLoader: node({
      name: "LoraLoader",
      output_node: false,
      output: ["MODEL", "CLIP"],
      input: {
        required: {},
        optional: { lora_name: [["detail_tweaker_xl.safetensors"]] },
      },
    }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: { "1": { class_type: "LoraLoader", inputs: { lora_name: "add_detail.safetensors" } } },
  });

  assert.ok(errors(result).some((e) => e.type === "invalid_value"));
});

test("a connection into a combo input is left alone", async () => {
  // Value-checking a [nodeId, slot] pair would report every wired combo as a
  // filename that does not exist.
  const client = clientReturning({
    Upstream: node({ name: "Upstream", output_node: false, output: ["STRING"] }),
    Consumer: node({
      name: "Consumer",
      output_node: true,
      input: { required: { choice: [["a", "b"]] }, optional: {} },
    }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: {
      "1": { class_type: "Upstream", inputs: {} },
      "2": { class_type: "Consumer", inputs: { choice: ["1", 0] } },
    },
  });

  assert.equal(errors(result).some((e) => e.type === "invalid_value"), false);
});

test("suggestions are ranked, capped, and empty when nothing is close", () => {
  const options = [
    "sd_xl_base_1.0.safetensors",
    "sd_xl_refiner_1.0.safetensors",
    "sd_xl_turbo_1.0.safetensors",
    "sd_xl_lightning.safetensors",
    "flux1-dev.safetensors",
  ];

  const close = similarOptions("sd_xl_base.safetensors", options);
  assert.equal(close[0], "sd_xl_base_1.0.safetensors");
  assert.ok(close.length <= 3, "never more than three");

  assert.deepEqual(similarOptions("wan2.2_ti2v_5B.safetensors", options), []);
  // A difference of case only is the likeliest single mistake, so it leads.
  assert.deepEqual(similarOptions("FLUX1-DEV.safetensors", options), ["flux1-dev.safetensors"]);
});
