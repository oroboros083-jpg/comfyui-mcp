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
