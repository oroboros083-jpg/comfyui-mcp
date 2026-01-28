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
