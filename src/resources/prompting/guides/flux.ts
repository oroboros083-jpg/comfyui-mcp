/**
 * Flux and its derivatives.
 */

import { ModelPromptingGuide } from "../types.js";
import { SPATIAL_CONTROL_NOTE } from "./vocabulary.js";

export const FLUX_GUIDES: Record<string, ModelPromptingGuide> = {
  flux: {
    modelType: "Flux (Schnell, Dev, Pro)",
    description:
      "State-of-the-art model with best-in-class prompt adherence and text rendering. Uses pure natural language.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: false,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "6-10 for Schnell, 20-50 for Dev/Pro",
      cfg: "1.0 for Schnell and GGUF builds, 3-4 for Dev",
      resolution: "1024x1024 and various aspect ratios",
    },
    tips: [
      "Write in pure natural language - describe the image as if to a human artist",
      "Be specific and detailed - Flux thrives on rich descriptions",
      "Place critical requirements at the beginning (Flux weighs earlier content more)",
      'Excellent text rendering - use quotes for exact text: \'text "HELLO" appears on sign\'',
      "For photorealism, include device names: 'shot on iPhone 16', lens specs, aperture",
      "Use phrases like 'with emphasis on' or 'with a focus on' instead of weights",
      "Describe what you want, not what you don't want (no negative prompts)",
      "For complex scenes, describe spatial relationships explicitly",
      SPATIAL_CONTROL_NOTE,
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
    examplePrompt:
      "A photorealistic portrait of an elderly Japanese craftsman in his traditional woodworking workshop. He wears a worn indigo happi coat and focuses intently on carving an intricate wooden dragon. Warm afternoon light filters through rice paper screens, creating soft shadows. Tools hang organized on pegboard walls. The scene conveys decades of mastery and quiet dedication. Shot on Hasselblad X2D 100C, 85mm lens, f/2.8, natural window lighting",
    starters: [
      {
        label: "Photoreal portrait",
        prompt:
          "A close-up portrait of a woman in her sixties with short grey hair and deep laugh lines, standing in a greenhouse surrounded by tomato vines. She holds a clay pot and looks directly at the camera with a wry half-smile. Humid air, diffused overcast light through glass panels. Shot on Hasselblad X2D, 90mm lens, f/2.8",
        notes: "Schnell: 8 steps, CFG 1. Dev: 28 steps, CFG 3.5.",
      },
      {
        label: "Rendered text",
        prompt:
          'A vintage enamel storefront sign mounted on brick, reading "CORNER BOOKS & COFFEE" in cream lettering on a deep green field, with a small painted cup beneath the words. Late afternoon sun raking across the brick, subtle rust at the mounting bolts.',
        notes: "Quote exact text. Flux renders short signage very reliably.",
      },
      {
        label: "Complex spatial scene",
        prompt:
          "A cutaway view of a narrow four-storey house. On the ground floor a baker slides trays into an oven; on the second a child practises violin by a window; on the third a cat sleeps on stacked books; in the attic an old man repairs a clock. Warm interior light in every room, blue dusk outside. Illustrated cross-section style, clean linework.",
        notes: "Spelling out per-floor placement is what makes the layout hold.",
      },
    ],
    models: [
      { name: "FLUX.1 [dev]", huggingFace: "black-forest-labs/FLUX.1-dev" },
      {
        name: "FLUX.1 [schnell]",
        huggingFace: "black-forest-labs/FLUX.1-schnell",
        note: "Apache 2.0, 4-8 steps at CFG 1.",
      },
      {
        name: "FLUX.1 Kontext [dev]",
        huggingFace: "black-forest-labs/FLUX.1-Kontext-dev",
        note: "Instruction-driven image editing.",
      },
      {
        name: "FLUX.2 [dev]",
        huggingFace: "black-forest-labs/FLUX.2-dev",
      },
      {
        name: "ComfyUI repackaged weights",
        huggingFace: "Comfy-Org/flux1-dev",
        note: "Single-file builds that load without assembling encoders separately.",
      },
    ],
  },

  chroma: {
    modelType: "Chroma",
    description:
      "A Flux-derived model retrained for broader style coverage and released under a permissive licence. Prompts like Flux, with a wider tolerance for artistic and illustrated styles.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: true,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "26-40",
      cfg: "4-5",
      resolution: "1024x1024 and Flux-compatible aspect ratios",
    },
    tips: [
      "Prompt as you would Flux: full natural-language description, specifics first",
      "Unlike base Flux it does accept a negative prompt - useful for style exclusion",
      "Noticeably stronger on illustration and painterly styles than Flux Dev",
      "Name the medium explicitly ('oil painting', 'ink and wash') - it responds well",
      "CFG sits higher than Flux Dev; 1.0 will look washed out",
    ],
    commonMistakes: [
      "Running it at Flux Schnell settings (CFG 1) and getting flat output",
      "Assuming negative prompts are ignored as they are in Flux",
      "Using booru tags - this is a natural-language model despite the art focus",
    ],
    examplePrompt:
      "An oil painting of a harbour town at dusk, fishing boats at anchor, warm windows glowing along the quay, thick impasto brushwork in the sky, muted teal and ochre palette",
    starters: [
      {
        label: "Painterly",
        prompt:
          "An oil painting of a wheat field under a gathering storm, heavy impasto clouds, a single crooked fence post in the foreground, palette of ochre, umber and slate blue, visible brushwork",
        negativePrompt: "photograph, 3d render, text, watermark",
      },
      {
        label: "Ink illustration",
        prompt:
          "A black ink and wash illustration of a heron standing in shallow water among reeds, loose confident brushstrokes, large areas of untouched paper, minimal composition",
        negativePrompt: "colour, photorealistic, cluttered background",
      },
    ],
    models: [
      {
        name: "Chroma1-HD",
        huggingFace: "lodestones/Chroma1-HD",
      },
    ],
  },
};
