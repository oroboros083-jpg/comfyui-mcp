/**
 * Prompting Guide for AI Image Generation Models
 *
 * This resource provides best practices for prompting different model types
 * supported by ComfyUI.
 */

export interface ModelPromptingGuide {
  modelType: string;
  description: string;
  promptingStyle: "keywords" | "natural_language" | "hybrid";
  supportsNegativePrompt: boolean;
  supportsPromptWeights: boolean;
  recommendedSettings: {
    steps?: string;
    cfg?: string;
    resolution?: string;
  };
  tips: string[];
  commonMistakes: string[];
  examplePrompt: string;
}

export const PROMPTING_GUIDES: Record<string, ModelPromptingGuide> = {
  "sd15": {
    modelType: "Stable Diffusion 1.5",
    description: "The original Stable Diffusion model. Works best with keyword-style prompts separated by commas.",
    promptingStyle: "keywords",
    supportsNegativePrompt: true,
    supportsPromptWeights: true,
    recommendedSettings: {
      steps: "20-30",
      cfg: "7-8",
      resolution: "512x512 (native), 768x512, 512x768",
    },
    tips: [
      "Use comma-separated keywords rather than full sentences",
      "Put the most important elements first in the prompt",
      "Use quality boosters: 'masterpiece, best quality, highly detailed'",
      "Negative prompts are essential - include: 'worst quality, low quality, blurry'",
      "Use prompt weights with (keyword:1.2) syntax to emphasize elements",
      "Keep prompts focused - SD1.5 struggles with complex multi-subject scenes",
      "Artist style references work well: 'by greg rutkowski, artstation'",
    ],
    commonMistakes: [
      "Writing long natural language sentences",
      "Requesting too many subjects or complex compositions",
      "Using resolutions far from 512x512",
      "Forgetting negative prompts (essential for quality)",
      "Over-weighting keywords above 1.5",
    ],
    examplePrompt: "a beautiful woman, portrait, detailed face, green eyes, red hair, soft lighting, masterpiece, best quality, highly detailed, sharp focus, 8k uhd",
  },

  "sdxl": {
    modelType: "Stable Diffusion XL",
    description: "Enhanced model with better prompt understanding. Supports both keyword and natural language styles.",
    promptingStyle: "hybrid",
    supportsNegativePrompt: true,
    supportsPromptWeights: true,
    recommendedSettings: {
      steps: "20-30",
      cfg: "5-7 (lower than SD1.5)",
      resolution: "1024x1024 (native), 1152x896, 896x1152, 1216x832, 832x1216",
    },
    tips: [
      "Natural language descriptions work well - describe scenes like a photographer",
      "Keyword style still works but natural language often produces better results",
      "Negative prompts are less critical than SD1.5, but still useful",
      "SDXL is more sensitive to weights - keep between 0.8-1.4",
      "Include photographic terms for realism: camera model, lens, lighting setup",
      "Dual text encoders allow style separation (main prompt + style prompt)",
      "Complex multi-subject scenes work much better than SD1.5",
      "Quality tags less necessary - SDXL handles quality well by default",
    ],
    commonMistakes: [
      "Using very long negative prompt lists (not needed like SD1.5)",
      "Going above 1.4 on prompt weights",
      "Using non-standard resolutions like 1000x1000 (stick to trained sizes)",
      "Using SD1.5 LoRAs (incompatible - must use SDXL LoRAs)",
      "Overcrowding with quality boosters (SDXL doesn't need as many)",
    ],
    examplePrompt: "A serene mountain lake at golden hour, with snow-capped peaks reflected in crystal clear water. A small wooden cabin sits at the water's edge, smoke rising from its chimney. Shot on Sony A7R IV, 24mm wide angle lens, f/8, golden hour lighting",
  },

  "sd3": {
    modelType: "Stable Diffusion 3 / 3.5",
    description: "Latest generation with excellent prompt adherence and text rendering. Uses natural language prompting.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: true,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "20-28",
      cfg: "4-7",
      resolution: "1024x1024 (native), various aspect ratios supported",
    },
    tips: [
      "Use natural, descriptive language - write like you're describing to an artist",
      "Prompt positioning matters: beginning and end carry more weight than middle",
      "Excellent at rendering text in images - just describe what text you want",
      "Superior composition understanding - describe spatial relationships clearly",
      "Complex multi-element scenes work well",
      "Artist references work differently than SDXL - may need adjustment",
      "Focus on describing what you want, not technical photography terms",
    ],
    commonMistakes: [
      "Using prompt weights (not supported in SD3)",
      "Using old keyword-heavy style prompts",
      "Burying important details in the middle of the prompt",
      "Copying prompts directly from SD1.5/SDXL without adaptation",
    ],
    examplePrompt: "A cozy bookshop interior with floor-to-ceiling wooden shelves filled with colorful books. Warm afternoon sunlight streams through a large arched window, illuminating dust particles floating in the air. A tabby cat sleeps on a velvet armchair, and a steaming cup of tea sits on a side table with a sign reading 'Please Browse'",
  },

  "flux": {
    modelType: "Flux (Schnell, Dev, Pro)",
    description: "State-of-the-art model with best-in-class prompt adherence and text rendering. Uses pure natural language.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: false,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "6-10 for Schnell, 20-50 for Dev/Pro",
      cfg: "1.0 for GGUF models, 3-4 for standard",
      resolution: "1024x1024 and various aspect ratios",
    },
    tips: [
      "Write in pure natural language - describe the image as if to a human artist",
      "Be specific and detailed - Flux thrives on rich descriptions",
      "Place critical requirements at the beginning (Flux weighs earlier content more)",
      "Excellent text rendering - use quotes for exact text: 'text \"HELLO\" appears on sign'",
      "For photorealism, include device names: 'shot on iPhone 16', lens specs, aperture",
      "Use phrases like 'with emphasis on' or 'with a focus on' instead of weights",
      "Describe what you want, not what you don't want (no negative prompts)",
      "For complex scenes, describe spatial relationships explicitly",
      "One change at a time when iterating - understand each effect",
    ],
    commonMistakes: [
      "Using prompt weights like (keyword:1.2) - not supported",
      "Using negative prompts - not supported, rephrase positively",
      "Using 'white background' with Dev variant (causes blur) - be specific instead",
      "Including contradictory descriptions ('bright sunny day with moody shadows')",
      "Using old keyword-style prompts from SD1.5",
      "Vague descriptions - Flux needs specificity",
    ],
    examplePrompt: "A photorealistic portrait of an elderly Japanese craftsman in his traditional woodworking workshop. He wears a worn indigo happi coat and focuses intently on carving an intricate wooden dragon. Warm afternoon light filters through rice paper screens, creating soft shadows. Tools hang organized on pegboard walls. The scene conveys decades of mastery and quiet dedication. Shot on Hasselblad X2D 100C, 85mm lens, f/2.8, natural window lighting",
  },
};

/**
 * Get prompting guide for a specific model type
 */
export function getPromptingGuide(modelType: string): ModelPromptingGuide | null {
  const normalizedType = modelType.toLowerCase();

  // Try exact match first
  if (PROMPTING_GUIDES[normalizedType]) {
    return PROMPTING_GUIDES[normalizedType];
  }

  // Try pattern matching
  if (normalizedType.includes("flux")) {
    return PROMPTING_GUIDES["flux"];
  }
  if (normalizedType.includes("sd3") || normalizedType.includes("sd 3")) {
    return PROMPTING_GUIDES["sd3"];
  }
  if (normalizedType.includes("sdxl") || normalizedType.includes("xl")) {
    return PROMPTING_GUIDES["sdxl"];
  }
  if (normalizedType.includes("sd1") || normalizedType.includes("1.5") || normalizedType.includes("sd 1")) {
    return PROMPTING_GUIDES["sd15"];
  }

  return null;
}

/**
 * Get all available prompting guides
 */
export function getAllPromptingGuides(): ModelPromptingGuide[] {
  return Object.values(PROMPTING_GUIDES);
}

/**
 * Format a prompting guide as a readable string
 */
export function formatPromptingGuide(guide: ModelPromptingGuide): string {
  const lines: string[] = [
    `# ${guide.modelType} Prompting Guide`,
    "",
    guide.description,
    "",
    "## Prompting Style",
    `- Style: ${guide.promptingStyle.replace("_", " ")}`,
    `- Negative prompts: ${guide.supportsNegativePrompt ? "Supported" : "Not supported"}`,
    `- Prompt weights: ${guide.supportsPromptWeights ? "Supported" : "Not supported"}`,
    "",
    "## Recommended Settings",
  ];

  if (guide.recommendedSettings.steps) {
    lines.push(`- Steps: ${guide.recommendedSettings.steps}`);
  }
  if (guide.recommendedSettings.cfg) {
    lines.push(`- CFG: ${guide.recommendedSettings.cfg}`);
  }
  if (guide.recommendedSettings.resolution) {
    lines.push(`- Resolution: ${guide.recommendedSettings.resolution}`);
  }

  lines.push("", "## Tips");
  for (const tip of guide.tips) {
    lines.push(`- ${tip}`);
  }

  lines.push("", "## Common Mistakes to Avoid");
  for (const mistake of guide.commonMistakes) {
    lines.push(`- ${mistake}`);
  }

  lines.push("", "## Example Prompt", "", `\`\`\``, guide.examplePrompt, `\`\`\``);

  return lines.join("\n");
}

/**
 * Get a comprehensive prompting guide covering all models
 */
export function getComprehensiveGuide(): string {
  const lines: string[] = [
    "# ComfyUI Image Generation Prompting Guide",
    "",
    "This guide covers best practices for prompting different AI image generation models.",
    "",
    "## Quick Reference",
    "",
    "| Model | Style | Negative Prompts | Weights | CFG |",
    "|-------|-------|------------------|---------|-----|",
    "| SD 1.5 | Keywords | Required | Yes | 7-8 |",
    "| SDXL | Hybrid | Optional | Yes (0.8-1.4) | 5-7 |",
    "| SD3/3.5 | Natural | Optional | No | 4-7 |",
    "| Flux | Natural | No | No | 1-4 |",
    "",
    "## Model Evolution",
    "",
    "As models evolved, prompting shifted from keyword-based to natural language:",
    "",
    "1. **SD 1.5**: Keyword tags, quality boosters essential, limited composition",
    "2. **SDXL**: Hybrid approach, better composition, less reliant on negative prompts",
    "3. **SD3**: Natural language, excellent text rendering, positioning matters",
    "4. **Flux**: Pure natural language, best prompt adherence, no weights/negatives",
    "",
  ];

  // Add each model's guide
  for (const guide of Object.values(PROMPTING_GUIDES)) {
    lines.push("---", "");
    lines.push(formatPromptingGuide(guide));
    lines.push("");
  }

  lines.push(
    "---",
    "",
    "## General Tips",
    "",
    "1. **Know your model**: Different models require different prompting approaches",
    "2. **Start simple**: Begin with a basic prompt and iterate",
    "3. **Be specific**: Vague prompts produce vague results",
    "4. **Use appropriate resolution**: Stick to trained resolutions for best results",
    "5. **Iterate thoughtfully**: Change one element at a time to understand effects",
    "",
    "## Sources",
    "",
    "- [Stable Diffusion Art - Prompt Guide](https://stable-diffusion-art.com/prompt-guide/)",
    "- [Segmind - SDXL Prompt Guide](https://blog.segmind.com/prompt-guide-for-stable-diffusion-xl-crafting-textual-descriptions-for-image-generation/)",
    "- [getimg.ai - Flux Prompt Guide](https://getimg.ai/blog/flux-1-prompt-guide-pro-tips-and-common-mistakes-to-avoid/)",
    "- [Civitai - Model Comparison](https://civitai.com/articles/7058/comparative-study-sd15-sdxl-sd3-pony-flux)",
    "- [Black Forest Labs - Flux Prompting Guide](https://docs.bfl.ml/guides/prompting_guide_flux2)",
  );

  return lines.join("\n");
}
