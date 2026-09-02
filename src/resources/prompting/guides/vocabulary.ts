/**
 * Shared tag vocabularies and prompt syntaxes.
 *
 * These are properties of an ecosystem rather than of one model, so they live
 * here and are referenced by the guides instead of being copied into each.
 * The five booru-tag anime models share a Danbooru vocabulary; every
 * SD-lineage model shares CLIPTextEncode's prompt language, whatever its taste
 * in prompts.
 */

import { PromptSyntax, TagVocabulary } from "../types.js";

/**
 * ComfyUI's own prompt language, as parsed by CLIPTextEncode.
 *
 * Worth stating explicitly because most prompt advice on the internet is
 * written for A1111/Forge, whose language is close but not identical - `BREAK`
 * and `[a|b]` alternation are the two that people reach for and that silently
 * do nothing here.
 */
export const COMFY_TEXT_ENCODE_SYNTAX: PromptSyntax = {
  separator: ", ",
  caseSensitive: false,
  underscores: "optional",
  constructs: [
    {
      name: "weighting",
      syntax: "(text:WEIGHT)",
      description:
        "Scales attention on the enclosed text. 1.0 is neutral; useful range is roughly 0.5-1.5, and past about 1.4 artefacts appear before the effect does.",
      example: "(red scarf:1.2), (background:0.8)",
    },
    {
      name: "bare parentheses",
      syntax: "(text)",
      description:
        "Multiplies weight by 1.1, and nests: ((text)) is 1.21. Prefer the explicit (text:1.2) form - it is readable and does not drift when someone adds a bracket.",
      example: "((detailed eyes))",
    },
    {
      name: "escaping",
      syntax: "\\( \\)",
      description:
        "Escapes a literal parenthesis. Required for booru character tags, which carry their series in brackets - unescaped, the brackets are read as a weight group and the series name silently becomes an emphasis modifier.",
      example: "ganyu \\(genshin impact\\)",
    },
    {
      name: "embeddings",
      syntax: "embedding:NAME",
      description:
        "Loads a textual-inversion embedding from models/embeddings by filename, without the extension. Commonly used for negative-quality embeddings.",
      example: "embedding:easynegative",
    },
    {
      name: "BREAK",
      syntax: "BREAK",
      description:
        "An A1111/Forge keyword that pads the prompt to the next 75-token chunk. ComfyUI's CLIPTextEncode does NOT implement it - it is encoded as the literal word. Use two CLIPTextEncode nodes joined by ConditioningConcat instead.",
      unsupported: true,
    },
    {
      name: "alternation and scheduling",
      syntax: "[a|b] and [a:b:0.4]",
      description:
        "A1111 step-scheduling syntax. Not implemented by CLIPTextEncode. ComfyUI expresses the same idea with ConditioningSetTimestepRange or a two-pass sampler.",
      unsupported: true,
    },
  ],
  notes:
    "These are CLIPTextEncode behaviours, so they apply to any model driven through it regardless of prompting style. Weighting has no effect on models whose encoder ignores it - check the overview's 'Prompt weights' line before reaching for it.",
};

/**
 * The same language, minus the parts that do nothing on an encoder that
 * ignores attention weighting (T5, Qwen-VL, Gemma and friends).
 */
export const NATURAL_LANGUAGE_SYNTAX: PromptSyntax = {
  separator: ". ",
  caseSensitive: false,
  underscores: "avoid",
  constructs: [
    {
      name: "weighting",
      syntax: "(text:WEIGHT)",
      description:
        "Parsed by CLIPTextEncode but ignored by this model's encoder: the weight changes nothing and the parentheses may be encoded as literal characters. Express emphasis in words instead - 'with particular emphasis on the brass fittings'.",
      unsupported: true,
    },
    {
      name: "escaping",
      syntax: "\\( \\)",
      description:
        "Still worth escaping literal parentheses so they are not consumed as a weight group.",
      example: "a diagram of a cell \\(cross-section\\)",
    },
    {
      name: "quoted text",
      syntax: '"TEXT"',
      description:
        "Double quotes mark text you want rendered inside the image. Models with strong typography follow this closely.",
      example: 'a sign reading "OPEN LATE"',
    },
  ],
  notes:
    "Write sentences, not tag lists. Emphasis comes from word choice and position - these models weight the start of the prompt more heavily than the end.",
};

/**
 * Curated Danbooru tags, grouped by what they control.
 *
 * Deliberately not exhaustive: Danbooru carries hundreds of thousands of tags
 * and no useful subset of them fits in a tool response. This is the working
 * set that covers most of what a prompt needs to say, with `reference` for
 * anything else. Tags are given in Danbooru's canonical underscored form;
 * most SDXL finetunes accept spaces equally.
 */
export const DANBOORU_VOCABULARY: TagVocabulary = {
  source: "Danbooru",
  reference: "https://danbooru.donmai.us/tags",
  categories: {
    "subject count": [
      "1girl",
      "2girls",
      "1boy",
      "2boys",
      "1other",
      "solo",
      "multiple_girls",
      "no_humans",
    ],
    framing: [
      "portrait",
      "upper_body",
      "cowboy_shot",
      "full_body",
      "close-up",
      "wide_shot",
      "feet_out_of_frame",
    ],
    "camera angle": [
      "from_above",
      "from_below",
      "from_side",
      "from_behind",
      "straight-on",
      "dutch_angle",
      "profile",
    ],
    gaze: [
      "looking_at_viewer",
      "looking_away",
      "looking_back",
      "looking_down",
      "looking_up",
      "looking_to_the_side",
    ],
    expression: [
      "smile",
      "grin",
      "open_mouth",
      "closed_mouth",
      "blush",
      "frown",
      "surprised",
      "crying",
      "expressionless",
      "light_smile",
    ],
    eyes: [
      "blue_eyes",
      "red_eyes",
      "green_eyes",
      "brown_eyes",
      "yellow_eyes",
      "purple_eyes",
      "heterochromia",
      "closed_eyes",
      "half-closed_eyes",
    ],
    hair: [
      "long_hair",
      "short_hair",
      "medium_hair",
      "twintails",
      "ponytail",
      "braid",
      "twin_braids",
      "blunt_bangs",
      "ahoge",
      "messy_hair",
      "floating_hair",
    ],
    "hair colour": [
      "blonde_hair",
      "brown_hair",
      "black_hair",
      "white_hair",
      "silver_hair",
      "pink_hair",
      "blue_hair",
      "red_hair",
      "green_hair",
      "multicolored_hair",
    ],
    pose: [
      "standing",
      "sitting",
      "lying",
      "kneeling",
      "walking",
      "running",
      "arms_up",
      "hand_on_hip",
      "crossed_arms",
      "outstretched_arms",
      "leaning_forward",
    ],
    clothing: [
      "school_uniform",
      "serafuku",
      "hoodie",
      "dress",
      "kimono",
      "armor",
      "jacket",
      "coat",
      "shirt",
      "skirt",
      "thighhighs",
      "detached_sleeves",
      "gloves",
      "hat",
    ],
    background: [
      "simple_background",
      "white_background",
      "transparent_background",
      "gradient_background",
      "blurry_background",
      "scenery",
      "outdoors",
      "indoors",
      "cityscape",
      "forest",
      "beach",
      "night_sky",
    ],
    lighting: [
      "backlighting",
      "rim_lighting",
      "sunlight",
      "dappled_sunlight",
      "moonlight",
      "candlelight",
      "god_rays",
      "night",
      "sunset",
      "twilight",
      "cinematic_lighting",
    ],
    "camera effects": [
      "depth_of_field",
      "motion_blur",
      "lens_flare",
      "bokeh",
      "chromatic_aberration",
      "vignetting",
      "film_grain",
    ],
    "medium and meta": [
      "highres",
      "absurdres",
      "official_art",
      "sketch",
      "lineart",
      "monochrome",
      "greyscale",
      "watercolor_(medium)",
      "oil_painting_(medium)",
      "chibi",
    ],
  },
  notes:
    "Prefer an exact tag over a description: `cowboy_shot` frames from mid-thigh up and is understood precisely, where 'three-quarter length shot' is not a tag and does almost nothing. Character tags carry their series in parentheses and MUST be escaped in ComfyUI - `ganyu \\(genshin impact\\)` - or the brackets are parsed as a weight group.",
};

/**
 * Why wording cannot place things, and what can.
 *
 * Shared across guides because the failure is a property of cross-attention
 * rather than of any one architecture: text conditioning is applied over the
 * whole latent, so "a red cube on the left and a blue sphere on the right"
 * has nowhere to attach "left" to. The colours swap, the objects merge, or
 * both land in the middle.
 *
 * This is also why prompt weights are the wrong tool for it, which is worth
 * saying explicitly: `(red cube:1.3)` scales that token *everywhere*. Several
 * guides currently advise "describe spatial relationships explicitly", which
 * cannot work for placement and sends the reader in a circle.
 *
 * The remedy is a different graph, not different words - and building that
 * graph is ComfyUI's job, not this server's. So this names the core nodes and
 * sends the reader to the official gallery, rather than at a tool here. It
 * used to point at comfyui://examples/area-composition; that resource went
 * with the bundled example catalogue.
 */
export const SPATIAL_CONTROL_NOTE =
  "Placement is a graph problem, not a wording problem. Text conditioning is applied across " +
  "the whole latent, so a prompt has no way to say 'here' - which is why two subjects merge, " +
  "why the red cube comes out blue, and why prompt weights do not help ((red cube:1.3) scales " +
  "that token everywhere). Bind text to a region instead: encode each region's text " +
  "separately, set an area on each, then combine - ConditioningSetArea or " +
  "ConditioningSetAreaPercentage into ConditioningCombine, all core nodes. Compositing " +
  "latents while they are still noisy is the alternative when hard-edged areas leave seams. " +
  "The official Comfy MCP's template gallery carries runnable graphs for both; search it for " +
  "'Area Composition'. Caveat: regional conditioning rides on CFG, so it works best on " +
  "SD1.5/SDXL and poorly at CFG 1 (Flux, and any distilled draft model).";
