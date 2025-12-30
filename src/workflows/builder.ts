import { ObjectInfo } from "../client/comfyui.js";
import { Capabilities } from "../capabilities/index.js";

export interface WorkflowNode {
  class_type: string;
  inputs: Record<string, unknown>;
}

export type Workflow = Record<string, WorkflowNode>;

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
 * Get the first available model of a type from object_info
 */
export function getFirstAvailableModel(
  objectInfo: ObjectInfo,
  loaderNode: string,
  inputField: string
): string | null {
  const loader = objectInfo[loaderNode];
  if (!loader?.input?.required?.[inputField]) return null;

  const input = loader.input.required[inputField] as unknown[];
  if (Array.isArray(input) && Array.isArray(input[0]) && input[0].length > 0) {
    return input[0][0] as string;
  }
  return null;
}

/**
 * Get all available models of a type
 */
export function getAvailableModels(
  objectInfo: ObjectInfo,
  loaderNode: string,
  inputField: string
): string[] {
  const loader = objectInfo[loaderNode];
  if (!loader?.input?.required?.[inputField]) return [];

  const input = loader.input.required[inputField] as unknown[];
  if (Array.isArray(input) && Array.isArray(input[0])) {
    return input[0] as string[];
  }
  return [];
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
    getFirstAvailableModel(objectInfo, "CheckpointLoaderSimple", "ckpt_name") ||
    "model.safetensors";

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
    options.unet ||
    getFirstAvailableModel(objectInfo, "UNETLoader", "unet_name");
  const vae =
    options.vae ||
    getFirstAvailableModel(objectInfo, "VAELoader", "vae_name");

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
    // Get available CLIP models
    const clipModels = getAvailableModels(objectInfo, "DualCLIPLoader", "clip_name1");
    const t5Model = clipModels.find((m) => m.toLowerCase().includes("t5")) || clipModels[0];
    const clipModel = clipModels.find((m) => m.toLowerCase().includes("clip_l")) || clipModels[1] || t5Model;

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
        clip_name: options.clip || getFirstAvailableModel(objectInfo, "CLIPLoader", "clip_name"),
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

/**
 * Determine the best workflow type based on model and capabilities
 */
export function selectWorkflowType(
  checkpoint: string | undefined,
  capabilities: Capabilities,
  objectInfo: ObjectInfo
): "standard" | "flux" | "sd3" {
  // If a specific checkpoint is provided, try to detect its type
  if (checkpoint) {
    const lower = checkpoint.toLowerCase();
    if (lower.includes("flux")) return "flux";
    if (lower.includes("sd3")) return "sd3";
    return "standard";
  }

  // Check if Flux models are available and no standard checkpoints
  const hasStandardCheckpoints = getAvailableModels(
    objectInfo,
    "CheckpointLoaderSimple",
    "ckpt_name"
  ).length > 0;

  if (!hasStandardCheckpoints && capabilities.hasFlux) {
    return "flux";
  }

  return "standard";
}
