/**
 * One table describing every model architecture this server knows about.
 *
 * Before this existed, "what does this architecture need" was answered
 * independently by five modules with five different vocabularies:
 * capabilities/ detected five architectures, prompting-guide/ shipped eleven
 * guides of which only four were reachable, builder/ had two graph shapes,
 * and recommend/ had a four-value union it had to squeeze thirty-six model
 * patterns into - so twenty-four of them were labelled "flux" regardless of
 * what they actually were. Adding one architecture meant ~12 edits across
 * eight files, and the modules drifted apart between edits.
 *
 * Everything about an architecture now lives in one row here. Adding one is
 * a row, plus a builder function if it needs a graph shape that does not
 * already exist.
 *
 * The critical separation is `id` versus `workflow`. Identity ("this is a
 * Qwen model") and graph shape ("this loads through UNETLoader +
 * DualCLIPLoader like Flux does") are different facts. Conflating them is
 * what forced Qwen, HiDream, Wan and the rest to claim they were Flux, which
 * in turn sent their users to the Flux prompting guide.
 */

import { comboOptions, ObjectInfo } from "../client/comfyui.js";

/** Graph shapes builder.ts knows how to produce. */
export type WorkflowShape = "standard" | "flux";

export interface ArchitectureSpec {
  /** Stable identifier, also the templates/db `modelType` value. */
  id: string;
  /** Human-readable name for summaries. */
  displayName: string;
  /**
   * The `Capabilities` boolean this architecture backs, where one exists.
   * Only the five that predate this registry have one; they are public API
   * (they appear in get_capabilities output) so they are still published.
   */
  legacyFlag?: "hasSD15" | "hasSDXL" | "hasSD3" | "hasFlux" | "hasCascade";
  /** Matched against installed checkpoint / diffusion-model filenames. */
  detect: {
    checkpoints?: RegExp;
    unets?: RegExp;
  };
  /** Which graph shape a workflow for this architecture uses. */
  workflow: WorkflowShape;
  /** Key into PROMPTING_GUIDES, when a guide for this architecture exists. */
  guide?: string;
  /** Extra substrings that should resolve to this architecture by name. */
  aliases?: string[];
  /** One-line steer, shown when this is the primary architecture installed. */
  advice: string;
  /**
   * Which architecture wins when several are installed. Higher is more
   * specific: the generic bases sit lowest so a specialised model is not
   * masked by the SDXL checkpoint sitting next to it.
   */
  priority: number;
}

/**
 * Ordered loosely by family. `priority`, not position, decides which wins.
 *
 * Detection patterns for the five architectures that predate this table are
 * reproduced exactly as they were, including SDXL's very loose bare `xl` -
 * narrowing it would silently change what existing installs report.
 */
export const ARCHITECTURES: ArchitectureSpec[] = [
  {
    id: "sd15",
    displayName: "SD 1.5",
    legacyFlag: "hasSD15",
    detect: { checkpoints: /v1-5|v1\.5|sd15/i },
    workflow: "standard",
    guide: "sd15",
    aliases: ["sd1", "1.5", "sd 1"],
    advice:
      "Keyword-style prompts with quality boosters. Negative prompts essential.",
    priority: 10,
  },
  {
    id: "sdxl",
    displayName: "SDXL",
    legacyFlag: "hasSDXL",
    detect: { checkpoints: /sdxl|xl/i },
    workflow: "standard",
    guide: "sdxl",
    aliases: ["sd_xl", "illustrious", "pony", "noobai"],
    advice:
      "Natural language or keywords. Prompt weights supported (0.8-1.4).",
    priority: 20,
  },
  {
    id: "sd3",
    displayName: "SD3",
    legacyFlag: "hasSD3",
    detect: { checkpoints: /sd3|sd_3/i, unets: /sd3/i },
    workflow: "standard",
    guide: "sd3",
    aliases: ["sd 3"],
    advice: "Natural language prompts. No prompt weights.",
    priority: 30,
  },
  {
    id: "cascade",
    displayName: "Stable Cascade",
    legacyFlag: "hasCascade",
    detect: { checkpoints: /cascade/i },
    workflow: "standard",
    guide: "cascade",
    advice: "Two-stage model. Natural language prompts, moderate detail.",
    priority: 35,
  },
  {
    id: "flux",
    displayName: "FLUX",
    legacyFlag: "hasFlux",
    detect: { checkpoints: /flux/i, unets: /flux/i },
    workflow: "flux",
    guide: "flux",
    advice:
      "Natural language prompts. No negative prompts or prompt weights.",
    priority: 40,
  },

  // Architectures that had a prompting guide but nothing that could detect
  // them or route to their guide.
  {
    id: "qwen",
    displayName: "Qwen Image",
    detect: { checkpoints: /qwen/i, unets: /qwen/i },
    workflow: "flux",
    guide: "qwen",
    advice:
      "Natural language prompts, strong at rendered text. No negative prompts.",
    priority: 60,
  },
  {
    id: "hunyuan",
    displayName: "Hunyuan",
    detect: { checkpoints: /hunyuan/i, unets: /hunyuan/i },
    workflow: "flux",
    guide: "hunyuan",
    advice: "Natural language prompts. Bilingual (English and Chinese).",
    priority: 55,
  },
  {
    id: "auraflow",
    displayName: "AuraFlow",
    detect: { checkpoints: /aura.?flow/i, unets: /aura.?flow/i },
    workflow: "standard",
    guide: "auraflow",
    advice: "Natural language prompts. Prompt weights supported.",
    priority: 50,
  },
  {
    id: "kolors",
    displayName: "Kolors",
    detect: { checkpoints: /kolors/i, unets: /kolors/i },
    workflow: "standard",
    guide: "kolors",
    advice: "Natural language prompts. Bilingual (English and Chinese).",
    priority: 50,
  },
  {
    id: "pixart",
    displayName: "PixArt",
    detect: { checkpoints: /pixart/i, unets: /pixart/i },
    workflow: "standard",
    guide: "pixart",
    advice: "Natural language prompts, descriptive and detailed.",
    priority: 50,
  },
  {
    id: "playground",
    displayName: "Playground",
    detect: { checkpoints: /playground/i },
    workflow: "standard",
    guide: "playground",
    advice: "SDXL-style prompting. Prompt weights supported.",
    priority: 50,
  },

  // Architectures that existed only as recommend.ts patterns claiming to be
  // Flux. They keep the Flux graph shape - that part was true - but no
  // longer claim to be Flux.
  {
    id: "hidream",
    displayName: "HiDream",
    detect: { checkpoints: /hidream/i, unets: /hidream/i },
    workflow: "flux",
    advice:
      "Natural language prompts. No dedicated guide yet; the Flux guide is the closest fit.",
    priority: 58,
  },
  {
    id: "wan",
    displayName: "Wan Video",
    detect: { checkpoints: /^wan[\d._]/i, unets: /^wan[\d._]/i },
    workflow: "flux",
    advice:
      "Video model. Describe motion as well as subject. No dedicated guide yet.",
    priority: 57,
  },
  {
    id: "lumina",
    displayName: "Lumina",
    detect: { checkpoints: /lumina/i, unets: /lumina/i },
    workflow: "flux",
    advice: "Natural language prompts. No dedicated guide yet.",
    priority: 50,
  },
  {
    id: "chroma",
    displayName: "Chroma",
    detect: { checkpoints: /chroma/i, unets: /chroma/i },
    workflow: "flux",
    advice: "Flux-derived. Natural language prompts, no negative prompts.",
    priority: 50,
  },
  {
    id: "zimage",
    displayName: "Z-Image",
    detect: { checkpoints: /z.?image/i, unets: /z.?image/i },
    workflow: "flux",
    aliases: ["z image", "z-image"],
    advice: "Turbo model, few steps. Natural language prompts.",
    priority: 50,
  },
  {
    id: "mochi",
    displayName: "Mochi",
    detect: { checkpoints: /mochi/i, unets: /mochi/i },
    workflow: "flux",
    advice: "Video model. Describe motion. No dedicated guide yet.",
    priority: 45,
  },
  {
    id: "ltxvideo",
    displayName: "LTX Video",
    detect: { checkpoints: /ltx/i, unets: /ltx/i },
    workflow: "flux",
    aliases: ["ltx-video", "ltx video"],
    advice: "Video model. Describe motion. No dedicated guide yet.",
    priority: 45,
  },
  {
    id: "cosmos",
    displayName: "Nvidia Cosmos",
    detect: { checkpoints: /cosmos/i, unets: /cosmos/i },
    workflow: "flux",
    advice: "Video model. Describe motion. No dedicated guide yet.",
    priority: 45,
  },
  {
    id: "aceaudio",
    displayName: "ACE Step / Stable Audio",
    detect: { checkpoints: /ace.?step|stable.?audio/i, unets: /ace.?step/i },
    workflow: "flux",
    aliases: ["ace step", "ace-step", "stable audio"],
    advice:
      "Audio model. Describe genre, instrumentation and mood rather than visual detail.",
    priority: 48,
  },
  {
    id: "omnigen",
    displayName: "OmniGen",
    detect: { checkpoints: /omnigen/i, unets: /omnigen/i },
    workflow: "flux",
    advice: "Instruction-following image editing. Describe the change wanted.",
    priority: 45,
  },
];

const BY_ID = new Map(ARCHITECTURES.map((a) => [a.id, a]));

/** Look one up by its id. */
export function architectureById(id: string): ArchitectureSpec | undefined {
  return BY_ID.get(id.toLowerCase());
}

/**
 * Resolve a free-form name - a filename, a model type, whatever the caller
 * has - to an architecture, by id, alias, or detection pattern.
 *
 * Ordered by descending priority so a specific match beats a generic one:
 * "qwen_image_fp8.safetensors" must not resolve to SDXL just because the
 * legacy SDXL pattern matches a bare "xl" anywhere in the string.
 */
export function architectureFor(name: string): ArchitectureSpec | undefined {
  const lower = name.toLowerCase();

  const ranked = [...ARCHITECTURES].sort((a, b) => b.priority - a.priority);

  for (const spec of ranked) {
    if (spec.id === lower) return spec;
    if (spec.aliases?.some((alias) => lower.includes(alias))) return spec;
  }

  for (const spec of ranked) {
    if (spec.detect.checkpoints?.test(lower)) return spec;
    if (spec.detect.unets?.test(lower)) return spec;
  }

  return undefined;
}

/**
 * Every architecture with at least one matching model installed.
 *
 * Reads the loader combos through `comboOptions`, so it sees both the legacy
 * and current ComfyUI combo formats - the hand-rolled check this replaced
 * understood only the legacy one.
 */
export function detectArchitectures(objectInfo: ObjectInfo): ArchitectureSpec[] {
  const checkpoints = comboOptions(
    objectInfo["CheckpointLoaderSimple"]?.input?.required?.ckpt_name
  ).map((c) => c.toLowerCase());

  const unets = comboOptions(
    objectInfo["UNETLoader"]?.input?.required?.unet_name
  ).map((c) => c.toLowerCase());

  return ARCHITECTURES.filter(
    (spec) =>
      (spec.detect.checkpoints &&
        checkpoints.some((c) => spec.detect.checkpoints!.test(c))) ||
      (spec.detect.unets && unets.some((u) => spec.detect.unets!.test(u)))
  );
}

/**
 * The architecture to steer by when several are installed: the most specific
 * one present. Returns undefined when nothing matched, so callers can say so
 * rather than guessing SD 1.5.
 */
export function primaryArchitecture(
  detected: ArchitectureSpec[]
): ArchitectureSpec | undefined {
  return [...detected].sort((a, b) => b.priority - a.priority)[0];
}
