/**
 * Which tools this process serves.
 *
 * The server is commonly mounted next to the official Comfy MCP
 * (`Comfy-Org/comfy-mcp`). Where both answer the same question, two tool
 * surfaces cost the agent context and a choice it has no basis to make - and
 * for install, lifecycle and model-download that choice should go their way:
 * those tools wrap comfy-cli and track ComfyUI's own releases, which this
 * server does by hand.
 *
 * So `companion` drops ours. It is a registration-time gate rather than a
 * runtime check because a tool that is not registered costs nothing at all,
 * where a tool that refuses at call time still costs its schema on every
 * tools/list.
 *
 * The gate lives in `defineTool`, for the reason defineTool exists at all:
 * every tool goes through it, so no registration can miss the filter by
 * being written a different way.
 */

/** What ComfyUI-adjacent servers this process expects to sit beside. */
export type Profile = "standalone" | "companion";

/**
 * Tools `companion` does not register, and what covers each instead.
 *
 * Bare names, without the `comfyui_` prefix - the same spelling
 * `defineTool` receives, so the entries here and the registrations they
 * match cannot drift in spelling.
 *
 * Deliberately short. Only tools whose job the official server does *better*
 * belong here, not everything it happens to overlap. `get_queue` is the
 * clearest non-entry: their `job(action="queue")` lists what comfy-cli
 * submitted, ours reads ComfyUI's real queue and sees every job whoever sent
 * it, so dropping ours would lose the only cross-server view of what is
 * actually running.
 */
export const COMPANION_OMITS: ReadonlyMap<string, string> = new Map([
  ["start_comfyui", "launch_comfyui"],
  ["restart_comfyui", "restart_comfyui"],
  ["get_install_guide", "install_comfyui / their README"],
  ["get_model_guide", "search_models + download_model"],
  ["get_download_url", "download_model"],
]);

let active: Profile = "standalone";

/**
 * Choose the profile. Called by the entry point before any registration -
 * afterwards it has no effect, since the omitted tools are the ones never
 * registered in the first place.
 */
export function setProfile(profile: Profile): void {
  active = profile;
}

export function getProfile(): Profile {
  return active;
}

/** Should this bare tool name be left unregistered under the active profile? */
export function isOmitted(bareName: string): boolean {
  return active === "companion" && COMPANION_OMITS.has(bareName);
}
