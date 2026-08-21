/**
 * Connection lifecycle and installation help: status, reconnect, start,
 * restart, and the setup guides. These stay available when ComfyUI is not
 * running - they are how the user gets it running.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { defineTool, noArgs } from "../register.js";
import {
  refreshConnection,
  waitForRestart,
  waitForShutdown,
  ensureConnected,
  unreachableError,
} from "../connection.js";
import { getCandidateUrls } from "../../discovery/index.js";
import { getCapabilitySummary } from "../../capabilities/index.js";
import { dataResult, textResult, errorResult } from "../../utils/response.js";
import {
  getInstallGuideSchema,
  getInstallGuide,
  getModelGuideSchema,
  getModelGuide,
  getStatusSchema,
  getStatus,
} from "../../tools/install.js";
import {
  startComfyUISchema,
  resolveLaunchTarget,
  spawnComfyUI,
  launchBlockedReason,
  readStartupLogTail,
  formatStartupLogTail,
} from "../../tools/launch.js";
import { restartComfyUISchema } from "../../tools/restart.js";
import { ServerContext } from "../../context.js";
import { info } from "../../utils/logging.js";

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
      "Get the current status of the ComfyUI connection and installation. Probes live rather than " +
      "reporting cached state, so it answers 'is this working right now'. Returns connection state, " +
      "the URL in use, detected capabilities, and - when disconnected - every URL that was tried " +
      "plus the next step to take.\n\n" +
      "If this reports comfyuiConnected:false, comfyui_start_comfyui launches ComfyUI on this " +
      "machine and connects; comfyui_reconnect only helps when it is already running.",
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
        let modelType = "sd15";
        if (c.capabilities.hasFlux) modelType = "flux";
        else if (c.capabilities.hasSD3) modelType = "sd3";
        else if (c.capabilities.hasSDXL) modelType = "sdxl";

        status.promptingAdvice = {
          detectedModelType: modelType,
          recommendation: `Call comfyui_get_prompting_guide('${modelType}') before generating - prompting style materially changes output quality.`,
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
      "This does NOT start ComfyUI. If nothing is running, call comfyui_start_comfyui instead - " +
      "reconnecting cannot succeed while there is nothing to connect to.",
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

  defineTool(server, {
    name: "start_comfyui",
    description:
      "Launch ComfyUI on this machine and connect to it. This is the tool to reach for whenever " +
      "ComfyUI is not running - when comfyui_get_status reports comfyuiConnected:false, or any tool " +
      "fails with 'ComfyUI is not reachable'. Nothing else in this server can bring it up.\n\n" +
      "Auto-detects the ComfyUI desktop app, a portable launcher or a source checkout, starts it " +
      "detached so it outlives this server, waits for it to answer, then connects and re-reads the " +
      "model and node lists. Pass 'command'/'args'/'cwd' to launch something else, or " +
      "'timeoutSeconds' for an install whose cold start is slow.\n\n" +
      "Safe to call speculatively: it probes first and returns alreadyRunning:true without launching " +
      "anything if an instance is already reachable, so it never starts a second one on a second " +
      "port. Do note it starts a real GPU process on the user's machine.\n\n" +
      "Use comfyui_restart_comfyui instead to restart an instance that is already running, and " +
      "comfyui_reconnect if ComfyUI is up but this server lost track of it.\n\n" +
      "Errors: if the launch never answers, the failure includes the tail of ComfyUI's own startup " +
      "log, which is normally where the real cause is - a bad model path, a custom node that fails " +
      "to import, a port already in use. Reports the reason instead when a local launch cannot help " +
      "at all: this server running in Docker, or COMFYUI_URL pointing at another host.",
    schema: startComfyUISchema,
    requiresConnection: false,
    annotations: {
      title: "Start ComfyUI",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) => {
      // Probe live rather than trusting cached state: acting on a stale
      // "disconnected" would start a second ComfyUI on a second port and
      // quietly split the user's queue across both.
      const existing = await refreshConnection();
      if (existing.connected) {
        return dataResult({
          started: false,
          alreadyRunning: true,
          url: existing.url,
          discoverySource: existing.source,
          ...connectedSummary(),
          reconciledTasks: existing.reconciled,
          note: "ComfyUI is already running; nothing was launched. Use comfyui_restart_comfyui to restart it.",
        });
      }

      const blocked = launchBlockedReason(
        process.env.COMFYUI_URL || ctx().config.comfyui.url
      );
      if (blocked) return errorResult(blocked);

      const { target, detected } = resolveLaunchTarget(input);
      if (!target) {
        return errorResult(
          "No ComfyUI installation was found in the usual locations.",
          "Pass 'command' with the path to your launcher, set COMFYUI_LAUNCH_COMMAND, " +
            "or see comfyui_get_install_guide if ComfyUI is not installed yet."
        );
      }

      const alternatives = detected
        .filter((option) => option.label !== target.label)
        .map((option) => option.label);

      const startedAt = Date.now();
      let launch: Awaited<ReturnType<typeof spawnComfyUI>>;
      try {
        launch = await spawnComfyUI(target);
      } catch (spawnError) {
        return errorResult(
          `Failed to launch via ${target.label}: ${
            spawnError instanceof Error ? spawnError.message : String(spawnError)
          }`,
          `Alternatives detected: ${alternatives.join(", ") || "none"}. Pass 'command' to launch a different executable, or start ComfyUI yourself and call comfyui_reconnect.`
        );
      }

      info(`Launched ComfyUI via ${target.label} (pid ${launch.pid})`, undefined, "launch");

      const recovery = await waitForRestart(input.timeoutSeconds * 1000);
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);

      if (!recovery.connected) {
        const exit = launch.exited();
        // ComfyUI writes why it died to its own log. Without reading it the
        // only advice available is "run it in a terminal", which an agent
        // cannot act on.
        const log = readStartupLogTail(target);

        const hint = exit
          ? "The launcher exited before ComfyUI answered, so it likely failed to start."
          : "The process is still running but has not answered yet - a cold start can take a while, so comfyui_reconnect may succeed shortly.";

        return errorResult(
          `Launched ${target.label} (pid ${launch.pid}) but it has not answered after ${elapsedSeconds}s: ${recovery.error ?? ""}` +
            formatStartupLogTail(log),
          log
            ? `${hint} The log above is from ComfyUI itself - fix what it reports, then call comfyui_start_comfyui again.`
            : `${hint} No ComfyUI startup log was found to explain it; run the command in a terminal to see its output.`
        );
      }

      return dataResult({
        started: true,
        connected: true,
        launcher: target.label,
        command: target.command,
        pid: launch.pid,
        elapsedSeconds,
        url: recovery.url,
        discoverySource: recovery.source,
        ...connectedSummary(),
        reconciledTasks: recovery.reconciled,
        note: "ComfyUI is detached from this server - it keeps running if the MCP server restarts.",
      });
    },
  });

  defineTool(server, {
    name: "restart_comfyui",
    description:
      "Ask ComfyUI to restart itself, then wait for it to come back and reconnect. Use to load newly " +
      "installed custom nodes or models, or to clear a wedged instance - it is a clean in-app restart, " +
      "not a process kill. Requires ComfyUI-Manager (core ComfyUI has no restart endpoint). Refuses " +
      "while generations are running or queued unless force is set.",
    schema: restartComfyUISchema,
    requiresConnection: true,
    annotations: {
      title: "Restart ComfyUI",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (input) => {
      const { client } = await ensureConnected();
      const restartingUrl = ctx().discoveredUrl;

      // A restart drops whatever ComfyUI is working on, so don't pull it out
      // from under a running generation unless explicitly told to.
      if (!input.force) {
        const queue = await client.getQueue();
        const busy = queue.queue_running.length + queue.queue_pending.length;
        if (busy > 0) {
          return errorResult(
            `${busy} generation(s) running or queued. Restarting would drop them.`,
            "Wait for them to finish, cancel them with comfyui_cancel_task, or call comfyui_restart_comfyui again with force: true."
          );
        }
      }

      const startedAt = Date.now();
      const { endpoint } = await client.requestRestart();
      info(`Asked ComfyUI to restart via ${endpoint}`, undefined, "restart");

      const observedShutdown = await waitForShutdown();
      const recovery = await waitForRestart(input.timeoutSeconds * 1000);
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);

      if (!recovery.connected) {
        // A restart that fails to come back fails for the same reasons a cold
        // start does - a broken model path, a custom node that stopped
        // importing - and ComfyUI records it in the same log.
        const log = readStartupLogTail(null);

        return errorResult(
          `Restart was accepted via ${endpoint} but ComfyUI has not come back after ${elapsedSeconds}s: ${recovery.error ?? ""}` +
            formatStartupLogTail(log),
          observedShutdown
            ? "ComfyUI shut down but has not returned yet. It may still be loading - call comfyui_reconnect in a moment. This server does not need restarting."
            : "ComfyUI never went offline, so the restart may not have been accepted. Check ComfyUI's console output."
        );
      }

      return dataResult({
        restarted: true,
        recovered: true,
        endpoint,
        observedShutdown,
        elapsedSeconds,
        url: recovery.url,
        movedFrom:
          restartingUrl && restartingUrl !== recovery.url ? restartingUrl : undefined,
        discoverySource: recovery.source,
        ...connectedSummary(),
        reconciledTasks: recovery.reconciled,
        note: observedShutdown
          ? "ComfyUI restarted; model and node lists were re-read."
          : "ComfyUI is reachable and its lists were re-read, but it was never observed going offline - it may have restarted too quickly to see, or not restarted at all.",
      });
    },
  });

  defineTool(server, {
    name: "get_install_guide",
    description:
      "Get installation instructions for ComfyUI. Recommends the desktop app for most users. " +
      "Returns markdown covering download, install, and first run.",
    schema: getInstallGuideSchema,
    requiresConnection: false,
    annotations: {
      title: "Get Installation Guide",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: (input) => textResult(getInstallGuide(input)),
  });

  defineTool(server, {
    name: "get_model_guide",
    description:
      "Get guidance on downloading and installing models for ComfyUI, including where each model type " +
      "belongs on disk. Use comfyui_get_download_url for the URL of a specific model.",
    schema: getModelGuideSchema,
    requiresConnection: false,
    annotations: {
      title: "Get Model Setup Guide",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: (input) => textResult(getModelGuide(input)),
  });
}
