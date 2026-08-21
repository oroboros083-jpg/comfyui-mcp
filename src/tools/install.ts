import { z } from "zod";
import { platform, homedir } from "os";
import { existsSync } from "fs";
import { join } from "path";

export interface InstallationStatus {
  installed: boolean;
  type?: "desktop" | "standalone" | "portable" | "unknown";
  path?: string;
  running: boolean;
  url?: string;
}

export interface InstallOption {
  name: string;
  description: string;
  url: string;
  difficulty: "easy" | "medium" | "advanced";
  recommended: boolean;
  platforms: string[];
}

const INSTALL_OPTIONS: InstallOption[] = [
  {
    name: "ComfyUI Desktop App",
    description:
      "Official desktop application with bundled Python and easy setup. Best for most users.",
    url: "https://www.comfy.org/download",
    difficulty: "easy",
    recommended: true,
    platforms: ["darwin", "win32", "linux"],
  },
  {
    name: "Standalone (Windows)",
    description:
      "Portable Windows package with embedded Python. Extract and run.",
    url: "https://github.com/comfyanonymous/ComfyUI/releases",
    difficulty: "easy",
    recommended: false,
    platforms: ["win32"],
  },
  {
    name: "Manual Installation",
    description:
      "Clone from GitHub and install with pip. Requires Python 3.10+ and Git.",
    url: "https://github.com/comfyanonymous/ComfyUI",
    difficulty: "medium",
    recommended: false,
    platforms: ["darwin", "win32", "linux"],
  },
  {
    name: "Docker",
    description:
      "Run in a Docker container. Good for isolation and reproducibility.",
    url: "https://github.com/comfyanonymous/ComfyUI#docker",
    difficulty: "medium",
    recommended: false,
    platforms: ["darwin", "win32", "linux"],
  },
];

/**
 * Check for known ComfyUI installation locations
 */
export function detectInstallation(): InstallationStatus {
  const os = platform();

  // Check for desktop app
  const desktopPaths: string[] = [];

  if (os === "darwin") {
    desktopPaths.push(
      "/Applications/ComfyUI.app",
      join(homedir(), "Applications", "ComfyUI.app"),
      join(homedir(), "Library", "Application Support", "ComfyUI")
    );
  } else if (os === "win32") {
    const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    const localAppData =
      process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
    desktopPaths.push(
      join(appData, "ComfyUI"),
      join(localAppData, "ComfyUI"),
      join(localAppData, "Programs", "ComfyUI"),
      "C:\\ComfyUI",
      "C:\\Program Files\\ComfyUI"
    );
  } else {
    desktopPaths.push(
      join(homedir(), ".config", "ComfyUI"),
      join(homedir(), ".comfyui"),
      join(homedir(), "ComfyUI"),
      "/opt/ComfyUI"
    );
  }

  for (const path of desktopPaths) {
    if (existsSync(path)) {
      return {
        installed: true,
        type: path.includes(".app") || path.includes("Programs") ? "desktop" : "standalone",
        path,
        running: false, // Will be updated by connection check
      };
    }
  }

  return { installed: false, running: false };
}

export const getInstallGuideSchema = z.object({
  platform: z
    .enum(["auto", "macos", "windows", "linux"])
    .optional()
    .default("auto")
    .describe("Target platform (auto-detect if not specified)"),
}).strict();

export type GetInstallGuideInput = z.infer<typeof getInstallGuideSchema>;

export function getInstallGuide(input: GetInstallGuideInput): string {
  let targetPlatform = input.platform;

  if (targetPlatform === "auto") {
    const os = platform();
    targetPlatform =
      os === "darwin" ? "macos" : os === "win32" ? "windows" : "linux";
  }

  const platformMap: Record<string, string> = {
    macos: "darwin",
    windows: "win32",
    linux: "linux",
  };

  const nodePlatform = platformMap[targetPlatform];

  // Check current installation status
  const status = detectInstallation();

  let guide = `# ComfyUI Installation Guide\n\n`;

  if (status.installed) {
    guide += `## Current Status\n`;
    guide += `ComfyUI appears to be installed at: ${status.path}\n`;
    guide += `Type: ${status.type}\n\n`;
    guide += `If it's not running, start it and this MCP server will auto-detect it.\n\n`;
  }

  guide += `## Installation Options for ${targetPlatform}\n\n`;

  // Filter and sort options
  const options = INSTALL_OPTIONS.filter((opt) =>
    opt.platforms.includes(nodePlatform)
  ).sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));

  for (const option of options) {
    guide += `### ${option.name}${option.recommended ? " (Recommended)" : ""}\n`;
    guide += `${option.description}\n\n`;
    guide += `- **Difficulty**: ${option.difficulty}\n`;
    guide += `- **Download**: ${option.url}\n\n`;
  }

  // Platform-specific instructions
  guide += `## Quick Start\n\n`;

  if (targetPlatform === "macos") {
    guide += `### macOS (Desktop App)\n`;
    guide += `1. Download from https://www.comfy.org/download\n`;
    guide += `2. Open the .dmg and drag ComfyUI to Applications\n`;
    guide += `3. Open ComfyUI from Applications\n`;
    guide += `4. On first run, it will download Python and set up the environment\n\n`;
  } else if (targetPlatform === "windows") {
    guide += `### Windows (Desktop App)\n`;
    guide += `1. Download from https://www.comfy.org/download\n`;
    guide += `2. Run the installer\n`;
    guide += `3. Launch ComfyUI from the Start Menu\n\n`;
    guide += `### Windows (Standalone/Portable)\n`;
    guide += `1. Download from https://github.com/comfyanonymous/ComfyUI/releases\n`;
    guide += `2. Extract the archive to a location (e.g., C:\\ComfyUI)\n`;
    guide += `3. Run \`run_nvidia_gpu.bat\` or \`run_cpu.bat\`\n\n`;
  } else {
    guide += `### Linux\n`;
    guide += `1. Download desktop app from https://www.comfy.org/download\n`;
    guide += `   OR install manually:\n`;
    guide += `2. Clone: \`git clone https://github.com/comfyanonymous/ComfyUI.git\`\n`;
    guide += `3. \`cd ComfyUI\`\n`;
    guide += `4. \`pip install -r requirements.txt\`\n`;
    guide += `5. \`python main.py\`\n\n`;
  }

  guide += `## After Installation\n\n`;
  guide += `Once ComfyUI is running (default: http://localhost:8188), this MCP server will automatically detect it.\n\n`;
  guide += `### Getting Models\n`;
  guide += `You'll need models to generate images. See the \`get_model_guide\` tool for help downloading models.\n`;

  return guide;
}

export const getModelGuideSchema = z.object({
  modelType: z
    .enum(["all", "checkpoint", "flux", "sdxl", "sd15", "lora", "controlnet", "vae"])
    .optional()
    .default("all")
    .describe("Type of model to get guidance for"),
}).strict();

export type GetModelGuideInput = z.infer<typeof getModelGuideSchema>;

interface ModelSource {
  name: string;
  type: string[];
  url: string;
  description: string;
  free: boolean;
}

const MODEL_SOURCES: ModelSource[] = [
  {
    name: "Hugging Face",
    type: ["checkpoint", "flux", "sdxl", "sd15", "lora", "controlnet", "vae"],
    url: "https://huggingface.co/models?pipeline_tag=text-to-image",
    description: "Largest repository of AI models. Many free models available.",
    free: true,
  },
  {
    name: "Civitai",
    type: ["checkpoint", "lora", "sdxl", "sd15"],
    url: "https://civitai.com/",
    description: "Community-driven model sharing platform with previews and ratings.",
    free: true,
  },
  {
    name: "Black Forest Labs (Flux)",
    type: ["flux"],
    url: "https://huggingface.co/black-forest-labs",
    description: "Official Flux models from Black Forest Labs.",
    free: true,
  },
  {
    name: "Stability AI",
    type: ["sdxl", "sd15", "vae"],
    url: "https://huggingface.co/stabilityai",
    description: "Official Stable Diffusion models from Stability AI.",
    free: true,
  },
];

export function getModelGuide(input: GetModelGuideInput): string {
  let guide = `# ComfyUI Model Guide\n\n`;

  guide += `## Model Directories\n`;
  guide += `Place downloaded models in the appropriate ComfyUI subdirectory:\n\n`;
  guide += `- **Checkpoints**: \`models/checkpoints/\`\n`;
  guide += `- **UNET** (Flux, SD3): \`models/unet/\` or \`models/diffusion_models/\`\n`;
  guide += `- **CLIP**: \`models/clip/\`\n`;
  guide += `- **VAE**: \`models/vae/\`\n`;
  guide += `- **LoRA**: \`models/loras/\`\n`;
  guide += `- **ControlNet**: \`models/controlnet/\`\n`;
  guide += `- **Upscale**: \`models/upscale_models/\`\n\n`;

  if (input.modelType === "all" || input.modelType === "flux") {
    guide += `## Flux Models\n`;
    guide += `Flux is a modern, high-quality model architecture.\n\n`;
    guide += `### Flux.1 [dev] (Recommended for quality)\n`;
    guide += `- UNET: https://huggingface.co/black-forest-labs/FLUX.1-dev\n`;
    guide += `- T5 Encoder: https://huggingface.co/comfyanonymous/flux_text_encoders\n`;
    guide += `- VAE: https://huggingface.co/black-forest-labs/FLUX.1-dev (flux1-dev.safetensors includes VAE)\n\n`;
    guide += `### Flux.1 [schnell] (Faster, 4 steps)\n`;
    guide += `- UNET: https://huggingface.co/black-forest-labs/FLUX.1-schnell\n\n`;
  }

  if (input.modelType === "all" || input.modelType === "sdxl") {
    guide += `## SDXL Models\n`;
    guide += `SDXL produces high-quality 1024x1024 images.\n\n`;
    guide += `### Official SDXL\n`;
    guide += `- https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0\n`;
    guide += `- Optional refiner: https://huggingface.co/stabilityai/stable-diffusion-xl-refiner-1.0\n\n`;
    guide += `### Popular Community Models\n`;
    guide += `- Juggernaut XL: https://civitai.com/models/133005\n`;
    guide += `- RealVisXL: https://civitai.com/models/139562\n`;
    guide += `- DreamShaper XL: https://civitai.com/models/112902\n\n`;
  }

  if (input.modelType === "all" || input.modelType === "sd15") {
    guide += `## SD 1.5 Models\n`;
    guide += `Classic Stable Diffusion, well-supported with many LoRAs.\n\n`;
    guide += `- Official: https://huggingface.co/runwayml/stable-diffusion-v1-5\n`;
    guide += `- Realistic Vision: https://civitai.com/models/4201\n`;
    guide += `- DreamShaper: https://civitai.com/models/4384\n\n`;
  }

  guide += `## Model Sources\n\n`;

  const sources =
    input.modelType === "all"
      ? MODEL_SOURCES
      : MODEL_SOURCES.filter((s) => s.type.includes(input.modelType!));

  for (const source of sources) {
    guide += `### ${source.name}\n`;
    guide += `${source.description}\n`;
    guide += `URL: ${source.url}\n\n`;
  }

  guide += `## Tips\n`;
  guide += `- Use \`comfyui_list_models\` tool to see what models ComfyUI has detected\n`;
  guide += `- Restart ComfyUI after adding new models, or use the "Refresh" button\n`;
  guide += `- Check file sizes: checkpoints are usually 2-7GB, LoRAs are 10-200MB\n`;

  return guide;
}

export const getStatusSchema = z.object({}).strict();

export interface ServerStatus {
  comfyuiConnected: boolean;
  comfyuiUrl?: string;
  discoverySource?: string;
  installationDetected: boolean;
  installationPath?: string;
  installationType?: string;
  capabilities?: string;
}

export async function getStatus(
  connected: boolean,
  url?: string,
  source?: string,
  capabilitySummary?: string
): Promise<ServerStatus> {
  const installation = detectInstallation();

  return {
    comfyuiConnected: connected,
    comfyuiUrl: url,
    discoverySource: source,
    installationDetected: installation.installed,
    installationPath: installation.path,
    installationType: installation.type,
    capabilities: capabilitySummary,
  };
}
