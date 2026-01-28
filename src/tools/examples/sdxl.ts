import { ExampleWorkflow } from "./types.js";

export const SDXL_EXAMPLES: ExampleWorkflow[] = [
  {
    name: "SDXL",
    description: "Basic SDXL text-to-image generation. Standard workflow using base checkpoint at 1024x1024 resolution.",
    category: "sdxl",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/sdxl/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/sdxl/sdxl_simple_example.png",
    ],
    requiredNodes: ["CheckpointLoaderSimple"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "sd_xl_base_1.0.safetensors",
        url: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/sd_xl_base_1.0.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Use 1024x1024 or equivalent pixel count (896x1152, 1152x896). This is the basic SDXL workflow without refiner.",
  },
  {
    name: "SDXL with Refiner",
    description: "Two-stage SDXL with base model and refiner. Refiner adds detail and improves quality in second pass.",
    category: "sdxl",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/sdxl/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/sdxl/sdxl_refiner_prompt_example.png",
    ],
    requiredNodes: ["CheckpointLoaderSimple"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "sd_xl_base_1.0.safetensors",
        url: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/sd_xl_base_1.0.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "sd_xl_refiner_1.0.safetensors",
        url: "https://huggingface.co/stabilityai/stable-diffusion-xl-refiner-1.0/blob/main/sd_xl_refiner_1.0.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "First pass with base model, second pass with refiner. Can use different prompts for each stage.",
  },
  {
    name: "SDXL ReVision (Image-Guided)",
    description: "Use images to guide SDXL generation. Zero positive prompt or combine with text for style transfer.",
    category: "sdxl",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/sdxl/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/sdxl/sdxl_revision_zero_positive.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/sdxl/sdxl_revision_text_prompts.png",
    ],
    requiredNodes: ["CLIPVisionLoader", "CLIPVisionEncode", "unCLIPConditioning"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "sd_xl_base_1.0.safetensors",
        url: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/sd_xl_base_1.0.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "clip_vision",
        name: "clip_vision_g.safetensors",
        url: "https://huggingface.co/comfyanonymous/clip_vision_g/blob/main/clip_vision_g.safetensors",
        destination: "ComfyUI/models/clip_vision",
      },
    ],
    notes: "First variant zeros out text prompt for pure image guidance. Second variant combines image and text prompts.",
  },
  {
    name: "SDXL Turbo",
    description: "Generate consistent images in a single step. Use SDTurboScheduler for best results.",
    category: "turbo",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/sdturbo/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/sdturbo/sdxlturbo_example.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        name: "sd_xl_turbo_1.0_fp16.safetensors",
        url: "https://huggingface.co/stabilityai/sdxl-turbo/blob/main/sd_xl_turbo_1.0_fp16.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Can use more steps to increase quality. Standard schedulers may also work.",
  },
  {
    name: "Z Image Turbo",
    description: "Fast distilled diffusion model using Qwen 3 4B text encoder",
    category: "turbo",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/z_image/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/z_image/z_image_turbo_example.png",
    ],
    requiredModels: [
      {
        type: "text_encoder",
        name: "qwen_3_4b.safetensors",
        url: "https://huggingface.co/Comfy-Org/z_image_turbo/blob/main/split_files/text_encoders/qwen_3_4b.safetensors",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "diffusion_model",
        name: "z_image_turbo_bf16.safetensors",
        url: "https://huggingface.co/Comfy-Org/z_image_turbo/blob/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "vae",
        name: "ae.safetensors (Z Image)",
        url: "https://huggingface.co/Comfy-Org/z_image_turbo/blob/main/split_files/vae/ae.safetensors",
        destination: "ComfyUI/models/vae",
      },
    ],
  }
];
