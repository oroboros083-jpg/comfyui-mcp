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
  generateImageSchema,
  generateImage,
  runWorkflowSchema,
  runWorkflow,
  getImageSchema,
  getImage,
  applySessionDefaults,
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
  listExamplesSchema,
  listExamples,
  getExampleWorkflowSchema,
  getExampleWorkflow,
  extractWorkflowFromPng,
  ListExamplesInput,
  GetExampleWorkflowInput,
} from "./tools/examples.js";
import { readFile } from "fs/promises";
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
  SessionDefaults,
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

  // === Session Defaults ===
  set_generation_defaults: {
    schema: z.object({
      model: z.string().optional().describe("Default model (checkpoint or UNET)"),
      sampler: z.string().optional().describe("Default sampler"),
      scheduler: z.string().optional().describe("Default scheduler"),
      steps: z.number().optional().describe("Default number of steps"),
      cfg: z.number().optional().describe("Default CFG/guidance scale"),
      width: z.number().optional().describe("Default width in pixels"),
      height: z.number().optional().describe("Default height in pixels"),
      negativePrompt: z.string().optional().describe("Default negative prompt"),
      imageFormat: z.enum(["jpeg", "png", "webp"]).optional().describe("Default image format"),
      imageQuality: z.number().min(1).max(100).optional().describe("Default image quality (1-100)"),
      outputMode: z.enum(["base64", "file", "auto"]).optional().describe("Default output mode"),
      workflow: z.record(z.unknown()).optional().describe("Custom workflow template (API format JSON). When set, generate_image uses this instead of auto-generating a workflow."),
      workflowDescription: z.string().optional().describe("Human-readable description of the workflow"),
      clear: z.boolean().optional().describe("Clear all defaults"),
      clearWorkflow: z.boolean().optional().describe("Clear only the workflow default (keep other settings)"),
    }),
    description:
      "Set session-level defaults for image generation. These persist until server restart and are applied to all subsequent generate_image calls unless explicitly overridden. You can set a custom workflow template that will be used instead of auto-generated workflows.",
    requiresConnection: false,
    annotations: {
      title: "Set Generation Defaults",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  get_generation_defaults: {
    schema: z.object({}),
    description:
      "Get the current session-level generation defaults",
    requiresConnection: false,
    annotations: {
      title: "Get Generation Defaults",
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
            const response = await fetch(source);
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
          try {
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
        const rawInput = generateImageSchema.parse(args) as GenerateImageInput;
        // Track which parameters were explicitly provided (not from schema defaults)
        const explicitParams = new Set(Object.keys(args as object));
        // Apply session defaults (explicit params override defaults)
        const input = applySessionDefaults(rawInput, ctx.sessionDefaults);

        // Check if a custom workflow is set as default
        if (ctx.sessionDefaults.workflow) {
          // Use custom workflow - apply user parameters to appropriate nodes
          const customWorkflow = JSON.parse(JSON.stringify(ctx.sessionDefaults.workflow));
          let promptsReplaced = 0;

          // Helper to check if a param should be applied
          // Only apply if: explicitly provided in this call, OR set as session default
          const shouldApply = (param: string) =>
            explicitParams.has(param) ||
            ctx.sessionDefaults[param as keyof typeof ctx.sessionDefaults] !== undefined;

          for (const node of Object.values(customWorkflow)) {
            const n = node as { class_type?: string; inputs?: Record<string, unknown> };
            if (!n.inputs) continue;

            // Replace prompts in CLIPTextEncode nodes (prompt is always required)
            if (n.class_type === "CLIPTextEncode") {
              const currentText = String(n.inputs.text || "").toLowerCase();
              const isNegative =
                currentText.includes("ugly") ||
                currentText.includes("bad quality") ||
                currentText.includes("deformed") ||
                currentText.includes("worst quality");

              if (!isNegative && promptsReplaced === 0) {
                n.inputs.text = input.prompt;
                promptsReplaced++;
              } else if (isNegative && shouldApply("negativePrompt") && input.negativePrompt) {
                n.inputs.text = input.negativePrompt;
              }
            }

            // Apply dimensions to EmptyLatentImage nodes
            if (n.class_type?.includes("EmptyLatent") || n.class_type?.includes("LatentImage")) {
              if (shouldApply("width") && n.inputs.width !== undefined) {
                n.inputs.width = input.width;
              }
              if (shouldApply("height") && n.inputs.height !== undefined) {
                n.inputs.height = input.height;
              }
            }

            // Apply sampler settings to KSampler nodes
            if (n.class_type === "KSampler" || n.class_type === "KSamplerAdvanced") {
              if (shouldApply("steps") && n.inputs.steps !== undefined) {
                n.inputs.steps = input.steps;
              }
              if (shouldApply("cfg") && n.inputs.cfg !== undefined) {
                n.inputs.cfg = input.cfg;
              }
              if (shouldApply("sampler") && n.inputs.sampler_name !== undefined) {
                n.inputs.sampler_name = input.sampler;
              }
              if (shouldApply("scheduler") && n.inputs.scheduler !== undefined) {
                n.inputs.scheduler = input.scheduler;
              }
              // Apply seed if explicitly provided (not -1)
              if (explicitParams.has("seed") && input.seed !== -1 && n.inputs.seed !== undefined) {
                n.inputs.seed = input.seed;
              }
            }
          }

          // Use run_workflow with the modified custom workflow
          const workflowInput = {
            workflow: customWorkflow,
            outputMode: input.outputMode,
            imageFormat: input.imageFormat,
            imageQuality: input.imageQuality,
            timeout: input.timeout,
            sync: input.sync,
          };

          if (input.sync) {
            const result = await runWorkflow(
              client,
              ws,
              workflowInput,
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
                text: `Generated ${result.images.length} image(s) using custom workflow (prompt_id: ${result.promptId})`,
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

          // Async mode with custom workflow
          const asyncResult = await runWorkflowAsync(
            ctx.server,
            ctx.jobManager,
            client,
            ws,
            workflowInput,
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
                  usingCustomWorkflow: true,
                  hint: "Generation started using custom workflow. Use get_task to check status, or get_task_result when complete.",
                }, null, 2),
              },
            ],
          };
        }

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

      // === Session Defaults ===
      case "set_generation_defaults": {
        const input = args as Partial<SessionDefaults> & { clear?: boolean; clearWorkflow?: boolean };

        if (input.clear) {
          ctx.sessionDefaults = {};
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  message: "Session defaults cleared",
                  defaults: {},
                }, null, 2),
              },
            ],
          };
        }

        // Handle clearWorkflow separately
        if (input.clearWorkflow) {
          delete ctx.sessionDefaults.workflow;
          delete ctx.sessionDefaults.workflowDescription;
        }

        // Update only provided fields
        const { clear: _, clearWorkflow: __, ...newDefaults } = input;
        for (const [key, value] of Object.entries(newDefaults)) {
          if (value !== undefined) {
            (ctx.sessionDefaults as Record<string, unknown>)[key] = value;
          }
        }

        // Detect model type if model was set
        let modelInfo = null;
        if (ctx.sessionDefaults.model && ctx.capabilities) {
          const model = ctx.sessionDefaults.model.toLowerCase();
          if (model.includes("flux")) {
            modelInfo = { type: "flux", recommendedCfg: 3.5, recommendedScheduler: "simple" };
          } else if (model.includes("sd3")) {
            modelInfo = { type: "sd3", recommendedCfg: 5, noNegativePrompt: true };
          } else if (model.includes("xl") || model.includes("sdxl")) {
            modelInfo = { type: "sdxl", recommendedCfg: 7 };
          } else {
            modelInfo = { type: "sd15", recommendedCfg: 7 };
          }
        }

        // Build response - don't include full workflow JSON in response (too large)
        const displayDefaults = { ...ctx.sessionDefaults };
        const hasWorkflow = !!displayDefaults.workflow;
        if (hasWorkflow) {
          (displayDefaults as Record<string, unknown>).workflow = `[Custom workflow set - ${Object.keys(ctx.sessionDefaults.workflow || {}).length} nodes]`;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                message: input.clearWorkflow ? "Workflow default cleared" : "Session defaults updated",
                defaults: displayDefaults,
                hasCustomWorkflow: hasWorkflow,
                modelInfo,
                hint: hasWorkflow
                  ? "Custom workflow will be used for generate_image. Prompt text in CLIPTextEncode nodes will be replaced with your prompt."
                  : "These defaults will apply to all subsequent generate_image calls unless explicitly overridden.",
              }, null, 2),
            },
          ],
        };
      }

      case "get_generation_defaults": {
        // Check if any defaults are set
        const hasDefaults = Object.keys(ctx.sessionDefaults).length > 0;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                defaults: ctx.sessionDefaults,
                hasDefaults,
                hint: hasDefaults
                  ? "These defaults are applied to generate_image calls unless explicitly overridden."
                  : "No session defaults set. Use set_generation_defaults to configure.",
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
          result.settingsHint = "Use set_generation_defaults to apply these as session defaults.";
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
