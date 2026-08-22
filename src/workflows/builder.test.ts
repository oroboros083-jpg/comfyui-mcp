import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getAvailableModels,
  getFirstAvailableModel,
  buildStandardTxt2Img,
  buildFluxWorkflow,
} from "./builder.js";
import { ToolError } from "../utils/errors.js";
import type { ObjectInfo } from "../client/comfyui.js";

/** An object_info carrying one loader whose combo uses the given spec. */
function loaderWith(node: string, field: string, spec: unknown): ObjectInfo {
  return {
    [node]: {
      name: node,
      display_name: node,
      category: "loaders",
      description: "",
      input: { required: { [field]: spec } },
      output: [],
      output_name: [],
      output_is_list: [],
    },
  } as unknown as ObjectInfo;
}

const LEGACY = [["a.safetensors", "b.safetensors"], {}];
const CURRENT = ["COMBO", { options: ["a.safetensors", "b.safetensors"] }];

test("getAvailableModels reads the legacy combo form", () => {
  const info = loaderWith("CheckpointLoaderSimple", "ckpt_name", LEGACY);
  assert.deepEqual(getAvailableModels(info, "CheckpointLoaderSimple", "ckpt_name"), [
    "a.safetensors",
    "b.safetensors",
  ]);
});

test("getAvailableModels reads the current COMBO form", () => {
  // This is the form a stock ComfyUI 0.8.x desktop install serves. Reading
  // only the legacy shape reported every loader as empty, which sent the
  // builders to a placeholder checkpoint name that does not exist on disk.
  const info = loaderWith("CheckpointLoaderSimple", "ckpt_name", CURRENT);
  assert.deepEqual(getAvailableModels(info, "CheckpointLoaderSimple", "ckpt_name"), [
    "a.safetensors",
    "b.safetensors",
  ]);
});

test("getFirstAvailableModel reports absence as null, not as a guess", () => {
  assert.equal(
    getFirstAvailableModel(loaderWith("X", "y", ["COMBO", { options: [] }]), "X", "y"),
    null
  );
  assert.equal(getFirstAvailableModel({} as ObjectInfo, "Missing", "field"), null);
});

test("buildStandardTxt2Img picks a real checkpoint from a current-form combo", () => {
  const info = loaderWith("CheckpointLoaderSimple", "ckpt_name", CURRENT);
  const workflow = buildStandardTxt2Img(
    {
      prompt: "a cat",
      width: 512,
      height: 512,
      steps: 20,
      cfg: 7,
      seed: 1,
      sampler: "euler",
      scheduler: "normal",
      batchSize: 1,
    },
    info
  );

  assert.equal(workflow["1"].inputs.ckpt_name, "a.safetensors");
});

test("buildStandardTxt2Img names the remedy when no checkpoint is installed", () => {
  // Previously emitted ckpt_name: "model.safetensors", which fails inside
  // ComfyUI as a validation error about an input the caller never chose.
  assert.throws(
    () =>
      buildStandardTxt2Img(
        {
          prompt: "a cat",
          width: 512,
          height: 512,
          steps: 20,
          cfg: 7,
          seed: 1,
          sampler: "euler",
          scheduler: "normal",
          batchSize: 1,
        },
        {} as ObjectInfo
      ),
    (err: unknown) =>
      err instanceof ToolError && /comfyui_get_download_url/.test(err.hint ?? "")
  );
});

test("buildFluxWorkflow refuses rather than emitting a null unet_name", () => {
  assert.throws(
    () =>
      buildFluxWorkflow(
        {
          prompt: "a cat",
          width: 1024,
          height: 1024,
          steps: 20,
          guidance: 3.5,
          seed: 1,
          sampler: "euler",
          scheduler: "simple",
        },
        {} as ObjectInfo
      ),
    (err: unknown) => err instanceof ToolError
  );
});

/** An object_info with the loaders a Flux build needs, and the given CLIP list. */
function fluxObjectInfo(clips: string[]): ObjectInfo {
  const loader = (field: string, options: string[]) => ({
    name: "L",
    display_name: "L",
    category: "loaders",
    description: "",
    input: { required: { [field]: ["COMBO", { options }] } },
    output: [],
    output_name: [],
    output_is_list: [],
  });

  return {
    UNETLoader: loader("unet_name", ["flux1-dev.safetensors"]),
    VAELoader: loader("vae_name", ["ae.safetensors"]),
    DualCLIPLoader: loader("clip_name1", clips),
  } as unknown as ObjectInfo;
}

const FLUX_OPTIONS = {
  prompt: "a cat",
  width: 1024,
  height: 1024,
  steps: 20,
  guidance: 3.5,
  seed: 1,
  sampler: "euler",
  scheduler: "simple",
};

function dualClipInputs(clips: string[]): Record<string, unknown> {
  const workflow = buildFluxWorkflow(FLUX_OPTIONS, fluxObjectInfo(clips));
  const node = Object.values(workflow).find((n) => n.class_type === "DualCLIPLoader");
  assert.ok(node, "a DualCLIPLoader was emitted");
  return node.inputs as Record<string, unknown>;
}

test("DualCLIPLoader does not put the T5 in both slots", () => {
  // The fallback took clipModels[1] positionally, which is the T5 itself on
  // the common ["clip_g", "t5xxl"] layout - so both slots named the same
  // encoder and the usable clip_g at index 0 was ignored.
  const inputs = dualClipInputs(["clip_g.safetensors", "t5xxl_fp16.safetensors"]);

  assert.equal(inputs.clip_name2, "t5xxl_fp16.safetensors");
  assert.equal(inputs.clip_name1, "clip_g.safetensors");
  assert.notEqual(inputs.clip_name1, inputs.clip_name2);
});

test("DualCLIPLoader still prefers a clip_l when one is installed", () => {
  const inputs = dualClipInputs([
    "t5xxl_fp16.safetensors",
    "clip_g.safetensors",
    "clip_l.safetensors",
  ]);

  assert.equal(inputs.clip_name1, "clip_l.safetensors");
  assert.equal(inputs.clip_name2, "t5xxl_fp16.safetensors");
});

test("DualCLIPLoader picks distinct encoders whatever the ordering", () => {
  for (const clips of [
    ["t5xxl_fp16.safetensors", "clip_g.safetensors"],
    ["clip_g.safetensors", "t5xxl_fp16.safetensors"],
    ["t5xxl_fp8_e4m3fn.safetensors", "clip_g_vision.safetensors"],
  ]) {
    const inputs = dualClipInputs(clips);
    assert.notEqual(inputs.clip_name1, inputs.clip_name2, clips.join(", "));
  }
});

test("a lone CLIP model is reused rather than emitting nothing", () => {
  // Nothing better is available; both slots at least name a real file.
  const inputs = dualClipInputs(["t5xxl_fp16.safetensors"]);

  assert.equal(inputs.clip_name1, "t5xxl_fp16.safetensors");
  assert.equal(inputs.clip_name2, "t5xxl_fp16.safetensors");
});
