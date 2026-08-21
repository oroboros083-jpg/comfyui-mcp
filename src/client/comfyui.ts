import { ToolError } from "../utils/errors.js";
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

/**
 * How long a fetched /object_info is trusted. Short enough that a newly
 * installed model appears without a reconnect, long enough that one burst of
 * tool calls does not refetch it repeatedly.
 */
const OBJECT_INFO_TTL_MS = 10_000;

/**
 * What to do about an HTTP failure from ComfyUI, by status.
 *
 * Deliberately specific: "Failed to get queue: 404" told the agent nothing,
 * and a 401 needs a different response from a 500.
 */
export function requestFailureHint(status: number): string {
  if (status === 401 || status === 403) {
    return "ComfyUI rejected the credentials. Set COMFYUI_API_KEY to the key this instance expects.";
  }
  if (status === 404) {
    return "That endpoint is missing on this ComfyUI build - it may be older than this server expects, or the feature needs a custom node. comfyui_get_status reports the version in use.";
  }
  if (status === 413) {
    return "The request body was too large for ComfyUI. Send a smaller workflow or image.";
  }
  if (status >= 500) {
    return "ComfyUI failed internally. Its console log has the traceback; comfyui_get_queue shows whether it is still processing.";
  }
  return "Check the arguments against comfyui_get_node_info, or comfyui_get_status if ComfyUI itself may be unhealthy.";
}

export class ComfyUIClient {
  private baseUrl: string;
  private clientId: string;
  private objectInfoCache: { value: ObjectInfo; at: number } | null = null;
  private objectInfoInFlight: Promise<ObjectInfo> | null = null;
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

  /**
   * One fetch against ComfyUI, with the failure turned into a ToolError that
   * says what to do about it.
   *
   * Ten methods repeated this block, each throwing a bare Error whose message
   * reached the agent as "comfyui_x failed: Not Found" with nothing to act
   * on. Status is mapped here once: an auth failure and a missing endpoint
   * need different responses, and neither is "try again".
   */
  private async request(
    path: string,
    label: string,
    init?: RequestInit & { signal?: AbortSignal }
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        headers: this.getHeaders(),
        ...init,
      });
    } catch (cause) {
      throw new ToolError(
        `Could not reach ComfyUI at ${this.baseUrl} while trying to ${label}`,
        "ComfyUI may have stopped or moved. Call comfyui_get_status to check, then comfyui_start_comfyui or comfyui_reconnect.",
        { cause }
      );
    }

    if (!response.ok) {
      throw new ToolError(
        `Failed to ${label}: ${response.status} ${response.statusText}`,
        requestFailureHint(response.status)
      );
    }

    return response;
  }

  getClientId(): string {
    return this.clientId;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async getSystemStats(signal?: AbortSignal): Promise<SystemStats> {
    const response = await this.request("/system_stats", "get system stats", { signal });
    return response.json() as Promise<SystemStats>;
  }

  /**
   * The node catalogue, cached for OBJECT_INFO_TTL_MS.
   *
   * This is by far the largest document ComfyUI serves - ~440KB on a modded
   * install - and nothing here used to cache it, so every gated tool refetched
   * and re-parsed the whole thing. Paging comfyui_list_nodes 50 at a time
   * through 2000 node types transferred and parsed it once per page.
   *
   * The window is short deliberately: long enough that a burst of calls (page,
   * page, build_node, validate_workflow) costs one fetch, short enough that a
   * model or custom node installed while the server runs shows up on its own.
   * comfyui_reconnect drops it outright via invalidateObjectInfo().
   */
  async getObjectInfo(): Promise<ObjectInfo> {
    const now = Date.now();
    if (this.objectInfoCache && now - this.objectInfoCache.at < OBJECT_INFO_TTL_MS) {
      return this.objectInfoCache.value;
    }

    // Share one in-flight request rather than starting a second 440KB
    // download when concurrent callers both miss.
    if (!this.objectInfoInFlight) {
      this.objectInfoInFlight = (async () => {
        const response = await this.request("/object_info", "get the node catalogue");
        return (await response.json()) as ObjectInfo;
      })();

      try {
        const value = await this.objectInfoInFlight;
        this.objectInfoCache = { value, at: Date.now() };
        return value;
      } finally {
        this.objectInfoInFlight = null;
      }
    }

    return this.objectInfoInFlight;
  }

  /** Drop the cached catalogue, so the next read goes back to ComfyUI. */
  invalidateObjectInfo(): void {
    this.objectInfoCache = null;
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
      // ComfyUI puts per-node validation errors in the body; that detail is
      // far more useful than the status, so it is kept rather than mapped.
      const error = await response.text();
      throw new ToolError(
        `ComfyUI rejected the workflow: ${response.status} ${response.statusText} - ${error}`,
        "Run comfyui_validate_workflow on this workflow - it reports missing nodes, bad connections and type mismatches before submission."
      );
    }
    return response.json() as Promise<QueuePromptResponse>;
  }

  async getQueue(): Promise<QueueStatus> {
    const response = await this.request("/queue", "get the queue");
    return response.json() as Promise<QueueStatus>;
  }

  async getHistory(promptId?: string): Promise<Record<string, HistoryEntry>> {
    const response = await this.request(
      promptId ? `/history/${promptId}` : "/history",
      "get generation history"
    );
    return response.json() as Promise<Record<string, HistoryEntry>>;
  }

  async cancelQueue(promptId?: string): Promise<void> {
    const body = promptId ? { delete: [promptId] } : { clear: true };
    await this.request("/queue", "cancel queued jobs", {
      method: "POST",
      body: JSON.stringify(body),
    });
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
        throw new ToolError(
          "ComfyUI-Manager refused the restart (403 Forbidden)",
          "Its security level forbids remote reboots - lower `security_level` in " +
            "ComfyUI-Manager's config.ini (it must be 'middle' or weaker) and try again. " +
            "Restarting ComfyUI by hand also works; call comfyui_reconnect afterwards."
        );
      }

      throw new ToolError(
        `ComfyUI refused the restart: ${response.status} ${response.statusText}`,
        requestFailureHint(response.status)
      );
    }

    throw new ToolError(
      `ComfyUI has no restart endpoint (HTTP ${lastStatus} at ${paths.join(" and ")})`,
      "Restarting on request is provided by ComfyUI-Manager, which does not appear to be " +
        "installed. Install it from https://github.com/Comfy-Org/ComfyUI-Manager, or restart " +
        "ComfyUI yourself and call comfyui_reconnect - this server does not need restarting."
    );
  }

  async interrupt(): Promise<void> {
    await this.request("/interrupt", "interrupt the running job", { method: "POST" });
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
    const response = await this.request(`/view?${params}`, `fetch ${filename}`);
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
      // Not routed through request(): this one posts FormData, so it builds
      // its own headers rather than the JSON ones.
      throw new ToolError(
        `Failed to upload image: ${response.status} ${response.statusText}`,
        requestFailureHint(response.status)
      );
    }
    return response.json() as Promise<{ name: string; subfolder: string; type: string }>;
  }

  async getModels(): Promise<ModelInfo> {
    // ComfyUI has no endpoint that lists models. The options of each loader
    // node's combo input are the list, so they are read out of object_info.
    // Independent requests, and /object_info is the largest document ComfyUI
    // serves - waiting for it before opening the embeddings socket cost the
    // sum of both latencies rather than the larger of the two.
    const [objectInfo, embeddings] = await Promise.all([
      this.getObjectInfo(),
      this.getEmbeddings(),
    ]);

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
    // have their own endpoint, fetched above alongside object_info.
    models.embeddings = embeddings;

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
