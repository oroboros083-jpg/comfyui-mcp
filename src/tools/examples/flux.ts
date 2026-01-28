import { ExampleWorkflow } from "./types.js";

export const FLUX_EXAMPLES: ExampleWorkflow[] = [
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
  }
];
