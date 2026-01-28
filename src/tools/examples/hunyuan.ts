import { ExampleWorkflow } from "./types.js";

export const HUNYUAN_EXAMPLES: ExampleWorkflow[] = [
  {
    name: "Hunyuan DiT 1.2",
    description: "Diffusion model capable of processing both English and Chinese text prompts",
    category: "hunyuan",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/hunyuan_dit/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/hunyuan_dit/hunyuan_dit_1.2_example.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        name: "hunyuan_dit_1.2.safetensors",
        url: "https://huggingface.co/comfyanonymous/hunyuan_dit_comfyui/blob/main/hunyuan_dit_1.2.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
  },
  {
    name: "Hunyuan Image 2.1",
    description: "Powerful diffusion model for image generation with optional refiner",
    category: "hunyuan",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/hunyuan_image/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/hunyuan_image/hunyuan_image_example.png",
    ],
    requiredModels: [
      {
        type: "text_encoder",
        name: "byt5_small_glyphxl_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/HunyuanImage_2.1_ComfyUI/blob/main/split_files/text_encoders/byt5_small_glyphxl_fp16.safetensors",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "text_encoder",
        name: "qwen_2.5_vl_7b.safetensors",
        url: "https://huggingface.co/Comfy-Org/HunyuanImage_2.1_ComfyUI/blob/main/split_files/text_encoders/qwen_2.5_vl_7b.safetensors",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "hunyuan_image_2.1_vae_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/HunyuanImage_2.1_ComfyUI/blob/main/split_files/vae/hunyuan_image_2.1_vae_fp16.safetensors",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "diffusion_model",
        name: "hunyuanimage2.1_bf16.safetensors",
        url: "https://huggingface.co/Comfy-Org/HunyuanImage_2.1_ComfyUI/blob/main/split_files/diffusion_models/hunyuanimage2.1_bf16.safetensors",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "hunyuanimage2.1_refiner_bf16.safetensors (optional)",
        url: "https://huggingface.co/Comfy-Org/HunyuanImage_2.1_ComfyUI/blob/main/split_files/diffusion_models/hunyuanimage2.1_refiner_bf16.safetensors",
        destination: "ComfyUI/models/diffusion_models",
      },
    ],
  }
];
