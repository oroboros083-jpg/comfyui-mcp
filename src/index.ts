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
  GenerateImageInput,
  RunWorkflowInput,
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

// Global state
let client: ComfyUIClient | null = null;
let ws: ComfyUIWebSocket | null = null;
let config: Config;
let capabilities: Capabilities | null = null;
let objectInfo: ObjectInfo | null = null;
let discoveredUrl: string | null = null;
let discoverySource: string | null = null;
let comfyuiPath: string | null = null;

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
  config = await loadConfig();

  // Try to detect ComfyUI installation
  const installation = detectInstallation();
  if (installation.installed && installation.path) {
    comfyuiPath = installation.path;
    console.error(`Found ComfyUI installation at: ${comfyuiPath}`);
  }

  // Try to discover running ComfyUI
  const discovered = await discoverComfyUI(config.comfyui.url);

  if (!discovered) {
    console.error(
      "ComfyUI is not running. Use get_install_guide or get_status for help."
    );
    return false;
  }

  discoveredUrl = discovered.url;
  discoverySource = discovered.source;
  console.error(`Found running ComfyUI at ${discovered.url} (${discovered.source})`);

  // Create client
  client = new ComfyUIClient(discovered.url, config.comfyui.apiKey);

  // Get capabilities
  try {
    objectInfo = await client.getObjectInfo();
    capabilities = detectCapabilities(objectInfo);
    console.error(`Detected capabilities:\n${getCapabilitySummary(capabilities)}`);
  } catch (error) {
    console.error("Failed to get ComfyUI capabilities:", error);
    return false;
  }

  // Connect WebSocket
  ws = new ComfyUIWebSocket(client.getWebSocketUrl());
  try {
    await ws.connect();
    console.error("WebSocket connected");
  } catch (error) {
    console.error("Failed to connect WebSocket:", error);
  }

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
      "Generate an image using ComfyUI. Automatically selects the appropriate workflow based on available models.",
    requiresConnection: true,
  },
  run_workflow: {
    schema: runWorkflowSchema,
    description:
      "Run a custom ComfyUI workflow (API format JSON). Use get_example_workflow to fetch examples.",
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
        const wasConnected = client !== null;
        await initializeComfyUI();

        // Test actual connectivity
        let isConnected = false;
        if (client) {
          try {
            await client.getSystemStats();
            isConnected = true;
          } catch {
            isConnected = false;
          }
        }

        const status = await getStatus(
          isConnected,
          discoveredUrl || undefined,
          discoverySource || undefined,
          capabilities ? getCapabilitySummary(capabilities) : undefined
        );
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

      // === Generation ===
      case "get_capabilities": {
        const { capabilities } = await ensureConnected();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  summary: getCapabilitySummary(capabilities),
                  details: capabilities,
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
        const result = await generateImage(
          client,
          ws,
          input,
          capabilities,
          objectInfo,
          config.outputDir,
          config.outputSizeThreshold
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
              mimeType: "image/png",
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

      case "run_workflow": {
        const { client, ws } = await ensureConnected();
        const input = runWorkflowSchema.parse(args) as RunWorkflowInput;
        const result = await runWorkflow(
          client,
          ws,
          input,
          config.outputDir,
          config.outputSizeThreshold
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
              mimeType: "image/png",
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
