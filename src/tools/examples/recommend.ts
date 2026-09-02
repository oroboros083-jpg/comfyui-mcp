import { z } from "zod";
import { BUILTIN_TEMPLATES } from "../../workflows/builder.js";
import { architectureById, isUnetShape } from "../../architectures/registry.js";
import { listTemplates as dbListTemplates } from "../../db/index.js";

export interface ModelPattern {
  pattern: RegExp;
  workflowName: string;
  /**
   * Registry architecture id. This was a four-value union, which is why 24
   * of the 36 rows below used to say "flux" - Qwen, HiDream, Wan, Lumina,
   * Chroma, Z-Image and the rest had nowhere else to go, and their users
   * were then pointed at the Flux prompting guide. Graph shape now comes
   * from the registry separately, so identity no longer has to carry it.
   */
  architecture: string;
  /**
   * Whether this model file is a *draft* tool or a finishing one.
   *
   * A property of the file, not of the architecture: `flux` covers both
   * flux1-schnell (4 steps, distilled, for farming) and flux1-dev (20+ steps,
   * for the render you keep). The registry cannot tell them apart, so the
   * distinction lives here, where the filename patterns already do.
   *
   * Required rather than optional on purpose - a new row has to decide.
   */
  tier: "draft" | "standard";
  defaultSteps: number;
  defaultCfg: number;
  defaultResolution: { width: number; height: number };
  notes: string;
}

export const MODEL_PATTERNS: ModelPattern[] = [
  // Flux 2. First because this list is first-match-wins in declaration order
  // and the Flux Dev row below matches "flux2-dev.safetensors" - the real BFL
  // filename - so every Flux 2 file was answered with Flux Dev's CFG of 1 and
  // "no negative prompt needed", and this row was unreachable.
  //
  // The pattern anchors the 2 to the word "flux" rather than matching any 2
  // anywhere after it, so a v2 quantization of a Flux 1 model is not caught.
  {
    pattern: /flux[\s._-]?2(?!\d)/i,
    workflowName: "Flux 2",
    architecture: "flux",
    tier: "standard",
    defaultSteps: 20,
    defaultCfg: 3,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Flux 2 with Mistral 3 text encoder. Supports multiple reference images.",
  },
  // Flux Schnell checkpoint (all-in-one)
  {
    pattern: /flux.*schnell.*\.(safetensors|ckpt)/i,
    workflowName: "Flux Schnell Checkpoint",
    architecture: "flux",
    tier: "draft",
    defaultSteps: 4,
    defaultCfg: 1,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Flux Schnell is 4-step distilled. Use simple scheduler. No negative prompt needed.",
  },
  // Flux Dev checkpoint (all-in-one)
  {
    pattern: /flux.*dev.*\.(safetensors|ckpt)/i,
    workflowName: "Flux Dev Checkpoint",
    architecture: "flux",
    tier: "standard",
    defaultSteps: 20,
    defaultCfg: 1,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Flux Dev is higher quality. Use 20-50 steps. No negative prompt needed.",
  },
  // Flux Kontext
  {
    pattern: /flux.*kontext/i,
    workflowName: "Flux Kontext",
    architecture: "flux",
    tier: "standard",
    defaultSteps: 20,
    defaultCfg: 1,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Kontext is for image editing. Describe the changes you want to make.",
  },
  // Flux Fill
  {
    pattern: /flux.*fill/i,
    workflowName: "Flux Fill (Inpaint/Outpaint)",
    architecture: "flux",
    tier: "standard",
    defaultSteps: 20,
    defaultCfg: 1,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Fill is for inpainting and outpainting. Requires mask input.",
  },
  // SD3.5 Large Turbo
  {
    pattern: /sd3\.?5.*turbo/i,
    workflowName: "SD3.5 Large Turbo",
    architecture: "sd3",
    tier: "draft",
    defaultSteps: 4,
    defaultCfg: 1,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Turbo model - use 4-8 steps with CFG 1.",
  },
  // SD3.5 (any)
  {
    pattern: /sd3\.?5/i,
    workflowName: "SD3.5 Checkpoint",
    architecture: "sd3",
    tier: "standard",
    defaultSteps: 28,
    defaultCfg: 4.5,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "SD3.5 uses 28 steps and CFG 4.5 by default.",
  },
  // SD3 (original)
  {
    pattern: /sd3[^5]/i,
    workflowName: "SD3.5 Checkpoint",
    architecture: "sd3",
    tier: "standard",
    defaultSteps: 28,
    defaultCfg: 4.5,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "SD3 uses similar settings to SD3.5.",
  },
  // SDXL Turbo.
  //
  // The separator is optional because Stability's own filename is
  // `sd_xl_turbo_1.0_fp16.safetensors`. Requiring a literal "sdxl" made this
  // row unreachable for the real file, which then fell through to the plain
  // SDXL row below and was answered with 25 steps at CFG 7 - the settings
  // that make a Turbo model look burnt out. Same failure mode as the Flux 2
  // row above.
  {
    pattern: /sd[\s._-]?xl.*turbo/i,
    workflowName: "SDXL Turbo",
    architecture: "sdxl",
    tier: "draft",
    defaultSteps: 1,
    defaultCfg: 1,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "SDXL Turbo generates in 1-4 steps with CFG 1.",
  },
  // SDXL (any)
  {
    pattern: /sdxl|sd_xl/i,
    workflowName: "SDXL",
    architecture: "sdxl",
    tier: "standard",
    defaultSteps: 25,
    defaultCfg: 7,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "SDXL works best at 1024x1024 or equivalent pixel count.",
  },
  // HiDream
  {
    pattern: /hidream.*dev/i,
    workflowName: "HiDream Dev",
    architecture: "hidream",
    tier: "standard",
    defaultSteps: 28,
    defaultCfg: 5,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "HiDream Dev is faster than Full.",
  },
  {
    pattern: /hidream.*full/i,
    workflowName: "HiDream Full",
    architecture: "hidream",
    tier: "standard",
    defaultSteps: 50,
    defaultCfg: 5,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "HiDream Full for highest quality.",
  },
  {
    pattern: /hidream.*e1/i,
    workflowName: "HiDream Edit (E1.1)",
    architecture: "hidream",
    tier: "standard",
    defaultSteps: 28,
    defaultCfg: 5,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "HiDream Edit for image editing.",
  },
  // Stable Cascade
  {
    pattern: /stable.*cascade/i,
    workflowName: "Stable Cascade",
    architecture: "cascade",
    tier: "standard",
    defaultSteps: 20,
    defaultCfg: 4,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Stable Cascade uses two-stage generation.",
  },
  // Qwen Image (basic txt2img)
  {
    pattern: /qwen.*image(?!.*edit|.*layered)/i,
    workflowName: "Qwen Image",
    architecture: "qwen",
    tier: "standard", // Uses similar workflow structure to Flux
    defaultSteps: 20,
    defaultCfg: 2.5,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Qwen Image 20B model. Uses EmptySD3LatentImage and ModelSamplingAuraFlow (shift=3.1). Excellent text rendering.",
  },
  // Qwen Image Edit
  {
    pattern: /qwen.*image.*edit/i,
    workflowName: "Qwen Image Edit (v2509)",
    architecture: "qwen",
    tier: "standard",
    defaultSteps: 20,
    defaultCfg: 2.5,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Qwen Image Edit for image editing. Supports up to 3 reference images.",
  },
  // Qwen Image Layered
  {
    pattern: /qwen.*image.*layered/i,
    workflowName: "Qwen Image",
    architecture: "qwen",
    tier: "standard",
    defaultSteps: 50,
    defaultCfg: 4,
    defaultResolution: { width: 640, height: 640 },
    notes: "Qwen Image Layered for layer decomposition. Use EmptyQwenImageLayeredLatentImage. Outputs RGBA layers for editing.",
  },
  // Wan (video models)
  {
    pattern: /wan.*2\.\d/i,
    workflowName: "Wan 2.1",
    architecture: "wan",
    tier: "standard",
    defaultSteps: 30,
    defaultCfg: 5,
    defaultResolution: { width: 832, height: 480 },
    notes: "Wan video generation model. See Wan 2.1 or Wan 2.2 examples for proper workflow.",
  },
  // Hunyuan DiT
  {
    pattern: /hunyuan.*dit/i,
    workflowName: "Hunyuan DiT 1.2",
    architecture: "hunyuan",
    tier: "standard",
    defaultSteps: 30,
    defaultCfg: 4,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Hunyuan DiT supports both English and Chinese prompts.",
  },
  // Hunyuan Image
  {
    pattern: /hunyuan.*image/i,
    workflowName: "Hunyuan Image 2.1",
    architecture: "hunyuan",
    tier: "standard",
    defaultSteps: 30,
    defaultCfg: 4,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Hunyuan Image 2.1 with optional refiner.",
  },
  // Hunyuan Video
  {
    pattern: /hunyuan.*video/i,
    workflowName: "Hunyuan Video",
    architecture: "hunyuan",
    tier: "standard",
    defaultSteps: 30,
    defaultCfg: 5,
    defaultResolution: { width: 1280, height: 720 },
    notes: "Hunyuan video generation. V2 follows guiding image closely, V1 has more dynamic motion.",
  },
  // Lumina
  {
    pattern: /lumina/i,
    workflowName: "Lumina Image 2.0",
    architecture: "lumina",
    tier: "standard",
    defaultSteps: 30,
    defaultCfg: 4,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Lumina Image 2.0 uses Gemma 2 2B for text encoding.",
  },
  // Chroma
  {
    pattern: /chroma/i,
    workflowName: "Chroma",
    architecture: "chroma",
    tier: "standard",
    defaultSteps: 20,
    defaultCfg: 1,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Chroma is a modified Flux model with architectural changes.",
  },
  // AuraFlow
  {
    pattern: /aura.*flow/i,
    workflowName: "AuraFlow",
    architecture: "auraflow",
    tier: "standard",
    defaultSteps: 30,
    defaultCfg: 4,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "AuraFlow is a true open source model with FOSS license.",
  },
  // Z Image Turbo
  {
    pattern: /z.*image.*turbo/i,
    workflowName: "Z Image Turbo",
    architecture: "zimage",
    tier: "draft",
    defaultSteps: 4,
    defaultCfg: 1,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Z Image Turbo uses Qwen 3 4B text encoder. Fast distilled model.",
  },
  // Mochi Video
  {
    pattern: /mochi/i,
    workflowName: "Mochi Video",
    architecture: "mochi",
    tier: "standard",
    defaultSteps: 50,
    defaultCfg: 4.5,
    defaultResolution: { width: 848, height: 480 },
    notes: "Mochi is a state of the art text-to-video model.",
  },
  // LTX Video
  {
    pattern: /ltx.*video/i,
    workflowName: "LTX-Video",
    architecture: "ltxvideo",
    tier: "standard",
    defaultSteps: 30,
    defaultCfg: 3,
    defaultResolution: { width: 768, height: 512 },
    notes: "LTX-Video for text-to-video and image-to-video. Use long descriptive prompts.",
  },
  // Cosmos
  {
    pattern: /cosmos/i,
    workflowName: "Nvidia Cosmos",
    architecture: "cosmos",
    tier: "standard",
    defaultSteps: 35,
    defaultCfg: 7,
    defaultResolution: { width: 1280, height: 704 },
    notes: "Nvidia Cosmos for text-to-video and video-to-video with motion continuation.",
  },
  // Omnigen
  {
    pattern: /omnigen/i,
    workflowName: "Omnigen 2",
    architecture: "omnigen",
    tier: "standard",
    defaultSteps: 50,
    defaultCfg: 2.5,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Omnigen 2 for image editing with text prompts and character reference images.",
  },
  // Stable Audio / ACE Step
  {
    pattern: /ace.*step|stable.*audio/i,
    workflowName: "Audio Generation (ACE Step / Stable Audio)",
    architecture: "aceaudio",
    tier: "standard",
    defaultSteps: 100,
    defaultCfg: 7,
    defaultResolution: { width: 0, height: 0 },
    notes: "Audio generation model. See audio examples for proper workflow.",
  },
  // SVD / Stable Video Diffusion
  {
    pattern: /svd|stable.*video.*diffusion/i,
    workflowName: "Stable Video Diffusion (Image-to-Video)",
    architecture: "sdxl",
    tier: "standard",
    defaultSteps: 25,
    defaultCfg: 2.5,
    defaultResolution: { width: 1024, height: 576 },
    notes: "SVD for image-to-video. Use svd_xt for 25 frames, svd for 14 frames.",
  },
  // CosXL Edit
  {
    pattern: /cosxl.*edit/i,
    workflowName: "SDXL Edit (CosXL Edit)",
    architecture: "sdxl",
    tier: "standard",
    defaultSteps: 20,
    defaultCfg: 7,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "CosXL Edit for InstructPix2Pix-style image editing.",
  },
  // Stable Zero123
  {
    pattern: /zero123|stable.*zero/i,
    workflowName: "Stable Zero123 (3D)",
    architecture: "sdxl",
    tier: "standard",
    defaultSteps: 50,
    defaultCfg: 4,
    defaultResolution: { width: 256, height: 256 },
    notes: "Stable Zero123 for 3D object rotation. Input should have simple background.",
  },
  // unCLIP
  {
    pattern: /unclip/i,
    workflowName: "unCLIP (Single Image)",
    architecture: "sdxl",
    tier: "standard",
    defaultSteps: 20,
    defaultCfg: 7,
    defaultResolution: { width: 768, height: 768 },
    notes: "unCLIP for image-guided generation. Use images as prompts.",
  },
  // LCM
  {
    pattern: /lcm/i,
    workflowName: "LCM (Latent Consistency Models)",
    architecture: "sdxl",
    tier: "draft",
    defaultSteps: 4,
    defaultCfg: 1.5,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "LCM for fast generation in 4-8 steps. Use lcm sampler with sgm_uniform scheduler.",
  },
  // Default SD1.5
  {
    pattern: /\.(safetensors|ckpt)$/i,
    workflowName: "Basic txt2img",
    architecture: "sd15",
    tier: "standard",
    defaultSteps: 20,
    defaultCfg: 7,
    defaultResolution: { width: 512, height: 512 },
    notes: "SD1.5 models work best at 512x512.",
  },
];

export const recommendWorkflowSchema = z.object({
  modelName: z
    .string()
    .describe("The model filename to match (e.g., 'flux1-schnell-fp8.safetensors')"),
  availableCheckpoints: z
    .array(z.string())
    .optional()
    .describe("List of available checkpoint files (from the official Comfy MCP's search_models)"),
  availableUnets: z
    .array(z.string())
    .optional()
    .describe("List of available UNET files (from the official Comfy MCP's search_models)"),
  taskType: z
    .enum(["txt2img", "img2img", "inpaint", "edit", "video"])
    .optional()
    .default("txt2img")
    .describe("What type of generation task"),
}).strict();

export type RecommendWorkflowInput = z.infer<typeof recommendWorkflowSchema>;

export interface WorkflowRecommendation {
  modelName: string;
  matchedWorkflow: string;
  /** Registry architecture id, e.g. "flux", "qwen", "hidream". */
  modelType: string;
  isCheckpoint: boolean;
  recommendedSettings: {
    steps: number;
    cfg: number;
    width: number;
    height: number;
    sampler?: string;
    scheduler?: string;
  };
  promptingGuide: string;
  notes: string;
  alternativeWorkflows?: string[];
  /**
   * Whether this model file is a draft tool or a finishing one, and where to
   * get the two-stage plan. Named here because this is the moment the caller
   * is deciding what to run, and a tool nobody is pointed at is a tool nobody
   * calls.
   */
  iteration: string;
  /** Matching templates from builtin and saved templates */
  matchingTemplates?: Array<{
    source: "builtin" | "example" | "custom";
    id: string;
    name: string;
    description: string;
  }>;
}

/**
 * Recommend the best workflow based on available models
 */
export async function recommendWorkflow(input: RecommendWorkflowInput): Promise<WorkflowRecommendation> {
  const modelName = input.modelName.toLowerCase();

  // Check if this is a checkpoint or UNET
  const isCheckpoint = input.availableCheckpoints?.some(
    (c) => c.toLowerCase().includes(modelName.replace(/\.(safetensors|ckpt)$/i, ""))
  ) ?? (modelName.includes("checkpoint") || !modelName.includes("unet"));

  // Find matching pattern
  let match: ModelPattern | undefined;
  for (const pattern of MODEL_PATTERNS) {
    if (pattern.pattern.test(input.modelName)) {
      match = pattern;
      break;
    }
  }

  // Default to SD1.5 if no match
  if (!match) {
    match = MODEL_PATTERNS[MODEL_PATTERNS.length - 1];
  }

  // Graph shape, not identity. `match.modelType === "flux"` used to stand in
  // for "loads through UNETLoader + DualCLIPLoader", which is why every
  // architecture with that shape had to claim it was Flux.
  const spec = architectureById(match.architecture);
  const shape = spec?.workflow;
  // "Loads a bare UNET" - true of both the dual-encoder Flux shape and the
  // single-encoder one. Sampler defaults and the checkpoint/UNET naming below
  // follow from the loader, not from the encoder count.
  const usesUnetShape = shape ? isUnetShape(shape) : false;

  // Templates are indexed by graph shape, not by architecture: a HiDream model
  // legitimately matches the Flux-shaped templates, because that is the graph
  // it runs on. Single-encoder architectures keep their own id, because their
  // graph really is different and they have their own templates.
  const templateModelType = shape === "flux" ? "flux" : match.architecture;

  // Adjust workflow name based on checkpoint vs UNET
  let workflowName = match.workflowName;
  if (usesUnetShape && !isCheckpoint) {
    // If it's a UNET file, recommend the UNET workflow instead of checkpoint
    if (workflowName.includes("Checkpoint")) {
      workflowName = workflowName.replace(" Checkpoint", "");
    }
  }

  // Build recommendation
  const recommendation: WorkflowRecommendation = {
    modelName: input.modelName,
    matchedWorkflow: workflowName,
    modelType: match.architecture,
    isCheckpoint,
    recommendedSettings: {
      steps: match.defaultSteps,
      cfg: match.defaultCfg,
      width: match.defaultResolution.width,
      height: match.defaultResolution.height,
    },
    // Points at this architecture's own guide where one exists. A Qwen model
    // used to be sent to the Flux guide, because it claimed to be Flux.
    promptingGuide: spec?.guide
      ? `Call comfyui_get_prompting_guide('${spec.guide}') for detailed prompting advice.`
      : `No dedicated prompting guide for ${spec?.displayName ?? match.architecture} yet; comfyui_get_prompting_guide('flux') is the closest fit for this workflow shape.`,
    notes: match.notes,
    iteration:
      match.tier === "draft"
        ? `This is a distilled draft model - fast, but not what you finish on. ` +
          `comfyui_plan_iteration(model: "<your final model>") pairs it with a final render and ` +
          `says what carries over between the two.`
        : `This is a full-quality model, so every iteration costs ${match.defaultSteps} steps. ` +
          `Call comfyui_plan_iteration(model: "${input.modelName}") for a cheap draft stage to ` +
          `farm prompts and seeds on first.`,
  };

  // Add sampler/scheduler recommendations
  if (usesUnetShape) {
    recommendation.recommendedSettings.sampler = "euler";
    recommendation.recommendedSettings.scheduler = "simple";
  } else if (match.workflowName.includes("Turbo")) {
    recommendation.recommendedSettings.sampler = "euler";
    recommendation.recommendedSettings.scheduler = "sgm_uniform";
  }

  // Add alternative workflows based on task type.
  //
  // These name Flux-family workflows, so they key off the Flux shape
  // specifically, not off `usesUnetShape`. Under the old conflated label a
  // Qwen model was flux-shaped and so was told to edit with Flux Kontext -
  // while the Qwen Image Edit examples it should have been given sat unused
  // in the same library.
  if (input.taskType === "inpaint") {
    if (shape === "flux") {
      recommendation.alternativeWorkflows = ["Flux Fill (Inpaint/Outpaint)"];
    } else {
      recommendation.alternativeWorkflows = ["Inpainting (Basic)", "Inpainting (Dedicated Model)"];
    }
  } else if (input.taskType === "edit") {
    if (match.architecture === "qwen") {
      recommendation.alternativeWorkflows = [
        "Qwen Image Edit (v2509)",
        "Qwen Image Edit (Original)",
      ];
    } else if (match.architecture === "hidream") {
      recommendation.alternativeWorkflows = ["HiDream Edit (E1.1)"];
    } else if (shape === "flux") {
      recommendation.alternativeWorkflows = ["Flux Kontext"];
    } else {
      recommendation.alternativeWorkflows = ["SDXL Edit (CosXL Edit)"];
    }
  }

  // Search for matching templates (builtin and custom)
  const matchingTemplates: WorkflowRecommendation["matchingTemplates"] = [];

  // Search builtin templates
  for (const template of BUILTIN_TEMPLATES) {
    const nameLower = template.name.toLowerCase();
    const modelLower = input.modelName.toLowerCase();
    // Match by model name patterns in template name/description
    if (nameLower.includes(modelLower.replace(/[_\-.].*$/, "")) ||
        template.description.toLowerCase().includes(modelLower.replace(/[_\-.].*$/, "")) ||
        (template.modelType === templateModelType && template.taskType === (input.taskType || "txt2img"))) {
      matchingTemplates.push({
        source: "builtin",
        id: template.id,
        name: template.name,
        description: template.description,
      });
    }
  }

  // Search custom templates from database
  try {
    const customTemplates = dbListTemplates();
    for (const template of customTemplates) {
      const nameLower = template.name.toLowerCase();
      const modelLower = input.modelName.toLowerCase();
      if (nameLower.includes(modelLower.replace(/[_\-.].*$/, "")) ||
          template.description.toLowerCase().includes(modelLower.replace(/[_\-.].*$/, "")) ||
          (template.modelType === templateModelType && template.taskType === (input.taskType || "txt2img"))) {
        matchingTemplates.push({
          source: "custom",
          id: template.id,
          name: template.name,
          description: template.description,
        });
      }
    }
  } catch {
    // Database not available, continue without custom templates
  }

  if (matchingTemplates.length > 0) {
    recommendation.matchingTemplates = matchingTemplates.slice(0, 10); // Limit to 10
  }

  return recommendation;
}

/**
 * Format workflow recommendation as readable text
 */
export function formatWorkflowRecommendation(rec: WorkflowRecommendation): string {
  let output = `# Workflow Recommendation for ${rec.modelName}\n\n`;

  output += `## Recommended Workflow\n`;
  output += `**${rec.matchedWorkflow}**\n\n`;

  output += `## Model Info\n`;
  output += `- Model Type: ${rec.modelType.toUpperCase()}\n`;
  output += `- Loader: ${rec.isCheckpoint ? "CheckpointLoaderSimple" : "UNETLoader + DualCLIPLoader"}\n\n`;

  output += `## Recommended Settings\n`;
  output += `- Steps: ${rec.recommendedSettings.steps}\n`;
  output += `- CFG: ${rec.recommendedSettings.cfg}\n`;
  output += `- Resolution: ${rec.recommendedSettings.width}x${rec.recommendedSettings.height}\n`;
  if (rec.recommendedSettings.sampler) {
    output += `- Sampler: ${rec.recommendedSettings.sampler}\n`;
  }
  if (rec.recommendedSettings.scheduler) {
    output += `- Scheduler: ${rec.recommendedSettings.scheduler}\n`;
  }

  output += `\n## Prompting\n`;
  output += `${rec.promptingGuide}\n\n`;

  output += `## Notes\n`;
  output += `${rec.notes}\n`;

  output += `\n## Iterating\n`;
  output += `${rec.iteration}\n`;

  if (rec.alternativeWorkflows && rec.alternativeWorkflows.length > 0) {
    output += `\n## Alternative Workflows\n`;
    for (const alt of rec.alternativeWorkflows) {
      output += `- ${alt}\n`;
    }
  }

  // Show matching templates if any
  if (rec.matchingTemplates && rec.matchingTemplates.length > 0) {
    output += `\n## Matching Templates\n`;
    for (const template of rec.matchingTemplates) {
      output += `- **${template.name}** (${template.source}): ${template.description}\n`;
      output += `  - Use: \`comfyui_get_user_snippet("${template.id}")\`\n`;
    }
  }

  output += `
## Next Steps
`;
  // A starter graph comes from comfyui_get_user_snippet for a built-in or
  // saved template, or from the official Comfy MCP's gallery. This server no
  // longer bundles its own example workflows.
  output += `1. Build the graph from a template above, or search the Comfy gallery
`;
  // Points back at the Prompting section rather than naming a guide after
  // modelType. That was a four-value union when this line was written and
  // is now any registry id, most of which have no guide - so it told wan,
  // hidream, lumina, chroma and six others to call a guide that errors.
  // Referring rather than repeating: the same sentence is already above.
  output += `2. Follow the prompting guidance above
`;
  output += `3. Use \`comfyui_run_workflow\` with the workflow
`;

  return output;
}

