import { createHash } from "crypto";

/**
 * Node structure in a ComfyUI workflow
 */
interface WorkflowNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
}

/**
 * ComfyUI API-format workflow
 */
export type Workflow = Record<string, WorkflowNode>;

/**
 * Deep clone an object
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Sort object keys recursively for consistent hashing
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  for (const key of keys) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Normalize a workflow for structural comparison.
 * Removes/replaces variable content (prompts, seeds, filenames) while
 * keeping structural elements (node types, connections, models, settings).
 */
export function normalizeWorkflow(workflow: Workflow): Workflow {
  const normalized = deepClone(workflow);

  for (const node of Object.values(normalized)) {
    if (!node || typeof node !== "object") continue;

    const inputs = node.inputs || {};

    // Normalize text prompts (CLIPTextEncode, etc.)
    if (node.class_type === "CLIPTextEncode" && typeof inputs.text === "string") {
      inputs.text = "[PROMPT]";
    }

    // Normalize positive/negative conditioning text
    if (typeof inputs.text_positive === "string") {
      inputs.text_positive = "[PROMPT]";
    }
    if (typeof inputs.text_negative === "string") {
      inputs.text_negative = "[PROMPT]";
    }

    // Normalize seeds (used for reproducibility, varies per generation)
    if (typeof inputs.seed === "number") {
      inputs.seed = 0;
    }
    if (typeof inputs.noise_seed === "number") {
      inputs.noise_seed = 0;
    }

    // Normalize control_after_generate (randomize, fixed, etc.)
    if (typeof inputs.control_after_generate === "string") {
      inputs.control_after_generate = "fixed";
    }

    // Normalize output filenames
    if (typeof inputs.filename_prefix === "string") {
      inputs.filename_prefix = "[OUTPUT]";
    }

    // Remove metadata (titles can vary)
    delete node._meta;
  }

  return normalized;
}

/**
 * Generate a stable hash for a workflow structure.
 * Workflows with different prompts/seeds but same structure will have the same hash.
 */
export function hashWorkflowStructure(workflow: Workflow): string {
  const normalized = normalizeWorkflow(workflow);
  const sorted = sortObjectKeys(normalized);
  const json = JSON.stringify(sorted);
  return createHash("sha256").update(json).digest("hex").slice(0, 16);
}

/**
 * Extract model names from a workflow.
 * Returns an array of model filenames with their types.
 */
export function extractModelsFromWorkflow(
  workflow: Workflow
): Array<{ name: string; type: string }> {
  const models: Array<{ name: string; type: string }> = [];
  const seen = new Set<string>();

  // Loader node types and their model input keys
  const loaderTypes: Record<string, { inputKey: string; modelType: string }> = {
    CheckpointLoaderSimple: { inputKey: "ckpt_name", modelType: "checkpoint" },
    CheckpointLoader: { inputKey: "ckpt_name", modelType: "checkpoint" },
    UNETLoader: { inputKey: "unet_name", modelType: "unet" },
    VAELoader: { inputKey: "vae_name", modelType: "vae" },
    LoraLoader: { inputKey: "lora_name", modelType: "lora" },
    LoraLoaderModelOnly: { inputKey: "lora_name", modelType: "lora" },
    ControlNetLoader: { inputKey: "control_net_name", modelType: "controlnet" },
    CLIPLoader: { inputKey: "clip_name", modelType: "clip" },
    DualCLIPLoader: { inputKey: "clip_name1", modelType: "clip" }, // Has clip_name1 and clip_name2
    UpscaleModelLoader: { inputKey: "model_name", modelType: "upscale" },
    IPAdapterModelLoader: { inputKey: "ipadapter_file", modelType: "ipadapter" },
  };

  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== "object") continue;

    const loaderConfig = loaderTypes[node.class_type];
    if (loaderConfig) {
      const modelName = node.inputs?.[loaderConfig.inputKey];
      if (typeof modelName === "string" && !seen.has(modelName)) {
        seen.add(modelName);
        models.push({ name: modelName, type: loaderConfig.modelType });
      }

      // Handle DualCLIPLoader's second clip
      if (node.class_type === "DualCLIPLoader") {
        const clip2 = node.inputs?.clip_name2;
        if (typeof clip2 === "string" && !seen.has(clip2)) {
          seen.add(clip2);
          models.push({ name: clip2, type: "clip" });
        }
      }
    }
  }

  return models;
}

/**
 * Extract prompts from a workflow.
 * Returns positive and negative prompts found in CLIPTextEncode nodes.
 */
export function extractPromptsFromWorkflow(workflow: Workflow): {
  positive: string[];
  negative: string[];
} {
  const positive: string[] = [];
  const negative: string[] = [];

  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node || typeof node !== "object") continue;

    if (node.class_type === "CLIPTextEncode") {
      const text = node.inputs?.text;
      if (typeof text === "string" && text.trim()) {
        // Heuristic: negative prompts often contain negative keywords
        const isNegative =
          nodeId.toLowerCase().includes("negative") ||
          node._meta?.title?.toLowerCase().includes("negative") ||
          text.toLowerCase().includes("ugly") ||
          text.toLowerCase().includes("bad quality") ||
          text.toLowerCase().includes("deformed");

        if (isNegative) {
          negative.push(text);
        } else {
          positive.push(text);
        }
      }
    }
  }

  return { positive, negative };
}

/**
 * Extract settings from a workflow (sampler, scheduler, steps, dimensions).
 */
export function extractSettingsFromWorkflow(workflow: Workflow): {
  sampler?: string;
  scheduler?: string;
  steps?: number;
  cfg?: number;
  width?: number;
  height?: number;
} {
  const settings: {
    sampler?: string;
    scheduler?: string;
    steps?: number;
    cfg?: number;
    width?: number;
    height?: number;
  } = {};

  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== "object") continue;

    const inputs = node.inputs || {};

    // KSampler and variants
    if (
      node.class_type === "KSampler" ||
      node.class_type === "KSamplerAdvanced" ||
      node.class_type === "SamplerCustom"
    ) {
      if (typeof inputs.sampler_name === "string") {
        settings.sampler = inputs.sampler_name;
      }
      if (typeof inputs.scheduler === "string") {
        settings.scheduler = inputs.scheduler;
      }
      if (typeof inputs.steps === "number") {
        settings.steps = inputs.steps;
      }
      if (typeof inputs.cfg === "number") {
        settings.cfg = inputs.cfg;
      }
    }

    // EmptyLatentImage for dimensions
    if (node.class_type === "EmptyLatentImage") {
      if (typeof inputs.width === "number") {
        settings.width = inputs.width;
      }
      if (typeof inputs.height === "number") {
        settings.height = inputs.height;
      }
    }

    // EmptySD3LatentImage, EmptyMochiLatentVideo, etc.
    if (node.class_type.includes("EmptyLatent") || node.class_type.includes("LatentImage")) {
      if (typeof inputs.width === "number" && !settings.width) {
        settings.width = inputs.width;
      }
      if (typeof inputs.height === "number" && !settings.height) {
        settings.height = inputs.height;
      }
    }
  }

  return settings;
}

/**
 * Generate a human-readable description of a workflow based on its nodes.
 */
export function describeWorkflow(workflow: Workflow): string {
  const nodeTypes = new Set<string>();
  let hasControlNet = false;
  let hasLora = false;
  let hasUpscale = false;
  let hasVideo = false;
  let modelType = "unknown";

  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== "object") continue;
    nodeTypes.add(node.class_type);

    if (node.class_type.includes("ControlNet")) hasControlNet = true;
    if (node.class_type.includes("Lora")) hasLora = true;
    if (node.class_type.includes("Upscale")) hasUpscale = true;
    if (node.class_type.includes("Video") || node.class_type.includes("AnimateDiff")) {
      hasVideo = true;
    }

    // Detect model type
    if (node.class_type === "UNETLoader") {
      const name = String(node.inputs?.unet_name || "").toLowerCase();
      if (name.includes("flux")) modelType = "Flux";
      else if (name.includes("sd3")) modelType = "SD3";
    }
    if (node.class_type === "CheckpointLoaderSimple") {
      const name = String(node.inputs?.ckpt_name || "").toLowerCase();
      if (name.includes("xl")) modelType = "SDXL";
      else if (name.includes("sd3")) modelType = "SD3";
      else if (name.includes("1.5") || name.includes("v1-5")) modelType = "SD1.5";
      else if (modelType === "unknown") modelType = "SD";
    }
  }

  const parts: string[] = [modelType];

  if (hasVideo) parts.push("video");
  else parts.push("txt2img");

  if (hasControlNet) parts.push("+ ControlNet");
  if (hasLora) parts.push("+ LoRA");
  if (hasUpscale) parts.push("+ Upscale");

  return parts.join(" ");
}
