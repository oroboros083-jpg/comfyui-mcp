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
import { discoverComfyUI } from "./discovery/index.js";
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
  ListModelsInput,
  ListNodesInput,
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
  generateImageSchema,
  generateImage,
  runWorkflowSchema,
  runWorkflow,
  getImageSchema,
  getImage,
  GenerateImageInput,
  RunWorkflowInput,
  GetImageInput,
} from "./tools/generate.js";
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
  listDownloadsSchema,
  listDownloads,
  downloadModelSchema,
  downloadModel,
  downloadHuggingFaceSchema,
  downloadHuggingFace,
  ListDownloadsInput,
  DownloadModelInput,
  DownloadHuggingFaceInput,
} from "./tools/download.js";
import {
  listExamplesSchema,
  listExamples,
  getExampleWorkflowSchema,
  getExampleWorkflow,
  ListExamplesInput,
  GetExampleWorkflowInput,
} from "./tools/examples.js";
import {
  getPromptingGuide,
  getComprehensiveGuide,
  formatPromptingGuide,
  PROMPTING_GUIDES,
} from "./resources/prompting-guide.js";
import { getJobManager, JobManager } from "./jobs/manager.js";
import {
  generateImageAsync,
  runWorkflowAsync,
} from "./tools/generate-async.js";
import {
  analyzeUserOutputs,
  getUserPreferencesSummary,
} from "./analysis/outputs.js";
import { join } from "path";
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
    return false;
  }

  ctx.discoveredUrl = discovered.url;
  ctx.discoverySource = discovered.source;
  info(`Found running ComfyUI at ${discovered.url} (${discovered.source})`, undefined, "init");

  // Create client
  ctx.client = new ComfyUIClient(discovered.url, ctx.config.comfyui.apiKey);
  debug("Created ComfyUI client", undefined, "init");

  // Get capabilities
  try {
    debug("Getting object info...", undefined, "init");
    ctx.objectInfo = await ctx.client.getObjectInfo();
    debug(`Got object info with ${Object.keys(ctx.objectInfo).length} nodes`, undefined, "init");
    ctx.capabilities = detectCapabilities(ctx.objectInfo);
    info(`Detected capabilities:\n${getCapabilitySummary(ctx.capabilities)}`, undefined, "init");
  } catch (err) {
    logError(`Failed to get ComfyUI capabilities: ${err}`, undefined, "init");
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

  // Connect WebSocket
  ctx.ws = new ComfyUIWebSocket(ctx.client.getWebSocketUrl());
  try {
    await ctx.ws.connect();
    debug("WebSocket connected", undefined, "init");
  } catch (err) {
    warning(`Failed to connect WebSocket: ${err}`, undefined, "init");
  }

  debug("Initialization complete, returning true", undefined, "init");
  return true;
}

/**
 * Ensure ComfyUI is connected
 */
async function ensureConnected(): Promise<{
  client: ComfyUIClient;
  ws: ComfyUIWebSocket;
  capabilities: Capabilities;
  objectInfo: ObjectInfo;
}> {
  if (!ctx.client || !ctx.ws || !ctx.capabilities || !ctx.objectInfo) {
    const connected = await initializeComfyUI();
    if (!connected) {
      throw new Error(
        "ComfyUI is not available. Use 'get_status' to check installation, or 'get_install_guide' for setup help."
      );
    }
  }

  if (!ctx.client || !ctx.ws || !ctx.capabilities || !ctx.objectInfo) {
    throw new Error(
      "ComfyUI is not available. Make sure it's running and accessible."
    );
  }

  // Verify connection is still alive
  if (!ctx.ws.isConnected()) {
    try {
      await ctx.ws.connect();
    } catch {
      throw new Error("Lost connection to ComfyUI WebSocket");
    }
  }

  return {
    client: ctx.client,
    ws: ctx.ws,
    capabilities: ctx.capabilities,
    objectInfo: ctx.objectInfo,
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

  // === Downloads (always available) ===
  list_downloads: {
    schema: listDownloadsSchema,
    description:
      "List popular models available for direct download",
    requiresConnection: false,
    annotations: {
      title: "List Available Downloads",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  download_model: {
    schema: downloadModelSchema,
    description:
      "Download a model directly to the ComfyUI models folder",
    requiresConnection: false,
    annotations: {
      title: "Download Model",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  download_huggingface: {
    schema: downloadHuggingFaceSchema,
    description:
      "Download a model file from HuggingFace to ComfyUI",
    requiresConnection: false,
    annotations: {
      title: "Download from HuggingFace",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },

  // === Examples (always available) ===
  list_examples: {
    schema: listExamplesSchema,
    description:
      "List official ComfyUI example workflows from the documentation",
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
      "Fetch an example workflow (extracts embedded JSON from documentation images)",
    requiresConnection: false,
    annotations: {
      title: "Get Example Workflow",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
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
  generate_image: {
    schema: generateImageSchema,
    description:
      "Generate an image using ComfyUI. Returns immediately with a task ID (async by default). Use get_task to check progress, get_task_result to retrieve images when complete. Set sync:true to wait for completion (blocking). IMPORTANT: Before your first generation, call get_prompting_guide with the appropriate model type (sd15, sdxl, sd3, or flux) to learn the correct prompting style.",
    requiresConnection: true,
    annotations: {
      title: "Generate Image",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  run_workflow: {
    schema: runWorkflowSchema,
    description:
      "Run a custom ComfyUI workflow (API format JSON). Returns immediately with a task ID (async by default). Use get_task to check progress, get_task_result to retrieve results when complete. Set sync:true to wait for completion (blocking).",
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
    description: "Cancel a queued or running job",
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
    description: "Interrupt the currently running job",
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
    description: "Get the current status of an async generation task",
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
    description: "Cancel a running async generation task. Also cancels the corresponding ComfyUI job.",
    requiresConnection: true, // Need to cancel in ComfyUI too
    annotations: {
      title: "Cancel Task",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
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
        // Always try to connect/reconnect when checking status
        debug("Starting status check...", undefined, "get_status");
        const wasConnected = ctx.client !== null;
        debug(`Was previously connected: ${wasConnected}`, undefined, "get_status");

        const initResult = await initializeComfyUI();
        debug(`initializeComfyUI returned: ${initResult}`, undefined, "get_status");
        debug(`client is null: ${ctx.client === null}`, undefined, "get_status");
        debug(`discoveredUrl: ${ctx.discoveredUrl}`, undefined, "get_status");

        // Test actual connectivity
        let isConnected = false;
        if (ctx.client) {
          try {
            debug("Testing connectivity with getSystemStats...", undefined, "get_status");
            const stats = await ctx.client.getSystemStats();
            debug(`Got system stats: ${JSON.stringify(stats).slice(0, 100)}...`, undefined, "get_status");
            isConnected = true;
          } catch (err) {
            debug(`getSystemStats failed: ${err}`, undefined, "get_status");
            isConnected = false;
          }
        } else {
          debug("client is null, cannot test connectivity", undefined, "get_status");
        }

        debug(`Final isConnected: ${isConnected}`, undefined, "get_status");

        const status = await getStatus(
          isConnected,
          ctx.discoveredUrl || undefined,
          ctx.discoverySource || undefined,
          ctx.capabilities ? getCapabilitySummary(ctx.capabilities) : undefined
        );

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

      // === Downloads ===
      case "list_downloads": {
        const input = listDownloadsSchema.parse(args) as ListDownloadsInput;
        const result = listDownloads(input);
        return { content: [{ type: "text", text: result }] };
      }

      case "download_model": {
        const input = downloadModelSchema.parse(args) as DownloadModelInput;
        const path = input.comfyuiPath || getComfyUIPath(ctx);
        const result = await downloadModel(input, path, (progress) => {
          // Progress updates could be sent via notifications in future
          info(
            `Downloading ${progress.filename}: ${progress.percent?.toFixed(1) || "?"}%`,
            undefined,
            "download"
          );
        });
        return {
          content: [
            {
              type: "text",
              text: result.success
                ? `Downloaded to: ${result.path}${result.error ? ` (${result.error})` : ""}`
                : `Failed: ${result.error}`,
            },
          ],
          isError: !result.success,
        };
      }

      case "download_huggingface": {
        const input = downloadHuggingFaceSchema.parse(args) as DownloadHuggingFaceInput;
        const path = input.comfyuiPath || getComfyUIPath(ctx);
        const result = await downloadHuggingFace(input, path, (progress) => {
          info(
            `Downloading ${progress.filename}: ${progress.percent?.toFixed(1) || "?"}%`,
            undefined,
            "download"
          );
        });
        return {
          content: [
            {
              type: "text",
              text: result.success
                ? `Downloaded to: ${result.path}${result.error ? ` (${result.error})` : ""}`
                : `Failed: ${result.error}`,
            },
          ],
          isError: !result.success,
        };
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

      case "generate_image": {
        const { client, ws, capabilities, objectInfo } = await ensureConnected();
        const input = generateImageSchema.parse(args) as GenerateImageInput;

        // Check if sync mode is requested
        if (input.sync) {
          // Synchronous mode - wait for completion
          const result = await generateImage(
            client,
            ws,
            input,
            capabilities,
            objectInfo,
            ctx.config.outputDir,
            ctx.config.outputSizeThreshold,
            input.timeout || 300000
          );

          if (!result.success) {
            return {
              content: [{ type: "text", text: `Error: ${result.error}` }],
              isError: true,
            };
          }

          const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [
            {
              type: "text",
              text: `Generated ${result.images.length} image(s) using ${result.workflowType} workflow (prompt_id: ${result.promptId})`,
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
        const asyncResult = await generateImageAsync(
          ctx.server,
          ctx.jobManager,
          client,
          ws,
          input,
          capabilities,
          objectInfo,
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
                hint: "Generation started in background. Use get_task to check status, or get_task_result when complete. You will also receive notifications as progress updates.",
              }, null, 2),
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
            ctx.config.outputSizeThreshold,
            input.timeout || 300000
          );

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
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                taskId: job.taskId,
                promptId: job.promptId,
                status: job.status,
                statusMessage: job.statusMessage,
                createdAt: job.createdAt,
                lastUpdatedAt: job.lastUpdatedAt,
                error: job.error,
              }, null, 2),
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
  await initializeComfyUI();

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
