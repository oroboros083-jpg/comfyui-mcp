/**
 * Looking at what you are about to run, and at what you are about to load.
 *
 * This module used to also list models, list node types, inspect one node and
 * search nodes by the types they produce or accept. All four are gone: the
 * official Comfy MCP's `nodes` tool does search, inspect, filter AND
 * graph-walk between types over the same live `object_info`, and its
 * `search_models` reads the same install. Reimplementing a worse version of
 * either is exactly what this server is not for.
 *
 * The two that stay are the two neither server covers. `build_node`:
 * inspecting a node's schema and CONSTRUCTING a filled instance from it are
 * different jobs, and official only does the first. `scan_model`: nothing in
 * ComfyUI or comfy-cli looks inside a checkpoint before `torch.load`
 * unpickles it, so a file `download_model` fetched is a file nobody checked.
 * Neither needs a connection - a scan reads the disk.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { defineTool } from "../register.js";
import { ensureConnected } from "../connection.js";
import { dataResult, formattedResult } from "../../utils/response.js";
import { buildNodeSchema, buildNode } from "../../tools/models.js";
import { scanModelSchema, scanModel, renderScanModel } from "../../tools/scan-model.js";

export function registerDiscoveryTools(server: McpServer): void {
  defineTool(server, {
    name: "scan_model",
    description:
      "Read a model file's pickle without executing it, and report what loading it would import. " +
      "A .ckpt/.pt/.pth/.bin is a Python pickle, so torch.load runs whatever the file names - this " +
      "answers whether that is anything worse than tensors.\n\n" +
      "Returns a verdict ('dangerous', 'suspicious', 'safe'), the imports behind it, and the path of " +
      "a .safetensors build sitting beside the file when one does, since loading that instead makes " +
      "the question moot. Handles safetensors and GGUF (nothing to scan), raw pickles, and the ZIP " +
      "torch.save has written since PyTorch 1.6.\n\n" +
      "'safe' means 'nothing on the known-dangerous list', not proof. Errors on a file that is not a " +
      "recognised model format, or whose extension is not one of .ckpt .pt .pth .bin .pkl .pickle " +
      ".safetensors .sft .gguf - treat that as unscanned, not clean.\n\n" +
      "Neither ComfyUI nor the official Comfy MCP's `download_model` checks this, so a file that " +
      "arrived through either is unscanned.",
    schema: scanModelSchema,
    annotations: {
      title: "Scan Model File",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (input) => {
      const result = await scanModel(input);
      return formattedResult(
        input.response_format,
        result,
        () => renderScanModel(result),
        "Scan one file at a time; there is no listing to page through."
      );
    },
  });

  defineTool(server, {
    name: "build_node",
    description:
      "Generate valid node JSON with correct inputs and outputs, ready to drop into a workflow. Supply " +
      "'inputs' to override defaults; omitted inputs get defaults or connection placeholders.\n\n" +
      "To find out WHICH node to build, or what its inputs mean, use the official Comfy MCP's `nodes` " +
      "tool - it searches, inspects and graph-walks the same live catalog. This builds an instance " +
      "once you know what you want, which that tool does not do.",
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
      return dataResult(await buildNode(client, input));
    },
  });
}
