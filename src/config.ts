import { homedir, hostname } from "os";
import { join } from "path";
import { readFile } from "fs/promises";
import { existsSync } from "fs";

export interface ComfyUIConfig {
  url: string;
  apiKey?: string;
}

export interface Config {
  comfyui: ComfyUIConfig;
  outputDir: string;
  workflowsDir: string;
  outputSizeThreshold: number; // bytes, for auto mode
  /**
   * Extra directories the workflow tools may write to.
   *
   * Empty by default: writes normally go through ComfyUI's own userdata API,
   * which refuses traversal itself, so the default is safe by construction.
   * This list is the deliberate exception for folders outside the user
   * directory.
   *
   * There is intentionally NO tool that appends to this. A permission an
   * agent can grant itself is not a permission -- it is edited here, by hand.
   */
  workflowWriteDirs: string[];
  /**
   * Who this instance is, when several agents drive one ComfyUI.
   *
   * Travels two ways. It is the `client_id` on every /prompt submission, which
   * ComfyUI echoes back in /queue -- so a queue listing can say which jobs are
   * this agent's and which belong to someone else. And it is stamped on the
   * workflow base state, so a refused write can name who last wrote the file.
   *
   * Stable across reconnects on purpose. ComfyUIClient used to mint a fresh
   * randomUUID() per construction, which meant a reconnect silently disowned
   * every job the previous connection had submitted.
   */
  agentId: string;
}

/**
 * A readable default identity: the host and pid, e.g. "gpu-box/48211".
 *
 * Readable rather than a uuid because it is shown to a human in queue
 * listings and write conflicts, where "which of my agents is that" has to be
 * answerable at a glance. Set COMFYUI_MCP_AGENT_ID to name them yourself.
 */
function defaultAgentId(): string {
  return `${hostname()}/${process.pid}`;
}

const DEFAULT_CONFIG: Config = {
  comfyui: {
    // Use 127.0.0.1 instead of localhost due to Node 18 fetch IPv6/IPv4 issues
    url: "http://127.0.0.1:8188",
  },
  outputDir: "./outputs",
  workflowsDir: "./workflows",
  outputSizeThreshold: 1024 * 1024, // 1MB
  workflowWriteDirs: [],
  agentId: defaultAgentId(),
};

function getConfigDir(): string {
  const platform = process.platform;
  if (platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "comfyui-mcp");
  } else if (platform === "win32") {
    return join(process.env.APPDATA || homedir(), "comfyui-mcp");
  } else {
    return join(homedir(), ".config", "comfyui-mcp");
  }
}

function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export async function loadConfig(): Promise<Config> {
  const configPath = getConfigPath();

  // Check environment variables first
  const envUrl = process.env.COMFYUI_URL;
  const envApiKey = process.env.COMFYUI_API_KEY;

  let fileConfig: Partial<Config> = {};

  if (existsSync(configPath)) {
    try {
      const content = await readFile(configPath, "utf-8");
      fileConfig = JSON.parse(content);
    } catch {
      // Ignore parse errors, use defaults
    }
  }

  const config: Config = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    comfyui: {
      ...DEFAULT_CONFIG.comfyui,
      ...fileConfig.comfyui,
    },
  };

  // Environment variables override the config file.
  //
  // COMFYUI_API_KEY is read here because requestFailureHint names it as the
  // remedy for a 401/403 from ComfyUI. It was never read, so following that
  // advice changed nothing and the key could only be supplied by hand-editing
  // config.json - which the hint does not mention.
  if (envUrl) {
    config.comfyui.url = envUrl;
  }
  if (envApiKey) {
    config.comfyui.apiKey = envApiKey;
  }
  if (process.env.COMFYUI_MCP_AGENT_ID) {
    config.agentId = process.env.COMFYUI_MCP_AGENT_ID;
  }

  return config;
}
