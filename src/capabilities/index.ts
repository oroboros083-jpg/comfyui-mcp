import { ObjectInfo, comboOptions } from "../client/comfyui.js";
import { UserPreferences } from "../analysis/outputs.js";
import {
  ARCHITECTURES,
  ArchitectureSpec,
  detectArchitectures,
  primaryArchitecture,
} from "../architectures/registry.js";

const ARCH_BY_ID = new Map(ARCHITECTURES.map((a) => [a.id, a]));

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

  // Audio capabilities.
  /** An audio model (ACE-Step or Stable Audio) is installed. */
  hasAudioGen: boolean;
  /** The StableAudioSampler custom node pack is installed. */
  hasStableAudio: boolean;

  // Special features
  hasInpainting: boolean;
  hasOutpainting: boolean;
  hasDepthEstimation: boolean;
  hasFaceDetection: boolean;
  hasSegmentation: boolean;

  /**
   * Every model architecture with a matching model installed, most specific
   * first. The hasSD15/hasSDXL/hasSD3/hasFlux/hasCascade booleans above are
   * derived from this and kept because they are public - they appear in
   * get_capabilities output. New architectures are added to the registry in
   * architectures/registry.ts and appear here without a new boolean.
   */
  detectedArchitectures: string[];

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

  // Audio nodes.
  //
  // Only the custom pack is listed here. EmptyLatentAudio, VAEDecodeAudio,
  // SaveAudio and the ACE-Step nodes all ship unconditionally in
  // comfy_extras, so their presence says nothing about whether this install
  // can actually generate audio - keying on them would make
  // canGenerateAudio true on a stock SD 1.5-only box. Whether an audio
  // *model* is installed is the real signal, and the registry already
  // detects that; see below.
  StableAudioSampler: "hasStableAudio",

  // Special features
  InpaintModelConditioning: "hasInpainting",
  OutpaintingPAD: "hasOutpainting",
  DepthAnything: "hasDepthEstimation",
  MiDaS_DepthMap: "hasDepthEstimation",
  UltralyticsDetectorProvider: "hasFaceDetection",
  SAMModelLoader: "hasSegmentation",
};

/** The registry row covering ACE-Step and Stable Audio checkpoints. */
const AUDIO_ARCHITECTURE = "aceaudio";

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
    detectedArchitectures: [],
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

  // Model architectures come from the registry, which owns the detection
  // patterns. The legacy booleans are derived from it so they keep working
  // for callers that read get_capabilities output.
  const detected = detectArchitectures(objectInfo);
  capabilities.detectedArchitectures = detected.map((a) => a.id);
  for (const spec of detected) {
    if (spec.legacyFlag) capabilities[spec.legacyFlag] = true;
  }

  // Audio generation follows the installed models, not the nodes. hasAudioGen
  // was previously initialised false and assigned nowhere at all, so
  // canGenerateAudio was false on every install including ones with an
  // ACE-Step or Stable Audio checkpoint sitting right there.
  capabilities.hasAudioGen = detected.some((spec) => spec.id === AUDIO_ARCHITECTURE);

  // Get available samplers
  const ksampler = objectInfo["KSampler"];
  capabilities.availableSamplers = comboOptions(
    ksampler?.input?.required?.sampler_name
  );
  capabilities.availableSchedulers = comboOptions(
    ksampler?.input?.required?.scheduler
  );

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

/** The detected architectures as registry rows rather than bare ids. */
export function architecturesOf(capabilities: Capabilities): ArchitectureSpec[] {
  return capabilities.detectedArchitectures
    .map((id) => ARCH_BY_ID.get(id))
    .filter((spec): spec is ArchitectureSpec => spec !== undefined);
}

/**
 * The architecture to steer by, or undefined when none was detected. Callers
 * used to reimplement this as an if/else ladder over the legacy booleans -
 * two of them, which had already drifted apart.
 */
export function primaryArchitectureOf(
  capabilities: Capabilities
): ArchitectureSpec | undefined {
  return primaryArchitecture(architecturesOf(capabilities));
}

export function getCapabilitySummary(capabilities: Capabilities): string {
  const features: string[] = [];

  if (capabilities.canGenerateImages) {
    const models = architecturesOf(capabilities).map((a) => a.displayName);
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
