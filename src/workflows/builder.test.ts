import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getAvailableModels,
  getFirstAvailableModel,
  buildStandardTxt2Img,
  buildFluxWorkflow,
  buildUnetClipWorkflow,
  buildFromTemplate,
  resolveClipType,
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
      err instanceof ToolError && /download_model/.test(err.hint ?? "")
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

// === unet_clip: UNETLoader + a SINGLE CLIPLoader ===

/** An object_info with the loaders a unet_clip graph needs. */
function unetClipInfo(clipTypes: string[] = ["flux", "qwen_image"]): ObjectInfo {
  return {
    ...loaderWith("UNETLoader", "unet_name", ["COMBO", { options: ["anima.safetensors"] }]),
    ...loaderWith("VAELoader", "vae_name", ["COMBO", { options: ["qwen_image_vae.safetensors"] }]),
    CLIPLoader: {
      name: "CLIPLoader",
      display_name: "CLIPLoader",
      category: "loaders",
      description: "",
      input: {
        required: {
          clip_name: ["COMBO", { options: ["qwen_3_06b_base.safetensors"] }],
          type: ["COMBO", { options: clipTypes }],
        },
      },
      output: [],
      output_name: [],
      output_is_list: [],
    },
    // Present but must NOT be used: the whole point of the shape is that a
    // single-encoder model does not get a DualCLIPLoader just because the
    // install happens to offer one.
    ...loaderWith("DualCLIPLoader", "clip_name1", ["COMBO", { options: ["t5.safetensors"] }]),
  } as unknown as ObjectInfo;
}

const UNET_CLIP_OPTS = {
  prompt: "a cat",
  negativePrompt: "blurry",
  width: 1024,
  height: 1024,
  steps: 30,
  cfg: 4.5,
  seed: 1,
  sampler: "euler",
  scheduler: "simple",
};

test("buildUnetClipWorkflow loads one CLIP, not a DualCLIPLoader", () => {
  const workflow = buildUnetClipWorkflow(UNET_CLIP_OPTS, unetClipInfo());
  const types = Object.values(workflow).map((n) => n.class_type);

  assert.ok(types.includes("CLIPLoader"));
  assert.ok(
    !types.includes("DualCLIPLoader"),
    "a single-encoder model must not be given a second encoder just because one is installed"
  );
  assert.ok(types.includes("UNETLoader"));
  assert.ok(types.includes("VAELoader"));
});

test("buildUnetClipWorkflow gives the negative prompt its own encoder", () => {
  // buildFluxWorkflow wires the negative back to the positive, because Flux
  // ignores it. These models do not, so a shared node would silently apply
  // the positive prompt as the negative.
  const workflow = buildUnetClipWorkflow(UNET_CLIP_OPTS, unetClipInfo());

  const sampler = Object.values(workflow).find((n) => n.class_type === "KSampler")!;
  const [posId] = sampler.inputs.positive as [string, number];
  const [negId] = sampler.inputs.negative as [string, number];

  assert.notEqual(posId, negId, "positive and negative must be distinct nodes");
  assert.equal(workflow[posId]!.inputs.text, "a cat");
  assert.equal(workflow[negId]!.inputs.text, "blurry");
});

test("buildUnetClipWorkflow passes CFG through instead of forcing 1", () => {
  const workflow = buildUnetClipWorkflow(UNET_CLIP_OPTS, unetClipInfo());
  const types = Object.values(workflow).map((n) => n.class_type);
  const sampler = Object.values(workflow).find((n) => n.class_type === "KSampler")!;

  assert.equal(sampler.inputs.cfg, 4.5);
  assert.ok(!types.includes("FluxGuidance"), "guidance is CFG here, not a node");
});

test("buildUnetClipWorkflow uses a 16-channel latent", () => {
  // These models pair with a 16-channel VAE; EmptyLatentImage is 4-channel
  // and the decoder rejects its shape.
  const workflow = buildUnetClipWorkflow(UNET_CLIP_OPTS, unetClipInfo());
  const types = Object.values(workflow).map((n) => n.class_type);

  assert.ok(types.includes("EmptySD3LatentImage"));
  assert.ok(!types.includes("EmptyLatentImage"));
});

test("resolveClipType honours preference order, then falls back", () => {
  const info = unetClipInfo(["flux", "qwen_image", "sd3"]);

  assert.equal(resolveClipType(info, ["qwen_image"]), "qwen_image");
  // First preference absent, second present.
  assert.equal(resolveClipType(info, ["nope", "sd3"]), "sd3");
  // Nothing matches: a real option beats a rejected graph.
  assert.equal(resolveClipType(info, ["nope"]), "flux");
  assert.equal(resolveClipType(info), "flux");
});

test("resolveClipType matches case-insensitively", () => {
  assert.equal(resolveClipType(unetClipInfo(["Qwen_Image"]), ["qwen_image"]), "Qwen_Image");
});

test("resolveClipType passes the hint through when the node has no combo", () => {
  // Older builds typed `type` as a free string. Omitting a required input is
  // worse than sending the caller's best guess.
  const info = { CLIPLoader: { input: { required: {} } } } as unknown as ObjectInfo;
  assert.equal(resolveClipType(info, ["qwen_image"]), "qwen_image");
});

test("the anima template builds a unet_clip graph end to end", () => {
  const workflow = buildFromTemplate("anima_txt2img", { prompt: "1girl, solo" }, unetClipInfo());
  assert.ok(workflow, "template should build");

  const types = Object.values(workflow!).map((n) => n.class_type);
  assert.ok(types.includes("CLIPLoader"));
  assert.ok(!types.includes("DualCLIPLoader"));

  const clipLoader = Object.values(workflow!).find((n) => n.class_type === "CLIPLoader")!;
  assert.equal(clipLoader.inputs.type, "qwen_image", "clipTypeHints should reach the graph");
});
