import { randomUUID } from "crypto";

export interface QueuePromptResponse {
  prompt_id: string;
  number: number;
  node_errors: Record<string, unknown>;
}

export interface QueueStatus {
  queue_running: Array<[number, string, unknown, unknown, unknown]>;
  queue_pending: Array<[number, string, unknown, unknown, unknown]>;
}

export interface HistoryEntry {
  prompt: [number, string, unknown, unknown, unknown];
  outputs: Record<string, { images?: ImageOutput[]; audio?: AudioOutput[] }>;
  status: {
    status_str: string;
    completed: boolean;
    messages: Array<[string, unknown]>;
  };
}

export interface ImageOutput {
  filename: string;
  subfolder: string;
  type: string;
}

export interface AudioOutput {
  filename: string;
  subfolder: string;
  type: string;
}

export interface SystemStats {
  system: {
    os: string;
    python_version: string;
    embedded_python: boolean;
  };
  devices: Array<{
    name: string;
    type: string;
    index: number;
    vram_total: number;
    vram_free: number;
    torch_vram_total: number;
    torch_vram_free: number;
  }>;
}

export interface ObjectInfo {
  [nodeName: string]: {
    input: {
      required?: Record<string, unknown>;
      optional?: Record<string, unknown>;
    };
    output: string[];
    output_is_list: boolean[];
    output_name: string[];
    name: string;
    display_name: string;
    description: string;
    category: string;
  };
}

export interface ModelInfo {
  checkpoints: string[];
  loras: string[];
  vae: string[];
  controlnet: string[];
  upscale_models: string[];
  embeddings: string[];
  hypernetworks: string[];
  clip: string[];
  unet: string[];
}

/**
 * Which loader node's combo input lists each kind of model.
 *
 * A table rather than seven near-identical blocks: every entry was previously
 * copy-pasted, which is how upscale_models came to be read with a check the
 * others had outgrown.
 */
const MODEL_SOURCES: ReadonlyArray<[keyof ModelInfo, string, string]> = [
  ["checkpoints", "CheckpointLoaderSimple", "ckpt_name"],
  ["loras", "LoraLoader", "lora_name"],
  ["vae", "VAELoader", "vae_name"],
  ["controlnet", "ControlNetLoader", "control_net_name"],
  ["upscale_models", "UpscaleModelLoader", "model_name"],
  ["unet", "UNETLoader", "unet_name"],
  ["clip", "CLIPLoader", "clip_name"],
  ["hypernetworks", "HypernetworkLoader", "hypernetwork_name"],
];

/**
 * Read the options out of a combo input spec.
 *
 * ComfyUI writes these two ways and a single instance serves both at once -
 * core nodes still use the legacy form while others have moved:
 *
 *   legacy:  [["a.safetensors", "b.safetensors"], { tooltip: ... }]
 *   current: ["COMBO", { options: ["a.safetensors", ...], multiselect: false }]
 *
 * Reading only the legacy form does not fail loudly; it reports an empty list,
 * so an installed model looks like a missing one. That was happening to
 * upscale_models on a stock ComfyUI 0.8.x desktop install.
 */
export function comboOptions(spec: unknown): string[] {
  if (!Array.isArray(spec) || spec.length === 0) return [];

  const [head, meta] = spec;

  if (Array.isArray(head)) {
    return head.filter((option): option is string => typeof option === "string");
  }

  if (head === "COMBO" && meta && typeof meta === "object") {
    const options = (meta as { options?: unknown }).options;
    if (Array.isArray(options)) {
      return options.filter((option): option is string => typeof option === "string");
    }
  }

  return [];
}

export class ComfyUIClient {
  private baseUrl: string;
  private clientId: string;
  private apiKey?: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.clientId = randomUUID();
    this.apiKey = apiKey;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  getClientId(): string {
    return this.clientId;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async getSystemStats(signal?: AbortSignal): Promise<SystemStats> {
    const response = await fetch(`${this.baseUrl}/system_stats`, {
      headers: this.getHeaders(),
      signal,
    });
    if (!response.ok) {
      throw new Error(`Failed to get system stats: ${response.statusText}`);
    }
    return response.json() as Promise<SystemStats>;
  }

  async getObjectInfo(): Promise<ObjectInfo> {
    const response = await fetch(`${this.baseUrl}/object_info`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to get object info: ${response.statusText}`);
    }
    return response.json() as Promise<ObjectInfo>;
  }

  async queuePrompt(
    workflow: Record<string, unknown>
  ): Promise<QueuePromptResponse> {
    const response = await fetch(`${this.baseUrl}/prompt`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        prompt: workflow,
        client_id: this.clientId,
      }),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to queue prompt: ${response.statusText} - ${error}`);
    }
    return response.json() as Promise<QueuePromptResponse>;
  }

  async getQueue(): Promise<QueueStatus> {
    const response = await fetch(`${this.baseUrl}/queue`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to get queue: ${response.statusText}`);
    }
    return response.json() as Promise<QueueStatus>;
  }

  async getHistory(promptId?: string): Promise<Record<string, HistoryEntry>> {
    const url = promptId
      ? `${this.baseUrl}/history/${promptId}`
      : `${this.baseUrl}/history`;
    const response = await fetch(url, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to get history: ${response.statusText}`);
    }
    return response.json() as Promise<Record<string, HistoryEntry>>;
  }

  async cancelQueue(promptId?: string): Promise<void> {
    const body = promptId ? { delete: [promptId] } : { clear: true };
    const response = await fetch(`${this.baseUrl}/queue`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Failed to cancel queue: ${response.statusText}`);
    }
  }

  /**
   * Ask ComfyUI to restart itself, rather than killing the process from
   * outside. The reboot endpoint comes from ComfyUI-Manager - core ComfyUI has
   * none - and its handler exits the process without finishing the response,
   * so a dropped connection is the success case, not an error.
   */
  async requestRestart(): Promise<{ endpoint: string }> {
    // ComfyUI mirrors extension routes under /api; builds that only expose the
    // unprefixed path answer 404 there, so fall back to it.
    const paths = ["/api/manager/reboot", "/manager/reboot"];
    let lastStatus = 404;

    for (const path of paths) {
      let response: Response;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        response = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          // JSON content type matters: ComfyUI-Manager rejects form-encoded and
          // text/plain bodies on this route as CSRF.
          headers: this.getHeaders(),
          signal: controller.signal,
        });
      } catch {
        // No response because the server exited mid-request - that is the
        // reboot taking effect. The caller confirms by watching it go down.
        return { endpoint: path };
      } finally {
        clearTimeout(timeout);
      }

      if (response.ok) {
        return { endpoint: path };
      }

      lastStatus = response.status;

      if (response.status === 404) {
        continue; // try the other path before concluding it isn't there
      }

      if (response.status === 403) {
        throw new Error(
          "ComfyUI-Manager refused the restart (403 Forbidden). Its security level " +
            "forbids remote reboots - lower `security_level` in ComfyUI-Manager's " +
            "config.ini (it must be 'middle' or weaker) and try again."
        );
      }

      throw new Error(
        `ComfyUI refused the restart: ${response.status} ${response.statusText}`
      );
    }

    throw new Error(
      `ComfyUI has no restart endpoint (HTTP ${lastStatus} at ${paths.join(" and ")}). ` +
        "Restarting on request is provided by ComfyUI-Manager, which does not appear to be " +
        "installed. Install it from https://github.com/Comfy-Org/ComfyUI-Manager, or restart " +
        "ComfyUI yourself - this server will reconnect on its own."
    );
  }

  async interrupt(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/interrupt`, {
      method: "POST",
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to interrupt: ${response.statusText}`);
    }
  }

  async getImage(
    filename: string,
    subfolder: string = "",
    type: string = "output"
  ): Promise<ArrayBuffer> {
    const params = new URLSearchParams({
      filename,
      subfolder,
      type,
    });
    const response = await fetch(`${this.baseUrl}/view?${params}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to get image: ${response.statusText}`);
    }
    return response.arrayBuffer();
  }

  async uploadImage(
    image: Buffer,
    filename: string,
    overwrite: boolean = false
  ): Promise<{ name: string; subfolder: string; type: string }> {
    const formData = new FormData();
    formData.append("image", new Blob([image]), filename);
    formData.append("overwrite", String(overwrite));

    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/upload/image`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`Failed to upload image: ${response.statusText}`);
    }
    return response.json() as Promise<{ name: string; subfolder: string; type: string }>;
  }

  async getModels(): Promise<ModelInfo> {
    // ComfyUI has no endpoint that lists models. The options of each loader
    // node's combo input are the list, so they are read out of object_info.
    const objectInfo = await this.getObjectInfo();

    const models: ModelInfo = {
      checkpoints: [],
      loras: [],
      vae: [],
      controlnet: [],
      upscale_models: [],
      embeddings: [],
      hypernetworks: [],
      clip: [],
      unet: [],
    };

    for (const [key, node, field] of MODEL_SOURCES) {
      const spec = objectInfo[node]?.input?.required?.[field];
      models[key] = comboOptions(spec);
    }

    // Embeddings are the exception: no loader node lists them, because they
    // are referenced from inside a prompt rather than loaded by a node. They
    // have their own endpoint, and without it this field is always empty -
    // which reads as "none installed" rather than "never looked".
    models.embeddings = await this.getEmbeddings();

    return models;
  }

  /**
   * Textual-inversion embeddings, by name and without file extension - that is
   * how a prompt refers to them.
   *
   * A failure here is not allowed to sink the whole model listing: the
   * endpoint is missing on old ComfyUI builds, and eight other model types
   * still have something useful to say.
   */
  async getEmbeddings(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        headers: this.getHeaders(),
      });
      if (!response.ok) return [];

      const names = await response.json();
      return Array.isArray(names)
        ? names.filter((name): name is string => typeof name === "string")
        : [];
    } catch {
      return [];
    }
  }

  getWebSocketUrl(): string {
    const wsProtocol = this.baseUrl.startsWith("https") ? "wss" : "ws";
    const host = this.baseUrl.replace(/^https?:\/\//, "");
    return `${wsProtocol}://${host}/ws?clientId=${this.clientId}`;
  }
}
