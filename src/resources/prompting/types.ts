/**
 * The shape of a prompting guide.
 *
 * A guide answers four separable questions, and a caller rarely wants all
 * four at once:
 *
 *   - What kind of prompt does this model want?      -> overview
 *   - In what ORDER does it want the pieces?         -> structure
 *   - Are there magic tokens it was trained on?      -> specialTags
 *   - What do I paste to get a first result?         -> starters
 *
 * They are separate fields rather than one prose blob so `get_prompting_guide`
 * can hand back one of them instead of all of them. Guides run to a few
 * thousand characters each and there are two dozen of them; returning every
 * section of every guide on every call is what progressive disclosure exists
 * to stop.
 */

/**
 * How a model wants its prompt written.
 *
 * `booru_tags` is distinct from `keywords` on purpose. Both are
 * comma-separated fragments, but a booru model was trained on a *fixed
 * vocabulary* scraped from an imageboard - `1girl`, `looking_at_viewer`,
 * `cowboy_shot` - where an unrecognised tag does nothing at all, and where
 * tag ORDER and quality/rating tokens carry real weight. Telling an
 * Illustrious user to "describe the scene like a photographer" (the SDXL
 * advice they used to get, because these models were mere aliases of SDXL)
 * produces markedly worse images.
 */
export type PromptingStyle =
  | "keywords"
  | "natural_language"
  | "hybrid"
  | "booru_tags";

/** One position in an ordered prompt structure. */
export interface TagSlot {
  /** Slot name, e.g. "quality", "character", "series". */
  name: string;
  /** What belongs here. */
  description: string;
  /** Whether omitting it materially degrades output. */
  required?: boolean;
  /** Concrete tokens that would go in this slot. */
  examples?: string[];
}

/**
 * An ordered prompt format, for models that were trained on one.
 *
 * Most models have no meaningful structure beyond "important things first",
 * and leave this undefined. The anime finetunes do: Anima and Animagine both
 * publish a slot order, and following it is the difference between the model
 * recognising a character and inventing one.
 */
export interface PromptStructure {
  /** Slots in the order the model expects them. */
  slots: TagSlot[];
  /** What joins the slots when rendered, e.g. ", ". */
  separator: string;
  /** A complete prompt showing the order filled in. */
  filledExample: string;
  /** Why the order matters here, when it is not obvious. */
  notes?: string;
}

/**
 * Tokens the model was explicitly trained on, which behave unlike ordinary
 * description. Quality ladders (`score_9`), rating gates (`explicit`) and
 * recency buckets (`newest`) are all in this category: they are switches,
 * not adjectives.
 */
export interface SpecialTags {
  /** Tokens that raise perceived quality, for the positive prompt. */
  quality?: string[];
  /** Tokens that belong in the NEGATIVE prompt to raise quality. */
  negativeQuality?: string[];
  /** Content-rating gates. */
  rating?: string[];
  /** Anything else with named semantics: recency buckets, source tags. */
  other?: Record<string, string[]>;
  /** Syntax rules for these tokens (underscores, casing, placement). */
  notes?: string;
}

/** A prompt a caller can paste to get a reasonable first image. */
export interface StarterPrompt {
  /** Short label describing what it produces. */
  label: string;
  prompt: string;
  /** Only meaningful where the model supports negatives. */
  negativePrompt?: string;
  /** Settings or caveats specific to this starter. */
  notes?: string;
}

/**
 * A concrete model this guide applies to, with its Hugging Face repo.
 *
 * `huggingFace` is a repo id (`owner/name`), not a URL - the renderer builds
 * the URL, so the id can also be used to look the model up through other
 * tooling. Omitted where a model has no canonical HF home (several anime
 * finetunes are distributed on Civitai instead), because a wrong link is
 * worse than no link.
 */
export interface ModelReference {
  name: string;
  /** Hugging Face repo id, e.g. "black-forest-labs/FLUX.1-dev". */
  huggingFace?: string;
  /** Where it actually lives, when that is not Hugging Face. */
  homepage?: string;
  note?: string;
}

export interface ModelPromptingGuide {
  modelType: string;
  description: string;
  promptingStyle: PromptingStyle;
  supportsNegativePrompt: boolean;
  supportsPromptWeights: boolean;
  recommendedSettings: {
    steps?: string;
    cfg?: string;
    resolution?: string;
  };
  tips: string[];
  commonMistakes: string[];
  /**
   * A single representative prompt. Retained because it predates `starters`
   * and three callers read it; `starters` is the richer replacement and is
   * what the renderer prefers when present.
   */
  examplePrompt: string;
  structure?: PromptStructure;
  specialTags?: SpecialTags;
  starters?: StarterPrompt[];
  models?: ModelReference[];
}

/**
 * The sections a guide can be asked for, in the order they render.
 *
 * `overview` is what a caller gets by default: enough to decide how to write
 * the prompt, without the tag tables and starter library behind it.
 */
export const GUIDE_SECTIONS = [
  "overview",
  "structure",
  "tags",
  "tips",
  "mistakes",
  "starters",
  "models",
] as const;

export type GuideSection = (typeof GUIDE_SECTIONS)[number];

/** Which sections this particular guide actually has content for. */
export function sectionsPresent(guide: ModelPromptingGuide): GuideSection[] {
  const present: GuideSection[] = ["overview"];
  if (guide.structure) present.push("structure");
  if (guide.specialTags) present.push("tags");
  if (guide.tips.length) present.push("tips");
  if (guide.commonMistakes.length) present.push("mistakes");
  if (guide.starters?.length || guide.examplePrompt) present.push("starters");
  if (guide.models?.length) present.push("models");
  return present;
}
