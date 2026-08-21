/**
 * Discovering what the connected ComfyUI can do: capabilities, installed
 * models, available node types, and how to wire a node up.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { defineTool, noArgs } from "../register.js";
import { ensureConnected } from "../connection.js";
import { getCapabilitySummary, promptingAdviceFor } from "../../capabilities/index.js";
import {
  dataResult,
  textResult,
  errorResult,
  formattedResult,
  paginatedOutputSchema,
} from "../../utils/response.js";
import { z } from "zod";
import {
  listModelsSchema,
  listModels,
  renderModels,
  listNodesSchema,
  listNodes,
  renderNodes,
  getNodeInfoSchema,
  getNodeInfo,
  findNodesByTypeSchema,
  findNodesByType,
  renderFoundNodes,
  NoTypeFilterError,
  buildNodeSchema,
  buildNode,
} from "../../tools/models.js";
import {
  validateWorkflowSchema,
  validateWorkflow,
  renderValidation,
} from "../../tools/validation.js";

export function registerDiscoveryTools(server: McpServer): void {
  defineTool(server, {
    name: "get_capabilities",
    description:
      "Get what the connected ComfyUI can do: detected model architectures (SD1.5/SDXL/SD3/Flux), " +
      "feature support, counts of installed models by type, and prompting advice for the primary " +
      "architecture. Returns a summary rather than full model lists - use comfyui_list_models for those.",
    schema: noArgs,
    requiresConnection: true,
    annotations: {
      title: "Get ComfyUI Capabilities",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async () => {
      const { capabilities } = await ensureConnected();

      // One line from the registry, rather than a ladder that only knew four
      // architectures and defaulted everything else to SD 1.5.
      const promptingAdvice = promptingAdviceFor(capabilities);

      // userPreferences holds every analysed workflow and can run to hundreds
      // of KB; availableLoaders is a long node-name list. Both have dedicated
      // tools, so report their shape here rather than inlining them.
      const {
        userPreferences,
        availableLoaders,
        availableSamplers,
        availableSchedulers,
        ...features
      } = capabilities;

      return dataResult({
        summary: getCapabilitySummary(capabilities),
        promptingAdvice,
        features,
        samplers: availableSamplers,
        schedulers: availableSchedulers,
        loaderCount: availableLoaders.length,
        ...(userPreferences
          ? {
              historyAnalysed: {
                totalImagesAnalyzed: userPreferences.totalImagesAnalyzed,
                uniqueWorkflows: userPreferences.uniqueWorkflows,
                hint: "Call comfyui_get_user_preferences for the workflows and settings this user actually uses.",
              },
            }
          : {}),
        hint: "Call comfyui_list_models for model filenames, comfyui_list_nodes for node types.",
      });
    },
  });

  defineTool(server, {
    name: "list_models",
    description:
      "List model files installed in ComfyUI (checkpoints, LoRAs, VAEs, ControlNets, upscalers, " +
      "embeddings, CLIP, UNET). Paginated. Filter with 'type' and/or 'search' before paging - an " +
      "install can hold hundreds of LoRAs.\n\n" +
      "Returns: { total, count, offset, models: { <type>: [filename, ...] }, has_more, next_offset }",
    schema: listModelsSchema,
    requiresConnection: true,
    annotations: {
      title: "List Installed Models",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    outputSchema: paginatedOutputSchema("models", z.record(z.array(z.string()))),
    handler: async (input) => {
      const { client } = await ensureConnected();
      const result = await listModels(client, input);
      return formattedResult(
        input.response_format,
        result,
        () => renderModels(result, input),
        "Filter with 'type' or 'search', or page with 'offset'."
      );
    },
  });

  defineTool(server, {
    name: "list_nodes",
    description:
      "List available ComfyUI node types. Paginated, and returns a summary projection by default - a " +
      "modded install carries 2000+ node types. Narrow with 'search' or 'category' before paging, use " +
      "detail:'names' to survey cheaply, and comfyui_get_node_info for one node's inputs and outputs.\n\n" +
      "Returns: { total, count, offset, categoryCount, topCategories, nodes, has_more, next_offset }",
    schema: listNodesSchema,
    requiresConnection: true,
    annotations: {
      title: "List Available Nodes",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    outputSchema: paginatedOutputSchema("nodes"),
    handler: async (input) => {
      const { client } = await ensureConnected();
      const result = await listNodes(client, input);
      return formattedResult(
        input.response_format,
        result,
        () => renderNodes(result, input),
        "Narrow with 'search'/'category', lower 'detail', or page with 'offset'."
      );
    },
  });

  defineTool(server, {
    name: "get_node_info",
    description:
      "Get one node type's full detail: every input with its type, default, range and valid options; " +
      "every output with its type; an example JSON instance; and a connection guide. This is the tool " +
      "for 'how do I wire this node up'.\n\n" +
      "Errors: returns a not-found message naming the node if the class_type does not exist.",
    schema: getNodeInfoSchema,
    requiresConnection: true,
    annotations: {
      title: "Get Node Info",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) => {
      const { client } = await ensureConnected();
      return textResult(
        await getNodeInfo(client, input),
        "This node has an unusually large input spec; check a narrower node."
      );
    },
  });

  defineTool(server, {
    name: "find_nodes_by_type",
    description:
      "Find node types by the data types they accept or produce - e.g. everything that outputs LATENT, " +
      "or everything that accepts CONDITIONING. Use when composing a workflow and you need the node " +
      "that bridges two types. Pass inputType, outputType, or both. Paginated.\n\n" +
      "Returns: { query, total, count, offset, categoryCount, topCategories, nodes, has_more, next_offset }",
    schema: findNodesByTypeSchema,
    requiresConnection: true,
    annotations: {
      title: "Find Nodes by Type",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    outputSchema: paginatedOutputSchema("nodes"),
    handler: async (input) => {
      const { client } = await ensureConnected();
      try {
        const result = await findNodesByType(client, input);
        return formattedResult(
          input.response_format,
          result,
          () => renderFoundNodes(result),
          "Constrain with both inputType and outputType, or page with 'offset'."
        );
      } catch (error) {
        if (error instanceof NoTypeFilterError) {
          return errorResult(
            error.message,
            "e.g. { outputType: 'IMAGE' } for nodes that produce an image."
          );
        }
        throw error;
      }
    },
  });

  defineTool(server, {
    name: "build_node",
    description:
      "Generate valid node JSON with correct inputs and outputs, ready to drop into a workflow. Supply " +
      "'inputs' to override defaults; omitted inputs get defaults or connection placeholders. Use " +
      "comfyui_validate_workflow once the nodes are assembled.",
    schema: buildNodeSchema,
    requiresConnection: true,
    annotations: {
      title: "Build Node JSON",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) => {
      const { client } = await ensureConnected();
      return textResult(await buildNode(client, input));
    },
  });

  defineTool(server, {
    name: "validate_workflow",
    description:
      "Validate a workflow before running it: checks that every node type exists, connections point at " +
      "real nodes and slots, required inputs are present, and types match. Returns errors and warnings. " +
      "Cheaper than a failed run - call it before comfyui_run_workflow on anything hand-assembled.",
    schema: validateWorkflowSchema,
    requiresConnection: true,
    annotations: {
      title: "Validate Workflow",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) => {
      const { client } = await ensureConnected();
      const result = await validateWorkflow(client, input);
      return formattedResult(
        input.response_format,
        result,
        () => renderValidation(result),
        "Validate a smaller subgraph."
      );
    },
  });
}
