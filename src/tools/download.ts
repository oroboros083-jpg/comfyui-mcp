import { z } from "zod";
import { createWriteStream, existsSync, mkdirSync } from "fs";
import { join, dirname, basename } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

// Known model sources with direct download URLs
export interface ModelDownload {
  name: string;
  type: "checkpoint" | "unet" | "clip" | "vae" | "lora" | "controlnet" | "upscale";
  url: string;
  filename: string;
  size?: string;
  description: string;
  license?: string;
}

// Popular models with known URLs (HuggingFace allows direct downloads)
export const KNOWN_MODELS: ModelDownload[] = [
  // Flux models
  {
    name: "Flux.1 Schnell (UNET)",
    type: "unet",
    url: "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/flux1-schnell.safetensors",
    filename: "flux1-schnell.safetensors",
    size: "23GB",
    description: "Fast Flux model, 4 steps generation",
    license: "Apache 2.0",
  },
  {
    name: "Flux.1 Dev (UNET)",
    type: "unet",
    url: "https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/flux1-dev.safetensors",
    filename: "flux1-dev.safetensors",
    size: "23GB",
    description: "High quality Flux model",
    license: "Non-commercial",
  },
  {
    name: "Flux T5-XXL Text Encoder",
    type: "clip",
    url: "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors",
    filename: "t5xxl_fp16.safetensors",
    size: "9.5GB",
    description: "T5 text encoder for Flux",
  },
  {
    name: "Flux CLIP-L Text Encoder",
    type: "clip",
    url: "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors",
    filename: "clip_l.safetensors",
    size: "235MB",
    description: "CLIP-L text encoder for Flux",
  },
  {
    name: "Flux VAE",
    type: "vae",
    url: "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/ae.safetensors",
    filename: "ae.safetensors",
    size: "335MB",
    description: "Autoencoder/VAE for Flux",
  },
  // SDXL models
  {
    name: "SDXL Base 1.0",
    type: "checkpoint",
    url: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors",
    filename: "sd_xl_base_1.0.safetensors",
    size: "6.9GB",
    description: "Official SDXL base model",
  },
  {
    name: "SDXL Refiner 1.0",
    type: "checkpoint",
    url: "https://huggingface.co/stabilityai/stable-diffusion-xl-refiner-1.0/resolve/main/sd_xl_refiner_1.0.safetensors",
    filename: "sd_xl_refiner_1.0.safetensors",
    size: "6.2GB",
    description: "Official SDXL refiner model",
  },
  {
    name: "SDXL VAE",
    type: "vae",
    url: "https://huggingface.co/stabilityai/sdxl-vae/resolve/main/sdxl_vae.safetensors",
    filename: "sdxl_vae.safetensors",
    size: "335MB",
    description: "SDXL VAE (fixes image artifacts)",
  },
  // SD 1.5 models
  {
    name: "SD 1.5 Pruned",
    type: "checkpoint",
    url: "https://huggingface.co/runwayml/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors",
    filename: "v1-5-pruned-emaonly.safetensors",
    size: "4.3GB",
    description: "Official SD 1.5 model (pruned)",
  },
  // Upscalers
  {
    name: "RealESRGAN x4",
    type: "upscale",
    url: "https://huggingface.co/sberbank-ai/Real-ESRGAN/resolve/main/RealESRGAN_x4.pth",
    filename: "RealESRGAN_x4.pth",
    size: "67MB",
    description: "4x upscaler, good for photos",
  },
  {
    name: "4x-UltraSharp",
    type: "upscale",
    url: "https://huggingface.co/Kim2091/UltraSharp/resolve/main/4x-UltraSharp.pth",
    filename: "4x-UltraSharp.pth",
    size: "67MB",
    description: "4x upscaler, sharp results",
  },
];

export const listDownloadsSchema = z.object({
  type: z
    .enum(["all", "checkpoint", "unet", "clip", "vae", "lora", "controlnet", "upscale"])
    .optional()
    .default("all")
    .describe("Filter by model type"),
});

export type ListDownloadsInput = z.infer<typeof listDownloadsSchema>;

export function listDownloads(input: ListDownloadsInput): string {
  let models = KNOWN_MODELS;

  if (input.type !== "all") {
    models = models.filter((m) => m.type === input.type);
  }

  // Group by type
  const grouped: Record<string, ModelDownload[]> = {};
  for (const model of models) {
    if (!grouped[model.type]) {
      grouped[model.type] = [];
    }
    grouped[model.type].push(model);
  }

  let result = "# Available Model Downloads\n\n";
  result += "These models can be downloaded directly using the `download_model` tool.\n\n";

  for (const [type, typeModels] of Object.entries(grouped)) {
    result += `## ${type.charAt(0).toUpperCase() + type.slice(1)}\n\n`;
    for (const model of typeModels) {
      result += `### ${model.name}\n`;
      result += `- File: ${model.filename}\n`;
      result += `- Size: ${model.size || "Unknown"}\n`;
      result += `- Description: ${model.description}\n`;
      if (model.license) {
        result += `- License: ${model.license}\n`;
      }
      result += "\n";
    }
  }

  return result;
}

export const downloadModelSchema = z.object({
  name: z
    .string()
    .describe(
      "Name of the model to download (use list_downloads to see available options)"
    ),
  comfyuiPath: z
    .string()
    .optional()
    .describe("Path to ComfyUI installation (auto-detected if not provided)"),
});

export type DownloadModelInput = z.infer<typeof downloadModelSchema>;

function getModelDir(type: string): string {
  switch (type) {
    case "checkpoint":
      return "models/checkpoints";
    case "unet":
      return "models/unet";
    case "clip":
      return "models/clip";
    case "vae":
      return "models/vae";
    case "lora":
      return "models/loras";
    case "controlnet":
      return "models/controlnet";
    case "upscale":
      return "models/upscale_models";
    default:
      return "models";
  }
}

export interface DownloadProgress {
  filename: string;
  bytesDownloaded: number;
  totalBytes?: number;
  percent?: number;
}

export async function downloadModel(
  input: DownloadModelInput,
  comfyuiPath: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ success: boolean; path?: string; error?: string }> {
  // Find the model
  const searchName = input.name.toLowerCase();
  const model = KNOWN_MODELS.find(
    (m) =>
      m.name.toLowerCase().includes(searchName) ||
      m.filename.toLowerCase().includes(searchName)
  );

  if (!model) {
    return {
      success: false,
      error: `Model "${input.name}" not found. Use list_downloads to see available models.`,
    };
  }

  // Determine destination path
  const destDir = join(comfyuiPath, getModelDir(model.type));
  const destPath = join(destDir, model.filename);

  // Check if already exists
  if (existsSync(destPath)) {
    return {
      success: true,
      path: destPath,
      error: "Model already exists",
    };
  }

  // Create directory if needed
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  try {
    // Download with progress
    const response = await fetch(model.url, {
      headers: {
        "User-Agent": "comfyui-mcp/1.0",
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Download failed: ${response.statusText}`,
      };
    }

    const totalBytes = parseInt(response.headers.get("content-length") || "0");
    let bytesDownloaded = 0;

    const reader = response.body?.getReader();
    if (!reader) {
      return { success: false, error: "No response body" };
    }

    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      bytesDownloaded += value.length;

      if (onProgress) {
        onProgress({
          filename: model.filename,
          bytesDownloaded,
          totalBytes,
          percent: totalBytes > 0 ? (bytesDownloaded / totalBytes) * 100 : undefined,
        });
      }
    }

    // Write to file
    const buffer = Buffer.concat(chunks);
    const writeStream = createWriteStream(destPath);
    await pipeline(Readable.from(buffer), writeStream);

    return { success: true, path: destPath };
  } catch (error) {
    return {
      success: false,
      error: `Download error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export const downloadHuggingFaceSchema = z.object({
  repo: z.string().describe("HuggingFace repository (e.g., 'stabilityai/stable-diffusion-xl-base-1.0')"),
  filename: z.string().describe("File to download from the repository"),
  destType: z
    .enum(["checkpoint", "unet", "clip", "vae", "lora", "controlnet", "upscale"])
    .describe("Type of model (determines destination folder)"),
  comfyuiPath: z.string().optional().describe("Path to ComfyUI installation"),
});

export type DownloadHuggingFaceInput = z.infer<typeof downloadHuggingFaceSchema>;

export async function downloadHuggingFace(
  input: DownloadHuggingFaceInput,
  comfyuiPath: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ success: boolean; path?: string; error?: string }> {
  const url = `https://huggingface.co/${input.repo}/resolve/main/${input.filename}`;

  const destDir = join(comfyuiPath, getModelDir(input.destType));
  const destPath = join(destDir, basename(input.filename));

  if (existsSync(destPath)) {
    return { success: true, path: destPath, error: "Model already exists" };
  }

  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "comfyui-mcp/1.0" },
    });

    if (!response.ok) {
      return { success: false, error: `Download failed: ${response.statusText}` };
    }

    const totalBytes = parseInt(response.headers.get("content-length") || "0");
    let bytesDownloaded = 0;

    const reader = response.body?.getReader();
    if (!reader) {
      return { success: false, error: "No response body" };
    }

    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      bytesDownloaded += value.length;

      if (onProgress) {
        onProgress({
          filename: input.filename,
          bytesDownloaded,
          totalBytes,
          percent: totalBytes > 0 ? (bytesDownloaded / totalBytes) * 100 : undefined,
        });
      }
    }

    const buffer = Buffer.concat(chunks);
    const writeStream = createWriteStream(destPath);
    await pipeline(Readable.from(buffer), writeStream);

    return { success: true, path: destPath };
  } catch (error) {
    return {
      success: false,
      error: `Download error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
