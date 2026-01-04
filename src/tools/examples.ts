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
    name: "Inpainting (Basic)",
    description: "Basic inpainting workflow using SetLatentNoiseMask. Works with any model by applying noise mask to latent.",
    category: "inpainting",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/inpaint_example.png",
    ],
    requiredNodes: ["SetLatentNoiseMask", "VAEEncodeForInpaint"],
    notes: "Basic approach that works with any model. Uses SetLatentNoiseMask to define the area to regenerate.",
  },
  {
    name: "Inpainting (Yosemite Example)",
    description: "Inpainting landscape example using the basic noise mask approach. Demonstrates replacing regions in nature photos.",
    category: "inpainting",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/yosemite_inpaint_example.png",
    ],
    requiredNodes: ["SetLatentNoiseMask"],
    notes: "Example showing inpainting in a landscape photo.",
  },
  {
    name: "Inpainting (Dedicated Model)",
    description: "Inpainting using dedicated SD 2.0 inpainting model. Better quality than basic approach for complex edits.",
    category: "inpainting",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/inpain_model_cat.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/inpain_model_woman.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        name: "512-inpainting-ema.safetensors (SD 2.0 Inpaint)",
        url: "https://huggingface.co/stabilityai/stable-diffusion-2-inpainting/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Uses specialized inpainting checkpoint trained on masked data. First variant shows cat example, second shows portrait.",
  },
  {
    name: "Inpainting (Regular Model)",
    description: "Inpainting using a regular (non-inpainting) model like AnythingV3. Shows that any model can be used for inpainting.",
    category: "inpainting",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/inpaint_anythingv3_woman.png",
    ],
    notes: "Demonstrates that inpainting works with any model, not just dedicated inpainting checkpoints.",
  },
  {
    name: "Outpainting",
    description: "Extend images beyond their original borders. Uses 'Pad Image for Outpainting' node to expand canvas.",
    category: "inpainting",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/yosemite_outpaint_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/inpain_model_outpainting.png",
    ],
    requiredNodes: ["ImagePadForOutpaint"],
    notes: "First variant shows basic outpainting, second uses dedicated inpainting model for better edge blending.",
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
  // CONTROLNET & GUIDANCE - Split by control type
  // =========================================
  {
    name: "ControlNet (Scribble/Lineart)",
    description: "Generate images guided by scribbles or line drawings. Great for sketches or doodles as input.",
    category: "controlnet",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/controlnet_example.png",
    ],
    requiredNodes: ["ControlNetLoader", "ControlNetApply"],
    requiredModels: [
      {
        type: "controlnet",
        name: "control_v11p_sd15_scribble.pth",
        url: "https://huggingface.co/lllyasviel/ControlNet-v1-1/tree/main",
        destination: "ComfyUI/models/controlnet",
      },
    ],
    notes: "Use rough sketches or scribbles as input. Model interprets structure and generates detailed image.",
  },
  {
    name: "ControlNet (Depth)",
    description: "Generate images guided by depth maps. Maintains 3D spatial structure of the input image.",
    category: "controlnet",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/depth_controlnet.png",
    ],
    requiredNodes: ["ControlNetLoader", "ControlNetApply"],
    requiredModels: [
      {
        type: "controlnet",
        name: "control_v11f1p_sd15_depth.pth",
        url: "https://huggingface.co/lllyasviel/ControlNet-v1-1/tree/main",
        destination: "ComfyUI/models/controlnet",
      },
    ],
    notes: "Create depth map from input image using MiDaS or DepthAnything, then use as control signal.",
  },
  {
    name: "T2I-Adapter (Depth)",
    description: "Depth-guided generation using T2I-Adapter. More efficient than ControlNet with minimal quality loss.",
    category: "controlnet",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/depth_t2i_adapter.png",
    ],
    requiredNodes: ["ControlNetLoader", "ControlNetApply"],
    requiredModels: [
      {
        type: "controlnet",
        name: "t2i-adapter_depth_sd15v2.pth",
        url: "https://huggingface.co/TencentARC/T2I-Adapter/tree/main",
        destination: "ComfyUI/models/controlnet",
      },
    ],
    notes: "T2I-Adapters are faster than ControlNets with similar results. Recommended for production use.",
  },
  {
    name: "ControlNet (Pose/OpenPose)",
    description: "Generate images guided by pose skeletons. Control body positioning and gestures of characters.",
    category: "controlnet",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/2_pass_pose_worship.png",
    ],
    requiredNodes: ["ControlNetLoader", "ControlNetApply"],
    requiredModels: [
      {
        type: "controlnet",
        name: "control_v11p_sd15_openpose.pth",
        url: "https://huggingface.co/lllyasviel/ControlNet-v1-1/tree/main",
        destination: "ComfyUI/models/controlnet",
      },
    ],
    notes: "Extract pose from reference image using OpenPose, then generate new image with same pose.",
  },
  {
    name: "ControlNet (Multiple/Combined)",
    description: "Combine multiple ControlNets for complex guidance. E.g., pose + scribble for character with specific appearance.",
    category: "controlnet",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/mixing_controlnets.png",
    ],
    requiredNodes: ["ControlNetLoader", "ControlNetApply"],
    requiredModels: [
      {
        type: "controlnet",
        name: "ControlNet v1.1 models",
        url: "https://huggingface.co/lllyasviel/ControlNet-v1-1/tree/main",
        destination: "ComfyUI/models/controlnet",
      },
    ],
    notes: "Chain multiple ControlNetApply nodes. Each adds guidance. Adjust strength per control type.",
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
    name: "unCLIP (Single Image)",
    description: "Use a single image as a prompt by encoding through CLIPVision. Generate variations of the input image.",
    category: "unclip",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/unclip/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/unclip/unclip_example.png",
    ],
    requiredNodes: ["unCLIPCheckpointLoader", "CLIPVisionEncode", "unCLIPConditioning"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "SD 2.1 unCLIP",
        url: "https://huggingface.co/stabilityai/stable-diffusion-2-1-unclip/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Encode input image with CLIP Vision, use as conditioning. Creates variations maintaining style and content.",
  },
  {
    name: "unCLIP (Multiple Images)",
    description: "Blend concepts from multiple reference images. Combine styles, subjects, or themes from different sources.",
    category: "unclip",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/unclip/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/unclip/unclip_example_multiple.png",
    ],
    requiredNodes: ["unCLIPCheckpointLoader", "CLIPVisionEncode", "unCLIPConditioning"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "SD 2.1 unCLIP",
        url: "https://huggingface.co/stabilityai/stable-diffusion-2-1-unclip/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Chain multiple CLIPVisionEncode + unCLIPConditioning nodes. Adjust strength per image to control influence.",
  },
  {
    name: "unCLIP (Two-Pass)",
    description: "Two-stage unCLIP generation. First pass creates initial image, second pass refines with higher detail.",
    category: "unclip",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/unclip/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/unclip/unclip_2pass.png",
    ],
    requiredNodes: ["unCLIPCheckpointLoader", "CLIPVisionEncode", "unCLIPConditioning"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "SD 2.1 unCLIP",
        url: "https://huggingface.co/stabilityai/stable-diffusion-2-1-unclip/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "First pass at low resolution, second pass upscales and adds detail. Better quality for complex images.",
  },

  // =========================================
  // SDXL - Split for better discoverability
  // =========================================
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

  // =========================================
  // SD3 - Split for better discoverability
  // =========================================
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
  // STABLE CASCADE - Split by workflow type
  // =========================================
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
  // HIDREAM - Split by model variant
  // =========================================
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

  // =========================================
  // QWEN IMAGE - Split by model type
  // =========================================
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

  // =========================================
  // FLUX - Split into separate entries for easier discovery
  // =========================================
  {
    name: "Flux Dev",
    description: "High-quality Flux Dev generation using separate UNET, CLIP, and VAE files. Requires UNETLoader and DualCLIPLoader nodes.",
    category: "flux",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/flux/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_dev_example.png",
    ],
    requiredNodes: ["UNETLoader", "DualCLIPLoader"],
    requiredModels: [
      {
        type: "text_encoder",
        name: "Flux text encoders (t5xxl + clip_l)",
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
        type: "vae",
        name: "ae.safetensors (Flux VAE)",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-dev/tree/main",
        destination: "ComfyUI/models/vae",
      },
    ],
    notes: "Use this workflow when you have separate UNET files in models/unet folder. For all-in-one checkpoints, use 'Flux Dev Checkpoint' instead.",
  },
  {
    name: "Flux Schnell",
    description: "Fast 4-step Flux Schnell generation using separate UNET, CLIP, and VAE files. Only needs 4 steps for good results.",
    category: "flux",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/flux/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_schnell_example.png",
    ],
    requiredNodes: ["UNETLoader", "DualCLIPLoader"],
    requiredModels: [
      {
        type: "text_encoder",
        name: "Flux text encoders (t5xxl + clip_l)",
        url: "https://huggingface.co/comfyanonymous/flux_text_encoders/tree/main",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "unet",
        name: "flux1-schnell.safetensors",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-schnell/tree/main",
        destination: "ComfyUI/models/unet",
      },
      {
        type: "vae",
        name: "ae.safetensors (Flux VAE)",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-schnell/tree/main",
        destination: "ComfyUI/models/vae",
      },
    ],
    notes: "Schnell is distilled for 4-step generation. Use this workflow with separate UNET files. For all-in-one checkpoints, use 'Flux Schnell Checkpoint' instead.",
  },
  {
    name: "Flux Dev Checkpoint",
    description: "Flux Dev using all-in-one FP8 checkpoint file. Uses CheckpointLoaderSimple instead of separate loaders. Easier setup.",
    category: "flux",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/flux/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_dev_checkpoint_example.png",
    ],
    requiredNodes: ["CheckpointLoaderSimple"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "flux1-dev-fp8.safetensors",
        url: "https://huggingface.co/Comfy-Org/flux1-dev/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "All-in-one checkpoint includes UNET, CLIP, and VAE. Simpler setup - just load the checkpoint like SD models. FP8 format for lower VRAM usage.",
  },
  {
    name: "Flux Schnell Checkpoint",
    description: "Fast 4-step Flux Schnell using all-in-one FP8 checkpoint. Uses CheckpointLoaderSimple. Only needs 4 steps.",
    category: "flux",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/flux/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_schnell_checkpoint_example.png",
    ],
    requiredNodes: ["CheckpointLoaderSimple"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "flux1-schnell-fp8.safetensors",
        url: "https://huggingface.co/Comfy-Org/flux1-schnell/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "All-in-one checkpoint for Schnell. Only needs 4 steps! Use simple scheduler. FP8 format for lower VRAM. Best choice for fast generation with checkpoint files.",
  },
  {
    name: "Flux Kontext",
    description: "Edit existing images with Flux Kontext. Describe changes in natural language to modify images while preserving identity.",
    category: "flux",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/flux/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_kontext_example.png",
    ],
    requiredNodes: ["UNETLoader", "DualCLIPLoader", "FluxKontextImageEncode"],
    requiredModels: [
      {
        type: "text_encoder",
        name: "Flux text encoders",
        url: "https://huggingface.co/comfyanonymous/flux_text_encoders/tree/main",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "unet",
        name: "FLUX.1-Kontext-dev",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev/tree/main",
        destination: "ComfyUI/models/unet",
      },
      {
        type: "vae",
        name: "ae.safetensors (Flux VAE)",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-dev/tree/main",
        destination: "ComfyUI/models/vae",
      },
    ],
    notes: "Kontext allows natural language image editing. Describe what to change and it modifies while keeping identity. Great for character consistency.",
  },
  {
    name: "Flux Fill (Inpaint/Outpaint)",
    description: "Inpainting and outpainting with Flux Fill. Mask regions to regenerate or extend images beyond their borders.",
    category: "flux",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/flux/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_fill_inpaint_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_fill_outpaint_example.png",
    ],
    requiredNodes: ["UNETLoader", "DualCLIPLoader", "InpaintModelConditioning"],
    requiredModels: [
      {
        type: "text_encoder",
        name: "Flux text encoders",
        url: "https://huggingface.co/comfyanonymous/flux_text_encoders/tree/main",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "unet",
        name: "FLUX.1-Fill-dev",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-Fill-dev/tree/main",
        destination: "ComfyUI/models/unet",
      },
      {
        type: "vae",
        name: "ae.safetensors (Flux VAE)",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-dev/tree/main",
        destination: "ComfyUI/models/vae",
      },
    ],
    notes: "First variant is inpainting (mask regions to regenerate). Second variant is outpainting (extend image borders).",
  },
  {
    name: "Flux Redux",
    description: "Image-guided generation with Flux Redux. Use reference images to guide style and composition of new generations.",
    category: "flux",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/flux/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_redux_model_example.png",
    ],
    requiredNodes: ["UNETLoader", "DualCLIPLoader", "CLIPVisionLoader", "StyleModelLoader"],
    requiredModels: [
      {
        type: "text_encoder",
        name: "Flux text encoders",
        url: "https://huggingface.co/comfyanonymous/flux_text_encoders/tree/main",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "unet",
        name: "flux1-dev.safetensors (or schnell)",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-dev/tree/main",
        destination: "ComfyUI/models/unet",
      },
      {
        type: "other",
        name: "FLUX.1-Redux-dev (style model)",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-Redux-dev/tree/main",
        destination: "ComfyUI/models/style_models",
      },
      {
        type: "clip_vision",
        name: "sigclip_vision_384.safetensors",
        url: "https://huggingface.co/Comfy-Org/sigclip_vision_384/tree/main",
        destination: "ComfyUI/models/clip_vision",
      },
      {
        type: "vae",
        name: "ae.safetensors (Flux VAE)",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-dev/tree/main",
        destination: "ComfyUI/models/vae",
      },
    ],
    notes: "Redux uses reference images to guide generation style. Requires CLIP Vision model for image encoding.",
  },
  {
    name: "Flux Canny",
    description: "Edge-guided generation with Flux Canny. Use canny edge detection to control structure of generated images.",
    category: "flux",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/flux/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_canny_model_example.png",
    ],
    requiredNodes: ["UNETLoader", "DualCLIPLoader", "Canny"],
    requiredModels: [
      {
        type: "text_encoder",
        name: "Flux text encoders",
        url: "https://huggingface.co/comfyanonymous/flux_text_encoders/tree/main",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "unet",
        name: "FLUX.1-Canny-dev",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-Canny-dev/tree/main",
        destination: "ComfyUI/models/unet",
      },
      {
        type: "vae",
        name: "ae.safetensors (Flux VAE)",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-dev/tree/main",
        destination: "ComfyUI/models/vae",
      },
    ],
    notes: "Official Canny model from Black Forest Labs. Extracts edges from input image to guide generation structure.",
  },
  {
    name: "Flux Depth",
    description: "Depth-guided generation with Flux Depth LoRA. Use depth maps to control spatial structure of generated images.",
    category: "flux",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/flux/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_depth_lora_example.png",
    ],
    requiredNodes: ["UNETLoader", "DualCLIPLoader", "DepthAnything"],
    requiredModels: [
      {
        type: "text_encoder",
        name: "Flux text encoders",
        url: "https://huggingface.co/comfyanonymous/flux_text_encoders/tree/main",
        destination: "ComfyUI/models/text_encoders",
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
    notes: "Uses depth estimation (DepthAnything) to guide spatial structure. Good for maintaining 3D consistency.",
  },
  {
    name: "Flux ControlNet (Community)",
    description: "Community ControlNet support for Flux. Apply structural guidance using various control types.",
    category: "flux",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/flux/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_controlnet_example.png",
    ],
    requiredNodes: ["UNETLoader", "DualCLIPLoader", "ControlNetLoader", "ControlNetApplyAdvanced"],
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
        type: "controlnet",
        name: "Flux ControlNets (community)",
        url: "https://huggingface.co/XLabs-AI/flux-controlnet-collections",
        destination: "ComfyUI/models/controlnet",
      },
      {
        type: "vae",
        name: "ae.safetensors (Flux VAE)",
        url: "https://huggingface.co/black-forest-labs/FLUX.1-dev/tree/main",
        destination: "ComfyUI/models/vae",
      },
    ],
    notes: "Community-trained ControlNets for Flux. Various control types available (canny, depth, pose, etc.).",
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
    name: "Stable Video Diffusion (Image-to-Video)",
    description: "Generate videos from images using SVD. 14-frame version for shorter clips.",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/video/",
    imageUrls: [],
    jsonUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/video/workflow_image_to_video.json",
    ],
    requiredNodes: ["ImageOnlyCheckpointLoader", "SVD_img2vid_Conditioning"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "svd.safetensors (14-frame)",
        url: "https://huggingface.co/stabilityai/stable-video-diffusion-img2vid/blob/main/svd.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Generates 14 frames of video from a single image. Use svd_xt for 25 frames.",
  },
  {
    name: "Stable Video Diffusion XT (25-frame)",
    description: "Extended SVD for longer 25-frame video generation from images.",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/video/",
    imageUrls: [],
    jsonUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/video/workflow_image_to_video.json",
    ],
    requiredNodes: ["ImageOnlyCheckpointLoader", "SVD_img2vid_Conditioning"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "svd_xt.safetensors (25-frame)",
        url: "https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/blob/main/svd_xt.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Extended version generates 25 frames. Same workflow as SVD, just swap the checkpoint.",
  },
  {
    name: "Text-to-Video (SDXL + SVD)",
    description: "Full text-to-video pipeline. Generate image with SDXL, then animate with SVD.",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/video/",
    imageUrls: [],
    jsonUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/video/workflow_txt_to_img_to_video.json",
    ],
    requiredNodes: ["ImageOnlyCheckpointLoader", "SVD_img2vid_Conditioning", "CheckpointLoaderSimple"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "sd_xl_base_1.0.safetensors",
        url: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/sd_xl_base_1.0.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "svd_xt.safetensors (25-frame)",
        url: "https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/blob/main/svd_xt.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Two-stage pipeline: SDXL generates base image, SVD animates it. Full text-to-video workflow.",
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

// Model patterns for workflow recommendation
interface ModelPattern {
  pattern: RegExp;
  workflowName: string;
  modelType: "sd15" | "sdxl" | "sd3" | "flux";
  defaultSteps: number;
  defaultCfg: number;
  defaultResolution: { width: number; height: number };
  notes: string;
}

const MODEL_PATTERNS: ModelPattern[] = [
  // Flux Schnell checkpoint (all-in-one)
  {
    pattern: /flux.*schnell.*\.(safetensors|ckpt)/i,
    workflowName: "Flux Schnell Checkpoint",
    modelType: "flux",
    defaultSteps: 4,
    defaultCfg: 1,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Flux Schnell is 4-step distilled. Use simple scheduler. No negative prompt needed.",
  },
  // Flux Dev checkpoint (all-in-one)
  {
    pattern: /flux.*dev.*\.(safetensors|ckpt)/i,
    workflowName: "Flux Dev Checkpoint",
    modelType: "flux",
    defaultSteps: 20,
    defaultCfg: 1,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Flux Dev is higher quality. Use 20-50 steps. No negative prompt needed.",
  },
  // Flux Kontext
  {
    pattern: /flux.*kontext/i,
    workflowName: "Flux Kontext",
    modelType: "flux",
    defaultSteps: 20,
    defaultCfg: 1,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Kontext is for image editing. Describe the changes you want to make.",
  },
  // Flux Fill
  {
    pattern: /flux.*fill/i,
    workflowName: "Flux Fill (Inpaint/Outpaint)",
    modelType: "flux",
    defaultSteps: 20,
    defaultCfg: 1,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Fill is for inpainting and outpainting. Requires mask input.",
  },
  // SD3.5 Large Turbo
  {
    pattern: /sd3\.?5.*turbo/i,
    workflowName: "SD3.5 Large Turbo",
    modelType: "sd3",
    defaultSteps: 4,
    defaultCfg: 1,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Turbo model - use 4-8 steps with CFG 1.",
  },
  // SD3.5 (any)
  {
    pattern: /sd3\.?5/i,
    workflowName: "SD3.5 Checkpoint",
    modelType: "sd3",
    defaultSteps: 28,
    defaultCfg: 4.5,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "SD3.5 uses 28 steps and CFG 4.5 by default.",
  },
  // SD3 (original)
  {
    pattern: /sd3[^5]/i,
    workflowName: "SD3.5 Checkpoint",
    modelType: "sd3",
    defaultSteps: 28,
    defaultCfg: 4.5,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "SD3 uses similar settings to SD3.5.",
  },
  // SDXL Turbo
  {
    pattern: /sdxl.*turbo/i,
    workflowName: "SDXL Turbo",
    modelType: "sdxl",
    defaultSteps: 1,
    defaultCfg: 1,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "SDXL Turbo generates in 1-4 steps with CFG 1.",
  },
  // SDXL (any)
  {
    pattern: /sdxl|sd_xl/i,
    workflowName: "SDXL",
    modelType: "sdxl",
    defaultSteps: 25,
    defaultCfg: 7,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "SDXL works best at 1024x1024 or equivalent pixel count.",
  },
  // HiDream
  {
    pattern: /hidream.*dev/i,
    workflowName: "HiDream Dev",
    modelType: "flux",
    defaultSteps: 28,
    defaultCfg: 5,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "HiDream Dev is faster than Full.",
  },
  {
    pattern: /hidream.*full/i,
    workflowName: "HiDream Full",
    modelType: "flux",
    defaultSteps: 50,
    defaultCfg: 5,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "HiDream Full for highest quality.",
  },
  {
    pattern: /hidream.*e1/i,
    workflowName: "HiDream Edit (E1.1)",
    modelType: "flux",
    defaultSteps: 28,
    defaultCfg: 5,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "HiDream Edit for image editing.",
  },
  // Stable Cascade
  {
    pattern: /stable.*cascade/i,
    workflowName: "Stable Cascade",
    modelType: "sdxl",
    defaultSteps: 20,
    defaultCfg: 4,
    defaultResolution: { width: 1024, height: 1024 },
    notes: "Stable Cascade uses two-stage generation.",
  },
  // Default SD1.5
  {
    pattern: /\.(safetensors|ckpt)$/i,
    workflowName: "Basic txt2img",
    modelType: "sd15",
    defaultSteps: 20,
    defaultCfg: 7,
    defaultResolution: { width: 512, height: 512 },
    notes: "SD1.5 models work best at 512x512.",
  },
];

export const recommendWorkflowSchema = z.object({
  modelName: z
    .string()
    .describe("The model filename to match (e.g., 'flux1-schnell-fp8.safetensors')"),
  availableCheckpoints: z
    .array(z.string())
    .optional()
    .describe("List of available checkpoint files (from list_models)"),
  availableUnets: z
    .array(z.string())
    .optional()
    .describe("List of available UNET files (from list_models)"),
  taskType: z
    .enum(["txt2img", "img2img", "inpaint", "edit", "video"])
    .optional()
    .default("txt2img")
    .describe("What type of generation task"),
});

export type RecommendWorkflowInput = z.infer<typeof recommendWorkflowSchema>;

export interface WorkflowRecommendation {
  modelName: string;
  matchedWorkflow: string;
  modelType: "sd15" | "sdxl" | "sd3" | "flux";
  isCheckpoint: boolean;
  recommendedSettings: {
    steps: number;
    cfg: number;
    width: number;
    height: number;
    sampler?: string;
    scheduler?: string;
  };
  promptingGuide: string;
  notes: string;
  alternativeWorkflows?: string[];
}

/**
 * Recommend the best workflow based on available models
 */
export function recommendWorkflow(input: RecommendWorkflowInput): WorkflowRecommendation {
  const modelName = input.modelName.toLowerCase();

  // Check if this is a checkpoint or UNET
  const isCheckpoint = input.availableCheckpoints?.some(
    (c) => c.toLowerCase().includes(modelName.replace(/\.(safetensors|ckpt)$/i, ""))
  ) ?? (modelName.includes("checkpoint") || !modelName.includes("unet"));

  // Find matching pattern
  let match: ModelPattern | undefined;
  for (const pattern of MODEL_PATTERNS) {
    if (pattern.pattern.test(input.modelName)) {
      match = pattern;
      break;
    }
  }

  // Default to SD1.5 if no match
  if (!match) {
    match = MODEL_PATTERNS[MODEL_PATTERNS.length - 1];
  }

  // Adjust workflow name based on checkpoint vs UNET
  let workflowName = match.workflowName;
  if (match.modelType === "flux" && !isCheckpoint) {
    // If it's a UNET file, recommend the UNET workflow instead of checkpoint
    if (workflowName.includes("Checkpoint")) {
      workflowName = workflowName.replace(" Checkpoint", "");
    }
  }

  // Build recommendation
  const recommendation: WorkflowRecommendation = {
    modelName: input.modelName,
    matchedWorkflow: workflowName,
    modelType: match.modelType,
    isCheckpoint,
    recommendedSettings: {
      steps: match.defaultSteps,
      cfg: match.defaultCfg,
      width: match.defaultResolution.width,
      height: match.defaultResolution.height,
    },
    promptingGuide: `Call get_prompting_guide('${match.modelType}') for detailed prompting advice.`,
    notes: match.notes,
  };

  // Add sampler/scheduler recommendations
  if (match.modelType === "flux") {
    recommendation.recommendedSettings.sampler = "euler";
    recommendation.recommendedSettings.scheduler = "simple";
  } else if (match.workflowName.includes("Turbo")) {
    recommendation.recommendedSettings.sampler = "euler";
    recommendation.recommendedSettings.scheduler = "sgm_uniform";
  }

  // Add alternative workflows based on task type
  if (input.taskType === "inpaint") {
    if (match.modelType === "flux") {
      recommendation.alternativeWorkflows = ["Flux Fill (Inpaint/Outpaint)"];
    } else {
      recommendation.alternativeWorkflows = ["Inpainting (Basic)", "Inpainting (Dedicated Model)"];
    }
  } else if (input.taskType === "edit") {
    if (match.modelType === "flux") {
      recommendation.alternativeWorkflows = ["Flux Kontext"];
    } else {
      recommendation.alternativeWorkflows = ["SDXL Edit (CosXL Edit)"];
    }
  }

  return recommendation;
}

/**
 * Format workflow recommendation as readable text
 */
export function formatWorkflowRecommendation(rec: WorkflowRecommendation): string {
  let output = `# Workflow Recommendation for ${rec.modelName}\n\n`;

  output += `## Recommended Workflow\n`;
  output += `**${rec.matchedWorkflow}**\n\n`;

  output += `## Model Info\n`;
  output += `- Model Type: ${rec.modelType.toUpperCase()}\n`;
  output += `- Loader: ${rec.isCheckpoint ? "CheckpointLoaderSimple" : "UNETLoader + DualCLIPLoader"}\n\n`;

  output += `## Recommended Settings\n`;
  output += `- Steps: ${rec.recommendedSettings.steps}\n`;
  output += `- CFG: ${rec.recommendedSettings.cfg}\n`;
  output += `- Resolution: ${rec.recommendedSettings.width}x${rec.recommendedSettings.height}\n`;
  if (rec.recommendedSettings.sampler) {
    output += `- Sampler: ${rec.recommendedSettings.sampler}\n`;
  }
  if (rec.recommendedSettings.scheduler) {
    output += `- Scheduler: ${rec.recommendedSettings.scheduler}\n`;
  }

  output += `\n## Prompting\n`;
  output += `${rec.promptingGuide}\n\n`;

  output += `## Notes\n`;
  output += `${rec.notes}\n`;

  if (rec.alternativeWorkflows && rec.alternativeWorkflows.length > 0) {
    output += `\n## Alternative Workflows\n`;
    for (const alt of rec.alternativeWorkflows) {
      output += `- ${alt}\n`;
    }
  }

  output += `\n## Next Steps\n`;
  output += `1. Call \`get_example_workflow("${rec.matchedWorkflow}")\` to get the workflow JSON\n`;
  output += `2. Call \`get_prompting_guide("${rec.modelType}")\` for prompting best practices\n`;
  output += `3. Use \`run_workflow\` with the workflow\n`;

  return output;
}

// === Template Search System ===

import {
  BUILTIN_TEMPLATES,
  buildFromTemplate,
  getTemplateById,
  WorkflowTemplate,
  Workflow,
} from "../workflows/builder.js";
import { ComfyUIClient, ObjectInfo } from "../client/comfyui.js";
import {
  saveTemplate as dbSaveTemplate,
  listTemplates as dbListTemplates,
  searchTemplatesInDb,
  deleteTemplate as dbDeleteTemplate,
  getTemplateById as dbGetTemplateById,
  CustomTemplate,
  incrementTemplateUseCount,
} from "../db/index.js";

export const searchTemplatesSchema = z.object({
  modelType: z
    .enum(["sd15", "sdxl", "sd3", "flux", "any"])
    .optional()
    .describe("Filter by model architecture"),
  taskType: z
    .enum(["txt2img", "img2img", "inpaint", "outpaint", "upscale", "controlnet", "video", "audio", "any"])
    .optional()
    .describe("Filter by task type"),
  category: z
    .string()
    .optional()
    .describe("Filter by category (e.g., 'basics', 'flux', 'controlnet', 'lora', 'custom')"),
  query: z
    .string()
    .optional()
    .describe("Free text search across workflow names and descriptions"),
  includeBuiltIn: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include built-in workflow templates"),
  includeExamples: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include example workflows from ComfyUI docs"),
  includeCustom: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include custom saved templates from the database"),
  limit: z
    .number()
    .optional()
    .default(20)
    .describe("Maximum number of results to return"),
});

export type SearchTemplatesInput = z.infer<typeof searchTemplatesSchema>;

interface TemplateMatch {
  source: "builtin" | "example" | "custom";
  id: string;
  name: string;
  description: string;
  modelType?: string;
  taskType?: string;
  category: string;
  parameters?: WorkflowTemplate["parameters"] | Array<{ name: string; type: string; required: boolean; default?: unknown; description: string }>;
  defaultSettings?: WorkflowTemplate["defaultSettings"] | Record<string, unknown>;
  requiredNodes?: string[];
  requiredModels?: ModelDownload[];
  fetchCommand?: string;
  useCount?: number;
  tags?: string[];
}

interface TemplateSearchResult {
  query: SearchTemplatesInput;
  totalResults: number;
  results: TemplateMatch[];
}

function matchesTemplateFilters(template: WorkflowTemplate, input: SearchTemplatesInput): boolean {
  if (input.modelType && input.modelType !== "any" && template.modelType !== input.modelType && template.modelType !== "any") {
    return false;
  }
  if (input.taskType && input.taskType !== "any" && template.taskType !== input.taskType) {
    return false;
  }
  if (input.category && !template.category.toLowerCase().includes(input.category.toLowerCase())) {
    return false;
  }
  if (input.query) {
    const queryLower = input.query.toLowerCase();
    const matches =
      template.name.toLowerCase().includes(queryLower) ||
      template.description.toLowerCase().includes(queryLower) ||
      template.id.toLowerCase().includes(queryLower);
    if (!matches) return false;
  }
  return true;
}

function matchesExampleFilters(example: ExampleWorkflow, input: SearchTemplatesInput): boolean {
  if (input.category && !example.category.toLowerCase().includes(input.category.toLowerCase())) {
    return false;
  }
  if (input.query) {
    const queryLower = input.query.toLowerCase();
    const matches =
      example.name.toLowerCase().includes(queryLower) ||
      example.description.toLowerCase().includes(queryLower) ||
      example.category.toLowerCase().includes(queryLower);
    if (!matches) return false;
  }
  // Model type filtering for examples - infer from category/name
  if (input.modelType && input.modelType !== "any") {
    const nameLower = example.name.toLowerCase();
    const categoryLower = example.category.toLowerCase();
    if (input.modelType === "flux" && !nameLower.includes("flux") && !categoryLower.includes("flux")) {
      return false;
    }
    if (input.modelType === "sdxl" && !nameLower.includes("sdxl") && !categoryLower.includes("sdxl")) {
      return false;
    }
    if (input.modelType === "sd3" && !nameLower.includes("sd3") && !categoryLower.includes("sd3")) {
      return false;
    }
  }
  // Task type filtering for examples - infer from category/name
  if (input.taskType && input.taskType !== "any") {
    const nameLower = example.name.toLowerCase();
    const categoryLower = example.category.toLowerCase();
    if (input.taskType === "inpaint" && !nameLower.includes("inpaint") && !categoryLower.includes("inpaint")) {
      return false;
    }
    if (input.taskType === "img2img" && !nameLower.includes("img2img") && !nameLower.includes("image-to-image")) {
      return false;
    }
    if (input.taskType === "controlnet" && !nameLower.includes("controlnet") && !categoryLower.includes("controlnet")) {
      return false;
    }
    if (input.taskType === "upscale" && !nameLower.includes("upscale") && !categoryLower.includes("upscale")) {
      return false;
    }
    if (input.taskType === "video" && !nameLower.includes("video") && !categoryLower.includes("video")) {
      return false;
    }
  }
  return true;
}

function matchesCustomTemplateFilters(template: CustomTemplate, input: SearchTemplatesInput): boolean {
  if (input.modelType && input.modelType !== "any" && template.modelType !== input.modelType && template.modelType !== "any") {
    return false;
  }
  if (input.taskType && input.taskType !== "any" && template.taskType !== input.taskType) {
    return false;
  }
  if (input.category && !template.category.toLowerCase().includes(input.category.toLowerCase())) {
    return false;
  }
  if (input.query) {
    const queryLower = input.query.toLowerCase();
    const matches =
      template.name.toLowerCase().includes(queryLower) ||
      template.description.toLowerCase().includes(queryLower) ||
      template.id.toLowerCase().includes(queryLower) ||
      template.tags.some((t) => t.toLowerCase().includes(queryLower));
    if (!matches) return false;
  }
  return true;
}

export function searchTemplates(input: SearchTemplatesInput): string {
  const results: TemplateMatch[] = [];

  // Search custom templates first (user's saved templates take priority)
  if (input.includeCustom !== false) {
    try {
      const customTemplates = input.query
        ? searchTemplatesInDb(input.query, 100)
        : dbListTemplates({
            modelType: input.modelType,
            taskType: input.taskType,
            category: input.category,
            limit: 100,
          });

      for (const template of customTemplates) {
        if (matchesCustomTemplateFilters(template, input)) {
          results.push({
            source: "custom",
            id: template.id,
            name: template.name,
            description: template.description,
            modelType: template.modelType,
            taskType: template.taskType,
            category: template.category,
            parameters: template.parameters,
            defaultSettings: template.defaultSettings,
            requiredNodes: template.requiredNodes,
            useCount: template.useCount,
            tags: template.tags,
          });
        }
      }
    } catch {
      // Database not available, continue without custom templates
    }
  }

  // Search built-in templates
  if (input.includeBuiltIn !== false) {
    for (const template of BUILTIN_TEMPLATES) {
      if (matchesTemplateFilters(template, input)) {
        results.push({
          source: "builtin",
          id: template.id,
          name: template.name,
          description: template.description,
          modelType: template.modelType,
          taskType: template.taskType,
          category: template.category,
          parameters: template.parameters,
          defaultSettings: template.defaultSettings,
          requiredNodes: template.requiredNodes,
        });
      }
    }
  }

  // Search example workflows
  if (input.includeExamples !== false) {
    for (const example of EXAMPLE_WORKFLOWS) {
      if (matchesExampleFilters(example, input)) {
        results.push({
          source: "example",
          id: example.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
          name: example.name,
          description: example.description,
          category: example.category,
          requiredNodes: example.requiredNodes,
          requiredModels: example.requiredModels,
          fetchCommand: `get_example_workflow({ name: "${example.name}" })`,
        });
      }
    }
  }

  const limit = input.limit ?? 20;
  const searchResult: TemplateSearchResult = {
    query: input,
    totalResults: results.length,
    results: results.slice(0, limit),
  };

  return JSON.stringify(searchResult, null, 2);
}

// === Get Template Tool ===

export const getTemplateSchema = z.object({
  templateId: z
    .string()
    .describe("The template ID (from search_templates results)"),
  parameters: z
    .record(z.unknown())
    .optional()
    .describe("Parameters for the template (e.g., { prompt: 'a cat', width: 1024 })"),
});

export type GetTemplateInput = z.infer<typeof getTemplateSchema>;

export async function getTemplate(
  client: ComfyUIClient,
  input: GetTemplateInput
): Promise<string> {
  // First check built-in templates
  const builtInTemplate = getTemplateById(input.templateId);

  if (builtInTemplate) {
    // Build the workflow from the template
    const objectInfo = await client.getObjectInfo();
    const workflow = buildFromTemplate(input.templateId, input.parameters || {}, objectInfo);

    if (!workflow) {
      return JSON.stringify({
        error: `Failed to build workflow from template '${input.templateId}'`,
      });
    }

    return JSON.stringify({
      templateId: input.templateId,
      templateName: builtInTemplate.name,
      source: "builtin",
      appliedParameters: input.parameters || {},
      defaultSettings: builtInTemplate.defaultSettings,
      workflow,
      usage: "Pass the 'workflow' object to run_workflow() to execute it",
    }, null, 2);
  }

  // Check custom templates in database
  try {
    const customTemplate = dbGetTemplateById(input.templateId);
    if (customTemplate) {
      // Increment use count
      incrementTemplateUseCount(input.templateId);

      // Apply parameters to the workflow
      let workflow = customTemplate.workflow;

      // If parameters provided, try to apply them to CLIPTextEncode nodes
      if (input.parameters) {
        workflow = applyParametersToWorkflow(workflow, input.parameters);
      }

      return JSON.stringify({
        templateId: input.templateId,
        templateName: customTemplate.name,
        source: "custom",
        appliedParameters: input.parameters || {},
        defaultSettings: customTemplate.defaultSettings,
        workflow,
        useCount: customTemplate.useCount + 1,
        usage: "Pass the 'workflow' object to run_workflow() to execute it",
      }, null, 2);
    }
  } catch {
    // Database not available
  }

  // Check if it's an example workflow name instead
  const example = EXAMPLE_WORKFLOWS.find(
    (e) => e.name.toLowerCase().replace(/[^a-z0-9]+/g, "_") === input.templateId
  );
  if (example) {
    return JSON.stringify({
      error: `'${input.templateId}' is an example workflow, not a template`,
      suggestion: `Use get_example_workflow({ name: "${example.name}" }) to fetch the example workflow`,
    });
  }

  return JSON.stringify({
    error: `Template '${input.templateId}' not found`,
    availableBuiltIn: BUILTIN_TEMPLATES.map((t) => t.id),
    hint: "Use search_templates to find available templates",
  });
}

/**
 * Apply parameters to a workflow by replacing values in CLIPTextEncode nodes
 */
function applyParametersToWorkflow(
  workflow: Record<string, unknown>,
  params: Record<string, unknown>
): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(workflow)); // Deep clone

  for (const [nodeId, node] of Object.entries(result)) {
    const nodeObj = node as Record<string, unknown>;
    if (nodeObj.class_type === "CLIPTextEncode" && nodeObj.inputs) {
      const inputs = nodeObj.inputs as Record<string, unknown>;
      // Apply prompt parameter to first CLIPTextEncode (positive)
      if (params.prompt !== undefined && inputs.text !== undefined) {
        inputs.text = params.prompt;
        delete params.prompt; // Only apply once
      }
    }
    // Apply other parameters (width, height, steps, etc.)
    if (nodeObj.inputs) {
      const inputs = nodeObj.inputs as Record<string, unknown>;
      for (const [key, value] of Object.entries(params)) {
        if (key in inputs) {
          inputs[key] = value;
        }
      }
    }
  }

  return result;
}

// === Save Template Tool ===

export const saveTemplateSchema = z.object({
  id: z
    .string()
    .describe("Unique template ID (e.g., 'my_flux_style', 'upscale_4x')"),
  name: z
    .string()
    .describe("Human-readable template name"),
  description: z
    .string()
    .describe("Description of what this template does"),
  workflow: z
    .record(z.unknown())
    .describe("The ComfyUI workflow JSON (API format)"),
  modelType: z
    .enum(["sd15", "sdxl", "sd3", "flux", "any"])
    .optional()
    .default("any")
    .describe("Model architecture this template is designed for"),
  taskType: z
    .enum(["txt2img", "img2img", "inpaint", "controlnet", "upscale", "video", "audio"])
    .optional()
    .default("txt2img")
    .describe("Type of task this template performs"),
  category: z
    .string()
    .optional()
    .default("custom")
    .describe("Category for organizing templates"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Tags for searching and filtering"),
  defaultSettings: z
    .record(z.unknown())
    .optional()
    .describe("Default settings (steps, cfg, width, height, etc.)"),
});

export type SaveTemplateInput = z.infer<typeof saveTemplateSchema>;

export function saveCustomTemplate(input: SaveTemplateInput): string {
  try {
    const saved = dbSaveTemplate({
      id: input.id,
      name: input.name,
      description: input.description,
      workflow: input.workflow as Record<string, unknown>,
      modelType: input.modelType,
      taskType: input.taskType,
      category: input.category,
      tags: input.tags,
      defaultSettings: input.defaultSettings as Record<string, unknown>,
    });

    return JSON.stringify({
      success: true,
      template: {
        id: saved.id,
        name: saved.name,
        description: saved.description,
        modelType: saved.modelType,
        taskType: saved.taskType,
        category: saved.category,
        tags: saved.tags,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      },
      usage: `Use get_template({ templateId: "${saved.id}" }) to retrieve this workflow`,
    }, null, 2);
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Failed to save template",
    });
  }
}

// === Delete Template Tool ===

export const deleteTemplateSchema = z.object({
  id: z
    .string()
    .describe("The template ID to delete"),
});

export type DeleteTemplateInput = z.infer<typeof deleteTemplateSchema>;

export function deleteCustomTemplate(input: DeleteTemplateInput): string {
  // Don't allow deleting built-in templates
  if (BUILTIN_TEMPLATES.some((t) => t.id === input.id)) {
    return JSON.stringify({
      success: false,
      error: "Cannot delete built-in templates",
    });
  }

  try {
    const deleted = dbDeleteTemplate(input.id);
    return JSON.stringify({
      success: deleted,
      message: deleted ? `Template '${input.id}' deleted` : `Template '${input.id}' not found`,
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete template",
    });
  }
}

// === Model Download URL Lookup ===

// Common model download URLs for easy reference
const MODEL_DOWNLOADS: Record<string, ModelDownload> = {
  // SDXL
  "sd_xl_base_1.0": {
    type: "checkpoint",
    name: "sd_xl_base_1.0.safetensors",
    url: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors",
    destination: "ComfyUI/models/checkpoints",
  },
  "sd_xl_refiner_1.0": {
    type: "checkpoint",
    name: "sd_xl_refiner_1.0.safetensors",
    url: "https://huggingface.co/stabilityai/stable-diffusion-xl-refiner-1.0/resolve/main/sd_xl_refiner_1.0.safetensors",
    destination: "ComfyUI/models/checkpoints",
  },
  // Flux
  "flux1-schnell": {
    type: "unet",
    name: "flux1-schnell.safetensors",
    url: "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/flux1-schnell.safetensors",
    destination: "ComfyUI/models/unet",
  },
  "flux1-dev": {
    type: "unet",
    name: "flux1-dev.safetensors",
    url: "https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/flux1-dev.safetensors",
    destination: "ComfyUI/models/unet",
  },
  "flux1-schnell-fp8": {
    type: "unet",
    name: "flux1-schnell-fp8.safetensors",
    url: "https://huggingface.co/Comfy-Org/flux1-schnell/resolve/main/flux1-schnell-fp8.safetensors",
    destination: "ComfyUI/models/unet",
  },
  "flux1-dev-fp8": {
    type: "unet",
    name: "flux1-dev-fp8.safetensors",
    url: "https://huggingface.co/Comfy-Org/flux1-dev/resolve/main/flux1-dev-fp8.safetensors",
    destination: "ComfyUI/models/unet",
  },
  // Flux CLIP/VAE
  "t5xxl_fp8": {
    type: "text_encoder",
    name: "t5xxl_fp8_e4m3fn.safetensors",
    url: "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors",
    destination: "ComfyUI/models/clip",
  },
  "t5xxl_fp16": {
    type: "text_encoder",
    name: "t5xxl_fp16.safetensors",
    url: "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors",
    destination: "ComfyUI/models/clip",
  },
  "clip_l": {
    type: "clip",
    name: "clip_l.safetensors",
    url: "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors",
    destination: "ComfyUI/models/clip",
  },
  "ae": {
    type: "vae",
    name: "ae.safetensors",
    url: "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/ae.safetensors",
    destination: "ComfyUI/models/vae",
  },
  // SD3.5
  "sd3.5_large": {
    type: "checkpoint",
    name: "sd3.5_large.safetensors",
    url: "https://huggingface.co/stabilityai/stable-diffusion-3.5-large/resolve/main/sd3.5_large.safetensors",
    destination: "ComfyUI/models/checkpoints",
  },
  "sd3.5_large_turbo": {
    type: "checkpoint",
    name: "sd3.5_large_turbo.safetensors",
    url: "https://huggingface.co/stabilityai/stable-diffusion-3.5-large-turbo/resolve/main/sd3.5_large_turbo.safetensors",
    destination: "ComfyUI/models/checkpoints",
  },
  // Upscalers
  "4x-UltraSharp": {
    type: "upscale",
    name: "4x-UltraSharp.pth",
    url: "https://huggingface.co/lokCX/4x-Ultrasharp/resolve/main/4x-UltraSharp.pth",
    destination: "ComfyUI/models/upscale_models",
  },
  "RealESRGAN_x4plus": {
    type: "upscale",
    name: "RealESRGAN_x4plus.pth",
    url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
    destination: "ComfyUI/models/upscale_models",
  },
  // Inpainting
  "512-inpainting-ema": {
    type: "checkpoint",
    name: "512-inpainting-ema.safetensors",
    url: "https://huggingface.co/stabilityai/stable-diffusion-2-inpainting/resolve/main/512-inpainting-ema.safetensors",
    destination: "ComfyUI/models/checkpoints",
  },
};

export const getDownloadUrlSchema = z.object({
  modelName: z
    .string()
    .describe("The model name or partial name to search for (e.g., 'flux1-schnell', 'sdxl', 't5xxl')"),
});

export type GetDownloadUrlInput = z.infer<typeof getDownloadUrlSchema>;

export function getDownloadUrl(input: GetDownloadUrlInput): string {
  const searchTerm = input.modelName.toLowerCase().replace(/[^a-z0-9]/g, "");

  // First try exact match
  const exactMatch = MODEL_DOWNLOADS[input.modelName];
  if (exactMatch) {
    return JSON.stringify({
      found: true,
      model: exactMatch,
      downloadCommand: `wget -P "${exactMatch.destination}" "${exactMatch.url}"`,
    }, null, 2);
  }

  // Try fuzzy match
  const matches: Array<{ key: string; model: ModelDownload; score: number }> = [];

  for (const [key, model] of Object.entries(MODEL_DOWNLOADS)) {
    const keyNorm = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const nameNorm = model.name.toLowerCase().replace(/[^a-z0-9]/g, "");

    if (keyNorm.includes(searchTerm) || nameNorm.includes(searchTerm) || searchTerm.includes(keyNorm)) {
      const score = keyNorm === searchTerm ? 100 : keyNorm.includes(searchTerm) ? 50 : 25;
      matches.push({ key, model, score });
    }
  }

  // Also search in example workflows' required models
  for (const example of EXAMPLE_WORKFLOWS) {
    if (example.requiredModels) {
      for (const model of example.requiredModels) {
        const nameNorm = model.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (nameNorm.includes(searchTerm) || searchTerm.includes(nameNorm)) {
          // Check if we already have this
          const exists = matches.some((m) => m.model.url === model.url);
          if (!exists) {
            matches.push({ key: model.name, model, score: 20 });
          }
        }
      }
    }
  }

  if (matches.length === 0) {
    return JSON.stringify({
      found: false,
      query: input.modelName,
      suggestion: "No matching model found. Try searching for: " + Object.keys(MODEL_DOWNLOADS).slice(0, 10).join(", "),
      availableModels: Object.keys(MODEL_DOWNLOADS),
    }, null, 2);
  }

  // Sort by score and return best matches
  matches.sort((a, b) => b.score - a.score);

  if (matches.length === 1) {
    const match = matches[0];
    return JSON.stringify({
      found: true,
      model: match.model,
      downloadCommand: `wget -P "${match.model.destination}" "${match.model.url}"`,
    }, null, 2);
  }

  return JSON.stringify({
    found: true,
    query: input.modelName,
    matchCount: matches.length,
    bestMatch: matches[0].model,
    downloadCommand: `wget -P "${matches[0].model.destination}" "${matches[0].model.url}"`,
    otherMatches: matches.slice(1, 5).map((m) => m.model),
  }, null, 2);
}
