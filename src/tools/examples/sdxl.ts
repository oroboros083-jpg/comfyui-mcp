import { ExampleWorkflow } from "./types.js";

export const SDXL_EXAMPLES: ExampleWorkflow[] = [
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
