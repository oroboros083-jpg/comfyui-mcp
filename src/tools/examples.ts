import { z } from "zod";

// ComfyUI examples from https://comfyanonymous.github.io/ComfyUI_examples/
// Workflows are distributed as PNG images with embedded metadata or as JSON files
export interface ModelDownload {
  type: "checkpoint" | "unet" | "clip" | "vae" | "lora" | "controlnet" | "upscale" | "text_encoder" | "diffusion_model" | "clip_vision" | "other";
  name: string;
  url: string;
  destination?: string; // e.g., "ComfyUI/models/checkpoints"
}

export interface ExampleWorkflow {
  name: string;
  description: string;
  category: string;
  pageUrl: string;
  imageUrls: string[]; // PNG images with embedded workflows
  jsonUrls?: string[]; // Direct JSON workflow files
  requiredNodes?: string[];
  requiredModels?: ModelDownload[];
  notes?: string;
}

// Comprehensive map of all example pages with their workflow images and model downloads
export const EXAMPLE_WORKFLOWS: ExampleWorkflow[] = [
  // =========================================
  // BASICS
  // =========================================
  {
    name: "Basic txt2img",
    description: "Simple text-to-image generation with a checkpoint model",
    category: "basics",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/ComfyUI_00001_.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        name: "sd_xl_base_1.0.safetensors",
        url: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/sd_xl_base_1.0.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
  },
  {
    name: "Hires Fix (Latent Upscale)",
    description: "Create an image at lower resolution, upscale it using latent space, then run through img2img for higher quality details",
    category: "basics",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/2_pass_txt2img/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/2_pass_txt2img/hiresfix_latent_workflow.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/2_pass_txt2img/hiresfix_esrgan_workflow.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/2_pass_txt2img/latent_upscale_different_prompt_model.png",
    ],
    notes: "Latent upscaling keeps everything in latent space. ESRGAN approach requires pixel-space conversion.",
  },
  {
    name: "Image-to-Image (img2img)",
    description: "Transform an existing image using a prompt. Denoise parameter controls modification intensity (lower = preserve more of original)",
    category: "basics",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/img2img/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/img2img/img2img_workflow.png",
    ],
    notes: "Uses VAE encoding to convert image to latent space. Denoise value governs noise amount - 0.87 is a common starting point.",
  },
  {
    name: "Inpainting",
    description: "Edit specific regions of an image using a mask. Works with dedicated inpainting models or regular models.",
    category: "inpainting",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/inpain_model_cat.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/inpain_model_woman.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/inpaint_anythingv3_woman.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/inpain_model_outpainting.png",
    ],
    notes: "Outpainting uses 'Pad Image for Outpainting' node. Works with non-inpainting models too (e.g., anythingV3).",
  },

  // =========================================
  // LORA, HYPERNETWORKS, EMBEDDINGS
  // =========================================
  {
    name: "LoRA",
    description: "Apply LoRA (Low-Rank Adaptation) patches to modify style or concepts. Supports all LoRA variants: Lycoris, loha, lokr, locon.",
    category: "lora",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/lora/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/lora/lora.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/lora/lora_multiple.png",
    ],
    notes: "Place LoRA files in models/loras. Chain multiple LoraLoader nodes for multiple LoRAs.",
  },
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

  // =========================================
  // UPSCALING
  // =========================================
  {
    name: "Upscaling with ESRGAN",
    description: "Increase image resolution using upscale models like ESRGAN, RealESRGAN, etc.",
    category: "upscale",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/upscale_models/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/upscale_models/esrgan_example.png",
    ],
    requiredNodes: ["UpscaleModelLoader", "ImageUpscaleWithModel"],
    requiredModels: [
      {
        type: "upscale",
        name: "4x-UltraSharp.pth",
        url: "https://openmodeldb.info/",
        destination: "ComfyUI/models/upscale_models",
      },
    ],
    notes: "Find upscale models at OpenModelDB: https://openmodeldb.info/",
  },

  // =========================================
  // AREA COMPOSITION & LATENT COMPOSITION
  // =========================================
  {
    name: "Area Composition",
    description: "Generate different content in specific image regions using ConditioningSetArea node. Great for wide aspect ratios.",
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
    notes: "Concentrate subject generation in square zones while rendering backgrounds. Prevents limbs extending unnaturally.",
  },
  {
    name: "Noisy Latent Composition",
    description: "Composite multiple latents together while still noisy, before full denoising. Enables precise subject positioning.",
    category: "advanced",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/noisy_latent_composition/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/noisy_latent_composition/noisy_latents_3_subjects.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/noisy_latent_composition/noisy_latents_3_subjects_.png",
    ],
    notes: "Excels at controlling subject position, pose, and coloring. Subjects can interact based on shared prompts.",
  },

  // =========================================
  // CONTROLNET & GUIDANCE
  // =========================================
  {
    name: "ControlNet",
    description: "Guide image generation with control images (pose, depth, edges, scribbles). T2I-Adapters are more efficient alternatives.",
    category: "controlnet",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/controlnet_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/depth_t2i_adapter.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/depth_controlnet.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/2_pass_pose_worship.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/mixing_controlnets.png",
    ],
    requiredNodes: ["ControlNetLoader", "ControlNetApply"],
    requiredModels: [
      {
        type: "controlnet",
        name: "ControlNet v1.1 (Full)",
        url: "https://huggingface.co/lllyasviel/ControlNet-v1-1/tree/main",
        destination: "ComfyUI/models/controlnet",
      },
      {
        type: "controlnet",
        name: "ControlNet v1.1 (FP16)",
        url: "https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/tree/main",
        destination: "ComfyUI/models/controlnet",
      },
      {
        type: "lora",
        name: "Control-LoRA (Rank 256)",
        url: "https://huggingface.co/stabilityai/control-lora/tree/main/control-LoRAs-rank256",
        destination: "ComfyUI/models/controlnet",
      },
      {
        type: "lora",
        name: "Control-LoRA (Rank 128)",
        url: "https://huggingface.co/stabilityai/control-lora/tree/main/control-LoRAs-rank128",
        destination: "ComfyUI/models/controlnet",
      },
    ],
    notes: "T2I-Adapters are much more efficient with minimal performance impact vs ControlNets that slow down generation significantly.",
  },
  {
    name: "GLIGEN (Text Box Positioning)",
    description: "Spatial control for image generation - specify location and size of multiple objects using text boxes",
    category: "controlnet",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/gligen/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/gligen/gligen_textbox_example.png",
    ],
    requiredModels: [
      {
        type: "other",
        name: "GLIGEN (Pruned)",
        url: "https://huggingface.co/comfyanonymous/GLIGEN_pruned_safetensors/tree/main",
        destination: "ComfyUI/models/gligen",
      },
    ],
    notes: "Use GLIGEN Textbox Apply nodes to position specific concepts precisely within generated imagery.",
  },
  {
    name: "unCLIP",
    description: "Use images as prompts by encoding them through CLIPVision. Blend concepts from multiple reference images.",
    category: "unclip",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/unclip/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/unclip/unclip_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/unclip/unclip_example_multiple.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/unclip/unclip_2pass.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        name: "SD 2.1 unCLIP",
        url: "https://huggingface.co/stabilityai/stable-diffusion-2-1-unclip/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "WD1.5 Beta 2 unCLIP",
        url: "https://huggingface.co/comfyanonymous/wd-1.5-beta2_unCLIP/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "Illuminati Diffusion unCLIP",
        url: "https://huggingface.co/comfyanonymous/illuminatiDiffusionV1_v11_unCLIP/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Multi-image workflows extract and blend concepts from multiple reference images into coherent outputs.",
  },

  // =========================================
  // SDXL
  // =========================================
  {
    name: "SDXL with Refiner",
    description: "Two-stage SDXL generation with base and refiner models. Can use different prompts for each stage.",
    category: "sdxl",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/sdxl/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/sdxl/sdxl_simple_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/sdxl/sdxl_refiner_prompt_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/sdxl/sdxl_revision_zero_positive.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/sdxl/sdxl_revision_text_prompts.png",
    ],
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
      {
        type: "clip_vision",
        name: "clip_vision_g.safetensors",
        url: "https://huggingface.co/comfyanonymous/clip_vision_g/blob/main/clip_vision_g.safetensors",
        destination: "ComfyUI/models/clip_vision",
      },
    ],
    notes: "Optimal output requires 1024x1024 or equivalent pixel count (e.g., 896x1152). ReVision uses images as inspiration.",
  },

  // =========================================
  // SD3
  // =========================================
  {
    name: "Stable Diffusion 3 / 3.5",
    description: "Generate with SD3 architecture. Supports separate text encoders (CLIP + T5) or all-in-one checkpoint.",
    category: "sd3",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/sd3/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/sd3/sd3.5_text_encoders_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/sd3/sd3.5_simple_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/sd3/sd3.5_large_canny_controlnet_example.png",
    ],
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
        name: "t5xxl_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/blob/main/text_encoders/t5xxl_fp16.safetensors",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "text_encoder",
        name: "t5xxl_fp8_e4m3fn_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/blob/main/text_encoders/t5xxl_fp8_e4m3fn_scaled.safetensors",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "checkpoint",
        name: "SD3.5 Large",
        url: "https://huggingface.co/stabilityai/stable-diffusion-3.5-large/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "SD3.5 Medium",
        url: "https://huggingface.co/stabilityai/stable-diffusion-3.5-medium/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "SD3.5 Large Turbo",
        url: "https://huggingface.co/stabilityai/stable-diffusion-3.5-large-turbo/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "sd3.5_large_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/blob/main/sd3.5_large_fp8_scaled.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "controlnet",
        name: "SD3.5 ControlNets",
        url: "https://huggingface.co/stabilityai/stable-diffusion-3.5-controlnets",
        destination: "ComfyUI/models/controlnet",
      },
    ],
    notes: "All-in-one checkpoints include text encoders. Separate loading allows mixing encoder precision.",
  },

  // =========================================
  // MODEL MERGING
  // =========================================
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

  // =========================================
  // 3D
  // =========================================
  {
    name: "Stable Zero123 (3D)",
    description: "Generate images of objects from different camera angles. Input image should have simple background.",
    category: "3d",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/3d/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/3d/stable_zero123_example.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        name: "stable_zero123.ckpt",
        url: "https://huggingface.co/stabilityai/stable-zero123/blob/main/stable_zero123.ckpt",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Controls object rotation via elevation and azimuth parameters (in degrees).",
  },

  // =========================================
  // FAST/DISTILLED MODELS
  // =========================================
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

  // =========================================
  // STABLE CASCADE
  // =========================================
  {
    name: "Stable Cascade",
    description: "Two-stage architecture with Stage C (generation) and Stage B (decoding). Supports txt2img, img2img, remix, ControlNet.",
    category: "stable_cascade",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/stable_cascade/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/stable_cascade/stable_cascade__text_to_image.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/stable_cascade/stable_cascade__image_to_image.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/stable_cascade/stable_cascade__image_remixing.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/stable_cascade/stable_cascade__image_remixing_multiple.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/stable_cascade/stable_cascade__canny_controlnet.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/stable_cascade/stable_cascade__inpaint_controlnet.png",
    ],
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
      {
        type: "controlnet",
        name: "inpainting.safetensors (Stable Cascade)",
        url: "https://huggingface.co/stabilityai/stable-cascade/tree/main/controlnet",
        destination: "ComfyUI/models/controlnet",
      },
    ],
    notes: "Image remixing creates variations using CLIP vision outputs. Multiple images can be blended together.",
  },

  // =========================================
  // AURA FLOW
  // =========================================
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

  // =========================================
  // HUNYUAN DiT
  // =========================================
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

  // =========================================
  // HUNYUAN IMAGE 2.1
  // =========================================
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
  },

  // =========================================
  // CHROMA
  // =========================================
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

  // =========================================
  // LUMINA 2
  // =========================================
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

  // =========================================
  // HIDREAM
  // =========================================
  {
    name: "HiDream I1",
    description: "State of the art image diffusion model with dev and full variants, plus edit models (e1, e1.1)",
    category: "hidream",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/hidream/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/hidream/hidream_dev_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/hidream/hidream_full_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/hidream/hidream_e1.1_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/hidream/hidream_e1_example.png",
    ],
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
      {
        type: "diffusion_model",
        name: "hidream_i1_full_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "hidream_e1_1_bf16.safetensors",
        url: "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
    ],
  },

  // =========================================
  // QWEN IMAGE
  // =========================================
  {
    name: "Qwen Image",
    description: "20B diffusion model for image generation with edit capabilities supporting up to 3 image inputs",
    category: "qwen",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/qwen_image/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/qwen_image/qwen_image_basic_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/qwen_image/qwen_image_edit_2509_basic_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/qwen_image/qwen_image_edit_basic_example.png",
    ],
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
      {
        type: "diffusion_model",
        name: "qwen_image_edit_2509_fp8_e4m3fn.safetensors",
        url: "https://huggingface.co/Comfy-Org/Qwen_Image_ComfyUI/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
    ],
    notes: "Edit model v2509 supports up to 3 different image inputs for complex editing workflows.",
  },

  // =========================================
  // FLUX
  // =========================================
  {
    name: "Flux",
    description: "High-quality generation with Flux dev/schnell. Supports Fill (inpaint/outpaint), Redux, Canny, Depth, Kontext editing.",
    category: "flux",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/flux/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_dev_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_schnell_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_dev_checkpoint_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_schnell_checkpoint_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_kontext_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_fill_inpaint_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_fill_outpaint_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_redux_model_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_canny_model_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_depth_lora_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_controlnet_example.png",
    ],
    requiredNodes: ["UNETLoader", "DualCLIPLoader"],
    requiredModels: [
      {
        type: "text_encoder",
        name: "Flux text encoders",
        url: "https://huggingface.co/comfyanonymous/flux_text_encoders/tree/main",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "unet",
        name: "flux1-dev.safetensors",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-dev/tree/main",
        destination: "ComfyUI/models/unet",
      },
      {
        type: "unet",
        name: "flux1-schnell.safetensors",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-schnell/tree/main",
        destination: "ComfyUI/models/unet",
      },
      {
        type: "checkpoint",
        name: "flux1-dev-fp8.safetensors (all-in-one)",
        url: "https://huggingface.co/Comfy-Org/flux1-dev/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "flux1-schnell-fp8.safetensors (all-in-one)",
        url: "https://huggingface.co/Comfy-Org/flux1-schnell/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "unet",
        name: "FLUX.1-Kontext-dev",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev/tree/main",
        destination: "ComfyUI/models/unet",
      },
      {
        type: "unet",
        name: "FLUX.1-Fill-dev",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-Fill-dev/tree/main",
        destination: "ComfyUI/models/unet",
      },
      {
        type: "clip_vision",
        name: "sigclip_vision_384.safetensors",
        url: "https://huggingface.co/Comfy-Org/sigclip_vision_384/tree/main",
        destination: "ComfyUI/models/clip_vision",
      },
      {
        type: "unet",
        name: "FLUX.1-Redux-dev",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-Redux-dev/tree/main",
        destination: "ComfyUI/models/unet",
      },
      {
        type: "unet",
        name: "FLUX.1-Canny-dev",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-Canny-dev/tree/main",
        destination: "ComfyUI/models/unet",
      },
      {
        type: "unet",
        name: "FLUX.1-Depth-dev",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-Depth-dev/tree/main",
        destination: "ComfyUI/models/unet",
      },
      {
        type: "vae",
        name: "ae.safetensors (Flux VAE)",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-dev/tree/main",
        destination: "ComfyUI/models/vae",
      },
    ],
    notes: "Schnell is 4-step distilled. Kontext enables image editing. Fill supports inpaint/outpaint. Redux uses images to guide style.",
  },

  // =========================================
  // FLUX 2
  // =========================================
  {
    name: "Flux 2",
    description: "State of the art image diffusion with Mistral 3 text encoder. Supports multiple reference images as optional inputs.",
    category: "flux",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/flux2/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/flux2/flux2_example.png",
    ],
    requiredModels: [
      {
        type: "text_encoder",
        name: "mistral_3_small_flux2_fp8.safetensors",
        url: "https://huggingface.co/Comfy-Org/flux2-dev/blob/main/split_files/text_encoders/mistral_3_small_flux2_fp8.safetensors",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "diffusion_model",
        name: "flux2_dev_fp8mixed.safetensors",
        url: "https://huggingface.co/Comfy-Org/flux2-dev/blob/main/split_files/diffusion_models/flux2_dev_fp8mixed.safetensors",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "vae",
        name: "flux2-vae.safetensors",
        url: "https://huggingface.co/Comfy-Org/flux2-dev/blob/main/split_files/vae/flux2-vae.safetensors",
        destination: "ComfyUI/models/vae",
      },
    ],
    notes: "Full model available at https://huggingface.co/black-forest-labs/FLUX.2-dev",
  },

  // =========================================
  // Z IMAGE TURBO
  // =========================================
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
  },

  // =========================================
  // EDIT MODELS
  // =========================================
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

  // =========================================
  // OMNIGEN
  // =========================================
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
  },

  // =========================================
  // VIDEO - SVD
  // =========================================
  {
    name: "Stable Video Diffusion (SVD)",
    description: "Generate videos from images using SVD. 14-frame (svd) or 25-frame (svd_xt) versions available.",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/video/",
    imageUrls: [], // WebP files, not PNG with embedded workflows
    requiredNodes: ["ImageOnlyCheckpointLoader", "SVD_img2vid_Conditioning"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "svd.safetensors (14-frame)",
        url: "https://huggingface.co/stabilityai/stable-video-diffusion-img2vid/blob/main/svd.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "svd_xt.safetensors (25-frame)",
        url: "https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/blob/main/svd_xt.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Can chain with SDXL text-to-image for full txt2img2vid pipeline.",
  },

  // =========================================
  // VIDEO - MOCHI
  // =========================================
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

  // =========================================
  // VIDEO - LTX-Video
  // =========================================
  {
    name: "LTX-Video",
    description: "Text-to-video and image-to-video generation. Use long descriptive prompts for best results.",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/ltxv/",
    imageUrls: [], // WebP files
    requiredModels: [
      {
        type: "checkpoint",
        name: "ltx-video-2b-v0.9.5.safetensors",
        url: "https://huggingface.co/Lightricks/LTX-Video/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "text_encoder",
        name: "t5xxl_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/mochi_preview_repackaged/tree/main/split_files",
        destination: "ComfyUI/models/text_encoders",
      },
    ],
    notes: "Image-to-video supports guiding images for keyframe control.",
  },

  // =========================================
  // VIDEO - HUNYUAN VIDEO
  // =========================================
  {
    name: "Hunyuan Video",
    description: "Text-to-video and image-to-video. V2 (replace) follows guiding image closely, V1 (concat) has more dynamic motion.",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/hunyuan_video/",
    imageUrls: [], // WebP files
    requiredModels: [
      {
        type: "text_encoder",
        name: "clip_l.safetensors",
        url: "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/tree/main/split_files/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "text_encoder",
        name: "llava_llama3_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/tree/main/split_files/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "hunyuan_video_vae_bf16.safetensors",
        url: "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/tree/main/split_files/vae",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "diffusion_model",
        name: "hunyuan_video_t2v_720p_bf16.safetensors",
        url: "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/tree/main/split_files/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "hunyuan_video_image_to_video_720p_bf16.safetensors",
        url: "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/tree/main/split_files/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "hunyuan_video_v2_replace_image_to_video_720p_bf16.safetensors",
        url: "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/tree/main/split_files/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "clip_vision",
        name: "llava_llama3_vision.safetensors",
        url: "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/tree/main/split_files/clip_vision",
        destination: "ComfyUI/models/clip_vision",
      },
    ],
    notes: "Can produce static images by setting video length to 1.",
  },

  // =========================================
  // VIDEO - COSMOS
  // =========================================
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

  // =========================================
  // VIDEO - COSMOS PREDICT2
  // =========================================
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

  // =========================================
  // VIDEO - WAN 2.1
  // =========================================
  {
    name: "Wan 2.1",
    description: "Text-to-video, image-to-video (480p/720p), VACE reference generation, and camera motion control",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/wan/",
    imageUrls: [], // WebP files
    jsonUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/wan/text_to_video_wan.json",
      "https://comfyanonymous.github.io/ComfyUI_examples/wan/image_to_video_wan_example.json",
      "https://comfyanonymous.github.io/ComfyUI_examples/wan/vace_reference_to_video.json",
      "https://comfyanonymous.github.io/ComfyUI_examples/wan/camera_image_to_video_wan_example.json",
    ],
    requiredModels: [
      {
        type: "text_encoder",
        name: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "wan_2.1_vae.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/vae",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "diffusion_model",
        name: "wan2.1_t2v_1.3B_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "wan2.1_i2v_480p_14B_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "wan2.1_i2v_720p_14B_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "wan2.1_vace_14B_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "wan2.1_fun_camera_v1.1_1.3B_bf16.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "clip_vision",
        name: "clip_vision_h.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/clip_vision",
        destination: "ComfyUI/models/clip_vision",
      },
    ],
    notes: "VACE reference creates videos derived from reference images without containing the actual image. Camera motion applies dynamic movements.",
  },

  // =========================================
  // VIDEO - WAN 2.2
  // =========================================
  {
    name: "Wan 2.2",
    description: "Text-to-video and image-to-video with 5B and 14B model variants",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/wan22/",
    imageUrls: [], // WebP files
    jsonUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/wan22/text_to_video_wan22_5B.json",
      "https://comfyanonymous.github.io/ComfyUI_examples/wan22/image_to_video_wan22_5B.json",
      "https://comfyanonymous.github.io/ComfyUI_examples/wan22/text_to_video_wan22_14B.json",
      "https://comfyanonymous.github.io/ComfyUI_examples/wan22/image_to_video_wan22_14B.json",
    ],
    requiredModels: [
      {
        type: "text_encoder",
        name: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "wan_2.1_vae.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "vae",
        name: "wan2.2_vae.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "diffusion_model",
        name: "wan2.2_ti2v_5B_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
    ],
    notes: "14B models require both high_noise and low_noise model files.",
  },

  // =========================================
  // AUDIO
  // =========================================
  {
    name: "Audio Generation (ACE Step / Stable Audio)",
    description: "Generate audio and music using ACE Step or Stable Audio Open models",
    category: "audio",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/audio/",
    imageUrls: [], // FLAC files with embedded workflows
    requiredNodes: ["StableAudioSampler"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "ace_step_v1_3.5b.safetensors",
        url: "https://huggingface.co/Comfy-Org/ACE-Step_ComfyUI_repackaged/blob/main/all_in_one/ace_step_v1_3.5b.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "text_encoder",
        name: "t5_base.safetensors",
        url: "https://huggingface.co/google-t5/t5-base/blob/main/model.safetensors",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "checkpoint",
        name: "stable_audio_open_1.0.safetensors",
        url: "https://huggingface.co/stabilityai/stable-audio-open-1.0/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "FLAC audio files contain embedded workflows that can be loaded into ComfyUI.",
  },
];

/**
 * Extract workflow JSON from PNG metadata
 * ComfyUI embeds workflow data in PNG tEXt chunks with key "workflow" or "prompt"
 */
export async function extractWorkflowFromPng(
  imageData: ArrayBuffer
): Promise<{ workflow?: Record<string, unknown>; prompt?: Record<string, unknown> } | null> {
  const data = new Uint8Array(imageData);

  // PNG signature check
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (data[i] !== pngSignature[i]) {
      return null; // Not a PNG
    }
  }

  const result: { workflow?: Record<string, unknown>; prompt?: Record<string, unknown> } = {};

  // Parse PNG chunks
  let offset = 8;
  while (offset < data.length) {
    // Read chunk length (4 bytes, big-endian)
    const length =
      (data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3];
    offset += 4;

    // Read chunk type (4 bytes)
    const type = String.fromCharCode(
      data[offset],
      data[offset + 1],
      data[offset + 2],
      data[offset + 3]
    );
    offset += 4;

    // Read chunk data
    const chunkData = data.slice(offset, offset + length);
    offset += length;

    // Skip CRC (4 bytes)
    offset += 4;

    // Check for tEXt or iTXt chunks
    if (type === "tEXt" || type === "iTXt") {
      // Find null separator between key and value
      let nullIndex = 0;
      for (let i = 0; i < chunkData.length; i++) {
        if (chunkData[i] === 0) {
          nullIndex = i;
          break;
        }
      }

      const key = new TextDecoder().decode(chunkData.slice(0, nullIndex));
      let value: string;

      if (type === "tEXt") {
        // tEXt: key\0value
        value = new TextDecoder().decode(chunkData.slice(nullIndex + 1));
      } else {
        // iTXt: key\0compression\0language\0translated\0text
        // Skip compression flag, method, language tag, translated keyword
        let valueStart = nullIndex + 1;
        let nullCount = 0;
        for (let i = valueStart; i < chunkData.length && nullCount < 3; i++) {
          if (chunkData[i] === 0) {
            nullCount++;
            valueStart = i + 1;
          }
        }
        value = new TextDecoder().decode(chunkData.slice(valueStart));
      }

      // Parse workflow or prompt JSON
      if (key === "workflow" || key === "prompt") {
        try {
          const parsed = JSON.parse(value);
          if (key === "workflow") {
            result.workflow = parsed;
          } else {
            result.prompt = parsed;
          }
        } catch {
          // Invalid JSON, skip
        }
      }
    }

    // Stop at IEND chunk
    if (type === "IEND") {
      break;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Fetch an example workflow image and extract the embedded workflow
 */
export async function fetchExampleWorkflow(
  imageUrl: string
): Promise<{
  success: boolean;
  workflow?: Record<string, unknown>;
  prompt?: Record<string, unknown>;
  error?: string;
}> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return { success: false, error: `Failed to fetch: ${response.statusText}` };
    }

    const imageData = await response.arrayBuffer();
    const extracted = await extractWorkflowFromPng(imageData);

    if (!extracted) {
      return { success: false, error: "No workflow data found in image" };
    }

    return {
      success: true,
      workflow: extracted.workflow,
      prompt: extracted.prompt,
    };
  } catch (error) {
    return {
      success: false,
      error: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Fetch a JSON workflow file directly
 */
export async function fetchJsonWorkflow(
  jsonUrl: string
): Promise<{
  success: boolean;
  workflow?: Record<string, unknown>;
  error?: string;
}> {
  try {
    const response = await fetch(jsonUrl);
    if (!response.ok) {
      return { success: false, error: `Failed to fetch: ${response.statusText}` };
    }

    const workflow = await response.json() as Record<string, unknown>;
    return {
      success: true,
      workflow,
    };
  } catch (error) {
    return {
      success: false,
      error: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export const listExamplesSchema = z.object({
  category: z
    .string()
    .optional()
    .describe(
      "Filter by category (basics, sdxl, flux, video, audio, controlnet, etc.)"
    ),
});

export type ListExamplesInput = z.infer<typeof listExamplesSchema>;

export function listExamples(input: ListExamplesInput): string {
  let examples = EXAMPLE_WORKFLOWS;

  if (input.category) {
    const cat = input.category.toLowerCase();
    examples = examples.filter((e) => e.category.toLowerCase().includes(cat));
  }

  // Group by category
  const grouped: Record<string, ExampleWorkflow[]> = {};
  for (const example of examples) {
    if (!grouped[example.category]) {
      grouped[example.category] = [];
    }
    grouped[example.category].push(example);
  }

  let result = "# ComfyUI Example Workflows\n\n";
  result +=
    "These examples are from the official ComfyUI documentation.\n";
  result += "Use `get_example_workflow` to fetch the actual workflow JSON.\n\n";

  for (const [category, categoryExamples] of Object.entries(grouped)) {
    result += `## ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
    for (const example of categoryExamples) {
      result += `### ${example.name}\n`;
      result += `${example.description}\n`;
      result += `- Documentation: ${example.pageUrl}\n`;
      if (example.imageUrls.length > 0) {
        result += `- Workflow images: ${example.imageUrls.length}\n`;
      }
      if (example.jsonUrls && example.jsonUrls.length > 0) {
        result += `- JSON workflows: ${example.jsonUrls.length}\n`;
      }
      if (example.requiredModels && example.requiredModels.length > 0) {
        result += `- Required models:\n`;
        for (const model of example.requiredModels) {
          result += `  - ${model.type}: ${model.name}\n`;
          result += `    ${model.url}\n`;
        }
      }
      if (example.requiredNodes) {
        result += `- Required nodes: ${example.requiredNodes.join(", ")}\n`;
      }
      if (example.notes) {
        result += `- Notes: ${example.notes}\n`;
      }
      result += "\n";
    }
  }

  return result;
}

export const getExampleWorkflowSchema = z.object({
  name: z.string().describe("Name of the example workflow to fetch"),
  variant: z
    .number()
    .optional()
    .default(0)
    .describe("Which variant to get (0 = first/default)"),
});

export type GetExampleWorkflowInput = z.infer<typeof getExampleWorkflowSchema>;

export async function getExampleWorkflow(
  input: GetExampleWorkflowInput
): Promise<string> {
  const searchName = input.name.toLowerCase();
  const example = EXAMPLE_WORKFLOWS.find(
    (e) =>
      e.name.toLowerCase().includes(searchName) ||
      e.category.toLowerCase() === searchName
  );

  if (!example) {
    return `Example "${input.name}" not found. Use list_examples to see available examples.`;
  }

  // Determine if we have PNG images or JSON files
  const hasPngWorkflows = example.imageUrls.length > 0;
  const hasJsonWorkflows = example.jsonUrls && example.jsonUrls.length > 0;

  if (!hasPngWorkflows && !hasJsonWorkflows) {
    let output = `# ${example.name}\n\n`;
    output += `${example.description}\n\n`;
    output += `This example does not have downloadable workflow files.\n`;
    output += `Visit ${example.pageUrl} for more information.\n\n`;

    if (example.requiredModels && example.requiredModels.length > 0) {
      output += `## Required Models\n\n`;
      for (const model of example.requiredModels) {
        output += `### ${model.name}\n`;
        output += `- Type: ${model.type}\n`;
        output += `- URL: ${model.url}\n`;
        if (model.destination) {
          output += `- Install to: ${model.destination}\n`;
        }
        output += "\n";
      }
    }

    if (example.notes) {
      output += `## Notes\n${example.notes}\n`;
    }

    return output;
  }

  let result: { success: boolean; workflow?: Record<string, unknown>; prompt?: Record<string, unknown>; error?: string };
  let sourceUrl: string;

  // Prefer JSON workflows if available, then PNG
  if (hasJsonWorkflows) {
    const variantIndex = Math.min(input.variant, example.jsonUrls!.length - 1);
    sourceUrl = example.jsonUrls![variantIndex];
    result = await fetchJsonWorkflow(sourceUrl);
  } else {
    const variantIndex = Math.min(input.variant, example.imageUrls.length - 1);
    sourceUrl = example.imageUrls[variantIndex];
    result = await fetchExampleWorkflow(sourceUrl);
  }

  if (!result.success) {
    return `Failed to fetch workflow: ${result.error}\n\nYou can manually visit: ${sourceUrl}`;
  }

  let output = `# ${example.name} Workflow\n\n`;
  output += `${example.description}\n\n`;
  output += `Source: ${sourceUrl}\n\n`;

  // Return the prompt (API format) which is what ComfyUI actually executes
  const workflowData = result.prompt || result.workflow;
  if (workflowData) {
    output += `## Workflow (API Format)\n`;
    output += "This can be used directly with the `run_workflow` tool:\n\n";
    output += "```json\n";
    output += JSON.stringify(workflowData, null, 2);
    output += "\n```\n";
  }

  if (example.requiredModels && example.requiredModels.length > 0) {
    output += `\n## Required Models\n\n`;
    for (const model of example.requiredModels) {
      output += `### ${model.name}\n`;
      output += `- Type: ${model.type}\n`;
      output += `- URL: ${model.url}\n`;
      if (model.destination) {
        output += `- Install to: ${model.destination}\n`;
      }
      output += "\n";
    }
  }

  if (example.notes) {
    output += `## Notes\n${example.notes}\n`;
  }

  return output;
}

/**
 * Get all model downloads for a specific example or category
 */
export function getModelDownloads(categoryOrName?: string): ModelDownload[] {
  let examples = EXAMPLE_WORKFLOWS;

  if (categoryOrName) {
    const search = categoryOrName.toLowerCase();
    examples = examples.filter(
      (e) =>
        e.name.toLowerCase().includes(search) ||
        e.category.toLowerCase().includes(search)
    );
  }

  const models: ModelDownload[] = [];
  const seen = new Set<string>();

  for (const example of examples) {
    if (example.requiredModels) {
      for (const model of example.requiredModels) {
        const key = `${model.type}:${model.url}`;
        if (!seen.has(key)) {
          seen.add(key);
          models.push(model);
        }
      }
    }
  }

  return models;
}

/**
 * Get all unique categories
 */
export function getCategories(): string[] {
  const categories = new Set<string>();
  for (const example of EXAMPLE_WORKFLOWS) {
    categories.add(example.category);
  }
  return Array.from(categories).sort();
}
