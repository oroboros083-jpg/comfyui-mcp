import { ExampleWorkflow } from "./types.js";

export const BASICS_EXAMPLES: ExampleWorkflow[] = [
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
