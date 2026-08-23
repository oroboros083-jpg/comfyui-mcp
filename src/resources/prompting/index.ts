/**
 * The prompting guide library.
 *
 * Guides are grouped by family in `guides/`. This module assembles them and
 * owns lookup and the index.
 */

import { architectureFor } from "../../architectures/registry.js";
import { ModelPromptingGuide } from "./types.js";
import { STABLE_DIFFUSION_GUIDES } from "./guides/stable-diffusion.js";
import { FLUX_GUIDES } from "./guides/flux.js";
import { ANIME_GUIDES } from "./guides/anime.js";
import { DIT_GUIDES } from "./guides/dit.js";
import { VIDEO_GUIDES } from "./guides/video.js";
import { AUDIO_GUIDES } from "./guides/audio.js";

export * from "./types.js";
export { formatPromptingGuide, huggingFaceUrl } from "./render.js";

export const PROMPTING_GUIDES: Record<string, ModelPromptingGuide> = {
  ...STABLE_DIFFUSION_GUIDES,
  ...FLUX_GUIDES,
  ...ANIME_GUIDES,
  ...DIT_GUIDES,
  ...VIDEO_GUIDES,
  ...AUDIO_GUIDES,
};

/**
 * Resolve a free-form name to a guide.
 *
 * Exact key first, then through the architecture registry, which owns the
 * aliases and filename detection patterns - so a raw checkpoint filename
 * resolves too.
 */
export function getPromptingGuide(modelType: string): ModelPromptingGuide | null {
  const normalizedType = modelType.toLowerCase();

  if (PROMPTING_GUIDES[normalizedType]) {
    return PROMPTING_GUIDES[normalizedType];
  }

  const spec = architectureFor(normalizedType);
  if (spec?.guide && PROMPTING_GUIDES[spec.guide]) {
    return PROMPTING_GUIDES[spec.guide];
  }

  return null;
}

/** Compact label for the style column. */
function styleLabel(guide: ModelPromptingGuide): string {
  return guide.promptingStyle.replace(/_/g, " ");
}

/**
 * The index: every guide in one table, and nothing else.
 *
 * This is what `modelType: "all"` returns. It used to concatenate every guide
 * in full, which was already 11 guides of prose; at the current count that
 * would be roughly 80KB and would simply hit the response truncation cap,
 * making the most expensive call in the server also one of the least useful.
 * A table plus "now ask for one" is the whole idea of progressive disclosure.
 */
export function getGuideIndex(): string {
  const rows = Object.entries(PROMPTING_GUIDES)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, guide]) => {
      const negative = guide.supportsNegativePrompt ? "yes" : "no";
      const weights = guide.supportsPromptWeights ? "yes" : "no";
      const cfg = guide.recommendedSettings.cfg ?? "—";
      return `| \`${key}\` | ${guide.modelType} | ${styleLabel(guide)} | ${negative} | ${weights} | ${cfg} |`;
    });

  return [
    "# Prompting Guides",
    "",
    `${rows.length} guides. Ask for one by key with comfyui_get_prompting_guide({ modelType: "<key>" }) —`,
    "a model filename works too, and resolves through the architecture registry.",
    "",
    "| Key | Model | Style | Negative | Weights | CFG |",
    "|-----|-------|-------|----------|---------|-----|",
    ...rows,
    "",
    "## Prompting styles",
    "",
    "- **keywords** — comma-separated fragments, free vocabulary. Quality boosters and negative prompts carry real weight.",
    "- **natural language** — full sentences describing the image. Weights and negatives usually unsupported.",
    "- **hybrid** — both work; pick per subject.",
    "- **booru tags** — comma-separated tags from a FIXED imageboard vocabulary, with quality/rating tokens that act as switches and, on some models, a required tag ORDER. An unrecognised tag does close to nothing.",
    "",
    "## Sections",
    "",
    "Each guide is divided into sections, and you can ask for one instead of the whole thing:",
    "`overview` (default), `structure`, `tags`, `tips`, `mistakes`, `starters`, `models`.",
    "Use `detail: \"full\"` for the complete guide.",
    "",
    "## Choosing",
    "",
    "1. Prompting style is the single biggest divide: a booru-tag model and a natural-language model want opposite prompts.",
    "2. Anime finetunes on an SDXL base (`illustrious`, `noobai`, `pony`, `animagine`) do NOT prompt like `sdxl`. Ask for them by name.",
    "3. Video models (`wan`, `ltxvideo`, `mochi`, `cosmos`) need subject motion AND camera motion stated separately.",
    "4. Audio (`aceaudio`) wants genre, instrumentation, tempo and production — no visual language at all.",
  ].join("\n");
}

/**
 * Retained under its original name because the resource handler and tool both
 * import it. It now returns the index rather than every guide concatenated.
 */
export function getComprehensiveGuide(): string {
  return getGuideIndex();
}
