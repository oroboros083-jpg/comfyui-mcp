/**
 * The Stability lineage: SD 1.5, SDXL, SD3/3.5, Stable Cascade.
 *
 * Tips and mistakes here are carried forward from the original single-file
 * guide unchanged - they were accurate. What is new is `starters`, `models`
 * (Hugging Face cards) and, where a model has one, `specialTags`.
 */

import { ModelPromptingGuide } from "../types.js";
import { COMFY_TEXT_ENCODE_SYNTAX, NATURAL_LANGUAGE_SYNTAX } from "./vocabulary.js";

export const STABLE_DIFFUSION_GUIDES: Record<string, ModelPromptingGuide> = {
  sd15: {
    modelType: "Stable Diffusion 1.5",
    description:
      "The original Stable Diffusion model. Works best with keyword-style prompts separated by commas.",
    promptingStyle: "keywords",
    supportsNegativePrompt: true,
    supportsPromptWeights: true,
    recommendedSettings: {
      steps: "20-30",
      cfg: "7-8",
      resolution: "512x512 (native), 768x512, 512x768",
    },
    specialTags: {
      quality: ["masterpiece", "best quality", "highly detailed", "sharp focus", "8k uhd"],
      negativeQuality: [
        "worst quality",
        "low quality",
        "blurry",
        "bad anatomy",
        "extra limbs",
        "watermark",
      ],
      notes:
        "SD 1.5 depends on quality boosters more than any later model, and its negative prompt is not optional - an empty negative visibly costs quality.",
    },
    syntax: COMFY_TEXT_ENCODE_SYNTAX,
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
    examplePrompt:
      "a beautiful woman, portrait, detailed face, green eyes, red hair, soft lighting, masterpiece, best quality, highly detailed, sharp focus, 8k uhd",
    starters: [
      {
        label: "Portrait",
        prompt:
          "portrait of a young woman, detailed face, green eyes, auburn hair, freckles, soft window light, shallow depth of field, masterpiece, best quality, highly detailed, sharp focus",
        negativePrompt:
          "worst quality, low quality, blurry, bad anatomy, extra limbs, deformed hands, watermark, text",
        notes: "512x768, 25 steps, CFG 7.5.",
      },
      {
        label: "Landscape",
        prompt:
          "mountain valley at sunrise, alpine lake, pine forest, mist, dramatic clouds, golden light, masterpiece, best quality, highly detailed, 8k uhd",
        negativePrompt: "worst quality, low quality, blurry, watermark, text, people",
        notes: "768x512, 25 steps, CFG 7.",
      },
    ],
    models: [
      {
        name: "Stable Diffusion v1.5",
        huggingFace: "runwayml/stable-diffusion-v1-5",
        note: "The original repo has been restricted at times; community mirrors carry the same weights.",
      },
    ],
  },

  sdxl: {
    modelType: "Stable Diffusion XL",
    description:
      "Enhanced model with better prompt understanding. Supports both keyword and natural language styles.",
    promptingStyle: "hybrid",
    supportsNegativePrompt: true,
    supportsPromptWeights: true,
    recommendedSettings: {
      steps: "20-30",
      cfg: "5-7 (lower than SD1.5)",
      resolution:
        "1024x1024 (native), 1152x896, 896x1152, 1216x832, 832x1216",
    },
    syntax: COMFY_TEXT_ENCODE_SYNTAX,
    tips: [
      "Natural language descriptions work well - describe scenes like a photographer",
      "Keyword style still works but natural language often produces better results",
      "Negative prompts are less critical than SD1.5, but still useful",
      "SDXL is more sensitive to weights - keep between 0.8-1.4",
      "Include photographic terms for realism: camera model, lens, lighting setup",
      "Dual text encoders allow style separation (main prompt + style prompt)",
      "Complex multi-subject scenes work much better than SD1.5",
      "Quality tags less necessary - SDXL handles quality well by default",
      "This is BASE SDXL. Anime finetunes built on it (Illustrious, NoobAI, Pony, Animagine) want booru tags instead - ask for their guide by name",
    ],
    commonMistakes: [
      "Using very long negative prompt lists (not needed like SD1.5)",
      "Going above 1.4 on prompt weights",
      "Using non-standard resolutions like 1000x1000 (stick to trained sizes)",
      "Using SD1.5 LoRAs (incompatible - must use SDXL LoRAs)",
      "Overcrowding with quality boosters (SDXL doesn't need as many)",
      "Applying this guide to an anime finetune - those are a different prompting world",
    ],
    examplePrompt:
      "A serene mountain lake at golden hour, with snow-capped peaks reflected in crystal clear water. A small wooden cabin sits at the water's edge, smoke rising from its chimney. Shot on Sony A7R IV, 24mm wide angle lens, f/8, golden hour lighting",
    starters: [
      {
        label: "Photographic",
        prompt:
          "A weathered fisherman mending nets on a harbour wall at dawn, fishing boats behind him, cold blue light, steam rising from a thermos. Shot on Canon EOS R5, 85mm, f/2.0, natural light",
        negativePrompt: "blurry, low quality, distorted hands, watermark",
        notes: "1024x1024, 28 steps, CFG 6.",
      },
      {
        label: "Illustrative",
        prompt:
          "An illustrated poster of a lighthouse in a storm, bold flat colours, strong silhouettes, limited palette of navy and amber, art deco composition, clean linework",
        negativePrompt: "photorealistic, blurry, text, watermark",
        notes: "832x1216, 30 steps, CFG 6.5.",
      },
    ],
    models: [
      {
        name: "SDXL base 1.0",
        huggingFace: "stabilityai/stable-diffusion-xl-base-1.0",
      },
      {
        name: "SDXL refiner 1.0",
        huggingFace: "stabilityai/stable-diffusion-xl-refiner-1.0",
        note: "Optional second pass over the base model's latent.",
      },
      {
        name: "SDXL Turbo",
        huggingFace: "stabilityai/sdxl-turbo",
        note: "Distilled: 1-4 steps at CFG 1.",
      },
    ],
  },

  sd3: {
    modelType: "Stable Diffusion 3 / 3.5",
    description:
      "Latest generation with excellent prompt adherence and text rendering. Uses natural language prompting.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: true,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "20-28",
      cfg: "4-7",
      resolution: "1024x1024 (native), various aspect ratios supported",
    },
    syntax: NATURAL_LANGUAGE_SYNTAX,
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
    examplePrompt:
      "A cozy bookshop interior with floor-to-ceiling wooden shelves filled with colorful books. Warm afternoon sunlight streams through a large arched window, illuminating dust particles floating in the air. A tabby cat sleeps on a velvet armchair, and a steaming cup of tea sits on a side table with a sign reading 'Please Browse'",
    starters: [
      {
        label: "Scene with rendered text",
        prompt:
          'A hand-painted wooden shop sign hanging above a cobblestone street, reading "THE GILDED PAGE" in ornate gold serif lettering. Warm evening light, wrought iron bracket, soft focus on the street behind.',
        notes: "Quote the exact text; SD3.5 renders it reliably.",
      },
      {
        label: "Multi-subject composition",
        prompt:
          "Three children building a sandcastle on a wide empty beach at low tide. The eldest kneels shaping a tower on the left, the youngest carries a bucket of water from the right, and the middle one presses shells into the wall. Overcast soft light, wet sand reflecting the sky.",
        negativePrompt: "blurry, distorted faces, extra limbs",
      },
    ],
    models: [
      { name: "SD 3.5 Large", huggingFace: "stabilityai/stable-diffusion-3.5-large" },
      { name: "SD 3.5 Medium", huggingFace: "stabilityai/stable-diffusion-3.5-medium" },
      {
        name: "SD 3.5 Large Turbo",
        huggingFace: "stabilityai/stable-diffusion-3.5-large-turbo",
        note: "Few-step distilled variant.",
      },
    ],
  },

  cascade: {
    modelType: "Stable Cascade",
    description:
      "Three-stage model with 42x compression factor. Fast inference, good prompt adherence, and text rendering capabilities.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: true,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "30+20 (prior + decoder)",
      cfg: "4-7",
      resolution: "1024x1024, efficient at high resolutions",
    },
    syntax: NATURAL_LANGUAGE_SYNTAX,
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
    examplePrompt:
      "A majestic snow leopard perched on a rocky mountain outcrop at sunset. The golden light catches its spotted fur and piercing blue eyes. Snow-capped peaks stretch into the distance under a gradient sky of orange and purple. Highly detailed fur texture, cinematic composition, National Geographic photography style.",
    starters: [
      {
        label: "Wildlife",
        prompt:
          "A red fox stepping through deep snow in a birch forest at dusk, breath visible in the cold air, low winter sun behind the trees. Highly detailed fur, cinematic composition, wildlife photography.",
        negativePrompt: "blurry, low quality, distorted anatomy, watermark",
      },
      {
        label: "Architectural",
        prompt:
          "The interior of a vast library carved into sandstone cliffs, spiral staircases winding between reading galleries, shafts of light from high windows, scholars at distant desks. Warm stone tones, dramatic scale.",
        negativePrompt: "blurry, low quality, text, watermark",
      },
    ],
    models: [{ name: "Stable Cascade", huggingFace: "stabilityai/stable-cascade" }],
  },
};
