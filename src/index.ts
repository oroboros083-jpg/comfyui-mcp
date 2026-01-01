#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

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

// Global state
let client: ComfyUIClient | null = null;
let ws: ComfyUIWebSocket | null = null;
let config: Config;
let capabilities: Capabilities | null = null;
let objectInfo: ObjectInfo | null = null;
let discoveredUrl: string | null = null;
let discoverySource: string | null = null;
let comfyuiPath: string | null = null;
const jobManager: JobManager = getJobManager();

const server = new Server(
  {
    name: "comfyui-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Initialize connection to ComfyUI
 */
async function initializeComfyUI(): Promise<boolean> {
  console.error("[init] Starting ComfyUI initialization...");
  config = await loadConfig();
  console.error(`[init] Config loaded, url from config: ${config.comfyui.url}`);

  // Try to detect ComfyUI installation
  const installation = detectInstallation();
  if (installation.installed && installation.path) {
    comfyuiPath = installation.path;
    console.error(`[init] Found ComfyUI installation at: ${comfyuiPath}`);
  } else {
    console.error("[init] No ComfyUI installation detected");
  }

  // Try to discover running ComfyUI
  console.error("[init] Attempting to discover running ComfyUI...");
  const discovered = await discoverComfyUI(config.comfyui.url);

  if (!discovered) {
    console.error(
      "[init] ComfyUI is not running. Use get_install_guide or get_status for help."
    );
    return false;
  }

  discoveredUrl = discovered.url;
  discoverySource = discovered.source;
  console.error(`[init] Found running ComfyUI at ${discovered.url} (${discovered.source})`);

  // Create client
  client = new ComfyUIClient(discovered.url, config.comfyui.apiKey);
  console.error("[init] Created ComfyUI client");

  // Get capabilities
  try {
    console.error("[init] Getting object info...");
    objectInfo = await client.getObjectInfo();
    console.error(`[init] Got object info with ${Object.keys(objectInfo).length} nodes`);
    capabilities = detectCapabilities(objectInfo);
    console.error(`[init] Detected capabilities:\n${getCapabilitySummary(capabilities)}`);
  } catch (error) {
    console.error(`[init] Failed to get ComfyUI capabilities: ${error}`);
    return false;
  }

  // Analyze user outputs for preferences (non-blocking)
  if (comfyuiPath) {
    const outputDir = join(comfyuiPath, "output");
    console.error(`[init] Analyzing user outputs in: ${outputDir}`);
    try {
      const userPrefs = await analyzeUserOutputs(outputDir);
      if (capabilities) {
        capabilities.userPreferences = userPrefs;
      }
      console.error(`[init] User preferences:\n${getUserPreferencesSummary(userPrefs)}`);
    } catch (error) {
      console.error(`[init] Failed to analyze user outputs: ${error}`);
      // Non-fatal - continue without preferences
    }
  }

  // Connect WebSocket
  ws = new ComfyUIWebSocket(client.getWebSocketUrl());
  try {
    await ws.connect();
    console.error("[init] WebSocket connected");
  } catch (error) {
    console.error(`[init] Failed to connect WebSocket: ${error}`);
  }

  console.error("[init] Initialization complete, returning true");
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
  if (!client || !ws || !capabilities || !objectInfo) {
    const connected = await initializeComfyUI();
    if (!connected) {
      throw new Error(
        "ComfyUI is not available. Use 'get_status' to check installation, or 'get_install_guide' for setup help."
      );
    }
  }

  if (!client || !ws || !capabilities || !objectInfo) {
    throw new Error(
      "ComfyUI is not available. Make sure it's running and accessible."
    );
  }

  // Verify connection is still alive
  if (!ws.isConnected()) {
    try {
      await ws.connect();
    } catch {
      throw new Error("Lost connection to ComfyUI WebSocket");
    }
  }

  return { client, ws, capabilities, objectInfo };
}

/**
 * Get the ComfyUI installation path for downloads
 */
function getComfyUIPath(): string {
  if (comfyuiPath) return comfyuiPath;
  // Fallback to config output directory's parent
  return config?.outputDir || "./";
}

// Convert Zod schema to JSON Schema for MCP
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodValue = value as z.ZodType;
      properties[key] = zodToJsonSchema(zodValue);

      if (!(zodValue instanceof z.ZodOptional) && !(zodValue instanceof z.ZodDefault)) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: "string", description: schema.description };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: "number", description: schema.description };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean", description: schema.description };
  }

  if (schema instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: schema.options,
      description: schema.description,
    };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }

  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchema(schema.removeDefault());
    return { ...inner, default: schema._def.defaultValue() };
  }

  if (schema instanceof z.ZodRecord) {
    return { type: "object", additionalProperties: true };
  }

  return { type: "string" };
}

// Tool definitions - organized by category
const TOOLS: Record<string, { schema: z.ZodType; description: string; requiresConnection?: boolean }> = {
  // === Status & Setup (always available) ===
  get_status: {
    schema: getStatusSchema,
    description:
      "Get the current status of ComfyUI connection and installation",
    requiresConnection: false,
  },
  get_install_guide: {
    schema: getInstallGuideSchema,
    description:
      "Get installation instructions for ComfyUI (recommends desktop app for most users)",
    requiresConnection: false,
  },
  get_model_guide: {
    schema: getModelGuideSchema,
    description:
      "Get guidance on downloading and installing models for ComfyUI",
    requiresConnection: false,
  },

  // === Downloads (always available) ===
  list_downloads: {
    schema: listDownloadsSchema,
    description:
      "List popular models available for direct download",
    requiresConnection: false,
  },
  download_model: {
    schema: downloadModelSchema,
    description:
      "Download a model directly to the ComfyUI models folder",
    requiresConnection: false,
  },
  download_huggingface: {
    schema: downloadHuggingFaceSchema,
    description:
      "Download a model file from HuggingFace to ComfyUI",
    requiresConnection: false,
  },

  // === Examples (always available) ===
  list_examples: {
    schema: listExamplesSchema,
    description:
      "List official ComfyUI example workflows from the documentation",
    requiresConnection: false,
  },
  get_example_workflow: {
    schema: getExampleWorkflowSchema,
    description:
      "Fetch an example workflow (extracts embedded JSON from documentation images)",
    requiresConnection: false,
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
  },

  // === Generation (requires ComfyUI) ===
  get_capabilities: {
    schema: z.object({}),
    description:
      "Get the detected capabilities of the connected ComfyUI instance",
    requiresConnection: true,
  },
  generate_image: {
    schema: generateImageSchema,
    description:
      "Generate an image using ComfyUI. Returns immediately with a task ID (async by default). Use get_task to check progress, get_task_result to retrieve images when complete. Set sync:true to wait for completion (blocking). IMPORTANT: Before your first generation, call get_prompting_guide with the appropriate model type (sd15, sdxl, sd3, or flux) to learn the correct prompting style.",
    requiresConnection: true,
  },
  run_workflow: {
    schema: runWorkflowSchema,
    description:
      "Run a custom ComfyUI workflow (API format JSON). Returns immediately with a task ID (async by default). Use get_task to check progress, get_task_result to retrieve results when complete. Set sync:true to wait for completion (blocking).",
    requiresConnection: true,
  },
  get_image: {
    schema: getImageSchema,
    description:
      "Retrieve a generated image as base64. Use this to fetch images from ComfyUI's output directory.",
    requiresConnection: true,
  },

  // === Model Discovery (requires ComfyUI) ===
  list_models: {
    schema: listModelsSchema,
    description:
      "List available models (checkpoints, LoRAs, VAEs, etc.) in ComfyUI",
    requiresConnection: true,
  },
  list_nodes: {
    schema: listNodesSchema,
    description:
      "List available ComfyUI nodes, optionally filtered by category or search term",
    requiresConnection: true,
  },

  // === Queue Management (requires ComfyUI) ===
  get_queue: {
    schema: getQueueSchema,
    description: "Get the current ComfyUI queue status",
    requiresConnection: true,
  },
  cancel_job: {
    schema: cancelJobSchema,
    description: "Cancel a queued or running job",
    requiresConnection: true,
  },
  interrupt: {
    schema: interruptSchema,
    description: "Interrupt the currently running job",
    requiresConnection: true,
  },
  get_history: {
    schema: getHistorySchema,
    description: "Get generation history",
    requiresConnection: true,
  },

  // === Task Management (for async operations) ===
  get_task: {
    schema: z.object({
      taskId: z.string().describe("The task ID to get status for"),
    }),
    description: "Get the current status of an async generation task",
    requiresConnection: false, // Jobs are tracked locally
  },
  get_task_result: {
    schema: z.object({
      taskId: z.string().describe("The task ID to get results for"),
    }),
    description: "Get the result of a completed generation task (images)",
    requiresConnection: false,
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
  },
  cancel_task: {
    schema: z.object({
      taskId: z.string().describe("The task ID to cancel"),
    }),
    description: "Cancel a running async generation task. Also cancels the corresponding ComfyUI job.",
    requiresConnection: true, // Need to cancel in ComfyUI too
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
}

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools: Tool[] = [];

  for (const [name, { schema, description }] of Object.entries(TOOLS)) {
    tools.push({
      name,
      description,
      inputSchema: zodToJsonSchema(schema) as Tool["inputSchema"],
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
        console.error("[get_status] Starting status check...");
        const wasConnected = client !== null;
        console.error(`[get_status] Was previously connected: ${wasConnected}`);

        const initResult = await initializeComfyUI();
        console.error(`[get_status] initializeComfyUI returned: ${initResult}`);
        console.error(`[get_status] client is null: ${client === null}`);
        console.error(`[get_status] discoveredUrl: ${discoveredUrl}`);

        // Test actual connectivity
        let isConnected = false;
        if (client) {
          try {
            console.error("[get_status] Testing connectivity with getSystemStats...");
            const stats = await client.getSystemStats();
            console.error(`[get_status] Got system stats: ${JSON.stringify(stats).slice(0, 100)}...`);
            isConnected = true;
          } catch (err) {
            console.error(`[get_status] getSystemStats failed: ${err}`);
            isConnected = false;
          }
        } else {
          console.error("[get_status] client is null, cannot test connectivity");
        }

        console.error(`[get_status] Final isConnected: ${isConnected}`);

        const status = await getStatus(
          isConnected,
          discoveredUrl || undefined,
          discoverySource || undefined,
          capabilities ? getCapabilitySummary(capabilities) : undefined
        );

        // Add prompting guide advice when connected
        if (isConnected && capabilities) {
          let modelType = "sd15";
          if (capabilities.hasFlux) modelType = "flux";
          else if (capabilities.hasSD3) modelType = "sd3";
          else if (capabilities.hasSDXL) modelType = "sdxl";

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
        const path = input.comfyuiPath || getComfyUIPath();
        const result = await downloadModel(input, path, (progress) => {
          // Progress updates could be sent via notifications in future
          console.error(
            `Downloading ${progress.filename}: ${progress.percent?.toFixed(1) || "?"}%`
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
        const path = input.comfyuiPath || getComfyUIPath();
        const result = await downloadHuggingFace(input, path, (progress) => {
          console.error(
            `Downloading ${progress.filename}: ${progress.percent?.toFixed(1) || "?"}%`
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
            config.outputDir,
            config.outputSizeThreshold,
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
          server,
          jobManager,
          client,
          ws,
          input,
          capabilities,
          objectInfo,
          config.outputDir,
          config.outputSizeThreshold
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
            config.outputDir,
            config.outputSizeThreshold,
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
          server,
          jobManager,
          client,
          ws,
          input,
          config.outputDir,
          config.outputSizeThreshold
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
        const job = jobManager.getJob(input.taskId);
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
        const job = jobManager.getJob(input.taskId);
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
        const jobs = jobManager.listJobs(input.status);
        const counts = jobManager.getJobCounts();

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
        const job = jobManager.getJob(input.taskId);

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
        jobManager.cancelJob(input.taskId);

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

// Main entry point
async function main() {
  // Load config first
  config = await loadConfig();

  // Try to initialize ComfyUI connection (non-fatal if not available)
  await initializeComfyUI();

  // Start MCP server regardless of ComfyUI status
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("ComfyUI MCP server started");
  if (!client) {
    console.error(
      "Note: ComfyUI is not connected. Setup and example tools are still available."
    );
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
