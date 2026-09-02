import { ExampleWorkflow } from "./types.js";

export const VIDEO_EXAMPLES: ExampleWorkflow[] = [
  {
    name: "Mochi Video",
    description: "State of the art video model for text-to-video generation",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/mochi/",
    imageUrls: [], // WebP files
    requiredModels: [
      {
        type: "diffusion_model",
        name: "mochi_preview_bf16.safetensors",
        url: "https://huggingface.co/Comfy-Org/mochi_preview_repackaged/tree/main/split_files",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "text_encoder",
        name: "t5xxl_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/mochi_preview_repackaged/tree/main/split_files",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "mochi_vae.safetensors",
        url: "https://huggingface.co/Comfy-Org/mochi_preview_repackaged/tree/main/split_files",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "checkpoint",
        name: "mochi_preview_fp8_scaled.safetensors (all-in-one)",
        url: "https://huggingface.co/Comfy-Org/mochi_preview_repackaged/blob/main/all_in_one/mochi_preview_fp8_scaled.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "fp8 files give lower quality than 16-bit versions but may be faster on compatible hardware.",
  },
  {
    name: "Nvidia Cosmos",
    description: "Text-to-video and image/video-to-video. Supports motion continuation and interpolation between images.",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/cosmos/",
    imageUrls: [], // WebP files
    jsonUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/cosmos/text_to_video_cosmos_7B.json",
      "https://comfyanonymous.github.io/ComfyUI_examples/cosmos/image_to_video_cosmos_7B.json",
    ],
    requiredModels: [
      {
        type: "text_encoder",
        name: "oldt5_xxl_fp8_e4m3fn_scaled.safetensors",
        url: "https://huggingface.co/comfyanonymous/cosmos_1.0_text_encoder_and_VAE_ComfyUI/tree/main",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "cosmos_cv8x8x8_1.0.safetensors",
        url: "https://huggingface.co/comfyanonymous/cosmos_1.0_text_encoder_and_VAE_ComfyUI/tree/main",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "diffusion_model",
        name: "Cosmos-1_0-Diffusion-7B-Text2World.safetensors",
        url: "https://huggingface.co/mcmonkey/cosmos-1.0/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "Cosmos-1_0-Diffusion-7B-Video2World.safetensors",
        url: "https://huggingface.co/mcmonkey/cosmos-1.0/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
    ],
    notes: "14B variants available from official Nvidia HuggingFace.",
  },
  {
    name: "Nvidia Cosmos Predict2",
    description: "Text-to-image and image-to-video using Cosmos Predict2 models (2B and 14B variants)",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/cosmos_predict2/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/cosmos_predict2/cosmos_predict2_2b_t2i_example.png",
    ],
    requiredModels: [
      {
        type: "text_encoder",
        name: "oldt5_xxl_fp8_e4m3fn_scaled.safetensors",
        url: "https://huggingface.co/comfyanonymous/cosmos_1.0_text_encoder_and_VAE_ComfyUI/tree/main/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "wan_2.1_vae.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/blob/main/split_files/vae/wan_2.1_vae.safetensors",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "diffusion_model",
        name: "cosmos_predict2_2B_t2i.safetensors",
        url: "https://huggingface.co/Comfy-Org/Cosmos_Predict2_repackaged/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "cosmos_predict2_14B_t2i.safetensors",
        url: "https://huggingface.co/Comfy-Org/Cosmos_Predict2_repackaged/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "cosmos_predict2_2B_video2world_480p_16fps.safetensors",
        url: "https://huggingface.co/Comfy-Org/Cosmos_Predict2_repackaged/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
    ],
    notes: "Resolution settings must match model (480p or 720p).",
  },
];
