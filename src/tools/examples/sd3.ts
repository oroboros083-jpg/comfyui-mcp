import { ExampleWorkflow } from "./types.js";

export const SD3_EXAMPLES: ExampleWorkflow[] = [
  {
    name: "SD3.5 (Separate Encoders)",
    description: "SD3.5 with separately loaded text encoders (CLIP L, CLIP G, T5). More control over precision and VRAM usage.",
    category: "sd3",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/sd3/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/sd3/sd3.5_text_encoders_example.png",
    ],
    requiredNodes: ["TripleCLIPLoader", "UNETLoader"],
    requiredModels: [
      {
        type: "text_encoder",
        name: "clip_l.safetensors",
        url: "https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/blob/main/text_encoders/clip_l.safetensors",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "text_encoder",
        name: "clip_g.safetensors",
        url: "https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/blob/main/text_encoders/clip_g.safetensors",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "text_encoder",
        name: "t5xxl_fp8_e4m3fn_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/blob/main/text_encoders/t5xxl_fp8_e4m3fn_scaled.safetensors",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "unet",
        name: "sd3.5_large.safetensors",
        url: "https://huggingface.co/stabilityai/stable-diffusion-3.5-large/tree/main",
        destination: "ComfyUI/models/unet",
      },
    ],
    notes: "Use when you have separate UNET and text encoder files. Allows fp8 T5 to reduce VRAM. Recommended: 28 steps, CFG 4.5, 1024x1024.",
  },
  {
    name: "SD3.5 Checkpoint",
    description: "SD3.5 using all-in-one checkpoint. Simplest setup - just load checkpoint like SD1.5/SDXL models.",
    category: "sd3",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/sd3/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/sd3/sd3.5_simple_example.png",
    ],
    requiredNodes: ["CheckpointLoaderSimple"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "sd3.5_large_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/blob/main/sd3.5_large_fp8_scaled.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "All-in-one checkpoint includes text encoders and VAE. FP8 for lower VRAM. Recommended: 28 steps, CFG 4.5, 1024x1024.",
  },
  {
    name: "SD3.5 Medium",
    description: "Smaller SD3.5 variant for faster generation or lower VRAM. Good balance of speed and quality.",
    category: "sd3",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/sd3/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/sd3/sd3.5_simple_example.png",
    ],
    requiredNodes: ["CheckpointLoaderSimple"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "sd3.5_medium.safetensors",
        url: "https://huggingface.co/stabilityai/stable-diffusion-3.5-medium/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Medium model is faster and uses less VRAM than Large. Recommended: 28 steps, CFG 4.5, 1024x1024.",
  },
  {
    name: "SD3.5 Large Turbo",
    description: "Fast distilled SD3.5 requiring fewer steps. Use 4-8 steps with low CFG for quick generation.",
    category: "sd3",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/sd3/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/sd3/sd3.5_simple_example.png",
    ],
    requiredNodes: ["CheckpointLoaderSimple"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "sd3.5_large_turbo.safetensors",
        url: "https://huggingface.co/stabilityai/stable-diffusion-3.5-large-turbo/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Turbo model for fast generation. Recommended: 4-8 steps, CFG 1.0, 1024x1024.",
  },
  {
    name: "SD3.5 ControlNet (Canny)",
    description: "SD3.5 with official canny ControlNet for edge-guided generation. Structural control for precise compositions.",
    category: "sd3",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/sd3/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/sd3/sd3.5_large_canny_controlnet_example.png",
    ],
    requiredNodes: ["CheckpointLoaderSimple", "ControlNetLoader", "ControlNetApplySD3"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "sd3.5_large_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/blob/main/sd3.5_large_fp8_scaled.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "controlnet",
        name: "sd3.5_large_controlnet_canny.safetensors",
        url: "https://huggingface.co/stabilityai/stable-diffusion-3.5-controlnets",
        destination: "ComfyUI/models/controlnet",
      },
    ],
    notes: "Official canny ControlNet from Stability AI. Use ControlNetApplySD3 node (not regular ControlNetApply).",
  },
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
