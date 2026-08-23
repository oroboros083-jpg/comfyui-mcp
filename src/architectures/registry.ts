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
    // `illustrious`, `pony` and `noobai` used to be aliases here. They are
    // SDXL by graph shape only: they want booru tags, quality tokens and a
    // tag order, none of which the SDXL guide teaches. Aliasing them here
    // meant every one of their users was handed advice close to the inverse
    // of what their model wanted, so they are now rows of their own below.
    aliases: ["sd_xl"],
    advice:
      "Natural language or keywords. Prompt weights supported (0.8-1.4).",
    priority: 20,
  },
  // Booru-tag anime finetunes. All SDXL-shaped, none SDXL-prompted, so they
  // sit above SDXL's priority - a WAI-Illustrious checkpoint matches both the
  // bare `xl` pattern and `illustrious`, and the specific one has to win.
  {
    id: "illustrious",
    displayName: "Illustrious XL",
    detect: { checkpoints: /illustrious/i },
    workflow: "standard",
    guide: "illustrious",
    advice:
      "Booru tags, not prose. Lead with quality tags; native 1536x1536.",
    priority: 25,
  },
  {
    id: "noobai",
    displayName: "NoobAI-XL",
    detect: { checkpoints: /noob.?ai/i },
    workflow: "standard",
    guide: "noobai",
    aliases: ["noob ai"],
    advice:
      "Booru tags from Danbooru and e621. Recency tags (newest/old) drive the art style.",
    priority: 26,
  },
  {
    id: "pony",
    displayName: "Pony Diffusion",
    detect: { checkpoints: /pony/i },
    workflow: "standard",
    guide: "pony",
    advice:
      "Open with the score chain (score_9, score_8_up, score_7_up) and a source_ tag.",
    priority: 25,
  },
  {
    id: "animagine",
    displayName: "Animagine XL",
    detect: { checkpoints: /animagine/i },
    workflow: "standard",
    guide: "animagine",
    advice:
      "Booru tags in a fixed order: count, character, series, rating, general, then quality LAST.",
    priority: 27,
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
    id: "anima",
    displayName: "Anima",
    // `\banima` with a letter excluded after it, so this does not swallow
    // "animagine" (its own row above) or "animatediff" (not an architecture).
    detect: { checkpoints: /\banima(?![a-z])/i, unets: /\banima(?![a-z])/i },
    // Anima actually loads UNETLoader + a SINGLE CLIPLoader (qwen_3_06b_base)
    // + VAELoader. "flux" is the closest shape this builder has and is what
    // `qwen` already uses for the same reason; the graph builder emits a
    // DualCLIPLoader where Anima wants one encoder. Detection, guidance and
    // recommendations are unaffected - only builder.ts output is approximate.
    workflow: "flux",
    guide: "anima",
    advice:
      "Booru tags, natural language, or both. Lead with quality/score/safety tags. Turbo variant runs at CFG 1.",
    priority: 52,
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
    guide: "hidream",
    advice:
      "Natural language prompts. Match CFG to the variant: ~5 for Full, 1 for Dev/Fast.",
    priority: 58,
  },
  {
    id: "wan",
    displayName: "Wan Video",
    detect: { checkpoints: /^wan[\d._]/i, unets: /^wan[\d._]/i },
    workflow: "flux",
    guide: "wan",
    advice:
      "Video model. State subject motion AND camera motion separately.",
    priority: 57,
  },
  {
    id: "lumina",
    displayName: "Lumina",
    detect: { checkpoints: /lumina/i, unets: /lumina/i },
    workflow: "flux",
    guide: "lumina",
    advice:
      "Natural language prompts, detailed. Negative prompts supported.",
    priority: 50,
  },
  {
    id: "chroma",
    displayName: "Chroma",
    detect: { checkpoints: /chroma/i, unets: /chroma/i },
    workflow: "flux",
    guide: "chroma",
    advice:
      "Flux-derived but DOES take a negative prompt, and wants CFG 4-5 rather than 1.",
    priority: 50,
  },
  {
    id: "zimage",
    displayName: "Z-Image",
    detect: { checkpoints: /z.?image/i, unets: /z.?image/i },
    workflow: "flux",
    aliases: ["z image", "z-image"],
    guide: "zimage",
    advice:
      "Distilled turbo: CFG 1 and single-digit steps. Short, concrete prompts.",
    priority: 50,
  },
  {
    id: "mochi",
    displayName: "Mochi",
    detect: { checkpoints: /mochi/i, unets: /mochi/i },
    workflow: "flux",
    guide: "mochi",
    advice:
      "Video model. Strong on fluids and cloth; name the camera move.",
    priority: 45,
  },
  {
    id: "ltxvideo",
    displayName: "LTX Video",
    detect: { checkpoints: /ltx/i, unets: /ltx/i },
    workflow: "flux",
    aliases: ["ltx-video", "ltx video"],
    guide: "ltxvideo",
    advice:
      "Video model. Wants unusually LONG prompts - short ones underperform.",
    priority: 45,
  },
  {
    id: "cosmos",
    displayName: "Nvidia Cosmos",
    detect: { checkpoints: /cosmos/i, unets: /cosmos/i },
    workflow: "flux",
    guide: "cosmos",
    advice:
      "Video world model. Physically literal descriptions; state the viewpoint.",
    priority: 45,
  },
  {
    id: "aceaudio",
    displayName: "ACE Step / Stable Audio",
    detect: { checkpoints: /ace.?step|stable.?audio/i, unets: /ace.?step/i },
    workflow: "flux",
    aliases: ["ace step", "ace-step", "stable audio"],
    guide: "aceaudio",
    advice:
      "Audio model. Genre, instrumentation, tempo, production - no visual language.",
    priority: 48,
  },
  {
    id: "omnigen",
    displayName: "OmniGen",
    detect: { checkpoints: /omnigen/i, unets: /omnigen/i },
    workflow: "flux",
    guide: "omnigen",
    advice:
      "Instruction-following editing. Write the CHANGE wanted, not a scene description.",
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

  // One pass, testing every way a row can match before moving to the next.
  //
  // Running all the aliases before any of the detection patterns made
  // priority order meaningless across the two: SD 1.5 is the lowest-priority
  // row in the table, but its "1.5" alias is a substring of every checkpoint
  // carrying a v1.5 version string, so "juggernautXL_v1.5.safetensors"
  // resolved to SD 1.5 and the SDXL pattern never got to run.
  for (const spec of ranked) {
    if (spec.id === lower) return spec;
    if (spec.aliases?.some((alias) => lower.includes(alias))) return spec;
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

  // Descending priority, so the most specific match leads. A plain filter
  // preserved table order, which is roughly least-specific first: an install
  // with an SDXL checkpoint and a Qwen UNET published
  // detectedArchitectures: ["sdxl", "qwen"], leading with the generic base
  // that `priority` exists to demote. The interface documents "most specific
  // first" and primaryArchitecture reads the same ordering, so anything
  // taking detectedArchitectures[0] as the primary now gets it.
  return ARCHITECTURES.filter(
    (spec) =>
      (spec.detect.checkpoints &&
        checkpoints.some((c) => spec.detect.checkpoints!.test(c))) ||
      (spec.detect.unets && unets.some((u) => spec.detect.unets!.test(u)))
  ).sort((a, b) => b.priority - a.priority);
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
