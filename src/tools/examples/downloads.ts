// === Model Download URL Lookup ===

import { z } from "zod";
import { ModelDownload } from "./types.js";
import { EXAMPLE_WORKFLOWS } from "./data.js";
import { ToolError } from "../../utils/errors.js";

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
}).strict();

export type GetDownloadUrlInput = z.infer<typeof getDownloadUrlSchema>;

/** Raised when no catalogued model answers to the name. */
export class ModelDownloadNotFoundError extends ToolError {
  constructor(query: string) {
    super(
      `No download is catalogued for '${query}'`,
      `Known names include: ${Object.keys(MODEL_DOWNLOADS).slice(0, 10).join(", ")}. ` +
        "comfyui_get_model_guide covers what each architecture needs, and comfyui_list_examples names the models its workflows use."
    );
  }
}

/** A resolved download, with the command that fetches it. */
export interface GetDownloadUrlResult {
  model: ModelDownload;
  downloadCommand: string;
  /** Present only when the name was ambiguous. */
  query?: string;
  matchCount?: number;
  otherMatches?: ModelDownload[];
}

export function getDownloadUrl(input: GetDownloadUrlInput): GetDownloadUrlResult {
  const searchTerm = input.modelName.toLowerCase().replace(/[^a-z0-9]/g, "");

  // First try exact match
  const exactMatch = MODEL_DOWNLOADS[input.modelName];
  if (exactMatch) {
    return {
      model: exactMatch,
      downloadCommand: `wget -P "${exactMatch.destination}" "${exactMatch.url}"`,
    };
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

  // Nothing found is a failure, not a success carrying found:false - and the
  // full availableModels list was a second copy of the catalogue in every
  // miss. The hint names a handful and the tools that list the rest.
  if (matches.length === 0) {
    throw new ModelDownloadNotFoundError(input.modelName);
  }

  // Sort by score and return best matches
  matches.sort((a, b) => b.score - a.score);

  if (matches.length === 1) {
    const match = matches[0];
    return {
      model: match.model,
      downloadCommand: `wget -P "${match.model.destination}" "${match.model.url}"`,
    };
  }

  return {
    query: input.modelName,
    matchCount: matches.length,
    model: matches[0].model,
    downloadCommand: `wget -P "${matches[0].model.destination}" "${matches[0].model.url}"`,
    otherMatches: matches.slice(1, 5).map((m) => m.model),
  };
}
