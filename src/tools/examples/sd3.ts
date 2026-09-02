import { ExampleWorkflow } from "./types.js";

export const SD3_EXAMPLES: ExampleWorkflow[] = [
  {
    name: "Stable Cascade",
    description: "Basic text-to-image with Stable Cascade. Two-stage architecture: Stage C generates, Stage B decodes.",
    category: "stable_cascade",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/stable_cascade/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/stable_cascade/stable_cascade__text_to_image.png",
    ],
    requiredNodes: ["CheckpointLoaderSimple", "StableCascade_StageC_VAEEncode"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "stable_cascade_stage_c.safetensors",
        url: "https://huggingface.co/stabilityai/stable-cascade/tree/main/comfyui_checkpoints",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "stable_cascade_stage_b.safetensors",
        url: "https://huggingface.co/stabilityai/stable-cascade/tree/main/comfyui_checkpoints",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Stage C generates at 24x compression, Stage B decodes. Very efficient architecture. Recommended: 20-30 steps.",
  },
  {
    name: "Stable Cascade (Image-to-Image)",
    description: "Transform existing images with Stable Cascade. Modify style while preserving structure.",
    category: "stable_cascade",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/stable_cascade/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/stable_cascade/stable_cascade__image_to_image.png",
    ],
    requiredNodes: ["CheckpointLoaderSimple", "StableCascade_StageC_VAEEncode"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "stable_cascade_stage_c.safetensors",
        url: "https://huggingface.co/stabilityai/stable-cascade/tree/main/comfyui_checkpoints",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "stable_cascade_stage_b.safetensors",
        url: "https://huggingface.co/stabilityai/stable-cascade/tree/main/comfyui_checkpoints",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Encode input image with Stage C VAE, then denoise partially. Lower denoise = more preservation.",
  },
  {
    name: "Stable Cascade (Image Remix)",
    description: "Create variations using reference images as inspiration. Uses CLIP Vision for style/concept transfer.",
    category: "stable_cascade",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/stable_cascade/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/stable_cascade/stable_cascade__image_remixing.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/stable_cascade/stable_cascade__image_remixing_multiple.png",
    ],
    requiredNodes: ["CheckpointLoaderSimple", "CLIPVisionLoader", "unCLIPConditioning"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "stable_cascade_stage_c.safetensors",
        url: "https://huggingface.co/stabilityai/stable-cascade/tree/main/comfyui_checkpoints",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "stable_cascade_stage_b.safetensors",
        url: "https://huggingface.co/stabilityai/stable-cascade/tree/main/comfyui_checkpoints",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "First variant uses single reference, second blends multiple images. Adjust strength per image.",
  },
  {
    name: "Stable Cascade ControlNet (Canny)",
    description: "Edge-guided generation with Stable Cascade. Use canny edges to control structure.",
    category: "stable_cascade",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/stable_cascade/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/stable_cascade/stable_cascade__canny_controlnet.png",
    ],
    requiredNodes: ["CheckpointLoaderSimple", "ControlNetLoader", "ControlNetApply"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "stable_cascade_stage_c.safetensors",
        url: "https://huggingface.co/stabilityai/stable-cascade/tree/main/comfyui_checkpoints",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "stable_cascade_stage_b.safetensors",
        url: "https://huggingface.co/stabilityai/stable-cascade/tree/main/comfyui_checkpoints",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "controlnet",
        name: "canny.safetensors (Stable Cascade)",
        url: "https://huggingface.co/stabilityai/stable-cascade/tree/main/controlnet",
        destination: "ComfyUI/models/controlnet",
      },
    ],
    notes: "Use Stable Cascade specific ControlNet, not SD1.5/SDXL ControlNets.",
  },
  {
    name: "Stable Cascade Inpainting",
    description: "Inpaint regions of images with Stable Cascade. Uses dedicated inpainting ControlNet.",
    category: "stable_cascade",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/stable_cascade/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/stable_cascade/stable_cascade__inpaint_controlnet.png",
    ],
    requiredNodes: ["CheckpointLoaderSimple", "ControlNetLoader"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "stable_cascade_stage_c.safetensors",
        url: "https://huggingface.co/stabilityai/stable-cascade/tree/main/comfyui_checkpoints",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "stable_cascade_stage_b.safetensors",
        url: "https://huggingface.co/stabilityai/stable-cascade/tree/main/comfyui_checkpoints",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "controlnet",
        name: "inpainting.safetensors (Stable Cascade)",
        url: "https://huggingface.co/stabilityai/stable-cascade/tree/main/controlnet",
        destination: "ComfyUI/models/controlnet",
      },
    ],
    notes: "Uses ControlNet-based inpainting, not standard inpaint models.",
  }
];
