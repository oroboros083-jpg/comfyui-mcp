/**
 * Constructing a node for a workflow.
 *
 * This module used to also list models, list node types, inspect one node and
 * search nodes by the types they produce or accept. All four are gone: the
 * official Comfy MCP's `nodes` tool does search, inspect, filter AND
 * graph-walk between types over the same live `object_info`, and its
 * `search_models` reads the same install. Reimplementing a worse version of
 * either is exactly what this server is not for.
 *
 * `build_node` stays because it is the one thing neither covers - inspecting a
 * node's schema and CONSTRUCTING a filled instance from it are different jobs,
 * and official only does the first.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { defineTool } from "../register.js";
import { ensureConnected } from "../connection.js";
import { dataResult } from "../../utils/response.js";
import { buildNodeSchema, buildNode } from "../../tools/models.js";

export function registerDiscoveryTools(server: McpServer): void {
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
