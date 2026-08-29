import { ObjectInfo, comboOptions } from "../client/comfyui.js";
import { ToolError } from "../utils/errors.js";
import { architectureById } from "../architectures/registry.js";

export interface WorkflowNode {
  class_type: string;
  inputs: Record<string, unknown>;
}

export type Workflow = Record<string, WorkflowNode>;

// === Template System ===

export interface TemplateParameter {
  name: string;
  type: "string" | "number" | "boolean" | "model" | "sampler" | "scheduler";
  required: boolean;
  default?: unknown;
  description: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  /**
   * Which models this template suits. Mostly a graph-shape label rather than
   * an identity - `flux` here means "UNETLoader + DualCLIPLoader", which is
   * why several non-Flux architectures legitimately match it. `qwen` and
   * `anima` are named individually because their single-encoder graph is a
   * different shape, not because they are special.
   */
  modelType: "sd15" | "sdxl" | "sd3" | "flux" | "qwen" | "anima" | "any";
  taskType: "txt2img" | "img2img" | "inpaint" | "controlnet" | "upscale" | "video" | "audio";
  category: string;
  requiredNodes: string[];
  parameters: TemplateParameter[];
  defaultSettings: {
    steps: number;
    cfg: number;
    width: number;
    height: number;
    sampler?: string;
    scheduler?: string;
  };
}

export interface Txt2ImgOptions {
  prompt: string;
  negativePrompt?: string;
  checkpoint?: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  seed: number;
  sampler: string;
  scheduler: string;
  batchSize: number;
}

export interface FluxOptions {
  prompt: string;
  unet?: string;
  clip?: string;
  vae?: string;
  width: number;
  height: number;
  steps: number;
  guidance: number;
  seed: number;
  sampler: string;
  scheduler: string;
}

/**
 * Get all available models of a type.
 *
 * Reads the loader combo through `comboOptions`, which is the one place that
 * knows both spellings ComfyUI uses for a dropdown. The hand-rolled check this
 * replaced understood only the legacy `[[opts], meta]` form, so on a current
 * instance every loader looked empty and the builders below fell back to a
 * placeholder checkpoint name or emitted a null one.
 */
export function getAvailableModels(
  objectInfo: ObjectInfo,
  loaderNode: string,
  inputField: string
): string[] {
  return comboOptions(objectInfo[loaderNode]?.input?.required?.[inputField]);
}

/**
 * Get the first available model of a type from object_info
 */
export function getFirstAvailableModel(
  objectInfo: ObjectInfo,
  loaderNode: string,
  inputField: string
): string | null {
  return getAvailableModels(objectInfo, loaderNode, inputField)[0] ?? null;
}

/**
 * The model to load, or a failure that names how to get one.
 *
 * A builder that cannot find a model used to emit the name `null` (or the
 * placeholder "model.safetensors"), which reaches ComfyUI as an opaque
 * validation error about an input the caller never chose. Nothing downstream
 * can recover from that, so it fails here instead, where the reason is known.
 */
function requireModel(
  objectInfo: ObjectInfo,
  loaderNode: string,
  inputField: string,
  what: string
): string {
  const model = getFirstAvailableModel(objectInfo, loaderNode, inputField);
  if (model) return model;

  throw new ToolError(
    `No ${what} is installed on this ComfyUI, so this template cannot be built.`,
    `The official Comfy MCP's \`search_models\` shows what is installed and \`download_model\` fetches a ${what} this template can use.`
  );
}

/**
 * Build a standard txt2img workflow for SD 1.5 / SDXL
 */
export function buildStandardTxt2Img(
  options: Txt2ImgOptions,
  objectInfo: ObjectInfo
): Workflow {
  // Get checkpoint if not specified
  const checkpoint =
    options.checkpoint ||
    requireModel(objectInfo, "CheckpointLoaderSimple", "ckpt_name", "checkpoint");

  const seed =
    options.seed === -1 ? Math.floor(Math.random() * 2147483647) : options.seed;

  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: checkpoint,
      },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["1", 1],
        text: options.prompt,
      },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["1", 1],
        text: options.negativePrompt || "",
      },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: {
        width: options.width,
        height: options.height,
        batch_size: options.batchSize,
      },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
        seed: seed,
        steps: options.steps,
        cfg: options.cfg,
        sampler_name: options.sampler,
        scheduler: options.scheduler,
        denoise: 1,
      },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["5", 0],
        vae: ["1", 2],
      },
    },
    "7": {
      class_type: "SaveImage",
      inputs: {
        images: ["6", 0],
        filename_prefix: "ComfyUI_MCP",
      },
    },
  };
}

/**
 * Build a Flux workflow (uses separate UNET/CLIP/VAE loaders)
 */
export function buildFluxWorkflow(
  options: FluxOptions,
  objectInfo: ObjectInfo
): Workflow {
  const unet =
    options.unet || requireModel(objectInfo, "UNETLoader", "unet_name", "UNET model");
  const vae =
    options.vae || requireModel(objectInfo, "VAELoader", "vae_name", "VAE");

  // Flux uses DualCLIPLoader
  const hasDualClip = "DualCLIPLoader" in objectInfo;

  const seed =
    options.seed === -1 ? Math.floor(Math.random() * 2147483647) : options.seed;

  const workflow: Workflow = {
    "1": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: unet,
        weight_dtype: "default",
      },
    },
  };

  if (hasDualClip) {
    // Get available CLIP models. Both slots must name a real file: an
    // undefined one is dropped by JSON.stringify and reaches ComfyUI as a
    // missing required input rather than as "no CLIP model installed".
    const clipModels = getAvailableModels(objectInfo, "DualCLIPLoader", "clip_name1");
    if (clipModels.length === 0) {
      throw new ToolError(
        "No CLIP model is installed, so a Flux workflow cannot be built.",
        "Flux needs both a T5 and a CLIP-L encoder. The official Comfy MCP's `search_models` shows what is installed and `download_model` fetches the missing one."
      );
    }
    const t5Model = clipModels.find((m) => m.toLowerCase().includes("t5")) || clipModels[0];
    // The second slot needs a model that is not the T5. Falling back to
    // clipModels[1] positionally picked the T5 again whenever it happened to
    // sit at index 1 - which it does on the common ["clip_g", "t5xxl"]
    // layout - so both slots named the same encoder and the usable clip_g at
    // index 0 was ignored. Only when there is genuinely nothing else does the
    // T5 get reused, which at least names a real file.
    const clipModel =
      clipModels.find((m) => m.toLowerCase().includes("clip_l")) ||
      clipModels.find((m) => m !== t5Model) ||
      t5Model;

    workflow["2"] = {
      class_type: "DualCLIPLoader",
      inputs: {
        clip_name1: clipModel,
        clip_name2: t5Model,
        type: "flux",
      },
    };
  } else {
    workflow["2"] = {
      class_type: "CLIPLoader",
      inputs: {
        clip_name:
          options.clip || requireModel(objectInfo, "CLIPLoader", "clip_name", "CLIP model"),
        type: "flux",
      },
    };
  }

  workflow["3"] = {
    class_type: "VAELoader",
    inputs: {
      vae_name: vae,
    },
  };

  workflow["4"] = {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: ["2", 0],
      text: options.prompt,
    },
  };

  workflow["5"] = {
    class_type: "EmptySD3LatentImage",
    inputs: {
      width: options.width,
      height: options.height,
      batch_size: 1,
    },
  };

  // Check if FluxGuidance node exists
  const hasFluxGuidance = "FluxGuidance" in objectInfo;

  if (hasFluxGuidance) {
    workflow["6"] = {
      class_type: "FluxGuidance",
      inputs: {
        conditioning: ["4", 0],
        guidance: options.guidance,
      },
    };

    workflow["7"] = {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["6", 0],
        negative: ["4", 0], // Flux ignores negative but needs it
        latent_image: ["5", 0],
        seed: seed,
        steps: options.steps,
        cfg: 1, // Flux uses guidance through FluxGuidance node
        sampler_name: options.sampler,
        scheduler: options.scheduler,
        denoise: 1,
      },
    };
  } else {
    workflow["7"] = {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["4", 0],
        negative: ["4", 0],
        latent_image: ["5", 0],
        seed: seed,
        steps: options.steps,
        cfg: options.guidance,
        sampler_name: options.sampler,
        scheduler: options.scheduler,
        denoise: 1,
      },
    };
  }

  workflow["8"] = {
    class_type: "VAEDecode",
    inputs: {
      samples: ["7", 0],
      vae: ["3", 0],
    },
  };

  workflow["9"] = {
    class_type: "SaveImage",
    inputs: {
      images: ["8", 0],
      filename_prefix: "ComfyUI_MCP_Flux",
    },
  };

  return workflow;
}

export interface UnetClipOptions {
  prompt: string;
  negativePrompt?: string;
  unet?: string;
  clip?: string;
  vae?: string;
  /**
   * Preferred CLIPLoader `type` values, best first. The first one this
   * ComfyUI actually offers wins; see `resolveClipType`.
   */
  clipTypePreference?: string[];
  width: number;
  height: number;
  steps: number;
  cfg: number;
  seed: number;
  sampler: string;
  scheduler: string;
}

/**
 * Pick a `type` for CLIPLoader that this ComfyUI will accept.
 *
 * The combo's contents move between ComfyUI versions as encoders are added,
 * so a hardcoded string is a graph that stops validating after an update.
 * Preference order first, then whatever the node actually offers.
 */
export function resolveClipType(
  objectInfo: ObjectInfo,
  preference: string[] = []
): string | undefined {
  const available = comboOptions(objectInfo["CLIPLoader"]?.input?.required?.type);
  if (available.length === 0) {
    // Older builds typed this as a free string rather than a combo. Passing
    // the caller's first preference through is better than omitting a
    // required input.
    return preference[0];
  }

  const lower = new Map(available.map((opt) => [opt.toLowerCase(), opt]));
  for (const want of preference) {
    const hit = lower.get(want.toLowerCase());
    if (hit) return hit;
  }
  return available[0];
}

/**
 * Build a workflow for models that load a bare UNET but need only ONE text
 * encoder: UNETLoader + CLIPLoader + VAELoader.
 *
 * Distinct from `buildFluxWorkflow` in two ways that matter beyond the loader
 * count. These models take a real negative prompt, so the negative branch gets
 * its own CLIPTextEncode rather than being wired back to the positive one; and
 * they take a real CFG, so there is no FluxGuidance node and `cfg` is passed
 * to the sampler as given.
 */
export function buildUnetClipWorkflow(
  options: UnetClipOptions,
  objectInfo: ObjectInfo
): Workflow {
  const unet =
    options.unet || requireModel(objectInfo, "UNETLoader", "unet_name", "UNET model");
  const clip =
    options.clip || requireModel(objectInfo, "CLIPLoader", "clip_name", "CLIP model");
  const vae = options.vae || requireModel(objectInfo, "VAELoader", "vae_name", "VAE");

  const seed =
    options.seed === -1 ? Math.floor(Math.random() * 2147483647) : options.seed;

  const clipType = resolveClipType(objectInfo, options.clipTypePreference);

  const workflow: Workflow = {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: unet, weight_dtype: "default" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: clip,
        // Omitted rather than set to undefined: JSON.stringify drops an
        // undefined value, and the node would then report a missing required
        // input instead of using its own default.
        ...(clipType ? { type: clipType } : {}),
      },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: vae },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["2", 0], text: options.prompt },
    },
    "5": {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["2", 0], text: options.negativePrompt ?? "" },
    },
    "6": {
      // 16-channel latent: these models pair with a 16-channel VAE, so the
      // 4-channel EmptyLatentImage produces a shape the decoder rejects.
      class_type: "EmptySD3LatentImage",
      inputs: { width: options.width, height: options.height, batch_size: 1 },
    },
    "7": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["4", 0],
        negative: ["5", 0],
        latent_image: ["6", 0],
        seed,
        steps: options.steps,
        cfg: options.cfg,
        sampler_name: options.sampler,
        scheduler: options.scheduler,
        denoise: 1,
      },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: { samples: ["7", 0], vae: ["3", 0] },
    },
    "9": {
      class_type: "SaveImage",
      inputs: { images: ["8", 0], filename_prefix: "ComfyUI_MCP_UnetClip" },
    },
  };

  return workflow;
}

// === Built-in Workflow Templates ===

export const BUILTIN_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "standard_txt2img",
    name: "Standard Text-to-Image",
    description: "Basic txt2img workflow for SD1.5/SDXL using CheckpointLoaderSimple. Works with any checkpoint model.",
    modelType: "any",
    taskType: "txt2img",
    category: "basics",
    requiredNodes: ["CheckpointLoaderSimple", "KSampler", "CLIPTextEncode", "EmptyLatentImage", "VAEDecode", "SaveImage"],
    parameters: [
      { name: "prompt", type: "string", required: true, description: "Positive prompt describing what to generate" },
      { name: "negativePrompt", type: "string", required: false, default: "", description: "Negative prompt describing what to avoid" },
      { name: "checkpoint", type: "model", required: false, description: "Checkpoint model to use (auto-selects if not provided)" },
      { name: "width", type: "number", required: false, default: 512, description: "Image width in pixels" },
      { name: "height", type: "number", required: false, default: 512, description: "Image height in pixels" },
      { name: "steps", type: "number", required: false, default: 20, description: "Number of sampling steps" },
      { name: "cfg", type: "number", required: false, default: 7, description: "CFG scale / classifier-free guidance" },
      { name: "seed", type: "number", required: false, default: -1, description: "Random seed (-1 for random)" },
      { name: "sampler", type: "sampler", required: false, default: "euler", description: "Sampler algorithm" },
      { name: "scheduler", type: "scheduler", required: false, default: "normal", description: "Scheduler type" },
      { name: "batchSize", type: "number", required: false, default: 1, description: "Number of images to generate" },
    ],
    defaultSettings: {
      steps: 20,
      cfg: 7,
      width: 512,
      height: 512,
      sampler: "euler",
      scheduler: "normal",
    },
  },
  {
    id: "sdxl_txt2img",
    name: "SDXL Text-to-Image",
    description: "Optimized txt2img for SDXL models at 1024x1024 resolution.",
    modelType: "sdxl",
    taskType: "txt2img",
    category: "sdxl",
    requiredNodes: ["CheckpointLoaderSimple", "KSampler", "CLIPTextEncode", "EmptyLatentImage", "VAEDecode", "SaveImage"],
    parameters: [
      { name: "prompt", type: "string", required: true, description: "Positive prompt describing what to generate" },
      { name: "negativePrompt", type: "string", required: false, default: "", description: "Negative prompt describing what to avoid" },
      { name: "checkpoint", type: "model", required: false, description: "SDXL checkpoint model" },
      { name: "width", type: "number", required: false, default: 1024, description: "Image width (1024 recommended for SDXL)" },
      { name: "height", type: "number", required: false, default: 1024, description: "Image height (1024 recommended for SDXL)" },
      { name: "steps", type: "number", required: false, default: 25, description: "Number of sampling steps" },
      { name: "cfg", type: "number", required: false, default: 7, description: "CFG scale" },
      { name: "seed", type: "number", required: false, default: -1, description: "Random seed (-1 for random)" },
      { name: "sampler", type: "sampler", required: false, default: "euler", description: "Sampler algorithm" },
      { name: "scheduler", type: "scheduler", required: false, default: "normal", description: "Scheduler type" },
    ],
    defaultSettings: {
      steps: 25,
      cfg: 7,
      width: 1024,
      height: 1024,
      sampler: "euler",
      scheduler: "normal",
    },
  },
  {
    id: "anima_txt2img",
    name: "Anima Text-to-Image",
    description:
      "Anima txt2img using UNETLoader + a single CLIPLoader (Qwen-3 0.6B) + VAELoader (Qwen-Image VAE). Takes a real negative prompt and a real CFG, unlike the Flux-shaped templates.",
    modelType: "anima",
    taskType: "txt2img",
    category: "anime",
    requiredNodes: ["UNETLoader", "CLIPLoader", "VAELoader", "KSampler", "CLIPTextEncode", "EmptySD3LatentImage", "VAEDecode", "SaveImage"],
    parameters: [
      { name: "prompt", type: "string", required: true, description: "Positive prompt. Booru tags in order: quality/score/safety, count, character, series, artist, general" },
      { name: "negativePrompt", type: "string", required: false, default: "worst quality, low quality, score_1, score_2, score_3", description: "Negative prompt" },
      { name: "unet", type: "model", required: false, description: "Anima diffusion model" },
      { name: "clip", type: "model", required: false, description: "Text encoder (qwen_3_06b_base)" },
      { name: "vae", type: "model", required: false, description: "VAE (qwen_image_vae)" },
      { name: "width", type: "number", required: false, default: 1024, description: "Image width (512-1536)" },
      { name: "height", type: "number", required: false, default: 1024, description: "Image height (512-1536)" },
      { name: "steps", type: "number", required: false, default: 35, description: "Sampling steps (30-50 for Base, 8-12 for Turbo)" },
      { name: "cfg", type: "number", required: false, default: 4.5, description: "CFG (4-5 for Base, 1 for Turbo)" },
      { name: "seed", type: "number", required: false, default: -1, description: "Random seed (-1 for random)" },
      { name: "sampler", type: "sampler", required: false, default: "euler", description: "Sampler" },
      { name: "scheduler", type: "scheduler", required: false, default: "simple", description: "Scheduler" },
    ],
    defaultSettings: {
      steps: 35,
      cfg: 4.5,
      width: 1024,
      height: 1024,
      sampler: "euler",
      scheduler: "simple",
    },
  },
  {
    id: "qwen_txt2img",
    name: "Qwen Image Text-to-Image",
    description:
      "Qwen-Image txt2img using UNETLoader + a single CLIPLoader (Qwen-2.5-VL) + VAELoader. Strong at rendered text; quote exact strings in the prompt.",
    modelType: "qwen",
    taskType: "txt2img",
    category: "qwen",
    requiredNodes: ["UNETLoader", "CLIPLoader", "VAELoader", "KSampler", "CLIPTextEncode", "EmptySD3LatentImage", "VAEDecode", "SaveImage"],
    parameters: [
      { name: "prompt", type: "string", required: true, description: "Positive prompt (natural language; quote text to render)" },
      { name: "negativePrompt", type: "string", required: false, default: "", description: "Negative prompt" },
      { name: "unet", type: "model", required: false, description: "Qwen-Image diffusion model" },
      { name: "clip", type: "model", required: false, description: "Text encoder (qwen_2.5_vl_7b)" },
      { name: "vae", type: "model", required: false, description: "VAE (qwen_image_vae)" },
      { name: "width", type: "number", required: false, default: 1024, description: "Image width" },
      { name: "height", type: "number", required: false, default: 1024, description: "Image height" },
      { name: "steps", type: "number", required: false, default: 30, description: "Sampling steps (8 with Lightning LoRA, 25-40 native)" },
      { name: "cfg", type: "number", required: false, default: 4, description: "CFG (1 for Lightning, 3-5 native)" },
      { name: "seed", type: "number", required: false, default: -1, description: "Random seed (-1 for random)" },
      { name: "sampler", type: "sampler", required: false, default: "euler", description: "Sampler" },
      { name: "scheduler", type: "scheduler", required: false, default: "simple", description: "Scheduler" },
    ],
    defaultSettings: {
      steps: 30,
      cfg: 4,
      width: 1024,
      height: 1024,
      sampler: "euler",
      scheduler: "simple",
    },
  },
  {
    id: "flux_txt2img",
    name: "Flux Text-to-Image",
    description: "Flux txt2img using UNETLoader and DualCLIPLoader. For Flux Schnell, Dev, and other Flux UNET models.",
    modelType: "flux",
    taskType: "txt2img",
    category: "flux",
    requiredNodes: ["UNETLoader", "DualCLIPLoader", "VAELoader", "KSampler", "CLIPTextEncode", "EmptySD3LatentImage", "VAEDecode", "SaveImage"],
    parameters: [
      { name: "prompt", type: "string", required: true, description: "Positive prompt (natural language works best for Flux)" },
      { name: "unet", type: "model", required: false, description: "Flux UNET model" },
      { name: "width", type: "number", required: false, default: 1024, description: "Image width" },
      { name: "height", type: "number", required: false, default: 1024, description: "Image height" },
      { name: "steps", type: "number", required: false, default: 20, description: "Sampling steps (4 for Schnell, 20-50 for Dev)" },
      { name: "guidance", type: "number", required: false, default: 3.5, description: "Guidance scale (lower than SD, typically 1-5)" },
      { name: "seed", type: "number", required: false, default: -1, description: "Random seed (-1 for random)" },
      { name: "sampler", type: "sampler", required: false, default: "euler", description: "Sampler (euler recommended)" },
      { name: "scheduler", type: "scheduler", required: false, default: "simple", description: "Scheduler (simple recommended for Flux)" },
    ],
    defaultSettings: {
      steps: 20,
      cfg: 3.5,
      width: 1024,
      height: 1024,
      sampler: "euler",
      scheduler: "simple",
    },
  },
  {
    id: "flux_schnell_txt2img",
    name: "Flux Schnell (Fast)",
    description: "Optimized settings for Flux Schnell - 4-step distilled model for fast generation.",
    modelType: "flux",
    taskType: "txt2img",
    category: "flux",
    requiredNodes: ["UNETLoader", "DualCLIPLoader", "VAELoader", "KSampler", "CLIPTextEncode", "EmptySD3LatentImage", "VAEDecode", "SaveImage"],
    parameters: [
      { name: "prompt", type: "string", required: true, description: "Positive prompt" },
      { name: "unet", type: "model", required: false, description: "Flux Schnell UNET model" },
      { name: "width", type: "number", required: false, default: 1024, description: "Image width" },
      { name: "height", type: "number", required: false, default: 1024, description: "Image height" },
      { name: "seed", type: "number", required: false, default: -1, description: "Random seed (-1 for random)" },
    ],
    defaultSettings: {
      steps: 4,
      cfg: 1,
      width: 1024,
      height: 1024,
      sampler: "euler",
      scheduler: "simple",
    },
  },
];

/**
 * Build a workflow from a template with provided parameters
 */
export function buildFromTemplate(
  templateId: string,
  params: Record<string, unknown>,
  objectInfo: ObjectInfo
): Workflow | null {
  const template = BUILTIN_TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    return null;
  }

  // Merge defaults with provided params
  const mergedParams: Record<string, unknown> = { ...template.defaultSettings };
  for (const param of template.parameters) {
    if (params[param.name] !== undefined) {
      mergedParams[param.name] = params[param.name];
    } else if (param.default !== undefined) {
      mergedParams[param.name] = param.default;
    }
  }

  // Build the appropriate workflow based on template
  switch (templateId) {
    case "standard_txt2img":
    case "sdxl_txt2img":
      return buildStandardTxt2Img(
        {
          prompt: (mergedParams.prompt as string) || "",
          negativePrompt: (mergedParams.negativePrompt as string) || "",
          checkpoint: mergedParams.checkpoint as string | undefined,
          width: (mergedParams.width as number) || template.defaultSettings.width,
          height: (mergedParams.height as number) || template.defaultSettings.height,
          steps: (mergedParams.steps as number) || template.defaultSettings.steps,
          cfg: (mergedParams.cfg as number) || template.defaultSettings.cfg,
          seed: (mergedParams.seed as number) ?? -1,
          sampler: (mergedParams.sampler as string) || template.defaultSettings.sampler || "euler",
          scheduler: (mergedParams.scheduler as string) || template.defaultSettings.scheduler || "normal",
          batchSize: (mergedParams.batchSize as number) || 1,
        },
        objectInfo
      );

    case "flux_txt2img":
    case "flux_schnell_txt2img":
      return buildFluxWorkflow(
        {
          prompt: (mergedParams.prompt as string) || "",
          unet: mergedParams.unet as string | undefined,
          width: (mergedParams.width as number) || template.defaultSettings.width,
          height: (mergedParams.height as number) || template.defaultSettings.height,
          steps: (mergedParams.steps as number) || template.defaultSettings.steps,
          guidance: (mergedParams.guidance as number) || (mergedParams.cfg as number) || template.defaultSettings.cfg,
          seed: (mergedParams.seed as number) ?? -1,
          sampler: (mergedParams.sampler as string) || template.defaultSettings.sampler || "euler",
          scheduler: (mergedParams.scheduler as string) || template.defaultSettings.scheduler || "simple",
        },
        objectInfo
      );

    case "anima_txt2img":
    case "qwen_txt2img":
      return buildUnetClipWorkflow(
        {
          prompt: (mergedParams.prompt as string) || "",
          negativePrompt: (mergedParams.negativePrompt as string) || "",
          unet: mergedParams.unet as string | undefined,
          clip: mergedParams.clip as string | undefined,
          vae: mergedParams.vae as string | undefined,
          clipTypePreference:
            architectureById(templateId === "anima_txt2img" ? "anima" : "qwen")
              ?.clipTypeHints ?? [],
          width: (mergedParams.width as number) || template.defaultSettings.width,
          height: (mergedParams.height as number) || template.defaultSettings.height,
          steps: (mergedParams.steps as number) || template.defaultSettings.steps,
          cfg: (mergedParams.cfg as number) || template.defaultSettings.cfg,
          seed: (mergedParams.seed as number) ?? -1,
          sampler: (mergedParams.sampler as string) || template.defaultSettings.sampler || "euler",
          scheduler: (mergedParams.scheduler as string) || template.defaultSettings.scheduler || "simple",
        },
        objectInfo
      );

    default:
      return null;
  }
}

/**
 * Get a template by ID
 */
export function getTemplateById(templateId: string): WorkflowTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === templateId);
}
