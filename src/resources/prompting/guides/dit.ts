/**
 * Diffusion-transformer image models that are neither Stability lineage nor
 * Flux derivatives.
 *
 * The last four here - hidream, lumina, zimage, omnigen - had registry rows
 * but no guide at all, so asking about them returned "no dedicated prompting
 * guide yet" and a pointer at the closest fit.
 */

import { ModelPromptingGuide } from "../types.js";
import { SPATIAL_CONTROL_NOTE } from "./vocabulary.js";

export const DIT_GUIDES: Record<string, ModelPromptingGuide> = {
  qwen: {
    modelType: "Qwen Image",
    description:
      "Alibaba's 20B MMDiT model with excellent text rendering and image editing. Uses an LLM as CLIP encoder, making it highly flexible with natural language.",
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
    examplePrompt:
      'On a pure white background is the text "Hello World" rendered in elegant gold calligraphy. The letters have a subtle metallic sheen with soft shadows beneath them. The style is minimalist and premium, like luxury brand typography.',
    starters: [
      {
        label: "Typography",
        prompt:
          'A minimalist poster on warm cream paper with the words "SLOW MORNINGS" set in a thin geometric sans-serif, centred, deep charcoal ink. A single small coffee ring stain sits in the lower right corner.',
        notes: "Qwen's strongest suit. Quote the text exactly.",
      },
      {
        label: "Bilingual sign",
        prompt:
          'A weathered bilingual street sign on a Hong Kong corner reading "NATHAN ROAD" above the Chinese characters 彌敦道, white on green enamel, neon glow reflecting off it at night.',
      },
    ],
    models: [
      { name: "Qwen-Image", huggingFace: "Qwen/Qwen-Image" },
      {
        name: "ComfyUI repackaged",
        huggingFace: "Comfy-Org/Qwen_Image_ComfyUI",
        note: "Split files ready for UNETLoader + CLIPLoader + VAELoader.",
      },
    ],
  },

  hunyuan: {
    modelType: "Hunyuan DiT",
    description:
      "Tencent's powerful diffusion transformer with fine-grained understanding of both English and Chinese. Excels at cinematic, detailed imagery.",
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
    examplePrompt:
      "A sweeping cinematic shot of an ancient temple complex nestled in misty mountains at dawn. Shafts of golden sunlight pierce through the fog, illuminating ornate stone carvings covered in moss. A solitary monk in saffron robes walks along a weathered stone path. The atmosphere is serene and mystical. Wide-angle view, volumetric lighting, soft morning haze, shot on ARRI Alexa 65, anamorphic lens flare.",
    starters: [
      {
        label: "Cinematic establishing shot",
        prompt:
          "A wide cinematic establishing shot of a fishing village clinging to a cliff face at first light. Wooden walkways zigzag between houses, lanterns still lit, boats returning across a mirror-flat sea. Cold blue shadows against warm lantern light, low mist over the water, volumetric god rays through a gap in the cliffs. Shot on ARRI Alexa 65, anamorphic lens, subtle flare.",
        negativePrompt: "blurry, low resolution, distorted architecture, watermark",
      },
      {
        label: "Detailed interior",
        prompt:
          "The interior of a traditional Chinese apothecary at dusk. Hundreds of small labelled drawers line the back wall, brass scales rest on a worn counter, dried herbs hang from ceiling beams. An elderly herbalist weighs a measure by lamplight. Warm amber lighting, deep shadows in the corners, fine dust in the air, shallow depth of field.",
        negativePrompt: "modern objects, blurry, distorted text",
      },
    ],
    models: [
      {
        name: "HunyuanDiT",
        huggingFace: "comfyanonymous/hunyuan_dit_comfyui",
        note: "ComfyUI-ready single-file builds.",
      },
      {
        name: "HunyuanImage 2.1",
        huggingFace: "Comfy-Org/HunyuanImage_2.1_ComfyUI",
      },
    ],
  },

  auraflow: {
    modelType: "AuraFlow",
    description:
      "The largest (6.8B) open-source text-to-image model with Apache 2.0 license. Exceptional prompt following and flexibility.",
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
      "Pony V7 is built on AuraFlow: it wants descriptive language, NOT the V6 score_* tags",
      "Experiment with both prompting styles to find what works best",
    ],
    commonMistakes: [
      "Not taking advantage of detailed prompt capabilities",
      "Using incompatible prompting styles from other models",
      "Setting CFG too high (3.5 is the recommended default)",
      "Carrying Pony V6 score tags onto a V7/AuraFlow checkpoint, where they do nothing",
    ],
    examplePrompt:
      "Extreme close-up of an iguana with vibrant blue-green scales, intricate textures and details visible on scaly skin. Wrapped in a dark hood giving a regal appearance. Dramatic side lighting emphasizing scale patterns, shallow depth of field, dark moody background.",
    starters: [
      {
        label: "Long descriptive prompt",
        prompt:
          "A cluttered watchmaker's bench photographed from directly above. Dozens of tiny brass gears are arranged in loose groups, a loupe rests on a folded chamois, tweezers lie across an open pocket watch with its movement exposed. Warm task lighting from the upper left, deep shadows between the tools, fine metal dust catching the light. Shallow depth of field with the open watch in sharpest focus.",
        negativePrompt: "blurry, low detail, watermark, text",
      },
      {
        label: "Tag-style",
        prompt:
          "1girl, solo, long hair, hooded cloak, standing in a pine forest, fog, dappled light, detailed background, painterly, masterpiece",
        negativePrompt: "low quality, bad anatomy, watermark",
        notes: "AuraFlow accepts tags as readily as prose - useful for style transfer from tag-trained sources.",
      },
    ],
    models: [
      { name: "AuraFlow", huggingFace: "fal/AuraFlow" },
      { name: "AuraFlow v0.2", huggingFace: "fal/AuraFlow-v0.2" },
    ],
  },

  kolors: {
    modelType: "Kolors",
    description:
      "Kwai's bilingual (Chinese/English) text-to-image model trained on billions of pairs. Excels at photorealistic images.",
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
    examplePrompt:
      "Portrait of a young woman in a traditional Chinese hanfu dress, standing in a bamboo forest. Soft natural lighting filters through the leaves, creating dappled shadows. Her expression is serene and contemplative. Photorealistic, highly detailed fabric textures.",
    starters: [
      {
        label: "Photoreal portrait",
        prompt:
          "Portrait of a man in his thirties wearing a charcoal wool coat, standing on a rainy city street at night. Neon signs reflect in the wet pavement behind him. Shallow depth of field, photorealistic skin texture.",
        negativePrompt: "blurry, distorted face, extra fingers, watermark",
      },
      {
        label: "Same prompt in Chinese",
        prompt:
          "一位三十多岁的男子身穿炭灰色羊毛大衣，站在雨夜的城市街道上。身后霓虹灯招牌倒映在湿漉漉的路面上。浅景深，写实皮肤质感。",
        notes: "Worth trying when the English version underperforms.",
      },
    ],
    models: [{ name: "Kolors", huggingFace: "Kwai-Kolors/Kolors" }],
  },

  pixart: {
    modelType: "PixArt (Alpha/Sigma)",
    description:
      "Efficient DiT model (0.6B params) capable of generating up to 4K images. Good prompt adherence with detailed descriptions.",
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
      SPATIAL_CONTROL_NOTE,
      "Use torch.compile for 20-30% faster inference",
    ],
    commonMistakes: [
      "Expecting good text rendering (PixArt struggles with text)",
      "Compositional prompts like 'X on top of Y' may not work well",
      "Using prompts that are too short or vague",
      "Not leveraging the multi-resolution capabilities",
    ],
    examplePrompt:
      "An extreme close-up of a gray-haired man with a beard in his 60s, deep in thought pondering the history of the universe as he sits at a cafe in Paris. His eyes focus on people offscreen. He wears a wool suit coat with a button-down shirt, a brown beret and glasses, with a professorial appearance. Cinematic golden hour lighting, Parisian streets in background, depth of field, 35mm film.",
    starters: [
      {
        label: "Cinematic character study",
        prompt:
          "A close-up of a woman in her forties leaning against a train window, watching the countryside blur past. Reflected light moves across her face. She wears a grey turtleneck and a thin gold chain. Cinematic overcast lighting, shallow depth of field, 35mm film grain.",
        negativePrompt: "blurry, distorted face, text, watermark",
      },
      {
        label: "High-resolution landscape",
        prompt:
          "A vast salt flat under a clear night sky, thin water film mirroring the Milky Way, distant mountains on the horizon, a single set of footprints leading toward the frame edge. Long exposure, astrophotography, extremely high detail.",
        negativePrompt: "blurry, noise, watermark",
        notes: "Worth pushing to 2K here - PixArt is comfortable at high resolutions.",
      },
    ],
    models: [
      { name: "PixArt-Sigma XL 2 1024", huggingFace: "PixArt-alpha/PixArt-Sigma-XL-2-1024-MS" },
    ],
  },

  playground: {
    modelType: "Playground v2.5",
    description:
      "State-of-the-art open-source model for aesthetic quality. Outperforms SDXL and competes with DALL-E 3 and Midjourney in user studies.",
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
    examplePrompt:
      "Astronaut floating in a bioluminescent jungle on an alien planet, cold color palette, muted greens and blues, detailed spacesuit with glowing elements, mysterious atmosphere, 8k, highly detailed, cinematic composition",
    starters: [
      {
        label: "High-contrast concept art",
        prompt:
          "A lone figure on a black sand beach beneath towering basalt columns, bioluminescent surf, cold teal and deep violet palette, dramatic rim lighting, 8k, highly detailed, cinematic composition",
        negativePrompt: "muddy colours, low contrast, blurry, watermark",
        notes: "CFG 3.0 on the EDM scheduler.",
      },
      {
        label: "Muted, painterly",
        prompt:
          "A quiet kitchen table with a half-peeled orange, a folded newspaper and a cold cup of tea, morning light through a net curtain, muted colours, soft contrast, painterly, detailed",
        negativePrompt: "oversaturated, harsh lighting, text, watermark",
      },
    ],
    models: [
      {
        name: "Playground v2.5 1024px Aesthetic",
        huggingFace: "playgroundai/playground-v2.5-1024px-aesthetic",
      },
    ],
  },

  hidream: {
    modelType: "HiDream-I1",
    description:
      "A 17B open-source image model with strong prompt adherence across photorealistic, illustrated and artistic styles. Natural-language prompted, released in Full, Dev and Fast variants.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: true,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "50 for Full, 28 for Dev, 16 for Fast",
      cfg: "5 for Full, 1 for Dev and Fast",
      resolution: "1024x1024 and standard aspect ratios",
    },
    tips: [
      "Describe the scene in full sentences, as with Flux - specifics before mood",
      "Name the style explicitly; it moves cleanly between photoreal and illustration",
      "Match CFG to the variant: Full wants ~5, the distilled Dev and Fast want 1",
      "Strong at faces and hands relative to its generation",
      "Handles short rendered text reasonably; quote it exactly",
    ],
    commonMistakes: [
      "Running Dev or Fast at Full's CFG and getting over-saturated output",
      "Using keyword or booru tags - this is a natural-language model",
      "Expecting prompt weights to apply",
    ],
    examplePrompt:
      "A watercolour illustration of a fox curled asleep in a bed of ferns, soft granulating pigment, loose wet edges, muted forest palette, a shaft of light falling across its back",
    starters: [
      {
        label: "Photoreal",
        prompt:
          "A market stall selling dried chillies in a covered bazaar, hundreds of deep red pods heaped in woven baskets, the vendor's hands weighing a portion on brass scales, warm shafts of light from vents in the roof, fine dust in the air. Photorealistic, shallow depth of field.",
        negativePrompt: "blurry, distorted hands, watermark",
        notes: "Full variant: 50 steps, CFG 5.",
      },
      {
        label: "Illustrated",
        prompt:
          "A children's book illustration of a whale swimming above a sleeping town, stars trailing from its fins, soft gouache texture, limited palette of navy, cream and gold, gentle and dreamlike",
        negativePrompt: "photorealistic, harsh contrast, text",
      },
    ],
    models: [
      { name: "HiDream-I1 Full", huggingFace: "HiDream-ai/HiDream-I1-Full" },
      {
        name: "ComfyUI repackaged",
        huggingFace: "Comfy-Org/HiDream-I1_ComfyUI",
      },
    ],
  },

  lumina: {
    modelType: "Lumina Image 2.0",
    description:
      "A compact (2B) flow-based diffusion transformer from Alpha-VLLM with strong prompt following for its size. Responds well to detailed, structured natural-language descriptions.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: true,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "30-50",
      cfg: "4-6",
      resolution: "1024x1024 and standard aspect ratios",
    },
    tips: [
      "Detailed prompts pay off more than with most 2B models",
      "Lead with the subject, then setting, then lighting and style",
      "Accepts a system-style preamble ('You are an assistant designing images…') which can steer overall quality",
      "Negative prompts work and are worth using for style exclusion",
      "Bilingual English/Chinese capability",
    ],
    commonMistakes: [
      "Writing terse prompts - it has the capacity for detail, use it",
      "Expecting prompt weights to apply",
      "Assuming a 2B model needs simple prompts",
    ],
    examplePrompt:
      "A glass terrarium on a windowsill containing a miniature rainforest, tiny ferns and moss-covered stones, condensation on the inside of the glass, soft morning light from behind, shallow depth of field",
    starters: [
      {
        label: "Still life",
        prompt:
          "A still life of three pears on a linen cloth beside a pewter jug, north light from a window on the left, soft shadows, muted earth palette, painterly realism, fine texture in the cloth",
        negativePrompt: "harsh lighting, oversaturated, text, watermark",
      },
      {
        label: "Environment",
        prompt:
          "A narrow canal in an old European town at night, warm light spilling from a single open doorway onto the water, iron railings, wet cobblestones, mist, quiet and deserted",
        negativePrompt: "people, crowds, blurry, watermark",
      },
    ],
    models: [
      { name: "Lumina Image 2.0", huggingFace: "Alpha-VLLM/Lumina-Image-2.0" },
      {
        name: "ComfyUI repackaged",
        huggingFace: "Comfy-Org/Lumina_Image_2.0_Repackaged",
      },
    ],
  },

  zimage: {
    modelType: "Z-Image",
    description:
      "A compact, heavily distilled turbo model built for very low step counts. Prompt as natural language, but expect it to reward brevity and clarity over elaborate description.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: false,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "4-10",
      cfg: "1",
      resolution: "1024x1024 and standard aspect ratios",
    },
    tips: [
      "Distilled turbo model: CFG 1 and single-digit steps, not the usual 20-30",
      "Short, concrete prompts land better than long atmospheric ones",
      "Put the subject and the style in the first clause",
      "Excellent for rapid iteration - generate many, then re-render a winner elsewhere",
      "No negative prompt: exclude by describing what you do want instead",
    ],
    commonMistakes: [
      "Running it at CFG 4-7 like a non-distilled model (produces burnt output)",
      "Using 30+ steps, which costs time without improving the image",
      "Writing very long prompts - the gain flattens quickly",
    ],
    examplePrompt:
      "A red bicycle leaning against a whitewashed wall, bright midday sun, hard shadow, minimal composition",
    starters: [
      {
        label: "Fast iteration",
        prompt: "A ceramic mug on a wooden table, morning light, soft shadow, minimal, photographic",
        notes: "6 steps, CFG 1. Change one noun at a time to explore quickly.",
      },
      {
        label: "Graphic style",
        prompt: "A bold flat-vector poster of a mountain range at sunset, three colours, clean geometry",
        notes: "8 steps, CFG 1.",
      },
    ],
    models: [
      {
        name: "Z-Image Turbo (ComfyUI)",
        huggingFace: "Comfy-Org/z_image_turbo",
      },
    ],
  },

  omnigen: {
    modelType: "OmniGen",
    description:
      "An instruction-following model for image editing and composition rather than pure text-to-image. Prompts are instructions about a change, often referring to one or more input images.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: false,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "25-50",
      cfg: "2.5-3 (text), with a separate image guidance around 1.6",
      resolution: "1024x1024",
    },
    tips: [
      "Write an INSTRUCTION, not a description: 'replace the background with…', not 'a person in a forest'",
      "Refer to input images positionally when there are several ('the man in image 1')",
      "State what should stay unchanged as well as what should change - it reduces drift",
      "One edit per pass gives cleaner results than a compound instruction",
      "Image guidance and text guidance are separate knobs; raise image guidance to preserve the source",
    ],
    commonMistakes: [
      "Prompting it like a text-to-image model and wondering why the input is ignored",
      "Bundling several unrelated edits into one instruction",
      "Leaving image guidance low, so the subject drifts away from the source",
      "Expecting negative prompts or weights to apply",
    ],
    examplePrompt:
      "Replace the background behind the woman in image 1 with a sunlit meadow, keeping her pose, clothing and lighting direction unchanged.",
    starters: [
      {
        label: "Background replacement",
        prompt:
          "Replace the background in image 1 with a quiet library interior, warm lamplight. Keep the subject's pose, clothing, expression and the direction of light on their face unchanged.",
      },
      {
        label: "Two-image composition",
        prompt:
          "Place the cat from image 2 onto the windowsill in image 1, matching the scale, perspective and the cool afternoon light of image 1.",
        notes: "Positional references are what make multi-image edits reliable.",
      },
    ],
    models: [
      {
        name: "OmniGen2 (ComfyUI)",
        huggingFace: "Comfy-Org/Omnigen2_ComfyUI_repackaged",
      },
    ],
  },
};
