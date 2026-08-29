/**
 * Connection lifecycle: status and reconnect.
 *
 * These stay available when ComfyUI is not running, because they are how a
 * caller finds out that it is not running and what to do about it.
 *
 * Starting, restarting and installing ComfyUI are NOT here. The official
 * Comfy MCP wraps comfy-cli for all of it (`launch_comfyui`,
 * `restart_comfyui`, `install_comfyui`, `search_models` + `download_model`)
 * and tracks ComfyUI's own releases, which this server would be reimplementing
 * by hand.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { defineTool, noArgs } from "../register.js";
import { refreshConnection, unreachableError } from "../connection.js";
import { getCandidateUrls } from "../../discovery/index.js";
import { getStatusSchema, getStatus } from "../../tools/install.js";
import { getCapabilitySummary, primaryArchitectureOf } from "../../capabilities/index.js";
import { dataResult, errorResult } from "../../utils/response.js";
import { ServerContext } from "../../context.js";

export function registerSetupTools(server: McpServer, ctx: () => ServerContext): void {
  /** Capability summary shared by every tool that reports a fresh connection. */
  const connectedSummary = () => {
    const c = ctx();
    return {
      capabilities: c.capabilities ? getCapabilitySummary(c.capabilities) : undefined,
      nodeCount: c.objectInfo ? Object.keys(c.objectInfo).length : 0,
    };
  };

  defineTool(server, {
    name: "get_status",
    description:
      "Connection state, plus which model architectures this ComfyUI actually has and which prompting " +
      "guide they call for. Probes live rather than reporting cached state, so it answers 'is this " +
      "working right now'. When disconnected it lists every URL that was tried.\n\n" +
      "CALL THIS FIRST: the architecture it detects is what selects a prompting guide, and prompting " +
      "style changes output quality more than any other single choice.\n\n" +
      "If this reports comfyuiConnected:false, comfyui_reconnect retries discovery for a ComfyUI that " +
      "is already running. To install or launch one, use the official Comfy MCP (`install_comfyui`, " +
      "`launch_comfyui`) - this server deliberately does not manage the ComfyUI process.",
    schema: getStatusSchema,
    requiresConnection: false,
    annotations: {
      title: "Get ComfyUI Status",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async () => {
      const refresh = await refreshConnection();
      const c = ctx();

      const status = (await getStatus(
        refresh.connected,
        c.discoveredUrl || undefined,
        c.discoverySource || undefined,
        c.capabilities ? getCapabilitySummary(c.capabilities) : undefined
      ));

      if (!refresh.connected) {
        status.error = refresh.error;
        status.urlsTried = getCandidateUrls(c.config.comfyui.url);
      }

      if (
        refresh.reconciled &&
        (refresh.reconciled.completed > 0 || refresh.reconciled.failed > 0)
      ) {
        status.reconciledTasks = refresh.reconciled;
      }

      if (refresh.connected && c.capabilities) {
        // Was a second copy of discovery.ts's ladder, already drifted from it:
        // this one omitted the advice text and knew nothing of Cascade.
        const primary = primaryArchitectureOf(c.capabilities);

        // Report what was detected, or say nothing was. The `?? "sd15"` this
        // replaces published a guess as a positive detection on any install
        // whose checkpoints are custom-named, which is the ladder's old final
        // `else` reappearing in the one place the registry could not see.
        //
        // The guide key is `guide`, not `id`: most registry rows have no
        // guide of their own, so naming the id sent the agent to a
        // get_prompting_guide call that errors.
        status.promptingAdvice = primary
          ? {
              detectedModelType: primary.id,
              recommendation: primary.guide
                ? `Call comfyui_get_prompting_guide('${primary.guide}') before generating - prompting style materially changes output quality.`
                : `No dedicated prompting guide for ${primary.displayName} yet. ${primary.advice}`,
            }
          : {
              detectedModelType: "unknown",
              recommendation:
                "No model architecture detected. The official Comfy MCP's `search_models` lists what is installed.",
            };
      }

      return dataResult(status);
    },
  });

  defineTool(server, {
    name: "reconnect",
    description:
      "Re-discover and reconnect to a ComfyUI that is ALREADY RUNNING, refreshing the cached model " +
      "and node lists. Use after restarting ComfyUI yourself, or when a tool reports it unreachable " +
      "but you know it is up. Rediscovers from scratch, so it finds an instance that came back on a " +
      "different port, and resolves tasks interrupted by the restart.\n\n" +
      "This does NOT start ComfyUI. If nothing is running, launch it with the official Comfy MCP's " +
      "`launch_comfyui` first - reconnecting cannot succeed while there is nothing to connect to.",
    schema: noArgs,
    requiresConnection: false,
    annotations: {
      title: "Reconnect to ComfyUI",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async () => {
      const refresh = await refreshConnection();

      if (!refresh.connected) {
        // refresh.error is already unreachableError(): the URLs that were
        // tried and the next step to take. Wrapping it in another sentence
        // that repeats the URL list, and then appending the same guidance as
        // a hint, said everything three times.
        return errorResult(refresh.error ?? unreachableError());
      }

      return dataResult({
        connected: true,
        url: refresh.url,
        discoverySource: refresh.source,
        ...connectedSummary(),
        reconciledTasks: refresh.reconciled,
        note: "Model and node lists were re-read from ComfyUI.",
      });
    },
  });
}
