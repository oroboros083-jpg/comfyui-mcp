import { ExampleWorkflow } from "./types.js";

export const NEXT_GEN_EXAMPLES: ExampleWorkflow[] = [
  {
    name: "AuraFlow",
    description: "True open source model with FOSS license for both code and weights",
    category: "aura_flow",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/aura_flow/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/aura_flow/aura_flow_0.2_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/aura_flow/aura_flow_0.1_example.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        name: "aura_flow_0.2.safetensors",
        url: "https://huggingface.co/fal/AuraFlow-v0.2/blob/main/aura_flow_0.2.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "aura_flow_0.1.safetensors",
        url: "https://huggingface.co/fal/AuraFlow/blob/main/aura_flow_0.1.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
  },
  {
    name: "Chroma",
    description: "Modified Flux model with architectural changes",
    category: "chroma",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/chroma/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/chroma/chroma_example.png",
    ],
    requiredModels: [
      {
        type: "text_encoder",
        name: "Flux text encoders (fp16 or fp8)",
        url: "https://huggingface.co/comfyanonymous/flux_text_encoders/tree/main",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "diffusion_model",
        name: "Chroma1-HD",
        url: "https://huggingface.co/lodestones/Chroma1-HD",
        destination: "ComfyUI/models/diffusion_models",
      },
    ],
  },
  {
    name: "Lumina Image 2.0",
    description: "Diffusion model using Gemma 2 2B for text encoding",
    category: "lumina",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/lumina2/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/lumina2/lumina2_basic_example.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        name: "lumina_2.safetensors",
        url: "https://huggingface.co/Comfy-Org/Lumina_Image_2.0_Repackaged/blob/main/all_in_one/lumina_2.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
  },
  {
    name: "HiDream Dev",
    description: "HiDream I1 Dev variant. Fast development model for quick iterations. Good balance of speed and quality.",
    category: "hidream",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/hidream/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/hidream/hidream_dev_example.png",
    ],
    requiredNodes: ["UNETLoader", "QuadrupleCLIPLoader"],
    requiredModels: [
      {
        type: "text_encoder",
        name: "clip_l_hidream.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "text_encoder",
        name: "clip_g_hidream.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "text_encoder",
        name: "t5xxl_fp8_e4m3fn_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "text_encoder",
        name: "llama_3.1_8b_instruct_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "ae.safetensors (HiDream)",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/vae",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "diffusion_model",
        name: "hidream_i1_dev_bf16.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
    ],
    notes: "Dev model is faster than Full. Uses 4 text encoders (CLIP L, CLIP G, T5, LLaMA). Recommended: 28 steps, CFG 5.",
  },
  {
    name: "HiDream Full",
    description: "HiDream I1 Full variant. Highest quality generation with full model weights. Use for final production images.",
    category: "hidream",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/hidream/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/hidream/hidream_full_example.png",
    ],
    requiredNodes: ["UNETLoader", "QuadrupleCLIPLoader"],
    requiredModels: [
      {
        type: "text_encoder",
        name: "clip_l_hidream.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "text_encoder",
        name: "clip_g_hidream.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "text_encoder",
        name: "t5xxl_fp8_e4m3fn_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "text_encoder",
        name: "llama_3.1_8b_instruct_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "ae.safetensors (HiDream)",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/vae",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "diffusion_model",
        name: "hidream_i1_full_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
    ],
    notes: "Full model for highest quality. Slower than Dev but better results. Recommended: 50 steps, CFG 5.",
  },
  {
    name: "HiDream Edit (E1.1)",
    description: "HiDream image editing model. Modify existing images with text instructions. Latest E1.1 version.",
    category: "hidream",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/hidream/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/hidream/hidream_e1.1_example.png",
    ],
    requiredNodes: ["UNETLoader", "QuadrupleCLIPLoader"],
    requiredModels: [
      {
        type: "text_encoder",
        name: "clip_l_hidream.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "text_encoder",
        name: "clip_g_hidream.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "text_encoder",
        name: "t5xxl_fp8_e4m3fn_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "text_encoder",
        name: "llama_3.1_8b_instruct_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "ae.safetensors (HiDream)",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/vae",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "diffusion_model",
        name: "hidream_e1_1_bf16.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
    ],
    notes: "Edit model for image modification. E1.1 is newer/better than E1. Describe the changes you want to make.",
  },
  {
    name: "HiDream Edit (E1)",
    description: "HiDream image editing model. Original E1 version. Use E1.1 for better results.",
    category: "hidream",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/hidream/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/hidream/hidream_e1_example.png",
    ],
    requiredNodes: ["UNETLoader", "QuadrupleCLIPLoader"],
    requiredModels: [
      {
        type: "text_encoder",
        name: "clip_l_hidream.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "text_encoder",
        name: "clip_g_hidream.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "text_encoder",
        name: "t5xxl_fp8_e4m3fn_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "text_encoder",
        name: "llama_3.1_8b_instruct_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "ae.safetensors (HiDream)",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/vae",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "diffusion_model",
        name: "hidream_e1_bf16.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
    ],
    notes: "Original edit model. E1.1 is recommended for better results.",
  },
  {
    name: "Qwen Image",
    description: "Qwen 20B diffusion model for text-to-image generation. High quality with excellent prompt following.",
    category: "qwen",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/qwen_image/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/qwen_image/qwen_image_basic_example.png",
    ],
    requiredNodes: ["UNETLoader", "CLIPLoader"],
    requiredModels: [
      {
        type: "diffusion_model",
        name: "qwen_image_fp8_e4m3fn.safetensors",
        url: "https://huggingface.co/Comfy-Org/Qwen_Image_ComfyUI/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "text_encoder",
        name: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/Qwen_Image_ComfyUI/tree/main",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "qwen_image_vae.safetensors",
        url: "https://huggingface.co/Comfy-Org/Qwen_Image_ComfyUI/tree/main",
        destination: "ComfyUI/models/vae",
      },
    ],
    notes: "20B parameter model. Excellent prompt following. Uses Qwen 2.5 VL as text encoder.",
  },
  {
    name: "Qwen Image Edit (v2509)",
    description: "Qwen image editing with v2509 model. Supports up to 3 reference images for complex multi-image editing.",
    category: "qwen",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/qwen_image/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/qwen_image/qwen_image_edit_2509_basic_example.png",
    ],
    requiredNodes: ["UNETLoader", "CLIPLoader"],
    requiredModels: [
      {
        type: "diffusion_model",
        name: "qwen_image_edit_2509_fp8_e4m3fn.safetensors",
        url: "https://huggingface.co/Comfy-Org/Qwen_Image_ComfyUI/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "text_encoder",
        name: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/Qwen_Image_ComfyUI/tree/main",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "qwen_image_vae.safetensors",
        url: "https://huggingface.co/Comfy-Org/Qwen_Image_ComfyUI/tree/main",
        destination: "ComfyUI/models/vae",
      },
    ],
    notes: "v2509 is the latest edit model. Supports up to 3 different image inputs for complex editing workflows.",
  },
  {
    name: "Qwen Image Edit (Original)",
    description: "Original Qwen image editing model. Use v2509 for better multi-image support.",
    category: "qwen",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/qwen_image/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/qwen_image/qwen_image_edit_basic_example.png",
    ],
    requiredNodes: ["UNETLoader", "CLIPLoader"],
    requiredModels: [
      {
        type: "diffusion_model",
        name: "qwen_image_edit_fp8_e4m3fn.safetensors",
        url: "https://huggingface.co/Comfy-Org/Qwen_Image_ComfyUI/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "text_encoder",
        name: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/Qwen_Image_ComfyUI/tree/main",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "qwen_image_vae.safetensors",
        url: "https://huggingface.co/Comfy-Org/Qwen_Image_ComfyUI/tree/main",
        destination: "ComfyUI/models/vae",
      },
    ],
    notes: "Original edit model. v2509 has better multi-image support.",
  },
  {
    name: "SDXL Edit (CosXL Edit)",
    description: "Image editing using text prompts, InstructPix2Pix-style",
    category: "edit",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/edit_models/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/edit_models/sdxl_edit_model.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        name: "cosxl_edit.safetensors",
        url: "https://huggingface.co/stabilityai/cosxl",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
  },
  {
    name: "Omnigen 2",
    description: "Edit images with text prompts, accepts character reference images. Chain ReferenceLatent nodes for multiple references.",
    category: "omnigen",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/omnigen/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/omnigen/omnigen2_example.png",
    ],
    requiredModels: [
      {
        type: "diffusion_model",
        name: "omnigen2_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/Omnigen2_ComfyUI_repackaged/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "text_encoder",
        name: "qwen_2.5_vl_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/Omnigen2_ComfyUI_repackaged/tree/main",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "ae.safetensors (Flux VAE for Omnigen)",
        url: "https://huggingface.co/Comfy-Org/Omnigen2_ComfyUI_repackaged/tree/main",
        destination: "ComfyUI/models/vae",
      },
    ],
  }
];
