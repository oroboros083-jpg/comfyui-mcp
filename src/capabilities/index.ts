import { ObjectInfo } from "../client/comfyui.js";
import { UserPreferences } from "../analysis/outputs.js";

export interface Capabilities {
  // Core generation
  canGenerateImages: boolean;
  canGenerateVideo: boolean;
  canGenerateAudio: boolean;

  // Model types available
  hasCheckpoints: boolean;
  hasUNET: boolean;
  hasLoRA: boolean;
  hasControlNet: boolean;
  hasIPAdapter: boolean;
  hasUpscaler: boolean;

  // Specific model architectures
  hasSD15: boolean;
  hasSDXL: boolean;
  hasSD3: boolean;
  hasFlux: boolean;
  hasCascade: boolean;

  // Video capabilities
  hasAnimateDiff: boolean;
  hasSVD: boolean;
  hasLTXVideo: boolean;
  hasHunyuanVideo: boolean;
  hasMochiVideo: boolean;
  hasCogVideo: boolean;

  // Audio capabilities
  hasAudioGen: boolean;
  hasStableAudio: boolean;

  // Special features
  hasInpainting: boolean;
  hasOutpainting: boolean;
  hasDepthEstimation: boolean;
  hasFaceDetection: boolean;
  hasSegmentation: boolean;

  // Available nodes for reference
  availableLoaders: string[];
  availableSamplers: string[];
  availableSchedulers: string[];

  // User preferences from output analysis (optional, populated if outputs exist)
  userPreferences?: UserPreferences;
}

const NODE_CAPABILITY_MAP: Record<string, keyof Capabilities> = {
  // Loaders
  CheckpointLoaderSimple: "hasCheckpoints",
  UNETLoader: "hasUNET",
  LoraLoader: "hasLoRA",
  LoraLoaderModelOnly: "hasLoRA",
  ControlNetLoader: "hasControlNet",
  IPAdapterModelLoader: "hasIPAdapter",
  UpscaleModelLoader: "hasUpscaler",

  // Video nodes
  AnimateDiffLoaderWithContext: "hasAnimateDiff",
  ADE_AnimateDiffLoaderWithContext: "hasAnimateDiff",
  SVD_img2vid_Conditioning: "hasSVD",
  ImageOnlyCheckpointLoader: "hasSVD",
  LTXVLoader: "hasLTXVideo",
  HunyuanVideoSampler: "hasHunyuanVideo",
  DownloadAndLoadMochiModel: "hasMochiVideo",
  CogVideoSampler: "hasCogVideo",

  // Audio nodes
  StableAudioSampler: "hasStableAudio",

  // Special features
  InpaintModelConditioning: "hasInpainting",
  OutpaintingPAD: "hasOutpainting",
  DepthAnything: "hasDepthEstimation",
  MiDaS_DepthMap: "hasDepthEstimation",
  UltralyticsDetectorProvider: "hasFaceDetection",
  SAMModelLoader: "hasSegmentation",
};

export function detectCapabilities(objectInfo: ObjectInfo): Capabilities {
  const nodeNames = new Set(Object.keys(objectInfo));

  const capabilities: Capabilities = {
    canGenerateImages: false,
    canGenerateVideo: false,
    canGenerateAudio: false,
    hasCheckpoints: false,
    hasUNET: false,
    hasLoRA: false,
    hasControlNet: false,
    hasIPAdapter: false,
    hasUpscaler: false,
    hasSD15: false,
    hasSDXL: false,
    hasSD3: false,
    hasFlux: false,
    hasCascade: false,
    hasAnimateDiff: false,
    hasSVD: false,
    hasLTXVideo: false,
    hasHunyuanVideo: false,
    hasMochiVideo: false,
    hasCogVideo: false,
    hasAudioGen: false,
    hasStableAudio: false,
    hasInpainting: false,
    hasOutpainting: false,
    hasDepthEstimation: false,
    hasFaceDetection: false,
    hasSegmentation: false,
    availableLoaders: [],
    availableSamplers: [],
    availableSchedulers: [],
  };

  // Check for specific nodes
  for (const [nodeName, capability] of Object.entries(NODE_CAPABILITY_MAP)) {
    if (nodeNames.has(nodeName)) {
      (capabilities as unknown as Record<string, boolean>)[capability] = true;
    }
  }

  // Detect model architectures from checkpoint loader options
  const checkpointLoader = objectInfo["CheckpointLoaderSimple"];
  if (checkpointLoader?.input?.required?.ckpt_name) {
    const ckptInput = checkpointLoader.input.required.ckpt_name as unknown[];
    if (Array.isArray(ckptInput) && Array.isArray(ckptInput[0])) {
      const checkpoints = (ckptInput[0] as string[]).map((c) => c.toLowerCase());
      capabilities.hasSD15 = checkpoints.some(
        (c) => c.includes("v1-5") || c.includes("v1.5") || c.includes("sd15")
      );
      capabilities.hasSDXL = checkpoints.some(
        (c) => c.includes("sdxl") || c.includes("xl")
      );
      capabilities.hasSD3 = checkpoints.some(
        (c) => c.includes("sd3") || c.includes("sd_3")
      );
      capabilities.hasFlux = checkpoints.some(
        (c) => c.includes("flux")
      );
      capabilities.hasCascade = checkpoints.some(
        (c) => c.includes("cascade")
      );
    }
  }

  // Also check UNET loader for Flux/SD3
  const unetLoader = objectInfo["UNETLoader"];
  if (unetLoader?.input?.required?.unet_name) {
    const unetInput = unetLoader.input.required.unet_name as unknown[];
    if (Array.isArray(unetInput) && Array.isArray(unetInput[0])) {
      const unets = (unetInput[0] as string[]).map((c) => c.toLowerCase());
      if (unets.some((c) => c.includes("flux"))) capabilities.hasFlux = true;
      if (unets.some((c) => c.includes("sd3"))) capabilities.hasSD3 = true;
    }
  }

  // Get available samplers
  const ksampler = objectInfo["KSampler"];
  if (ksampler?.input?.required?.sampler_name) {
    const samplerInput = ksampler.input.required.sampler_name as unknown[];
    if (Array.isArray(samplerInput) && Array.isArray(samplerInput[0])) {
      capabilities.availableSamplers = samplerInput[0] as string[];
    }
  }

  // Get available schedulers
  if (ksampler?.input?.required?.scheduler) {
    const schedulerInput = ksampler.input.required.scheduler as unknown[];
    if (Array.isArray(schedulerInput) && Array.isArray(schedulerInput[0])) {
      capabilities.availableSchedulers = schedulerInput[0] as string[];
    }
  }

  // Collect loader nodes
  for (const nodeName of nodeNames) {
    if (nodeName.toLowerCase().includes("loader")) {
      capabilities.availableLoaders.push(nodeName);
    }
  }

  // Determine high-level capabilities
  capabilities.canGenerateImages =
    capabilities.hasCheckpoints || capabilities.hasUNET;

  capabilities.canGenerateVideo =
    capabilities.hasAnimateDiff ||
    capabilities.hasSVD ||
    capabilities.hasLTXVideo ||
    capabilities.hasHunyuanVideo ||
    capabilities.hasMochiVideo ||
    capabilities.hasCogVideo;

  capabilities.canGenerateAudio =
    capabilities.hasStableAudio || capabilities.hasAudioGen;

  return capabilities;
}

export function getCapabilitySummary(capabilities: Capabilities): string {
  const features: string[] = [];

  if (capabilities.canGenerateImages) {
    const models: string[] = [];
    if (capabilities.hasSD15) models.push("SD 1.5");
    if (capabilities.hasSDXL) models.push("SDXL");
    if (capabilities.hasSD3) models.push("SD3");
    if (capabilities.hasFlux) models.push("Flux");
    if (capabilities.hasCascade) models.push("Cascade");
    features.push(`Image generation (${models.join(", ") || "checkpoints available"})`);
  }

  if (capabilities.canGenerateVideo) {
    const videoTypes: string[] = [];
    if (capabilities.hasAnimateDiff) videoTypes.push("AnimateDiff");
    if (capabilities.hasSVD) videoTypes.push("SVD");
    if (capabilities.hasLTXVideo) videoTypes.push("LTX Video");
    if (capabilities.hasHunyuanVideo) videoTypes.push("Hunyuan Video");
    if (capabilities.hasMochiVideo) videoTypes.push("Mochi");
    if (capabilities.hasCogVideo) videoTypes.push("CogVideo");
    features.push(`Video generation (${videoTypes.join(", ")})`);
  }

  if (capabilities.canGenerateAudio) {
    features.push("Audio generation");
  }

  if (capabilities.hasLoRA) features.push("LoRA support");
  if (capabilities.hasControlNet) features.push("ControlNet");
  if (capabilities.hasIPAdapter) features.push("IP-Adapter");
  if (capabilities.hasUpscaler) features.push("Upscaling");
  if (capabilities.hasInpainting) features.push("Inpainting");
  if (capabilities.hasDepthEstimation) features.push("Depth estimation");
  if (capabilities.hasSegmentation) features.push("Segmentation");

  if (capabilities.userPreferences) {
    const prefs = capabilities.userPreferences;
    features.push(`\nUser history: ${prefs.imagesWithWorkflows} images analyzed, ${prefs.uniqueWorkflows} unique workflows`);
    if (prefs.modelUsage.length > 0) {
      features.push(`Preferred models: ${prefs.modelUsage.slice(0, 3).map(m => m.name).join(", ")}`);
    }
  }

  return features.length > 0
    ? features.join("\n")
    : "Basic ComfyUI (no models detected)";
}

// Re-export UserPreferences for convenience
export type { UserPreferences } from "../analysis/outputs.js";
