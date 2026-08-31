import { z } from "zod";
import { platform, homedir } from "os";
import { existsSync } from "fs";
import { join } from "path";

import { ReconcileSummary } from "../jobs/reconcile.js";

export interface InstallationStatus {
  installed: boolean;
  type?: "desktop" | "standalone" | "portable" | "unknown";
  path?: string;
  running: boolean;
  url?: string;
}

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

export const getStatusSchema = z.object({}).strict();

export interface ServerStatus {
  comfyuiConnected: boolean;
  comfyuiUrl?: string;
  discoverySource?: string;
  installationDetected: boolean;
  installationPath?: string;
  installationType?: string;
  capabilities?: string;
  /** Set when disconnected: why, and where we looked. */
  error?: string;
  urlsTried?: string[];
  /** Set when reconnecting resolved tasks interrupted by a restart. */
  reconciledTasks?: ReconcileSummary;
  /** Set when connected, to steer prompting before the first generation. */
  promptingAdvice?: { detectedModelType: string; recommendation: string };
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
