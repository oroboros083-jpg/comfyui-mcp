import { ObjectInfo, comboOptions } from "../client/comfyui.js";
import { ToolError } from "../utils/errors.js";

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
  modelType: "sd15" | "sdxl" | "sd3" | "flux" | "any";
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
    `comfyui_list_models shows what is installed, and comfyui_get_download_url gives the download for a ${what} this template can use.`
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
        "Flux needs both a T5 and a CLIP-L encoder. comfyui_get_download_url has the files, and comfyui_list_models shows what is already installed."
      );
    }
    const t5Model = clipModels.find((m) => m.toLowerCase().includes("t5")) || clipModels[0];
    const clipModel =
      clipModels.find((m) => m.toLowerCase().includes("clip_l")) || clipModels[1] || t5Model;

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
