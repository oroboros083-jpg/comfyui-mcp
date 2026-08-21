/**
 * Prompting Guide for AI Image Generation Models
 *
 * This resource provides best practices for prompting different model types
 * supported by ComfyUI.
 */

import { architectureFor } from "../architectures/registry.js";

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

  "qwen": {
    modelType: "Qwen Image",
    description: "Alibaba's 20B MMDiT model with excellent text rendering and image editing. Uses an LLM as CLIP encoder, making it highly flexible with natural language.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: false,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "8 with Lightning LoRA, 25-40 for native quality",
      cfg: "1 for Lightning, 3-5 for native",
      resolution: "1024x1024, supports various aspect ratios",
    },
    tips: [
      "Uses an LLM as CLIP - extremely flexible with natural language, just describe what you want",
      "Prompt formula: Subject + Scene + Style + Lens Language + Atmosphere + Details",
      "Keep prompts simple and clear: 1-3 sentences work well",
      "Describe main subject first, then environment, then finer details",
      "For text in images: use double quotes for exact text, specify font style/color if needed",
      "Supports both English and Chinese prompts with high fidelity",
      "Use seed for reproducibility - same seed + prompt = identical output",
      "Excels at complex text rendering and precise image editing",
    ],
    commonMistakes: [
      "Using keyword-style prompts instead of natural descriptions",
      "Overloading prompts - keep it focused and clear",
      "Not using quotes for text you want rendered in the image",
      "Expecting prompt weights to work (they don't)",
    ],
    examplePrompt: "On a pure white background is the text \"Hello World\" rendered in elegant gold calligraphy. The letters have a subtle metallic sheen with soft shadows beneath them. The style is minimalist and premium, like luxury brand typography.",
  },

  "hunyuan": {
    modelType: "Hunyuan DiT",
    description: "Tencent's powerful diffusion transformer with fine-grained understanding of both English and Chinese. Excels at cinematic, detailed imagery.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: true,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "20-50",
      cfg: "4-7",
      resolution: "1024x1024, auto-resolution based on prompt available",
    },
    tips: [
      "Supports 1000+ character prompts - be detailed and comprehensive",
      "Structure: Main subject/scene + Image quality/style + Composition + Lighting + Technical params",
      "Cinematic prompts work exceptionally well - describe like a film scene",
      "Use professional terminology: 'wide-angle view', 'soft focus', 'lens flare'",
      "Include environmental cues: weather, time of day, lighting effects",
      "For text in images: put exact text in quotation marks",
      "Explicitly define spatial relationships for multi-subject scenes",
      "Consider using PromptEnhancer for improved results",
    ],
    commonMistakes: [
      "Writing short, vague prompts (Hunyuan thrives on detail)",
      "Not leveraging the large context window",
      "Forgetting to describe lighting and atmosphere",
      "Using keyword-style prompts from older models",
    ],
    examplePrompt: "A sweeping cinematic shot of an ancient temple complex nestled in misty mountains at dawn. Shafts of golden sunlight pierce through the fog, illuminating ornate stone carvings covered in moss. A solitary monk in saffron robes walks along a weathered stone path. The atmosphere is serene and mystical. Wide-angle view, volumetric lighting, soft morning haze, shot on ARRI Alexa 65, anamorphic lens flare.",
  },

  "auraflow": {
    modelType: "AuraFlow",
    description: "The largest (6.8B) open-source text-to-image model with Apache 2.0 license. Exceptional prompt following and flexibility.",
    promptingStyle: "hybrid",
    supportsNegativePrompt: true,
    supportsPromptWeights: true,
    recommendedSettings: {
      steps: "20 for iteration, 50 for final quality",
      cfg: "3.5",
      resolution: "1024x1024",
    },
    tips: [
      "Exceptionally good at following long, detailed prompts",
      "Supports both natural language and Danbooru-style tags",
      "Quality modifiers and rating modifiers can influence aesthetic style",
      "Has built-in natural language enhancement for simpler prompts",
      "Can understand complex multi-element descriptions",
      "For Pony V7 finetunes: focus on descriptive language over quality tags",
      "Experiment with both prompting styles to find what works best",
    ],
    commonMistakes: [
      "Not taking advantage of detailed prompt capabilities",
      "Using incompatible prompting styles from other models",
      "Setting CFG too high (3.5 is the recommended default)",
      "Not iterating with lower steps before final render",
    ],
    examplePrompt: "Extreme close-up of an iguana with vibrant blue-green scales, intricate textures and details visible on scaly skin. Wrapped in a dark hood giving a regal appearance. Dramatic side lighting emphasizing scale patterns, shallow depth of field, dark moody background.",
  },

  "kolors": {
    modelType: "Kolors",
    description: "Kwai's bilingual (Chinese/English) text-to-image model trained on billions of pairs. Excels at photorealistic images.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: true,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "50",
      cfg: "5",
      resolution: "1024x1024, various aspect ratios",
    },
    tips: [
      "Great at photorealistic images with simple prompts",
      "Supports 256 token context length",
      "Bilingual - works with both English and Chinese prompts",
      "Chinese prompts may sometimes produce better results",
      "Uses EulerDiscreteScheduler by default for best results",
      "Complex prompts are understood but keep expectations reasonable",
      "Focus on clear subject and scene descriptions",
    ],
    commonMistakes: [
      "Expecting SDXL-level prompt adherence on complex scenes",
      "Using schedulers other than Euler without adjusting CFG",
      "Overly long prompts (256 token limit)",
      "Not trying Chinese translation for difficult prompts",
    ],
    examplePrompt: "Portrait of a young woman in a traditional Chinese hanfu dress, standing in a bamboo forest. Soft natural lighting filters through the leaves, creating dappled shadows. Her expression is serene and contemplative. Photorealistic, highly detailed fabric textures.",
  },

  "pixart": {
    modelType: "PixArt (Alpha/Sigma)",
    description: "Efficient DiT model (0.6B params) capable of generating up to 4K images. Good prompt adherence with detailed descriptions.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: true,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "20-30",
      cfg: "4.5",
      resolution: "512x512, 1024x1024, 2K, 4K supported",
    },
    tips: [
      "Detailed, descriptive prompts produce best results",
      "Structure prompts like describing a photograph or painting",
      "Include cinematic details: lighting, camera specs, film style",
      "Can be refined with SDXL refiner for improved quality",
      "Sigma version has better prompt understanding than Alpha",
      "Describe spatial relationships for complex compositions",
      "Use torch.compile for 20-30% faster inference",
    ],
    commonMistakes: [
      "Expecting good text rendering (PixArt struggles with text)",
      "Compositional prompts like 'X on top of Y' may not work well",
      "Using prompts that are too short or vague",
      "Not leveraging the multi-resolution capabilities",
    ],
    examplePrompt: "An extreme close-up of a gray-haired man with a beard in his 60s, deep in thought pondering the history of the universe as he sits at a cafe in Paris. His eyes focus on people offscreen. He wears a wool suit coat with a button-down shirt, a brown beret and glasses, with a professorial appearance. Cinematic golden hour lighting, Parisian streets in background, depth of field, 35mm film.",
  },

  "playground": {
    modelType: "Playground v2.5",
    description: "State-of-the-art open-source model for aesthetic quality. Outperforms SDXL and competes with DALL-E 3 and Midjourney in user studies.",
    promptingStyle: "hybrid",
    supportsNegativePrompt: true,
    supportsPromptWeights: true,
    recommendedSettings: {
      steps: "25-50",
      cfg: "3.0 for EDM scheduler, 5.0 for DPM++, 7.0 for Euler/Heun",
      resolution: "1024x1024, multiple aspect ratios supported",
    },
    tips: [
      "Excels at vibrant colors and high contrast images",
      "Quality modifiers still work: 'detailed', '8k', 'muted colors'",
      "Subject + color/mood descriptors + quality modifiers formula works well",
      "Uses EDMDPMSolverMultistepScheduler by default for crisp details",
      "No offset noise needed - handles contrast naturally",
      "Multiple aspect ratios are well-supported",
      "Focus on aesthetic descriptions for best results",
    ],
    commonMistakes: [
      "Expecting photorealistic human skin and hair (not its strength)",
      "Using wrong CFG for the scheduler (varies by scheduler type)",
      "Not leveraging the aesthetic focus of the model",
      "Expecting one-shot perfection - iteration is part of the process",
    ],
    examplePrompt: "Astronaut floating in a bioluminescent jungle on an alien planet, cold color palette, muted greens and blues, detailed spacesuit with glowing elements, mysterious atmosphere, 8k, highly detailed, cinematic composition",
  },

  "cascade": {
    modelType: "Stable Cascade",
    description: "Three-stage model with 42x compression factor. Fast inference, good prompt adherence, and text rendering capabilities.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: true,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "30+20 (prior + decoder)",
      cfg: "4-7",
      resolution: "1024x1024, efficient at high resolutions",
    },
    tips: [
      "Natural language prompts work well, but old keyword prompts are also understood",
      "Faster than SDXL - about 2x speed improvement",
      "Can render text in generated images",
      "Supports image variations from embeddings without prompts",
      "ControlNets available: inpainting, outpainting, canny edge",
      "Describe subject, action, camera specs, quality, and style",
      "Negative prompts help avoid undesired elements",
    ],
    commonMistakes: [
      "Expecting perfect faces (the autoencoder is lossy)",
      "Not using appropriate negative prompts for quality control",
      "Underestimating the value of detailed descriptions",
      "Not taking advantage of the speed for iteration",
    ],
    examplePrompt: "A majestic snow leopard perched on a rocky mountain outcrop at sunset. The golden light catches its spotted fur and piercing blue eyes. Snow-capped peaks stretch into the distance under a gradient sky of orange and purple. Highly detailed fur texture, cinematic composition, National Geographic photography style.",
  },
};

/**
 * Get prompting guide for a specific model type
 */
export function getPromptingGuide(modelType: string): ModelPromptingGuide | null {
  const normalizedType = modelType.toLowerCase();

  // Exact key first: callers that already know the key get it unchanged.
  if (PROMPTING_GUIDES[normalizedType]) {
    return PROMPTING_GUIDES[normalizedType];
  }

  // Otherwise resolve through the architecture registry, which owns the
  // aliases and detection patterns. This used to be a hand-maintained
  // if/else chain that had to be extended for every architecture and could
  // not answer for a raw model filename.
  const spec = architectureFor(normalizedType);
  if (spec?.guide && PROMPTING_GUIDES[spec.guide]) {
    return PROMPTING_GUIDES[spec.guide];
  }

  return null;
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
    "| Qwen Image | Natural | No | No | 1-5 |",
    "| Hunyuan | Natural | Optional | No | 4-7 |",
    "| AuraFlow | Hybrid | Optional | Yes | 3.5 |",
    "| Kolors | Natural | Optional | No | 5 |",
    "| PixArt | Natural | Optional | No | 4.5 |",
    "| Playground | Hybrid | Optional | Yes | 3-7 |",
    "| Cascade | Natural | Optional | No | 4-7 |",
    "",
    "## Model Evolution",
    "",
    "As models evolved, prompting shifted from keyword-based to natural language:",
    "",
    "1. **SD 1.5**: Keyword tags, quality boosters essential, limited composition",
    "2. **SDXL**: Hybrid approach, better composition, less reliant on negative prompts",
    "3. **SD3**: Natural language, excellent text rendering, positioning matters",
    "4. **Flux**: Pure natural language, best prompt adherence, no weights/negatives",
    "5. **Qwen/Hunyuan**: LLM-based encoders, extremely flexible natural language",
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
    "- [Segmind - Qwen Image Guide](https://blog.segmind.com/qwen-image-prompt-parameter-guide/)",
    "- [Hunyuan Image 3.0 Prompt Guide](https://yuanic.com/blog/hunyuan-image-3-advanced-prompt-engineering-guide)",
    "- [fal.ai - AuraFlow](https://blog.fal.ai/auraflow/)",
    "- [Kwai-Kolors GitHub](https://github.com/Kwai-Kolors/Kolors)",
    "- [PixArt-Sigma Project](https://pixart-alpha.github.io/PixArt-sigma-project/)",
    "- [Playground Prompt Guide](https://playground.com/prompt-guide)",
    "- [Stability AI - Stable Cascade](https://stability.ai/news/introducing-stable-cascade)",
  );

  return lines.join("\n");
}
