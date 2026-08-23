/**
 * Video models.
 *
 * None of these had a guide before; the registry told callers only "Video
 * model. Describe motion." That is the right instinct but not enough to write
 * a prompt with, because video prompting has a structure image prompting does
 * not: subject, then what the subject DOES, then what the CAMERA does. Getting
 * the last one wrong is the single most common reason a video comes out static.
 */

import { ModelPromptingGuide } from "../types.js";

/** Every model here wants the same three-part skeleton. */
const MOTION_STRUCTURE = {
  separator: ", ",
  slots: [
    {
      name: "subject and setting",
      description: "What is in frame and where, as you would for a still image.",
      required: true,
      examples: ["a fox in a snowy birch forest"],
    },
    {
      name: "subject motion",
      description:
        "What the subject DOES across the clip. A verb, not a pose - this is what separates video from a still.",
      required: true,
      examples: ["steps slowly forward, ears twitching"],
    },
    {
      name: "camera motion",
      description:
        "What the CAMERA does. Omit it and most models hold a locked-off frame.",
      examples: ["slow dolly in", "static shot", "handheld pan left", "crane up"],
    },
    {
      name: "style and lighting",
      description: "Look, film stock, time of day, atmosphere.",
      examples: ["overcast winter light, 35mm film grain"],
    },
  ],
  filledExample:
    "A red fox in a snowy birch forest, stepping slowly forward with ears twitching at a distant sound, slow dolly in, overcast winter light, shallow depth of field, 35mm film grain",
  notes:
    "Subject motion and camera motion are different things and both need saying. 'A fox in a forest, cinematic' will usually give you a near-still image with a little drift.",
};

export const VIDEO_GUIDES: Record<string, ModelPromptingGuide> = {
  wan: {
    modelType: "Wan (2.1 / 2.2)",
    description:
      "Alibaba's open video model family, in text-to-video and image-to-video variants. Strong at coherent subject motion over a few seconds and responsive to explicit camera direction.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: true,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "20-30 (or 4-8 with a Lightning/CausVid LoRA)",
      cfg: "5-6 native, 1 with a distill LoRA",
      resolution: "832x480 or 1280x720, typically 81 frames at 16fps",
    },
    structure: MOTION_STRUCTURE,
    tips: [
      "Name the camera move explicitly - 'static shot' is also a valid, useful choice",
      "One clear action per clip; a shot list in one prompt produces mush",
      "2.2 splits into high-noise and low-noise experts - both need the same prompt",
      "For image-to-video, describe only the MOTION; the first frame already fixes the subject",
      "Negative prompts work well for artefacts: 'blurry, distorted, static, watermark'",
      "Frame count drives duration - 81 frames at 16fps is roughly five seconds",
    ],
    commonMistakes: [
      "Describing only a scene and getting an almost-static clip",
      "Packing multiple shots or a scene change into one prompt",
      "Re-describing the subject in image-to-video instead of describing its motion",
      "Running a Lightning-LoRA workflow at native CFG",
    ],
    examplePrompt:
      "A lantern-lit paper boat drifting down a narrow canal at night, the flame flickering as it moves, slow tracking shot following alongside, reflections rippling on the water, warm amber light against deep blue shadows",
    starters: [
      {
        label: "Text-to-video, moving camera",
        prompt:
          "A hawk perched on a fence post in a windy meadow, feathers ruffling, then launching into flight to the left of frame. Camera pans left to follow. Overcast afternoon light, grass moving in the wind, telephoto compression.",
        negativePrompt:
          "blurry, distorted, static, morphing, extra limbs, watermark, text",
        notes: "832x480, 81 frames.",
      },
      {
        label: "Image-to-video, motion only",
        prompt:
          "The steam rises and curls from the cup, the surface of the coffee ripples slightly, dust motes drift through the light. Camera holds static.",
        negativePrompt: "distorted, morphing, sudden cuts, watermark",
        notes:
          "For i2v the first frame supplies the subject - saying more about it only invites drift.",
      },
    ],
    models: [
      {
        name: "Wan 2.1 (ComfyUI repackaged)",
        huggingFace: "Comfy-Org/Wan_2.1_ComfyUI_repackaged",
      },
      {
        name: "Wan 2.2 (ComfyUI repackaged)",
        huggingFace: "Comfy-Org/Wan_2.2_ComfyUI_Repackaged",
      },
    ],
  },

  ltxvideo: {
    modelType: "LTX-Video",
    description:
      "Lightricks' fast DiT video model, notable for near-real-time generation. It wants unusually long, dense prompts - short ones noticeably underperform.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: true,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "20-30",
      cfg: "3-4",
      resolution: "768x512 and similar; frame counts around 97-121",
    },
    structure: MOTION_STRUCTURE,
    tips: [
      "Write LONG prompts - LTX is the outlier here, it rewards 50+ words where others do not",
      "Chain the action chronologically: what happens first, then next",
      "Describe camera movement and lighting in the same detail as the subject",
      "Very fast, so iterate on the prompt rather than agonising over one attempt",
      "A strong negative prompt against artefacts is worth carrying between runs",
    ],
    commonMistakes: [
      "Writing a short prompt - the most common cause of poor LTX output",
      "Leaving out the camera entirely",
      "Expecting long-range narrative coherence from a few-second clip",
    ],
    examplePrompt:
      "A woman with long dark hair sits at a workbench in a dim workshop, carefully soldering a circuit board. A thin curl of smoke rises from the iron and drifts to the right. She leans in slightly, adjusting her grip, then sets the iron down in its stand. The camera slowly pushes in from a medium shot toward a close-up of her hands. Warm task lighting from a lamp on the left, deep shadows behind her, shallow depth of field, subtle film grain.",
    starters: [
      {
        label: "Dense chronological prompt",
        prompt:
          "An elderly man in a wool cardigan stands at a kitchen window holding a watering can. He tips it slowly over a row of potted herbs on the sill, water darkening the soil. He straightens up, sets the can down, and looks out at the rain. The camera drifts slowly from his hands up toward the window. Cool grey daylight, condensation on the glass, soft focus falloff, 35mm film grain.",
        negativePrompt:
          "blurry, distorted, morphing, jittery motion, watermark, text, low quality",
      },
    ],
    models: [{ name: "LTX-Video", huggingFace: "Lightricks/LTX-Video" }],
  },

  mochi: {
    modelType: "Mochi 1",
    description:
      "Genmo's open video model, strong on physically plausible motion and fluid dynamics. Prompts read like a shot description.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: true,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "50-64",
      cfg: "4.5-6",
      resolution: "848x480, around 163 frames at 30fps",
    },
    structure: MOTION_STRUCTURE,
    tips: [
      "Particularly good at fluids, cloth and smoke - lean into those where the shot allows",
      "Describe motion in physical terms ('billows', 'splashes', 'sways') rather than abstractly",
      "Camera language from filmmaking works: dolly, pan, tilt, crane, handheld",
      "Slower to sample than most - get the prompt right at low frame counts first",
    ],
    commonMistakes: [
      "Requesting rendered text or legible signage (a weak point)",
      "Expecting photoreal faces in close-up",
      "Skipping camera direction",
    ],
    examplePrompt:
      "A silk scarf caught by the wind on a clifftop, billowing and twisting against a grey sea, camera tilts up to follow it, overcast diffuse light, slow motion",
    starters: [
      {
        label: "Fluid motion",
        prompt:
          "Cream being poured into a glass of black coffee in slow motion, blooming into curling white plumes through the dark liquid. Macro shot, camera holds static, soft window light from the left, shallow depth of field.",
        negativePrompt: "blurry, distorted, morphing, watermark, text",
      },
    ],
    models: [
      {
        name: "Mochi 1 preview (ComfyUI repackaged)",
        huggingFace: "Comfy-Org/mochi_preview_repackaged",
      },
    ],
  },

  cosmos: {
    modelType: "NVIDIA Cosmos",
    description:
      "NVIDIA's world-model family aimed at physical AI and simulation. It expects grounded, physically literal descriptions rather than cinematic mood.",
    promptingStyle: "natural_language",
    supportsNegativePrompt: true,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "30-35",
      cfg: "4-7",
      resolution: "1280x704 and similar 16:9 sizes",
    },
    structure: MOTION_STRUCTURE,
    tips: [
      "Describe physically plausible scenes - it was trained for world simulation, not stylised film",
      "Concrete nouns and measurable motion beat atmospheric adjectives",
      "Strong on vehicles, robotics and outdoor environments",
      "State the viewpoint plainly: 'front-facing dashboard camera', 'fixed overhead camera'",
      "Predict2 variants take the same prompting approach",
    ],
    commonMistakes: [
      "Prompting for stylised or fantastical scenes - not what it is for",
      "Vague camera framing on a model that cares about viewpoint",
      "Expecting character animation quality comparable to the film-oriented models",
    ],
    examplePrompt:
      "A front-facing dashboard camera view from a car driving along a two-lane coastal highway at midday, guardrail on the right, oncoming traffic passing at intervals, clear sky, steady forward motion",
    starters: [
      {
        label: "Vehicle viewpoint",
        prompt:
          "A front-facing dashboard camera view from a delivery van moving slowly through a narrow residential street. Parked cars on both sides, a cyclist ahead pulling to the right, overcast daylight, steady forward motion at low speed.",
        negativePrompt: "blurry, distorted geometry, morphing, watermark",
      },
      {
        label: "Fixed observation",
        prompt:
          "A fixed overhead camera above a warehouse aisle. A wheeled robot travels along the aisle from the top of frame toward the bottom, passing shelving units, then turns left at the junction. Even fluorescent lighting, concrete floor.",
        negativePrompt: "distorted geometry, morphing, watermark",
      },
    ],
    models: [
      {
        name: "Cosmos Predict2 (ComfyUI repackaged)",
        huggingFace: "Comfy-Org/Cosmos_Predict2_repackaged",
      },
      {
        name: "Cosmos 1.0 text encoder and VAE",
        huggingFace: "comfyanonymous/cosmos_1.0_text_encoder_and_VAE_ComfyUI",
      },
    ],
  },
};
