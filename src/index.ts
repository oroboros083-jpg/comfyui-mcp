#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  SetLevelRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { loadConfig, Config } from "./config.js";
import { discoverComfyUI, getCandidateUrls } from "./discovery/index.js";
import { ComfyUIClient, ObjectInfo } from "./client/comfyui.js";
import { ComfyUIWebSocket } from "./client/websocket.js";
import {
  detectCapabilities,
  getCapabilitySummary,
  Capabilities,
} from "./capabilities/index.js";

// Tool imports
import {
  listModelsSchema,
  listModels,
  listNodesSchema,
  listNodes,
  getNodeInfoSchema,
  getNodeInfo,
  findNodesByTypeSchema,
  findNodesByType,
  ListModelsInput,
  ListNodesInput,
  GetNodeInfoInput,
  FindNodesByTypeInput,
} from "./tools/models.js";
import {
  getQueueSchema,
  getQueue,
  cancelJobSchema,
  cancelJob,
  interruptSchema,
  interrupt,
  getHistorySchema,
  getHistory,
  CancelJobInput,
  GetHistoryInput,
} from "./tools/queue.js";
import {
  runWorkflowSchema,
  runWorkflow,
  getImageSchema,
  getImage,
  RunWorkflowInput,
  GetImageInput,
} from "./tools/generate.js";
import { processImageForTransfer } from "./utils/image.js";
import {
  validateWorkflowSchema,
  validateWorkflow,
  ValidateWorkflowInput,
} from "./tools/validation.js";
import {
  buildNodeSchema,
  buildNode,
  BuildNodeInput,
} from "./tools/models.js";
import {
  getInstallGuideSchema,
  getInstallGuide,
  getModelGuideSchema,
  getModelGuide,
  getStatusSchema,
  getStatus,
  detectInstallation,
  GetInstallGuideInput,
  GetModelGuideInput,
} from "./tools/install.js";
import {
  startComfyUISchema,
  resolveLaunchTarget,
  spawnComfyUI,
  launchBlockedReason,
  StartComfyUIInput,
} from "./tools/launch.js";
import {
  listExamplesSchema,
  listExamples,
  getExampleWorkflowSchema,
  getExampleWorkflow,
  extractWorkflowFromPng,
  recommendWorkflowSchema,
  recommendWorkflow,
  formatWorkflowRecommendation,
  searchTemplatesSchema,
  searchTemplates,
  getTemplateSchema,
  getTemplate,
  saveTemplateSchema,
  saveCustomTemplate,
  deleteTemplateSchema,
  deleteCustomTemplate,
  getDownloadUrlSchema,
  getDownloadUrl,
  ListExamplesInput,
  GetExampleWorkflowInput,
  RecommendWorkflowInput,
  SearchTemplatesInput,
  GetTemplateInput,
  SaveTemplateInput,
  DeleteTemplateInput,
  GetDownloadUrlInput,
} from "./tools/examples/index.js";
import { readFile, stat } from "fs/promises";
import { safeFetch } from "./utils/safe-fetch.js";
import {
  getPromptingGuide,
  getComprehensiveGuide,
  formatPromptingGuide,
  PROMPTING_GUIDES,
} from "./resources/prompting-guide.js";
import { getJobManager, JobManager } from "./jobs/manager.js";
import { reconcileOrphanedJobs, ReconcileSummary } from "./jobs/reconcile.js";
import { restartComfyUISchema, RestartComfyUIInput } from "./tools/restart.js";
import {
  listOpenWorkflowsSchema,
  flushWorkflowSchema,
  reloadWorkflowSchema,
  readWorkflowSchema,
  writeWorkflowSchema,
  FlushWorkflowInput,
  ReloadWorkflowInput,
  ReadWorkflowInput,
  WriteWorkflowInput,
  getTabState,
  flushWorkflow,
  reloadWorkflow,
  readWorkflowFile,
  writeWorkflowFile,
  diffWorkflows,
  WriteNotPermittedError,
  BRIDGE_MISSING_HINT,
} from "./tools/workflow-files.js";
import {
  runWorkflowAsync,
} from "./tools/generate-async.js";
import {
  analyzeUserOutputs,
  getUserPreferencesSummary,
} from "./analysis/outputs.js";
import {
  renderSvgSchema,
  renderSvg,
  RenderSvgInput,
} from "./tools/svg.js";
import {
  downloadFontSchema,
  downloadFont,
  listFontsSchema,
  listFonts,
  DownloadFontInput,
  RECOMMENDED_MAP_FONTS,
} from "./tools/fonts.js";
import { join } from "path";
import * as db from "./db/index.js";
import {
  ServerContext,
  createContext,
  getComfyUIPath,
} from "./context.js";
import {
  getStaticResources,
  getDynamicResources,
  readResource,
} from "./handlers/resources.js";
import { listPrompts, getPrompt } from "./handlers/prompts.js";
import {
  initLogging,
  setLogLevel,
  LoggingLevel,
  debug,
  info,
  warning,
  error as logError,
} from "./utils/logging.js";

// Server context - single source of truth for all state
let ctx: ServerContext;

// extract_workflow's local-file branch reads whatever path it's given with
// no directory sandboxing, since users legitimately point it at PNGs
// anywhere on disk (Downloads, ComfyUI's output folder, etc.). Restricting
// it to a .png extension and this size cap narrows that from "read any
// file the process can access" down to "read a PNG-sized PNG", closing off
// the realistic path to exfiltrating unrelated sensitive files (dotfiles,
// keys, .env) through this tool.
const MAX_LOCAL_IMAGE_BYTES = 50 * 1024 * 1024; // 50MB

const server = new Server(
  {
    name: "comfyui-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
      logging: {},
    },
  }
);

/**
 * Initialize connection to ComfyUI
 */
async function initializeComfyUI(): Promise<boolean> {
  debug("Starting ComfyUI initialization...", undefined, "init");
  debug(`Config loaded, url from config: ${ctx.config.comfyui.url}`, undefined, "init");

  // Try to detect ComfyUI installation
  const installation = detectInstallation();
  if (installation.installed && installation.path) {
    ctx.comfyuiPath = installation.path;
    info(`Found ComfyUI installation at: ${ctx.comfyuiPath}`, undefined, "init");
  } else {
    debug("No ComfyUI installation detected", undefined, "init");
  }

  // Try to discover running ComfyUI
  debug("Attempting to discover running ComfyUI...", undefined, "init");
  const discovered = await discoverComfyUI(ctx.config.comfyui.url);

  if (!discovered) {
    info("ComfyUI is not running. Use get_install_guide or get_status for help.", undefined, "init");
    clearConnectionState();
    return false;
  }

  ctx.discoveredUrl = discovered.url;
  ctx.discoverySource = discovered.source;
  info(`Found running ComfyUI at ${discovered.url} (${discovered.source})`, undefined, "init");

  // Create client
  ctx.client = new ComfyUIClient(discovered.url, ctx.config.comfyui.apiKey);
  debug("Created ComfyUI client", undefined, "init");

  // Get capabilities. This always re-fetches: reaching here means we either
  // never connected or lost the connection, and a ComfyUI restart can add or
  // remove models and custom nodes.
  try {
    debug("Getting object info...", undefined, "init");
    ctx.objectInfo = await ctx.client.getObjectInfo();
    debug(`Got object info with ${Object.keys(ctx.objectInfo).length} nodes`, undefined, "init");
    ctx.capabilities = detectCapabilities(ctx.objectInfo);
    info(`Detected capabilities:\n${getCapabilitySummary(ctx.capabilities)}`, undefined, "init");
  } catch (err) {
    logError(`Failed to get ComfyUI capabilities: ${err}`, undefined, "init");
    clearConnectionState();
    return false;
  }

  // Analyze user outputs for preferences (non-blocking)
  if (ctx.comfyuiPath) {
    const outputDir = join(ctx.comfyuiPath, "output");
    debug(`Analyzing user outputs in: ${outputDir}`, undefined, "init");
    try {
      const userPrefs = await analyzeUserOutputs(outputDir);
      if (ctx.capabilities) {
        ctx.capabilities.userPreferences = userPrefs;
      }
      debug(`User preferences:\n${getUserPreferencesSummary(userPrefs)}`, undefined, "init");
    } catch (err) {
      warning(`Failed to analyze user outputs: ${err}`, undefined, "init");
      // Non-fatal - continue without preferences
    }
  }

  // Connect WebSocket. Any previous socket is torn down first so its reconnect
  // ladder doesn't keep running against the old URL.
  ctx.ws?.disconnect();
  ctx.ws = new ComfyUIWebSocket(ctx.client.getWebSocketUrl());
  try {
    await ctx.ws.connect();
    debug("WebSocket connected", undefined, "init");
  } catch (err) {
    warning(`Failed to connect WebSocket: ${err}`, undefined, "init");
  }

  ctx.lastHealthyAt = Date.now();
  debug("Initialization complete, returning true", undefined, "init");
  return true;
}

interface ConnectionHandles {
  client: ComfyUIClient;
  ws: ComfyUIWebSocket;
  capabilities: Capabilities;
  objectInfo: ObjectInfo;
}

// A successful health probe is trusted for this long, so a burst of tool calls
// costs one round trip instead of one per call. Only successes are cached: a
// failed probe leaves lastHealthyAt at 0, so the next call probes again.
const HEALTH_TTL_MS = 20_000;
const HEALTH_PROBE_TIMEOUT_MS = 2000;

// The in-flight connection check, shared by concurrent callers so N simultaneous
// tool calls trigger one probe rather than N.
let connectionCheck: Promise<ConnectionHandles> | null = null;

function isFullyInitialized(): boolean {
  return !!(ctx.client && ctx.ws && ctx.capabilities && ctx.objectInfo);
}

function connectionHandles(): ConnectionHandles {
  return {
    client: ctx.client!,
    ws: ctx.ws!,
    capabilities: ctx.capabilities!,
    objectInfo: ctx.objectInfo!,
  };
}

/**
 * Drop every piece of ComfyUI-derived state. Called whenever ComfyUI turns out
 * to be unreachable, so no tool, resource, or status report can serve a model
 * list or capability set from before the outage as though it were current.
 */
function clearConnectionState(): void {
  ctx.ws?.disconnect();
  ctx.client = null;
  ctx.ws = null;
  ctx.capabilities = null;
  ctx.objectInfo = null;
  ctx.discoveredUrl = null;
  ctx.discoverySource = null;
  ctx.lastHealthyAt = 0;
}

/**
 * Cheap liveness probe. /system_stats is a few hundred bytes; /object_info is
 * megabytes and must never be used as a health check.
 */
async function probeCurrentClient(): Promise<boolean> {
  if (!ctx.client) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_PROBE_TIMEOUT_MS);
  try {
    await ctx.client.getSystemStats(controller.signal);
    return true;
  } catch (err) {
    debug(`Health probe failed: ${err}`, undefined, "connection");
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Error text for a genuinely unreachable ComfyUI: name where we looked and how
 * to retry without restarting the MCP server.
 */
function unreachableError(): string {
  const candidates = getCandidateUrls(ctx.config.comfyui.url);
  return (
    `ComfyUI is not reachable. Tried: ${candidates.join(", ")}. ` +
    "Start ComfyUI (or set COMFYUI_URL) and call 'reconnect' to retry - " +
    "the MCP server does not need to be restarted. See 'get_install_guide' for setup help."
  );
}

/**
 * Resolve interrupted jobs against ComfyUI now that it is reachable again.
 */
async function reconcileAfterConnect(): Promise<ReconcileSummary | undefined> {
  if (!ctx.client) return undefined;
  try {
    const summary = await reconcileOrphanedJobs(ctx.client, ctx.jobManager);
    if (summary.completed > 0 || summary.failed > 0) {
      info(
        `Reconciled interrupted tasks: ${summary.completed} completed, ${summary.failed} failed, ${summary.stillRunning} still running`,
        undefined,
        "connection"
      );
    }
    return summary;
  } catch (err) {
    warning(`Failed to reconcile interrupted tasks: ${err}`, undefined, "connection");
    return undefined;
  }
}

async function resolveConnection(): Promise<ConnectionHandles> {
  // Fast path: initialized and probed within the TTL.
  if (isFullyInitialized() && Date.now() - ctx.lastHealthyAt < HEALTH_TTL_MS) {
    return connectionHandles();
  }

  // Still pointing at a live ComfyUI with a live socket? Just extend the TTL.
  // A dropped WebSocket means ComfyUI went away even if it is answering again
  // now, so that case falls through to a full refresh.
  if (isFullyInitialized() && ctx.ws!.isConnected() && (await probeCurrentClient())) {
    ctx.lastHealthyAt = Date.now();
    return connectionHandles();
  }

  // Either we never connected or ComfyUI stopped answering. Re-run the whole
  // discovery ladder rather than retrying the last URL - it may have come back
  // on a different port.
  const previousUrl = ctx.discoveredUrl;
  if (previousUrl) {
    warning(
      `Lost connection to ComfyUI at ${previousUrl}, re-running discovery...`,
      undefined,
      "connection"
    );
  }

  const connected = await initializeComfyUI();
  if (!connected || !isFullyInitialized()) {
    throw new Error(unreachableError());
  }

  if (previousUrl && previousUrl !== ctx.discoveredUrl) {
    info(`ComfyUI moved from ${previousUrl} to ${ctx.discoveredUrl}`, undefined, "connection");
  }

  // ComfyUI restarted under us, so anything left mid-flight needs resolving.
  await reconcileAfterConnect();

  return connectionHandles();
}

/**
 * Gate every ComfyUI-touching tool goes through. Revalidates the connection,
 * rediscovers and refreshes capabilities when ComfyUI has restarted, and throws
 * an actionable error when it is genuinely gone.
 */
async function ensureConnected(): Promise<ConnectionHandles> {
  if (connectionCheck) return connectionCheck;

  const pending = resolveConnection();
  connectionCheck = pending;
  try {
    return await pending;
  } finally {
    if (connectionCheck === pending) connectionCheck = null;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// How long to watch for ComfyUI to actually go offline after accepting a
// restart. It exits without answering the request, so the disappearance is the
// only confirmation the restart took effect.
const RESTART_SHUTDOWN_WINDOW_MS = 20_000;
const RESTART_POLL_INTERVAL_MS = 2000;

/**
 * Watch the current URL until it stops answering. Returns false if ComfyUI
 * never went away, which means the restart didn't take (or it came back faster
 * than we could observe).
 */
async function waitForShutdown(): Promise<boolean> {
  const deadline = Date.now() + RESTART_SHUTDOWN_WINDOW_MS;
  while (Date.now() < deadline) {
    if (!(await probeCurrentClient())) return true;
    await sleep(500);
  }
  return false;
}

/**
 * Poll until ComfyUI answers again, rediscovering each time - a restarted
 * instance may come back on a different port.
 */
async function waitForRestart(timeoutMs: number): Promise<{
  connected: boolean;
  url?: string;
  source?: string;
  error?: string;
  reconciled?: ReconcileSummary;
}> {
  const deadline = Date.now() + timeoutMs;
  let last: Awaited<ReturnType<typeof refreshConnection>> = {
    connected: false,
    error: unreachableError(),
  };

  while (Date.now() < deadline) {
    last = await refreshConnection();
    if (last.connected) return last;
    await sleep(RESTART_POLL_INTERVAL_MS);
  }

  return last;
}

/**
 * Force a full rediscovery and capability refresh, ignoring the health cache.
 * Backs both `reconnect` and `get_status`, which exist to answer "is this
 * working right now" - a question a cached answer cannot address.
 */
async function refreshConnection(): Promise<{
  connected: boolean;
  url?: string;
  source?: string;
  error?: string;
  reconciled?: ReconcileSummary;
}> {
  ctx.lastHealthyAt = 0;
  const previousUrl = ctx.discoveredUrl;

  const connected = await initializeComfyUI();
  if (!connected || !isFullyInitialized()) {
    return { connected: false, error: unreachableError() };
  }

  // Confirm with a live, authenticated request: discovery probes /system_stats
  // without the API key, so it can succeed against an instance our client is
  // not actually allowed to talk to.
  if (!(await probeCurrentClient())) {
    clearConnectionState();
    return { connected: false, error: unreachableError() };
  }
  ctx.lastHealthyAt = Date.now();

  if (previousUrl && previousUrl !== ctx.discoveredUrl) {
    info(`ComfyUI moved from ${previousUrl} to ${ctx.discoveredUrl}`, undefined, "connection");
  }

  const reconciled = await reconcileAfterConnect();

  return {
    connected: true,
    url: ctx.discoveredUrl ?? undefined,
    source: ctx.discoverySource ?? undefined,
    reconciled,
  };
}


// Tool annotation type
interface ToolAnnotations {
  title: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

// Tool definition type
interface ToolDefinition {
  schema: z.ZodType;
  description: string;
  requiresConnection?: boolean;
  annotations: ToolAnnotations;
}

// Tool definitions - organized by category
const TOOLS: Record<string, ToolDefinition> = {
  // === Status & Setup (always available) ===
  get_status: {
    schema: getStatusSchema,
    description:
      "Get the current status of ComfyUI connection and installation",
    requiresConnection: false,
    annotations: {
      title: "Get ComfyUI Status",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  reconnect: {
    schema: z.object({}),
    description:
      "Re-discover and reconnect to ComfyUI, refreshing the cached model and node list. Use this after restarting ComfyUI, or if a tool reports that ComfyUI is unreachable. Also resolves any tasks that were interrupted by the restart.",
    requiresConnection: false,
    annotations: {
      title: "Reconnect to ComfyUI",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  start_comfyui: {
    schema: startComfyUISchema,
    description:
      "Start ComfyUI on this machine if it is not already running, then wait for it to come up and connect. Auto-detects the desktop app, a portable launcher, or a source install; pass 'command' to launch something else. Returns immediately with alreadyRunning if an instance is already reachable - it never starts a second one. To restart a running instance, use restart_comfyui instead.",
    requiresConnection: false,
    annotations: {
      title: "Start ComfyUI",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  restart_comfyui: {
    schema: restartComfyUISchema,
    description:
      "Ask ComfyUI to restart itself, then wait for it to come back and reconnect. Use this to load newly installed custom nodes or models, or to clear a wedged ComfyUI - it is a clean in-app restart, not a process kill. Requires ComfyUI-Manager (core ComfyUI has no restart endpoint). Refuses while generations are running or queued unless force is set.",
    requiresConnection: true,
    annotations: {
      title: "Restart ComfyUI",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  list_open_workflows: {
    schema: listOpenWorkflowsSchema,
    description:
      "List the workflows currently open in the user's ComfyUI browser tabs, and which have UNSAVED changes. Call this before rewriting a workflow file: a tab holding it will keep showing the old graph and, with autosave on, will write its stale copy back over yours. Requires the ComfyUI-TabBridge custom node.",
    requiresConnection: true,
    annotations: {
      title: "List Open Workflow Tabs",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  flush_workflow: {
    schema: flushWorkflowSchema,
    description:
      "Ask any open tab to SAVE a workflow now, and wait for it to settle. Use before overwriting a workflow so the human's unsaved edits reach disk, where they can be read and taken into account instead of being destroyed by your write. write_workflow does this for you.",
    requiresConnection: true,
    annotations: {
      title: "Flush Workflow Tab",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  reload_workflow: {
    schema: reloadWorkflowSchema,
    description:
      "Tell open tabs to re-read a workflow from disk after it was rewritten. Necessary because ComfyUI restores a workflow from cached session state rather than re-reading the file, so a tab can sit on a stale graph indefinitely and autosave it back. write_workflow does this for you.",
    requiresConnection: true,
    annotations: {
      title: "Reload Workflow Tab",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  read_workflow: {
    schema: readWorkflowSchema,
    description:
      "Read a workflow file as JSON. Reads through ComfyUI so it always sees the current file rather than a cached copy.",
    requiresConnection: true,
    annotations: {
      title: "Read Workflow File",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  write_workflow: {
    schema: writeWorkflowSchema,
    description:
      "Write a workflow file SAFELY: flushes any open tab so unsaved human edits reach disk, diffs the existing file against what you are about to write, writes, then tells the tab to reload. ALWAYS use this instead of writing workflow JSON with a file tool. If the returned diff is non-empty the human had edited that workflow -- read it and fold their intent into what you generate, rather than regenerating it away. Writes go through ComfyUI's user directory by default; other locations must be granted in workflowWriteDirs in the MCP config.",
    requiresConnection: true,
    annotations: {
      title: "Write Workflow File",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  get_install_guide: {
    schema: getInstallGuideSchema,
    description:
      "Get installation instructions for ComfyUI (recommends desktop app for most users)",
    requiresConnection: false,
    annotations: {
      title: "Get Installation Guide",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  get_model_guide: {
    schema: getModelGuideSchema,
    description:
      "Get guidance on downloading and installing models for ComfyUI",
    requiresConnection: false,
    annotations: {
      title: "Get Model Setup Guide",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },

  // === Examples (always available) ===
  list_examples: {
    schema: listExamplesSchema,
    description:
      "List official ComfyUI example workflows from the documentation. RECOMMENDED: Always check examples first before building custom workflows - they provide tested, working templates for common use cases like txt2img, img2img, ControlNet, LoRA, regional prompting, and more.",
    requiresConnection: false,
    annotations: {
      title: "List Example Workflows",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  get_example_workflow: {
    schema: getExampleWorkflowSchema,
    description:
      "Fetch an example workflow (extracts embedded JSON from documentation images). Returns ready-to-use workflow JSON that can be passed directly to run_workflow. Use this as a starting point and modify prompts, models, or parameters as needed.",
    requiresConnection: false,
    annotations: {
      title: "Get Example Workflow",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  extract_workflow: {
    schema: z.object({
      source: z.string().describe("Path to a local PNG file or URL of a PNG image with embedded ComfyUI workflow"),
    }),
    description:
      "Extract the workflow JSON from a ComfyUI-generated PNG image. Works with local file paths or URLs. Returns the workflow in API format that can be passed directly to run_workflow.",
    requiresConnection: false,
    annotations: {
      title: "Extract Workflow from Image",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  recommend_workflow: {
    schema: recommendWorkflowSchema,
    description:
      "IMPORTANT: Call this BEFORE generating images to get the correct workflow and settings for a model. Given a model filename, returns the recommended workflow, optimal settings (steps, CFG, resolution), and prompting guide. Essential for matching checkpoint vs UNET models to the right workflow.",
    requiresConnection: false,
    annotations: {
      title: "Recommend Workflow for Model",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },

  // === Prompting Guides (always available) ===
  get_prompting_guide: {
    schema: z.object({
      modelType: z
        .enum(["sd15", "sdxl", "sd3", "flux", "all"])
        .optional()
        .default("all")
        .describe("Model type to get prompting guide for (sd15, sdxl, sd3, flux, or all)"),
    }),
    description:
      "Get prompting best practices for AI image generation models (SD1.5, SDXL, SD3, Flux)",
    requiresConnection: false,
    annotations: {
      title: "Get Prompting Guide",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },

  // === Generation (requires ComfyUI) ===
  get_capabilities: {
    schema: z.object({}),
    description:
      "Get the detected capabilities of the connected ComfyUI instance",
    requiresConnection: true,
    annotations: {
      title: "Get ComfyUI Capabilities",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  run_workflow: {
    schema: runWorkflowSchema,
    description:
      "Run a custom ComfyUI workflow (API format JSON). Returns immediately with a task ID (async by default). Use get_task to check progress, get_task_result to retrieve results when complete. Set sync:true to wait for completion (blocking). IMPORTANT: Use the 'name' parameter with descriptive names like 'sunset_portrait_v2' or 'logo_design_red' to make generations easy to find later. BEST PRACTICE: Always start from example workflows (list_examples/get_example_workflow) or templates (search_templates/get_template) rather than building workflows from scratch.",
    requiresConnection: true,
    annotations: {
      title: "Run Custom Workflow",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  get_image: {
    schema: getImageSchema,
    description:
      "Retrieve a generated image as base64. Use this to fetch images from ComfyUI's output directory.",
    requiresConnection: true,
    annotations: {
      title: "Get Generated Image",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },

  // === Model Discovery (requires ComfyUI) ===
  list_models: {
    schema: listModelsSchema,
    description:
      "List available models (checkpoints, LoRAs, VAEs, etc.) in ComfyUI",
    requiresConnection: true,
    annotations: {
      title: "List Installed Models",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  list_nodes: {
    schema: listNodesSchema,
    description:
      "List available ComfyUI nodes, optionally filtered by category or search term",
    requiresConnection: true,
    annotations: {
      title: "List Available Nodes",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  get_node_info: {
    schema: getNodeInfoSchema,
    description:
      "Get detailed information about a specific ComfyUI node, including its inputs (with types, defaults, and valid options) and outputs. Essential for understanding how to wire nodes together in workflows.",
    requiresConnection: true,
    annotations: {
      title: "Get Node Info",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  find_nodes_by_type: {
    schema: findNodesByTypeSchema,
    description:
      "Find ComfyUI nodes by their input or output types. Use this to discover which nodes can produce a specific type (e.g., MODEL, LATENT, IMAGE) or which nodes can consume a type. Essential for workflow composition.",
    requiresConnection: true,
    annotations: {
      title: "Find Nodes by Type",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  build_node: {
    schema: buildNodeSchema,
    description:
      "Generate valid node JSON with proper inputs/outputs that can be assembled into a workflow. Provide inputs to override defaults, or leave empty to get a node with default values and placeholders for connections.",
    requiresConnection: true,
    annotations: {
      title: "Build Node JSON",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  validate_workflow: {
    schema: validateWorkflowSchema,
    description:
      "Validate a workflow before running it. Checks that all node types exist, connections are valid, required inputs are provided, and types match. Returns errors and warnings.",
    requiresConnection: true,
    annotations: {
      title: "Validate Workflow",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },

  // === Template System ===
  search_templates: {
    schema: searchTemplatesSchema,
    description:
      "Search for workflow templates by model type, task type, category, or text. Returns templates from built-in workflows, ComfyUI examples, and custom saved templates. Use get_template to generate workflow JSON from a template.",
    requiresConnection: false,
    annotations: {
      title: "Search Workflow Templates",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  get_template: {
    schema: getTemplateSchema,
    description:
      "Generate workflow JSON from a template with provided parameters. Returns a complete workflow that can be passed to run_workflow. Works with built-in and custom saved templates.",
    requiresConnection: true,
    annotations: {
      title: "Get Workflow from Template",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  save_template: {
    schema: saveTemplateSchema,
    description:
      "Save a workflow as a reusable template. Use descriptive names that indicate the purpose (e.g., 'portrait_lighting_studio', 'product_photo_white_bg'). Templates are stored persistently and can be searched and retrieved later.",
    requiresConnection: false,
    annotations: {
      title: "Save Custom Template",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  delete_template: {
    schema: deleteTemplateSchema,
    description: "Delete a custom saved template. Built-in templates cannot be deleted.",
    requiresConnection: false,
    annotations: {
      title: "Delete Custom Template",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  get_download_url: {
    schema: getDownloadUrlSchema,
    description:
      "Get the download URL for a model by name. Searches common model names and returns download URLs, destinations, and wget commands. Useful for helping users download missing models.",
    requiresConnection: false,
    annotations: {
      title: "Get Model Download URL",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },

  // === Queue Management (requires ComfyUI) ===
  get_queue: {
    schema: getQueueSchema,
    description: "Get the current ComfyUI queue status",
    requiresConnection: true,
    annotations: {
      title: "Get Queue Status",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  cancel_job: {
    schema: cancelJobSchema,
    description: "Cancel a queued job by prompt ID. NOTE: This only works for jobs that are queued (pending), NOT for jobs that are already running. To stop a running job, use the 'interrupt' tool instead.",
    requiresConnection: true,
    annotations: {
      title: "Cancel Job",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  interrupt: {
    schema: interruptSchema,
    description: "Interrupt the currently running job. Use this to stop a job that is actively generating. For queued jobs that haven't started yet, use 'cancel_job' instead.",
    requiresConnection: true,
    annotations: {
      title: "Interrupt Current Job",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  get_history: {
    schema: getHistorySchema,
    description: "Get generation history",
    requiresConnection: true,
    annotations: {
      title: "Get Generation History",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },

  // === Task Management (for async operations) ===
  get_task: {
    schema: z.object({
      taskId: z.string().describe("The task ID to get status for"),
    }),
    description: "Get the current status of an async generation task. Returns progress info including current step, total steps, average step time, estimated remaining time, and a suggested poll interval based on generation speed.",
    requiresConnection: false, // Jobs are tracked locally
    annotations: {
      title: "Get Task Status",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  get_task_result: {
    schema: z.object({
      taskId: z.string().describe("The task ID to get results for"),
    }),
    description: "Get the result of a completed generation task (images)",
    requiresConnection: false,
    annotations: {
      title: "Get Task Result",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  list_tasks: {
    schema: z.object({
      status: z
        .enum(["working", "completed", "failed", "cancelled"])
        .optional()
        .describe("Filter tasks by status"),
    }),
    description: "List all generation tasks, optionally filtered by status",
    requiresConnection: false,
    annotations: {
      title: "List Tasks",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  cancel_task: {
    schema: z.object({
      taskId: z.string().describe("The task ID to cancel"),
    }),
    description: "Cancel an async generation task. For queued tasks, this cancels the ComfyUI job. For tasks that are already running, this only removes the task from tracking - use 'interrupt' to actually stop the running generation.",
    requiresConnection: true, // Need to cancel in ComfyUI too
    annotations: {
      title: "Cancel Task",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  get_generation_by_name: {
    schema: z.object({
      name: z.string().describe("The name assigned to the generation"),
    }),
    description: "Retrieve a generation by its user-assigned name. Returns the same format as get_task_result.",
    requiresConnection: false,
    annotations: {
      title: "Get Generation by Name",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  name_generation: {
    schema: z.object({
      taskId: z.string().describe("The task ID to name"),
      name: z.string().describe("The name to assign - use descriptive names like 'hero_banner_blue' or 'product_shot_v3' that clearly identify the content"),
    }),
    description: "Assign a descriptive name to an existing generation for easy retrieval. Use clear, searchable names that describe the content (e.g., 'landscape_sunset_warm', 'logo_draft_2', 'character_portrait_final').",
    requiresConnection: false,
    annotations: {
      title: "Name Generation",
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },

  // === Notes (for agent memory/learning) ===
  save_note: {
    schema: z.object({
      topic: z.string().describe("The topic/category of the note (e.g., 'flux-models', 'prompting-tips', 'workflow-patterns')"),
      content: z.string().describe("The content of the note"),
      tags: z.array(z.string()).optional().describe("Optional tags for categorization"),
    }),
    description: "Save a note about something learned during image generation. Useful for remembering model behaviors, prompting techniques, workflow patterns, etc.",
    requiresConnection: false,
    annotations: {
      title: "Save Note",
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  get_notes: {
    schema: z.object({
      topic: z.string().optional().describe("Filter notes by topic"),
      limit: z.number().optional().default(50).describe("Maximum number of notes to return"),
    }),
    description: "Retrieve saved notes, optionally filtered by topic.",
    requiresConnection: false,
    annotations: {
      title: "Get Notes",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  search_notes: {
    schema: z.object({
      query: z.string().describe("Search query (searches topic, content, and tags)"),
      limit: z.number().optional().default(50).describe("Maximum number of notes to return"),
    }),
    description: "Search notes using full-text search.",
    requiresConnection: false,
    annotations: {
      title: "Search Notes",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  delete_note: {
    schema: z.object({
      id: z.number().describe("The ID of the note to delete"),
    }),
    description: "Delete a note by its ID.",
    requiresConnection: false,
    annotations: {
      title: "Delete Note",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  list_topics: {
    schema: z.object({}),
    description: "List all unique topics that have notes.",
    requiresConnection: false,
    annotations: {
      title: "List Note Topics",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },

  get_user_preferences: {
    schema: z.object({
      includeWorkflows: z.boolean().optional().default(true).describe("Include workflow templates"),
      includeModels: z.boolean().optional().default(true).describe("Include model usage stats"),
      includeSettings: z.boolean().optional().default(true).describe("Include common settings"),
      workflowLimit: z.number().optional().default(20).describe("Max workflow templates to return"),
      modelLimit: z.number().optional().default(30).describe("Max models to return"),
    }),
    description:
      "Get user preferences extracted from analyzing their ComfyUI output history. Returns commonly used workflows (as reusable templates), frequently used models, and preferred settings.",
    requiresConnection: true, // Need capabilities which contain the preferences
    annotations: {
      title: "Get User Preferences",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },

  // === SVG Tools ===
  render_svg: {
    schema: renderSvgSchema,
    description:
      "Render SVG content to PNG and save to ComfyUI's input folder. Returns filename for use in LoadImage nodes. Useful for creating precise base images for img2img workflows.",
    requiresConnection: true, // Need ComfyUI path for input folder
    annotations: {
      title: "Render SVG to PNG",
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },

  // === Font Tools ===
  download_font: {
    schema: downloadFontSchema,
    description:
      "Download a font from Google Fonts or a direct URL for use in SVG rendering. Fonts are cached locally and can be embedded in SVGs via render_svg. Popular fantasy/map fonts: Cinzel, Pirata One, MedievalSharp, UnifrakturMaguntia, Almendra.",
    requiresConnection: false,
    annotations: {
      title: "Download Font",
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  list_fonts: {
    schema: listFontsSchema,
    description:
      "List all downloaded fonts available for use in SVG rendering.",
    requiresConnection: false,
    annotations: {
      title: "List Downloaded Fonts",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
};

// Tool type for list tools response
interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
  annotations?: ToolAnnotations;
}

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools: Tool[] = [];

  for (const [name, { schema, description, annotations }] of Object.entries(TOOLS)) {
    tools.push({
      name,
      description,
      inputSchema: zodToJsonSchema(schema, { target: "jsonSchema7" }) as Tool["inputSchema"],
      annotations,
    });
  }

  return { tools };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // === Status & Setup ===
      case "get_status": {
        // Always probe live - "is this working right now" is the whole point of
        // this tool, so it never reports cached connection state.
        debug("Starting status check...", undefined, "get_status");
        const refresh = await refreshConnection();
        const isConnected = refresh.connected;
        debug(`Final isConnected: ${isConnected}`, undefined, "get_status");

        const status = await getStatus(
          isConnected,
          ctx.discoveredUrl || undefined,
          ctx.discoverySource || undefined,
          ctx.capabilities ? getCapabilitySummary(ctx.capabilities) : undefined
        );

        if (!isConnected) {
          (status as unknown as Record<string, unknown>).error = refresh.error;
          (status as unknown as Record<string, unknown>).urlsTried =
            getCandidateUrls(ctx.config.comfyui.url);
        }

        if (refresh.reconciled && (refresh.reconciled.completed > 0 || refresh.reconciled.failed > 0)) {
          (status as unknown as Record<string, unknown>).reconciledTasks = refresh.reconciled;
        }

        // Add prompting guide advice when connected
        if (isConnected && ctx.capabilities) {
          let modelType = "sd15";
          if (ctx.capabilities.hasFlux) modelType = "flux";
          else if (ctx.capabilities.hasSD3) modelType = "sd3";
          else if (ctx.capabilities.hasSDXL) modelType = "sdxl";

          (status as unknown as Record<string, unknown>).promptingAdvice = {
            detectedModelType: modelType,
            recommendation: `Before generating images, call get_prompting_guide('${modelType}') to learn the correct prompting style for best results.`,
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
        };
      }

      case "reconnect": {
        const refresh = await refreshConnection();

        if (!refresh.connected) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    connected: false,
                    error: refresh.error,
                    urlsTried: getCandidateUrls(ctx.config.comfyui.url),
                    hint: "Start ComfyUI and run 'reconnect' again. 'get_install_guide' has setup help.",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  connected: true,
                  url: refresh.url,
                  discoverySource: refresh.source,
                  capabilities: ctx.capabilities
                    ? getCapabilitySummary(ctx.capabilities)
                    : undefined,
                  nodeCount: ctx.objectInfo ? Object.keys(ctx.objectInfo).length : 0,
                  reconciledTasks: refresh.reconciled,
                  note: "Model and node lists were re-read from ComfyUI.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "start_comfyui": {
        const input = startComfyUISchema.parse(args) as StartComfyUIInput;

        // Probe live rather than trusting cached state: acting on a stale
        // "disconnected" would start a second ComfyUI on a second port and
        // quietly split the user's queue across both.
        const existing = await refreshConnection();
        if (existing.connected) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    started: false,
                    alreadyRunning: true,
                    url: existing.url,
                    discoverySource: existing.source,
                    capabilities: ctx.capabilities
                      ? getCapabilitySummary(ctx.capabilities)
                      : undefined,
                    reconciledTasks: existing.reconciled,
                    note: "ComfyUI is already running; nothing was launched. Use restart_comfyui to restart it.",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const blocked = launchBlockedReason(
          process.env.COMFYUI_URL || ctx.config.comfyui.url
        );
        if (blocked) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ started: false, reason: blocked }, null, 2),
              },
            ],
            isError: true,
          };
        }

        const { target, detected } = resolveLaunchTarget(input);
        if (!target) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    started: false,
                    reason:
                      "No ComfyUI installation was found in the usual locations.",
                    hint:
                      "Pass 'command' with the path to your launcher, set COMFYUI_LAUNCH_COMMAND, " +
                      "or see 'get_install_guide' if ComfyUI is not installed yet.",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        const alternatives = detected
          .filter((option) => option.label !== target.label)
          .map((option) => option.label);

        const startedAt = Date.now();
        let launch: Awaited<ReturnType<typeof spawnComfyUI>>;
        try {
          launch = await spawnComfyUI(target);
        } catch (spawnError) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    started: false,
                    launcher: target.label,
                    command: target.command,
                    error:
                      spawnError instanceof Error
                        ? spawnError.message
                        : String(spawnError),
                    alternatives,
                    hint: "Pass 'command' to launch a different executable, or start ComfyUI yourself and call 'reconnect'.",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        info(
          `Launched ComfyUI via ${target.label} (pid ${launch.pid})`,
          undefined,
          "launch"
        );

        const recovery = await waitForRestart(input.timeoutSeconds * 1000);
        const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);

        if (!recovery.connected) {
          const exit = launch.exited();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    started: true,
                    connected: false,
                    launcher: target.label,
                    command: target.command,
                    pid: launch.pid,
                    waitedSeconds: elapsedSeconds,
                    launcherExit: exit ?? undefined,
                    error: recovery.error,
                    alternatives,
                    hint: exit
                      ? "The launcher exited before ComfyUI answered, so it likely failed to start. Run the command in a terminal to see its output."
                      : "The process is still running but has not answered yet - a cold start can take a while. Call 'reconnect' in a moment.",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  started: true,
                  connected: true,
                  launcher: target.label,
                  command: target.command,
                  pid: launch.pid,
                  elapsedSeconds,
                  url: recovery.url,
                  discoverySource: recovery.source,
                  capabilities: ctx.capabilities
                    ? getCapabilitySummary(ctx.capabilities)
                    : undefined,
                  nodeCount: ctx.objectInfo
                    ? Object.keys(ctx.objectInfo).length
                    : 0,
                  reconciledTasks: recovery.reconciled,
                  note: "ComfyUI is running and detached from this server - it keeps running if the MCP server restarts.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "restart_comfyui": {
        const input = restartComfyUISchema.parse(args) as RestartComfyUIInput;
        const { client } = await ensureConnected();
        const restartingUrl = ctx.discoveredUrl;

        // A restart drops whatever ComfyUI is working on, so don't pull it out
        // from under a running generation unless explicitly told to.
        if (!input.force) {
          const queue = await client.getQueue();
          const busy = queue.queue_running.length + queue.queue_pending.length;
          if (busy > 0) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      restarted: false,
                      reason: `${busy} generation(s) running or queued. Restarting would drop them.`,
                      hint: "Wait for them to finish, cancel them with cancel_task, or call restart_comfyui again with force: true.",
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }

        const startedAt = Date.now();
        const { endpoint } = await client.requestRestart();
        info(`Asked ComfyUI to restart via ${endpoint}`, undefined, "restart");

        const observedShutdown = await waitForShutdown();
        const recovery = await waitForRestart(input.timeoutSeconds * 1000);
        const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);

        if (!recovery.connected) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    restarted: true,
                    recovered: false,
                    endpoint,
                    observedShutdown,
                    waitedSeconds: elapsedSeconds,
                    error: recovery.error,
                    hint: observedShutdown
                      ? "ComfyUI shut down but has not come back yet. It may still be loading - call 'reconnect' in a moment. This server does not need restarting."
                      : "ComfyUI never went offline, so the restart may not have been accepted. Check ComfyUI's console output.",
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  restarted: true,
                  recovered: true,
                  endpoint,
                  observedShutdown,
                  elapsedSeconds,
                  url: recovery.url,
                  movedFrom:
                    restartingUrl && restartingUrl !== recovery.url
                      ? restartingUrl
                      : undefined,
                  discoverySource: recovery.source,
                  capabilities: ctx.capabilities
                    ? getCapabilitySummary(ctx.capabilities)
                    : undefined,
                  nodeCount: ctx.objectInfo ? Object.keys(ctx.objectInfo).length : 0,
                  reconciledTasks: recovery.reconciled,
                  note: observedShutdown
                    ? "ComfyUI restarted; model and node lists were re-read."
                    : "ComfyUI is reachable and its model and node lists were re-read, but it was never observed going offline - it may have restarted too quickly to see, or not restarted at all.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "list_open_workflows": {
        await ensureConnected();
        const base = ctx.discoveredUrl!;
        const state = await getTabState(base);
        if (!state) {
          return {
            content: [{ type: "text", text: JSON.stringify({ available: false, hint: BRIDGE_MISSING_HINT }, null, 2) }],
          };
        }
        return { content: [{ type: "text", text: JSON.stringify(state, null, 2) }] };
      }

      case "flush_workflow": {
        const input = flushWorkflowSchema.parse(args) as FlushWorkflowInput;
        await ensureConnected();
        const result = await flushWorkflow(ctx.discoveredUrl!, input.path, input.wait_seconds ?? 4);
        return {
          content: [{ type: "text", text: JSON.stringify({
            ...result,
            hint: result.requested ? undefined : BRIDGE_MISSING_HINT,
          }, null, 2) }],
        };
      }

      case "reload_workflow": {
        const input = reloadWorkflowSchema.parse(args) as ReloadWorkflowInput;
        await ensureConnected();
        const ok = await reloadWorkflow(ctx.discoveredUrl!, input.path, input.save_first !== false);
        return {
          content: [{ type: "text", text: JSON.stringify({
            requested: ok, hint: ok ? undefined : BRIDGE_MISSING_HINT,
          }, null, 2) }],
        };
      }

      case "read_workflow": {
        const input = readWorkflowSchema.parse(args) as ReadWorkflowInput;
        await ensureConnected();
        try {
          const wf = await readWorkflowFile(ctx.discoveredUrl!, input.path, ctx.config.workflowWriteDirs ?? []);
          if (wf === null) {
            return { content: [{ type: "text", text: JSON.stringify({ found: false, path: input.path }, null, 2) }] };
          }
          return { content: [{ type: "text", text: JSON.stringify(wf, null, 2) }] };
        } catch (err) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }, null, 2) }],
            isError: true,
          };
        }
      }

      case "write_workflow": {
        const input = writeWorkflowSchema.parse(args) as WriteWorkflowInput;
        await ensureConnected();
        const base = ctx.discoveredUrl!;
        const granted = ctx.config.workflowWriteDirs ?? [];

        // 1. Flush, so unsaved hand edits land on disk and show up in the
        //    diff below instead of being destroyed by this write.
        let flushed = null;
        if (!input.skip_flush) {
          flushed = await flushWorkflow(base, input.path, 4);
        }

        // 2. Diff what is there against what we are about to write.
        let diff = null;
        try {
          const existing = await readWorkflowFile(base, input.path, granted);
          if (existing) diff = diffWorkflows(existing, input.workflow);
        } catch {
          // Unreadable or absent: nothing to compare, carry on and write.
        }

        // 3. Write.
        let written: string;
        try {
          written = await writeWorkflowFile(base, input.path, input.workflow, granted);
        } catch (err) {
          const permission = err instanceof WriteNotPermittedError;
          return {
            content: [{ type: "text", text: JSON.stringify({
              written: false,
              reason: err instanceof Error ? err.message : String(err),
              ...(permission ? { how_to_allow: "Add the directory to workflowWriteDirs in the MCP config file. There is no tool for this on purpose -- it is the human's decision." } : {}),
            }, null, 2) }],
            isError: true,
          };
        }

        // 4. Reload, so the tab is not left on the old graph.
        let reloaded = false;
        if (!input.skip_reload) {
          reloaded = await reloadWorkflow(base, input.path, true);
        }

        return {
          content: [{ type: "text", text: JSON.stringify({
            written: true,
            path: written,
            flushed,
            reloaded,
            human_edits_detected: diff?.any ?? false,
            ...(diff?.any ? {
              their_changes: diff.summary,
              action_required: "The human had edited this workflow. Those edits were just overwritten. Read the diff, work out what they were doing, and fold it into the generator so it survives the next regeneration.",
            } : {}),
          }, null, 2) }],
        };
      }

      case "get_install_guide": {
        const input = getInstallGuideSchema.parse(args) as GetInstallGuideInput;
        const guide = getInstallGuide(input);
        return { content: [{ type: "text", text: guide }] };
      }

      case "get_model_guide": {
        const input = getModelGuideSchema.parse(args) as GetModelGuideInput;
        const guide = getModelGuide(input);
        return { content: [{ type: "text", text: guide }] };
      }

      // === Examples ===
      case "list_examples": {
        const input = listExamplesSchema.parse(args) as ListExamplesInput;
        const result = listExamples(input);
        return { content: [{ type: "text", text: result }] };
      }

      case "get_example_workflow": {
        const input = getExampleWorkflowSchema.parse(args) as GetExampleWorkflowInput;
        const result = await getExampleWorkflow(input);
        return { content: [{ type: "text", text: result }] };
      }

      case "extract_workflow": {
        const input = args as { source: string };
        const source = input.source;

        let imageData: ArrayBuffer;

        // Check if it's a URL or file path
        if (source.startsWith("http://") || source.startsWith("https://")) {
          // Fetch from URL
          try {
            const response = await safeFetch(source);
            if (!response.ok) {
              return {
                content: [{ type: "text", text: `Failed to fetch image: ${response.status} ${response.statusText}` }],
                isError: true,
              };
            }
            imageData = await response.arrayBuffer();
          } catch (err) {
            return {
              content: [{ type: "text", text: `Failed to fetch image: ${err}` }],
              isError: true,
            };
          }
        } else {
          // Read from local file
          if (!/\.png$/i.test(source)) {
            return {
              content: [{ type: "text", text: "Local file source must be a .png file" }],
              isError: true,
            };
          }
          try {
            const stats = await stat(source);
            if (!stats.isFile()) {
              return {
                content: [{ type: "text", text: `Not a file: ${source}` }],
                isError: true,
              };
            }
            if (stats.size > MAX_LOCAL_IMAGE_BYTES) {
              return {
                content: [{ type: "text", text: `File too large (${stats.size} bytes, max ${MAX_LOCAL_IMAGE_BYTES})` }],
                isError: true,
              };
            }
            const buffer = await readFile(source);
            imageData = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
          } catch (err) {
            return {
              content: [{ type: "text", text: `Failed to read file: ${err}` }],
              isError: true,
            };
          }
        }

        // Extract workflow from PNG
        const metadata = await extractWorkflowFromPng(imageData);

        if (!metadata) {
          return {
            content: [{ type: "text", text: "No workflow metadata found in image. Make sure it's a ComfyUI-generated PNG." }],
            isError: true,
          };
        }

        // Prefer prompt (API format) over workflow (UI format) for execution
        const workflow = metadata.prompt || metadata.workflow;

        // Extract notes/documentation from UI format if available
        const notes: string[] = [];
        if (metadata.workflow) {
          const uiWorkflow = metadata.workflow as { nodes?: Array<{ type?: string; widgets_values?: unknown[]; properties?: { text?: string } }> };
          if (uiWorkflow.nodes && Array.isArray(uiWorkflow.nodes)) {
            for (const node of uiWorkflow.nodes) {
              // Note nodes typically have type "Note" or similar
              if (node.type === "Note" || node.type === "PrimitiveNode") {
                // Notes often store text in widgets_values[0] or properties.text
                const noteText = node.widgets_values?.[0] || node.properties?.text;
                if (typeof noteText === "string" && noteText.trim()) {
                  notes.push(noteText.trim());
                }
              }
            }
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                source,
                hasPrompt: !!metadata.prompt,
                hasWorkflow: !!metadata.workflow,
                workflow,
                notes: notes.length > 0 ? notes : undefined,
                hint: "Pass the 'workflow' field directly to run_workflow to execute this workflow.",
              }, null, 2),
            },
          ],
        };
      }

      case "recommend_workflow": {
        const input = recommendWorkflowSchema.parse(args) as RecommendWorkflowInput;
        const recommendation = await recommendWorkflow(input);
        const formatted = formatWorkflowRecommendation(recommendation);
        return {
          content: [
            { type: "text", text: formatted },
            { type: "text", text: "\n---\n\n**Raw recommendation data:**\n```json\n" + JSON.stringify(recommendation, null, 2) + "\n```" },
          ],
        };
      }

      // === Prompting Guides ===
      case "get_prompting_guide": {
        const input = args as { modelType?: string };
        const modelType = input.modelType || "all";

        if (modelType === "all") {
          const guide = getComprehensiveGuide();
          return { content: [{ type: "text", text: guide }] };
        }

        const guide = getPromptingGuide(modelType);
        if (!guide) {
          return {
            content: [
              {
                type: "text",
                text: `Unknown model type: ${modelType}. Available types: ${Object.keys(PROMPTING_GUIDES).join(", ")}`,
              },
            ],
            isError: true,
          };
        }

        return { content: [{ type: "text", text: formatPromptingGuide(guide) }] };
      }

      // === Generation ===
      case "get_capabilities": {
        const { capabilities } = await ensureConnected();

        // Determine primary model type for prompting guidance
        let promptingAdvice = "";
        if (capabilities.hasFlux) {
          promptingAdvice = "Primary model type: FLUX. Use natural language prompts. No negative prompts or weights supported. Call get_prompting_guide('flux') for detailed guidance.";
        } else if (capabilities.hasSD3) {
          promptingAdvice = "Primary model type: SD3. Use natural language prompts. No prompt weights. Call get_prompting_guide('sd3') for detailed guidance.";
        } else if (capabilities.hasSDXL) {
          promptingAdvice = "Primary model type: SDXL. Supports both natural language and keywords. Weights supported (0.8-1.4). Call get_prompting_guide('sdxl') for detailed guidance.";
        } else {
          promptingAdvice = "Primary model type: SD1.5. Use keyword-style prompts with quality boosters. Negative prompts essential. Call get_prompting_guide('sd15') for detailed guidance.";
        }

        // Build user preferences summary if available
        let userPreferencesSummary = null;
        if (capabilities.userPreferences) {
          const prefs = capabilities.userPreferences;
          userPreferencesSummary = {
            totalImages: prefs.totalImagesAnalyzed,
            imagesWithWorkflows: prefs.imagesWithWorkflows,
            uniqueWorkflows: prefs.uniqueWorkflows,
            topModels: prefs.modelUsage.slice(0, 5).map((m) => ({
              name: m.name,
              type: m.type,
              usageCount: m.usageCount,
            })),
            topWorkflows: prefs.workflowTemplates.slice(0, 5).map((wf) => ({
              description: wf.description,
              usageCount: wf.usageCount,
              models: wf.models,
              samplePrompts: wf.samplePrompts.slice(0, 3),
            })),
            preferredSettings: prefs.commonSettings,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  summary: getCapabilitySummary(capabilities),
                  promptingAdvice,
                  importantNote: "BEFORE generating images, call get_prompting_guide with your model type to learn the correct prompting style. Using the wrong prompting style significantly degrades output quality.",
                  userPreferences: userPreferencesSummary,
                  details: {
                    ...capabilities,
                    userPreferences: undefined, // Already included above in summary form
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "run_workflow": {
        const { client, ws } = await ensureConnected();
        const input = runWorkflowSchema.parse(args) as RunWorkflowInput;

        // Check if sync mode is requested
        if (input.sync) {
          // Synchronous mode - wait for completion
          const result = await runWorkflow(
            client,
            ws,
            input,
            ctx.config.outputDir,
            ctx.config.outputSizeThreshold
          );

          // Store the job in the database so named generations work
          if (result.promptId) {
            ctx.jobManager.createJob(result.promptId, {
              type: "run_workflow",
              input,
            }, input.name);

            if (result.success) {
              ctx.jobManager.completeJob(result.promptId, result);
            } else {
              ctx.jobManager.failJob(result.promptId, result.error || "Unknown error");
            }
          }

          if (!result.success) {
            return {
              content: [{ type: "text", text: `Error: ${result.error}` }],
              isError: true,
            };
          }

          const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [
            {
              type: "text",
              text: `Workflow completed (prompt_id: ${result.promptId})`,
            },
          ];

          for (const img of result.images) {
            if (img.data) {
              content.push({
                type: "image",
                data: img.data,
                mimeType: img.mimeType || "image/jpeg",
              });
            } else if (img.path) {
              content.push({
                type: "text",
                text: `Saved: ${img.path}`,
              });
            }
          }

          return { content };
        }

        // Async mode (default) - return immediately with task ID
        const asyncResult = await runWorkflowAsync(
          ctx.server,
          ctx.jobManager,
          client,
          ws,
          input,
          ctx.config.outputDir,
          ctx.config.outputSizeThreshold
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                taskId: asyncResult.taskId,
                promptId: asyncResult.promptId,
                status: asyncResult.status,
                statusMessage: asyncResult.statusMessage,
                pollInterval: asyncResult.pollInterval,
                hint: "Workflow started in background. Use get_task to check status, or get_task_result when complete.",
              }, null, 2),
            },
          ],
        };
      }

      case "get_image": {
        const { client } = await ensureConnected();
        const input = getImageSchema.parse(args) as GetImageInput;
        const result = await getImage(client, input);

        if (!result.success) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "image",
              data: result.data,
              mimeType: result.mimeType || "image/png",
            },
          ],
        };
      }

      // === Model Discovery ===
      case "list_models": {
        const { client } = await ensureConnected();
        const input = listModelsSchema.parse(args) as ListModelsInput;
        const result = await listModels(client, input);
        return { content: [{ type: "text", text: result }] };
      }

      case "list_nodes": {
        const { client } = await ensureConnected();
        const input = listNodesSchema.parse(args) as ListNodesInput;
        const result = await listNodes(client, input);
        return { content: [{ type: "text", text: result }] };
      }

      case "get_node_info": {
        const { client } = await ensureConnected();
        const input = getNodeInfoSchema.parse(args) as GetNodeInfoInput;
        const result = await getNodeInfo(client, input);
        return { content: [{ type: "text", text: result }] };
      }

      case "find_nodes_by_type": {
        const { client } = await ensureConnected();
        const input = findNodesByTypeSchema.parse(args) as FindNodesByTypeInput;
        const result = await findNodesByType(client, input);
        return { content: [{ type: "text", text: result }] };
      }

      case "build_node": {
        const { client } = await ensureConnected();
        const input = buildNodeSchema.parse(args) as BuildNodeInput;
        const result = await buildNode(client, input);
        return { content: [{ type: "text", text: result }] };
      }

      case "validate_workflow": {
        const { client } = await ensureConnected();
        const input = validateWorkflowSchema.parse(args) as ValidateWorkflowInput;
        const result = await validateWorkflow(client, input);
        return { content: [{ type: "text", text: result }] };
      }

      // === Template System ===
      case "search_templates": {
        const input = searchTemplatesSchema.parse(args) as SearchTemplatesInput;
        const result = searchTemplates(input);
        return { content: [{ type: "text", text: result }] };
      }

      case "get_template": {
        const { client } = await ensureConnected();
        const input = getTemplateSchema.parse(args) as GetTemplateInput;
        const result = await getTemplate(client, input);
        return { content: [{ type: "text", text: result }] };
      }

      case "save_template": {
        const input = saveTemplateSchema.parse(args) as SaveTemplateInput;
        const result = saveCustomTemplate(input);
        return { content: [{ type: "text", text: result }] };
      }

      case "delete_template": {
        const input = deleteTemplateSchema.parse(args) as DeleteTemplateInput;
        const result = deleteCustomTemplate(input);
        return { content: [{ type: "text", text: result }] };
      }

      case "get_download_url": {
        const input = getDownloadUrlSchema.parse(args) as GetDownloadUrlInput;
        const result = getDownloadUrl(input);
        return { content: [{ type: "text", text: result }] };
      }

      // === Queue Management ===
      case "get_queue": {
        const { client } = await ensureConnected();
        const result = await getQueue(client);
        return { content: [{ type: "text", text: result }] };
      }

      case "cancel_job": {
        const { client } = await ensureConnected();
        const input = cancelJobSchema.parse(args) as CancelJobInput;
        const result = await cancelJob(client, input);
        return { content: [{ type: "text", text: result }] };
      }

      case "interrupt": {
        const { client } = await ensureConnected();
        const result = await interrupt(client);
        return { content: [{ type: "text", text: result }] };
      }

      case "get_history": {
        const { client } = await ensureConnected();
        const input = getHistorySchema.parse(args) as GetHistoryInput;
        const result = await getHistory(client, input);
        return { content: [{ type: "text", text: result }] };
      }

      // === Task Management ===
      case "get_task": {
        const input = args as { taskId: string };
        const job = ctx.jobManager.getJob(input.taskId);
        if (!job) {
          return {
            content: [{ type: "text", text: `Task not found: ${input.taskId}` }],
            isError: true,
          };
        }

        // Build response with optional timing stats
        const response: Record<string, unknown> = {
          taskId: job.taskId,
          promptId: job.promptId,
          status: job.status,
          statusMessage: job.statusMessage,
          createdAt: job.createdAt,
          lastUpdatedAt: job.lastUpdatedAt,
          error: job.error,
          name: job.name,
        };

        // Include timing stats if available
        if (job.progressStats) {
          response.progress = {
            currentStep: job.progressStats.currentStep,
            totalSteps: job.progressStats.totalSteps,
            currentNode: job.progressStats.currentNode,
            avgStepTimeMs: job.progressStats.avgStepTimeMs,
            estimatedRemainingMs: job.progressStats.estimatedRemainingMs,
          };

          // Add suggested poll interval based on timing
          if (job.progressStats.avgStepTimeMs) {
            // Suggest polling at half the average step time, min 500ms, max 10s
            const suggestedPollMs = Math.max(500, Math.min(10000, Math.round(job.progressStats.avgStepTimeMs / 2)));
            response.suggestedPollIntervalMs = suggestedPollMs;
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      case "get_task_result": {
        const input = args as { taskId: string };
        const job = ctx.jobManager.getJob(input.taskId);
        if (!job) {
          return {
            content: [{ type: "text", text: `Task not found: ${input.taskId}` }],
            isError: true,
          };
        }

        if (job.status === "working") {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  taskId: job.taskId,
                  status: job.status,
                  statusMessage: job.statusMessage,
                  hint: "Task is still in progress. Check again later or wait for completion notification.",
                }, null, 2),
              },
            ],
          };
        }

        if (job.status === "failed") {
          return {
            content: [{ type: "text", text: `Task failed: ${job.error}` }],
            isError: true,
          };
        }

        if (job.status === "cancelled") {
          return {
            content: [{ type: "text", text: "Task was cancelled" }],
            isError: true,
          };
        }

        // Task completed - return the result with images
        if (!job.result) {
          return {
            content: [{ type: "text", text: "No result available" }],
            isError: true,
          };
        }

        const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [
          {
            type: "text",
            text: `Task ${job.taskId} completed. Generated ${job.result.images.length} image(s).`,
          },
        ];

        for (const img of job.result.images) {
          if (img.data) {
            content.push({
              type: "image",
              data: img.data,
              mimeType: img.mimeType || "image/jpeg",
            });
          } else if (img.path) {
            content.push({
              type: "text",
              text: `Saved: ${img.path}`,
            });
          }
        }

        return { content };
      }

      case "list_tasks": {
        const input = args as { status?: "working" | "completed" | "failed" | "cancelled" };
        const jobs = ctx.jobManager.listJobs(input.status);
        const counts = ctx.jobManager.getJobCounts();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                summary: counts,
                tasks: jobs.map((j) => ({
                  taskId: j.taskId,
                  status: j.status,
                  statusMessage: j.statusMessage,
                  createdAt: j.createdAt,
                  lastUpdatedAt: j.lastUpdatedAt,
                  name: j.name,
                })),
              }, null, 2),
            },
          ],
        };
      }

      case "cancel_task": {
        const { client } = await ensureConnected();
        const input = args as { taskId: string };
        const job = ctx.jobManager.getJob(input.taskId);

        if (!job) {
          return {
            content: [{ type: "text", text: `Task not found: ${input.taskId}` }],
            isError: true,
          };
        }

        if (job.status !== "working") {
          return {
            content: [{ type: "text", text: `Task is not running (status: ${job.status})` }],
            isError: true,
          };
        }

        // Cancel in ComfyUI
        try {
          await cancelJob(client, { promptId: job.promptId });
        } catch {
          // Job might already be done in ComfyUI
        }

        // Mark as cancelled in job manager
        ctx.jobManager.cancelJob(input.taskId);

        return {
          content: [
            {
              type: "text",
              text: `Task ${input.taskId} cancelled successfully`,
            },
          ],
        };
      }

      case "get_generation_by_name": {
        const input = args as { name: string };
        const job = ctx.jobManager.getJobByName(input.name);
        if (!job) {
          return {
            content: [{ type: "text", text: `No generation found with name: ${input.name}` }],
            isError: true,
          };
        }

        if (job.status === "working") {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  name: job.name,
                  taskId: job.taskId,
                  status: job.status,
                  statusMessage: job.statusMessage,
                  hint: "Generation is still in progress. Check again later.",
                }, null, 2),
              },
            ],
          };
        }

        if (job.status === "failed") {
          // Check if the job actually completed in ComfyUI (timeout might have occurred but generation finished)
          if (job.error?.includes("timed out") && ctx.client) {
            try {
              const history = await ctx.client.getHistory(job.promptId);
              const historyEntry = history[job.promptId];
              if (historyEntry?.status?.completed && historyEntry.outputs) {
                // Generation actually completed! Recover the result
                const images: Array<{ filename: string; data?: string; mimeType?: string; path?: string }> = [];
                for (const [_nodeId, output] of Object.entries(historyEntry.outputs)) {
                  const nodeOutput = output as { images?: Array<{ filename: string; subfolder: string; type: string }> };
                  if (nodeOutput.images) {
                    for (const img of nodeOutput.images) {
                      const imageData = await ctx.client!.getImage(img.filename, img.subfolder, img.type);
                      const imageBuffer = Buffer.from(imageData);
                      const processed = await processImageForTransfer(imageBuffer, {
                        format: "jpeg",
                        quality: 85,
                      });
                      images.push({
                        filename: img.filename,
                        data: processed.data,
                        mimeType: processed.mimeType,
                      });
                    }
                  }
                }

                // Update job status to completed
                const recoveredResult = {
                  success: true,
                  promptId: job.promptId,
                  outputs: historyEntry.outputs,
                  images,
                };
                ctx.jobManager.completeJob(job.taskId, recoveredResult);

                // Return the recovered result
                const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [
                  {
                    type: "text",
                    text: `Generation "${input.name}" recovered from timeout. ${images.length} image(s).`,
                  },
                ];
                for (const img of images) {
                  if (img.data) {
                    content.push({
                      type: "image",
                      data: img.data,
                      mimeType: img.mimeType || "image/jpeg",
                    });
                  }
                }
                return { content };
              }
            } catch {
              // Failed to recover, fall through to error
            }
          }
          return {
            content: [{ type: "text", text: `Generation "${input.name}" failed: ${job.error}` }],
            isError: true,
          };
        }

        if (job.status === "cancelled") {
          return {
            content: [{ type: "text", text: `Generation "${input.name}" was cancelled` }],
            isError: true,
          };
        }

        if (!job.result) {
          return {
            content: [{ type: "text", text: "No result available" }],
            isError: true,
          };
        }

        const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [
          {
            type: "text",
            text: `Generation "${input.name}" (task ${job.taskId}) completed. ${job.result.images.length} image(s).`,
          },
        ];

        for (const img of job.result.images) {
          if (img.data) {
            content.push({
              type: "image",
              data: img.data,
              mimeType: img.mimeType || "image/jpeg",
            });
          } else if (img.path) {
            content.push({
              type: "text",
              text: `Saved: ${img.path}`,
            });
          }
        }

        return { content };
      }

      case "name_generation": {
        const input = args as { taskId: string; name: string };
        const job = ctx.jobManager.getJob(input.taskId);

        if (!job) {
          return {
            content: [{ type: "text", text: `Task not found: ${input.taskId}` }],
            isError: true,
          };
        }

        const success = ctx.jobManager.setName(input.taskId, input.name);
        if (!success) {
          return {
            content: [{ type: "text", text: `Failed to set name for task: ${input.taskId}` }],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                message: `Generation named "${input.name}"`,
                taskId: input.taskId,
                name: input.name,
                hint: `You can now retrieve this generation using get_generation_by_name with name "${input.name}"`,
              }, null, 2),
            },
          ],
        };
      }

      // === Notes ===
      case "save_note": {
        const input = args as { topic: string; content: string; tags?: string[] };
        const note = db.saveNote(input.topic, input.content, input.tags || []);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                message: "Note saved",
                note: {
                  id: note.id,
                  topic: note.topic,
                  tags: note.tags,
                  createdAt: note.createdAt,
                },
              }, null, 2),
            },
          ],
        };
      }

      case "get_notes": {
        const input = args as { topic?: string; limit?: number };
        const notes = input.topic
          ? db.getNotesByTopic(input.topic)
          : db.getAllNotes(input.limit || 50);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                count: notes.length,
                notes: notes.map(n => ({
                  id: n.id,
                  topic: n.topic,
                  content: n.content,
                  tags: n.tags,
                  createdAt: n.createdAt,
                  updatedAt: n.updatedAt,
                })),
              }, null, 2),
            },
          ],
        };
      }

      case "search_notes": {
        const input = args as { query: string; limit?: number };
        const notes = db.searchNotes(input.query, input.limit || 50);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                query: input.query,
                count: notes.length,
                notes: notes.map(n => ({
                  id: n.id,
                  topic: n.topic,
                  content: n.content,
                  tags: n.tags,
                  createdAt: n.createdAt,
                  updatedAt: n.updatedAt,
                })),
              }, null, 2),
            },
          ],
        };
      }

      case "delete_note": {
        const input = args as { id: number };
        const success = db.deleteNote(input.id);

        if (!success) {
          return {
            content: [{ type: "text", text: `Note not found: ${input.id}` }],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Note ${input.id} deleted successfully`,
            },
          ],
        };
      }

      case "list_topics": {
        const topics = db.getTopics();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                count: topics.length,
                topics,
              }, null, 2),
            },
          ],
        };
      }

      case "get_user_preferences": {
        const { capabilities } = await ensureConnected();
        const input = args as {
          includeWorkflows?: boolean;
          includeModels?: boolean;
          includeSettings?: boolean;
          workflowLimit?: number;
          modelLimit?: number;
        };

        const prefs = capabilities.userPreferences;
        if (!prefs) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  message: "No user preferences available. Output analysis may not have completed or no images with workflow metadata were found.",
                  hint: "Generate some images first, then restart the server to analyze your output history.",
                }, null, 2),
              },
            ],
          };
        }

        const includeWorkflows = input.includeWorkflows !== false;
        const includeModels = input.includeModels !== false;
        const includeSettings = input.includeSettings !== false;
        const workflowLimit = input.workflowLimit || 20;
        const modelLimit = input.modelLimit || 30;

        const result: Record<string, unknown> = {
          summary: {
            totalImagesAnalyzed: prefs.totalImagesAnalyzed,
            imagesWithWorkflows: prefs.imagesWithWorkflows,
            uniqueWorkflows: prefs.uniqueWorkflows,
            analyzedAt: prefs.analyzedAt,
          },
        };

        if (includeWorkflows) {
          // Return workflow templates that can be passed directly to run_workflow
          result.workflowTemplates = prefs.workflowTemplates.slice(0, workflowLimit).map((wf) => ({
            // Metadata for selection
            hash: wf.hash,
            description: wf.description,
            usageCount: wf.usageCount,
            lastUsed: wf.lastUsed,
            models: wf.models,
            samplePrompts: wf.samplePrompts,
            // The actual workflow - pass this to run_workflow
            workflow: wf.workflow,
          }));
          result.workflowHint = "To use a workflow: call run_workflow with the 'workflow' field from any template. Modify prompt text in CLIPTextEncode nodes as needed.";
        }

        if (includeModels) {
          result.frequentModels = prefs.modelUsage.slice(0, modelLimit);
        }

        if (includeSettings) {
          result.commonSettings = prefs.commonSettings;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // === SVG Tools ===
      case "render_svg": {
        const input = renderSvgSchema.parse(args) as RenderSvgInput;

        // Render SVG to PNG buffer
        const result = await renderSvg(input);

        if (!result.success || !result.buffer || !result.filename) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: result.error || "Failed to render SVG",
                }, null, 2),
              },
            ],
            isError: true,
          };
        }

        // Upload to ComfyUI via API (works with Docker/remote instances)
        const { client } = await ensureConnected();
        const uploadResult = await client.uploadImage(result.buffer, result.filename, true);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                filename: uploadResult.name,
                subfolder: uploadResult.subfolder,
                type: uploadResult.type,
                hint: `Use "${uploadResult.name}" in a LoadImage node to load this image.`,
              }, null, 2),
            },
          ],
        };
      }

      // === Font Tools ===
      case "download_font": {
        const input = downloadFontSchema.parse(args) as DownloadFontInput;
        const result = await downloadFont(input);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ...result,
                recommendedFonts: result.success ? undefined : RECOMMENDED_MAP_FONTS,
                hint: result.success
                  ? `Font downloaded. Use it in render_svg with fonts: [{ name: "${result.font?.name}" }]`
                  : "Check the font name or try one of the recommended fonts.",
              }, null, 2),
            },
          ],
          isError: !result.success,
        };
      }

      case "list_fonts": {
        const result = await listFonts();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ...result,
                recommendedFonts: RECOMMENDED_MAP_FONTS,
                hint: "Use download_font to add more fonts. These can be embedded in SVGs via render_svg.",
              }, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// List resources handler
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const staticResources = getStaticResources();
  const dynamicResources = getDynamicResources(ctx);

  return {
    resources: [...staticResources, ...dynamicResources],
  };
});

// Read resource handler
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  // ComfyUI-backed resources go through the same gate as tools, so a restarted
  // ComfyUI is rediscovered instead of being reported as "not connected".
  // readResource reports the disconnected case itself, so failures fall through.
  if (uri.startsWith("comfyui://models/") || uri === "comfyui://capabilities") {
    await ensureConnected().catch(() => {});
  }
  return await readResource(ctx, uri);
});

// List prompts handler
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: listPrompts(),
  };
});

// Get prompt handler
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return await getPrompt(ctx, name, args || {});
});

// Set logging level handler
server.setRequestHandler(SetLevelRequestSchema, async (request) => {
  const { level } = request.params;
  setLogLevel(level as LoggingLevel);
  info(`Logging level set to: ${level}`);
  return {};
});

// Main entry point
async function main() {
  // Load config first
  const config = await loadConfig();

  // Create server context
  ctx = createContext(server, config, getJobManager());

  // Initialize logging with the server
  initLogging(server, "info");

  // Try to initialize ComfyUI connection (non-fatal if not available)
  if (await initializeComfyUI()) {
    // Jobs outlive this process, so anything left "working" in the database was
    // interrupted by a restart on one side or the other.
    await reconcileAfterConnect();
  }

  // Start MCP server regardless of ComfyUI status
  const transport = new StdioServerTransport();
  await server.connect(transport);

  info("ComfyUI MCP server started");
  if (!ctx.client) {
    info("ComfyUI is not connected. Setup and example tools are still available.");
  }
}

main().catch((err) => {
  logError(`Fatal error: ${err}`);
  process.exit(1);
});
