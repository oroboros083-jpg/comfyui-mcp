import { ExampleWorkflow } from "./types.js";

export const BASICS_EXAMPLES: ExampleWorkflow[] = [
  {
    name: "Hypernetworks",
    description: "Apply hypernetwork patches on top of the main model",
    category: "hypernetworks",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/hypernetworks/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/hypernetworks/hypernetwork_example.png",
    ],
    notes: "Place hypernetworks in models/hypernetworks. Chain multiple Hypernetwork Loader nodes for multiple hypernetworks.",
  },
  {
    name: "Textual Inversion / Embeddings",
    description: "Use trained embeddings as custom words in prompts. Placement in prompt matters for effect.",
    category: "embeddings",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/textual_inversion_embeddings/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/textual_inversion_embeddings/embedding_example.png",
    ],
    notes: "Place embeddings in models/embeddings. Use (embedding:strength) syntax. Position affects output.",
  },
  {
    name: "Area Composition",
    // Named for the symptom, not the cure. An agent watching two subjects
    // merge, or colours swap between objects, does not know to search for
    // "ConditioningSetArea" - that is the answer it is looking for. The
    // failures are spelled out here because this description is what the
    // resource listing publishes.
    description:
      "Bind part of a prompt to part of the canvas. The fix for prompts that place things: " +
      "two subjects merging into one, colours swapping between objects (the red cube comes out " +
      "blue), or 'on the left' and 'on the right' being ignored entirely. Weights cannot fix " +
      "any of that - a weight scales a token everywhere, and a plain graph has no 'here'. " +
      "Encode each region's text separately, set an area on each, combine. Also good for wide " +
      "aspect ratios.",
    category: "advanced",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/area_composition/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/area_composition/night_evening_day_morning.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/area_composition/workflow_night_evening_day_morning.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/area_composition/morning_day_evening_night.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/area_composition/night_evening_day_morning_subject.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/area_composition/square_area_for_subject.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/area_composition/square_area_for_2_subjects_first_pass.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/area_composition/square_area_for_2_subjects.png",
    ],
    requiredNodes: ["ConditioningSetArea", "ConditioningSetAreaPercentage", "ConditioningCombine"],
    notes:
      "All core ComfyUI, nothing to install. Concentrate subject generation in square zones " +
      "while rendering backgrounds, which also stops limbs extending unnaturally.\n\n" +
      "Honest limits. Regional conditioning rides on CFG, so it degrades badly at CFG 1 - a " +
      "distilled draft model (Turbo, Schnell, a Lightning LoRA) cannot preview a regional " +
      "layout, and comfyui_plan_iteration says so. It works best on SD1.5 and SDXL and much " +
      "worse on Flux, which runs at CFG 1 by design. Areas are hard rectangles and leave seams " +
      "at their boundaries; Noisy Latent Composition is the alternative when they show.",
  },
  {
    name: "Noisy Latent Composition",
    // The other half of the same symptom. Searchable from the same words as
    // Area Composition, because a caller hitting seams does not yet know
    // which of the two they want.
    description:
      "Place subjects by compositing latents while they are still noisy, before denoising " +
      "finishes. The alternative to Area Composition for prompts that place things - two " +
      "subjects merging, or 'on the left' being ignored - and the one to use when area " +
      "conditioning's hard rectangles leave visible seams.",
    category: "advanced",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/noisy_latent_composition/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/noisy_latent_composition/noisy_latents_3_subjects.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/noisy_latent_composition/noisy_latents_3_subjects_.png",
    ],
    notes:
      "Excels at controlling subject position, pose and colouring, and subjects can interact " +
      "based on shared prompts, which hard-edged areas make awkward. Costs an extra sampling " +
      "pass, and like area conditioning it rides on CFG, so a CFG 1 distilled model is a poor " +
      "place to try it.",
  },
  {
    name: "Model Merging",
    description: "Merge multiple checkpoints, integrate LoRAs into weights, create inpainting models, convert between architectures",
    category: "advanced",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/model_merging/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/model_merging/model_merging_basic.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/model_merging/model_merging_3_checkpoints.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/model_merging/model_merging_lora.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/model_merging/model_merging_inpaint.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/model_merging/model_merging_cosxl.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        name: "CosXL",
        url: "https://huggingface.co/stabilityai/cosxl",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "sd_xl_base_1.0_0.9vae.safetensors",
        url: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/sd_xl_base_1.0_0.9vae.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "albedobase-xl",
        url: "https://civitai.com/models/140737/albedobase-xl",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Formula for inpainting: (inpaint_model - base_model) * 1.0 + other_model. Block-level control over input/middle/output.",
  },
  {
    name: "LCM (Latent Consistency Models)",
    description: "Accelerated image generation in very few steps. Use lcm sampler with low CFG and sgm_uniform/simple scheduler.",
    category: "lcm",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/lcm/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/lcm/lcm_basic_example.png",
    ],
    requiredModels: [
      {
        type: "lora",
        name: "lcm_lora_sdxl.safetensors",
        url: "https://huggingface.co/latent-consistency/lcm-lora-sdxl/blob/main/pytorch_lora_weights.safetensors",
        destination: "ComfyUI/models/loras",
      },
    ],
    notes: "Rename downloaded file to lcm_lora_sdxl.safetensors. Use reduced CFG value. ModelSamplingDiscrete node is optional.",
  }
];
