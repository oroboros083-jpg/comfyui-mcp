/**
 * ComfyUI connection lifecycle.
 *
 * Owns discovery, the health cache, capability refresh, and the restart/
 * shutdown watches. Split out of index.ts so that file is tool registration
 * and nothing else.
 *
 * All of this closes over a single ServerContext, bound once at startup by
 * bindContext(). The module-level `connectionCheck` deliberately shares one
 * in-flight probe across concurrent callers.
 */

import { join } from "path";

import { discoverComfyUI, getCandidateUrls } from "../discovery/index.js";
import { ToolError } from "../utils/errors.js";
import { ComfyUIClient, ObjectInfo } from "../client/comfyui.js";
import { ComfyUIWebSocket } from "../client/websocket.js";
import {
  detectCapabilities,
  getCapabilitySummary,
  Capabilities,
} from "../capabilities/index.js";
import { detectInstallation } from "../tools/install.js";
import { clearTagIndexCache } from "../tools/tags.js";
import { reconcileOrphanedJobs, ReconcileSummary } from "../jobs/reconcile.js";
import {
  analyzeUserOutputs,
  getUserPreferencesSummary,
} from "../analysis/outputs.js";
import { ServerContext } from "../context.js";
import {
  debug,
  info,
  warning,
  error as logError,
} from "../utils/logging.js";

// Bound once from main(); every function below reads through it.
let ctx: ServerContext;

export function bindContext(context: ServerContext): void {
  ctx = context;
}

export interface ConnectionRefresh {
  connected: boolean;
  url?: string;
  source?: string;
  error?: string;
  reconciled?: ReconcileSummary;
}


/**
 * Initialize connection to ComfyUI
 */
export async function initializeComfyUI(): Promise<boolean> {
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
    info(`ComfyUI is not running. ${nextStepWhenDown()}`, undefined, "init");
    clearConnectionState();
    return false;
  }

  ctx.discoveredUrl = discovered.url;
  ctx.discoverySource = discovered.source;
  info(`Found running ComfyUI at ${discovered.url} (${discovered.source})`, undefined, "init");

  // Create client
  ctx.client = new ComfyUIClient(discovered.url, ctx.config.comfyui.apiKey, ctx.config.agentId);
  debug("Created ComfyUI client", undefined, "init");

  // Get capabilities. This always re-fetches: reaching here means we either
  // never connected or lost the connection, and a ComfyUI restart can add or
  // remove models and custom nodes.
  try {
    debug("Getting object info...", undefined, "init");
    // Reaching here means we never connected or lost the connection, so any
    // cached catalogue is suspect. comfyui_reconnect exists to pick up models
    // and custom nodes added since - serving it a cached copy would defeat
    // the one thing it promises.
    ctx.client.invalidateObjectInfo();
    ctx.objectInfo = await ctx.client.getObjectInfo();
    debug(`Got object info with ${Object.keys(ctx.objectInfo).length} nodes`, undefined, "init");
    ctx.capabilities = detectCapabilities(ctx.objectInfo);
    info(`Detected capabilities:\n${getCapabilitySummary(ctx.capabilities)}`, undefined, "init");
  } catch (err) {
    logError(`Failed to get ComfyUI capabilities: ${err}`, undefined, "init");
    clearConnectionState();
    return false;
  }

  // Analyse user outputs for preferences. Deliberately NOT awaited: this walks
  // the whole output tree and reads up to MAX_IMAGES PNGs in full, which on a
  // real install is seconds to minutes. It used to be awaited despite the
  // comment claiming otherwise, so the server answered no tool call until it
  // finished. Every reader already treats userPreferences as optional.
  if (ctx.comfyuiPath) {
    const outputDir = join(ctx.comfyuiPath, "output");
    debug(`Analyzing user outputs in: ${outputDir}`, undefined, "init");
    void analyzeUserOutputs(outputDir)
      .then((userPrefs) => {
        if (ctx.capabilities) {
          ctx.capabilities.userPreferences = userPrefs;
        }
        debug(`User preferences:\n${getUserPreferencesSummary(userPrefs)}`, undefined, "init");
      })
      .catch((err) => {
        warning(`Failed to analyze user outputs: ${err}`, undefined, "init");
      });
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

export interface ConnectionHandles {
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

export function isFullyInitialized(): boolean {
  return !!(ctx.client && ctx.ws && ctx.capabilities && ctx.objectInfo);
}

export function connectionHandles(): ConnectionHandles {
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
export function clearConnectionState(): void {
  ctx.ws?.disconnect();
  ctx.client = null;
  ctx.ws = null;
  ctx.capabilities = null;
  ctx.objectInfo = null;
  ctx.discoveredUrl = null;
  ctx.discoverySource = null;
  ctx.lastHealthyAt = 0;
  // The tag index is ComfyUI-derived too: it is parsed from CSVs served by a
  // custom node, and the instance that comes back may be a different one, or
  // the same one with refreshed tag data.
  clearTagIndexCache();
}

/**
 * Cheap liveness probe. /system_stats is a few hundred bytes; /object_info is
 * megabytes and must never be used as a health check.
 */
export async function probeCurrentClient(): Promise<boolean> {
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
 * Whether a URL points at this machine.
 *
 * Nothing here launches anything any more, but where ComfyUI lives still
 * decides what advice is worth giving: telling someone to run `launch_comfyui`
 * cannot help a ComfyUI on another host, because that tool starts a process
 * where it is running, which is here.
 */
export function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/**
 * What to actually do about a ComfyUI that is down.
 *
 * This is the server's main disclosure point for a dead connection:
 * every connection-gated tool reaches it through unreachableError(), and it
 * is usually the first thing an agent sees when ComfyUI is not running. It
 * used to say "Start ComfyUI and call comfyui_reconnect", which reads as an
 * instruction to go and do it by hand - naming the two tools that cannot
 * help (reconnect only works once something is already listening) while
 * omitting the one that can.
 *
 * When the configured URL is on another host, it says so instead, rather
 * than advertising a tool that would start a process in the wrong place.
 */
export function nextStepWhenDown(): string {
  const url = process.env.COMFYUI_URL || ctx.config.comfyui.url;
  if (!isLocalUrl(url)) {
    return (
      `ComfyUI is configured at ${url}, which is not this machine. ` +
      "Start it on that host and call 'comfyui_reconnect'."
    );
  }

  return (
    "Launch it with the official Comfy MCP's launch_comfyui - it knows the " +
    "desktop app, a portable launcher and a source checkout, waits for the " +
    "server to answer, and connects. This server does not manage the ComfyUI " +
    "process at all. Its `install_comfyui` covers installing one in the first " +
    "place. If you would rather start ComfyUI yourself, call comfyui_reconnect " +
    "once it is up."
  );
}

/**
 * Error text for a genuinely unreachable ComfyUI: name where we looked, and
 * what to do about it.
 */
export function unreachableError(): string {
  const candidates = getCandidateUrls(ctx.config.comfyui.url);
  return (
    `ComfyUI is not reachable. Tried: ${candidates.join(", ")}. ` +
    `${nextStepWhenDown()} The MCP server itself does not need restarting.`
  );
}

/**
 * Resolve interrupted jobs against ComfyUI now that it is reachable again.
 */
export async function reconcileAfterConnect(): Promise<ReconcileSummary | undefined> {
  if (!ctx.client) return undefined;
  try {
    const summary = await reconcileOrphanedJobs(
      ctx.client,
      ctx.jobManager,
      ctx.config.outputDir,
      ctx.config.outputSizeThreshold
    );
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

export async function resolveConnection(): Promise<ConnectionHandles> {
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
    // Message and remedy split, so defineTool reports the remedy as a hint
    // rather than leaving it buried mid-sentence.
    throw new ToolError(
      `ComfyUI is not reachable. Tried: ${getCandidateUrls(ctx.config.comfyui.url).join(", ")}.`,
      nextStepWhenDown()
    );
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
export async function ensureConnected(): Promise<ConnectionHandles> {
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
export async function waitForShutdown(): Promise<boolean> {
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
export async function waitForRestart(timeoutMs: number): Promise<ConnectionRefresh> {
  const deadline = Date.now() + timeoutMs;
  let last: ConnectionRefresh = {
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
export async function refreshConnection(): Promise<ConnectionRefresh> {
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
