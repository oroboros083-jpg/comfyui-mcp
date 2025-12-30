import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync } from "fs";

const DEFAULT_PORTS = [8188, 8000, 8189, 8190]; // 8000 is used by ComfyUI Desktop on macOS
// Use 127.0.0.1 instead of localhost due to Node 18 fetch IPv6/IPv4 issues
const LOCALHOST = "127.0.0.1";
// Docker Desktop (macOS/Windows) uses this to access host services
const DOCKER_HOST = "host.docker.internal";

/**
 * Check if we're running inside a Docker container
 */
function isRunningInDocker(): boolean {
  return existsSync("/.dockerenv") || process.env.DOCKER === "true";
}
const PROBE_TIMEOUT = 2000; // 2 seconds

export interface DiscoveryResult {
  url: string;
  source: "desktop" | "port-scan" | "environment" | "config" | "docker-host";
}

/**
 * Get the ComfyUI Desktop app data directory
 */
function getDesktopAppDir(): string | null {
  const platform = process.platform;

  if (platform === "darwin") {
    // macOS: Check both possible locations
    const paths = [
      join(homedir(), "Library", "Application Support", "ComfyUI"),
      join(homedir(), ".comfyui"),
    ];
    for (const p of paths) {
      if (existsSync(p)) return p;
    }
  } else if (platform === "win32") {
    // Windows
    const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    const path = join(appData, "ComfyUI");
    if (existsSync(path)) return path;
  } else {
    // Linux
    const paths = [
      join(homedir(), ".config", "ComfyUI"),
      join(homedir(), ".comfyui"),
    ];
    for (const p of paths) {
      if (existsSync(p)) return p;
    }
  }

  return null;
}

/**
 * Try to read the port from ComfyUI Desktop's configuration
 */
function getDesktopAppPort(): number | null {
  const appDir = getDesktopAppDir();
  if (!appDir) return null;

  // Try to find config file with port setting
  const configPaths = [
    join(appDir, "config.json"),
    join(appDir, "settings.json"),
    join(appDir, "user_settings.json"),
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, "utf-8");
        const config = JSON.parse(content);
        if (config.port) return config.port;
        if (config.server?.port) return config.server.port;
      } catch {
        // Continue to next config file
      }
    }
  }

  return null;
}

/**
 * Probe a URL to check if ComfyUI is running
 */
async function probeUrl(url: string): Promise<boolean> {
  console.error(`[discovery] Probing ${url}/system_stats...`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT);

    const response = await fetch(`${url}/system_stats`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeout);
    console.error(`[discovery] ${url} responded with status ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error(`[discovery] ${url} probe failed: ${error}`);
    return false;
  }
}

/**
 * Discover ComfyUI instances
 */
export async function discoverComfyUI(
  configUrl?: string
): Promise<DiscoveryResult | null> {
  // 1. Check environment variable
  const envUrl = process.env.COMFYUI_URL;
  if (envUrl) {
    if (await probeUrl(envUrl)) {
      return { url: envUrl, source: "environment" };
    }
  }

  // 2. Check config file URL
  if (configUrl) {
    if (await probeUrl(configUrl)) {
      return { url: configUrl, source: "config" };
    }
  }

  // 3. Check Desktop app configuration
  const desktopPort = getDesktopAppPort();
  if (desktopPort) {
    const desktopUrl = `http://${LOCALHOST}:${desktopPort}`;
    if (await probeUrl(desktopUrl)) {
      return { url: desktopUrl, source: "desktop" };
    }
  }

  // 4. Scan common ports on localhost
  for (const port of DEFAULT_PORTS) {
    const url = `http://${LOCALHOST}:${port}`;
    if (await probeUrl(url)) {
      return { url, source: "port-scan" };
    }
  }

  // 5. If running in Docker, try host.docker.internal
  if (isRunningInDocker()) {
    console.error("[discovery] Running in Docker, trying host.docker.internal...");
    for (const port of DEFAULT_PORTS) {
      const url = `http://${DOCKER_HOST}:${port}`;
      if (await probeUrl(url)) {
        return { url, source: "docker-host" };
      }
    }
  }

  return null;
}

/**
 * Check if ComfyUI is reachable at the given URL
 */
export async function checkConnection(url: string): Promise<boolean> {
  return probeUrl(url);
}
