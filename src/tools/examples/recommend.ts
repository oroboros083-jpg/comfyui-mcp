import { z } from "zod";
import { ExampleWorkflow } from "./types.js";
import { EXAMPLE_WORKFLOWS } from "./data.js";
import { fetchExampleWorkflow, apiFormatOf } from "./list-examples.js";
import { BUILTIN_TEMPLATES } from "../../workflows/builder.js";
import { architectureById } from "../../architectures/registry.js";
import { listTemplates as dbListTemplates } from "../../db/index.js";

interface ModelPattern {
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
  defaultSteps: number;
  defaultCfg: number;
  defaultResolution: { width: number; height: number };
  notes: string;
}

const MODEL_PATTERNS: ModelPattern[] = [
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
    defaultSteps: 28,
    defaultCfg: 4.5,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "SD3 uses similar settings to SD3.5.",
  },
  // SDXL Turbo
  {
    pattern: /sdxl.*turbo/i,
    workflowName: "SDXL Turbo",
    architecture: "sdxl",
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
    defaultSteps: 28,
    defaultCfg: 5,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "HiDream Dev is faster than Full.",
  },
  {
    pattern: /hidream.*full/i,
    workflowName: "HiDream Full",
    architecture: "hidream",
    defaultSteps: 50,
    defaultCfg: 5,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "HiDream Full for highest quality.",
  },
  {
    pattern: /hidream.*e1/i,
    workflowName: "HiDream Edit (E1.1)",
    architecture: "hidream",
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
    defaultSteps: 20,
    defaultCfg: 4,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Stable Cascade uses two-stage generation.",
  },
  // Qwen Image (basic txt2img)
  {
    pattern: /qwen.*image(?!.*edit|.*layered)/i,
    workflowName: "Qwen Image",
    architecture: "qwen", // Uses similar workflow structure to Flux
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
    .describe("List of available checkpoint files (from comfyui_list_models)"),
  availableUnets: z
    .array(z.string())
    .optional()
    .describe("List of available UNET files (from comfyui_list_models)"),
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
  /** The actual workflow JSON from examples, ready to use with run_workflow */
  exampleWorkflow?: Record<string, unknown>;
  /** Source of the example workflow */
  exampleSource?: string;
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
  const usesFluxShape = spec?.workflow === "flux";

  // Templates are indexed by graph shape, not by architecture: a Qwen model
  // legitimately matches the Flux-shaped templates, because that is the graph
  // it runs on. This is the one place the old conflated label was right, and
  // it stays - explicitly, and under a name that says which of the two facts
  // it means.
  const templateModelType = usesFluxShape ? "flux" : match.architecture;

  // Adjust workflow name based on checkpoint vs UNET
  let workflowName = match.workflowName;
  if (usesFluxShape && !isCheckpoint) {
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
  };

  // Add sampler/scheduler recommendations
  if (usesFluxShape) {
    recommendation.recommendedSettings.sampler = "euler";
    recommendation.recommendedSettings.scheduler = "simple";
  } else if (match.workflowName.includes("Turbo")) {
    recommendation.recommendedSettings.sampler = "euler";
    recommendation.recommendedSettings.scheduler = "sgm_uniform";
  }

  // Add alternative workflows based on task type
  if (input.taskType === "inpaint") {
    if (usesFluxShape) {
      recommendation.alternativeWorkflows = ["Flux Fill (Inpaint/Outpaint)"];
    } else {
      recommendation.alternativeWorkflows = ["Inpainting (Basic)", "Inpainting (Dedicated Model)"];
    }
  } else if (input.taskType === "edit") {
    if (usesFluxShape) {
      recommendation.alternativeWorkflows = ["Flux Kontext"];
    } else {
      recommendation.alternativeWorkflows = ["SDXL Edit (CosXL Edit)"];
    }
  }

  // Try to fetch the actual example workflow
  const example = findExampleByName(workflowName);
  if (example && example.imageUrls.length > 0) {
    try {
      const workflowResult = await fetchExampleWorkflow(example.imageUrls[0]);
      // The docs PNGs embed both graphs: "prompt" is the API format /prompt
      // accepts, "workflow" is the UI one. Taking `.workflow` handed back a
      // graph ComfyUI rejects, under a field whose own doc comment and
      // rendered text both say to pass it straight to run_workflow.
      // get_example_workflow and handlers/resources.ts both prefer prompt.
      const apiWorkflow = apiFormatOf(workflowResult);
      if (apiWorkflow) {
        recommendation.exampleWorkflow = apiWorkflow as Record<string, unknown>;
        recommendation.exampleSource = example.imageUrls[0];
      }
    } catch {
      // Workflow fetch failed, continue without it
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
 * Find an example workflow by name (case-insensitive partial match)
 */
function findExampleByName(name: string): ExampleWorkflow | undefined {
  const nameLower = name.toLowerCase();
  return EXAMPLE_WORKFLOWS.find(ex =>
    ex.name.toLowerCase() === nameLower ||
    ex.name.toLowerCase().includes(nameLower) ||
    nameLower.includes(ex.name.toLowerCase())
  );
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
      output += `  - Use: \`comfyui_get_template("${template.id}")\`\n`;
    }
  }

  // Show if example workflow was loaded
  if (rec.exampleWorkflow) {
    output += `\n## Example Workflow\n`;
    output += `**Loaded from**: ${rec.exampleSource || "embedded example"}\n`;
    output += `The workflow JSON is included in the \`exampleWorkflow\` field and can be passed directly to \`comfyui_run_workflow\`.\n`;
    output += `Modify the prompt and settings as needed before running.\n`;
  } else {
    output += `\n## Next Steps\n`;
    output += `1. Call \`comfyui_get_example_workflow("${rec.matchedWorkflow}")\` to get the workflow JSON\n`;
    // Reuse the sentence built above rather than naming a guide after
    // modelType. That was a four-value union when this line was written and
    // is now any registry id, most of which have no guide - so this told
    // wan, hidream, lumina, chroma and six others to call a guide that
    // errors. The computed line already falls back correctly.
    output += `2. ${rec.promptingGuide}\n`;
    output += `3. Use \`comfyui_run_workflow\` with the workflow\n`;
  }

  return output;
}

