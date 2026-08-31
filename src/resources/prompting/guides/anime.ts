/**
 * Booru-tag anime models.
 *
 * These used to be invisible to this server. `illustrious`, `pony` and
 * `noobai` were listed as *aliases of SDXL* in the architecture registry, so
 * anyone asking for guidance on a WAI-Illustrious or Pony checkpoint was told
 * to "describe scenes like a photographer" and that "quality tags are less
 * necessary" - advice that is close to the exact inverse of what these models
 * want. They are SDXL by graph shape and nothing else.
 *
 * What separates them from SDXL proper:
 *
 *   - a FIXED vocabulary scraped from Danbooru/e621, where an unrecognised
 *     tag contributes approximately nothing
 *   - quality and rating tokens that act as switches rather than adjectives
 *   - a documented tag ORDER, which the model was trained to read
 *
 * Sources are the published model cards; each guide links its own.
 */

import { ModelPromptingGuide } from "../types.js";
import {
  COMFY_TEXT_ENCODE_SYNTAX,
  DANBOORU_VOCABULARY,
  SPATIAL_CONTROL_NOTE,
} from "./vocabulary.js";

/** Shared by every model in this family, stated once. */
const BOORU_SYNTAX =
  "Tags are lowercase and comma-separated. Danbooru writes multi-word tags with " +
  "underscores (looking_at_viewer); most SDXL finetunes accept spaces equally well. " +
  "Score tags are the exception and always keep their underscores.";

export const ANIME_GUIDES: Record<string, ModelPromptingGuide> = {
  anima: {
    modelType: "Anima",
    description:
      "A 2B latent-diffusion anime model from CircleStone Labs built with Comfy Org, using a Qwen-3 0.6B text encoder and the Qwen-Image VAE. Unusually for an anime model it understands Danbooru tags, natural language, and mixtures of the two.",
    promptingStyle: "booru_tags",
    supportsNegativePrompt: true,
    supportsPromptWeights: true,
    recommendedSettings: {
      steps: "30-50 for Base and Aesthetic, 8-12 for Turbo",
      cfg: "4-5 for Base and Aesthetic, 1 for Turbo",
      resolution: "512x512 up to 1536x1536",
    },
    structure: {
      separator: ", ",
      slots: [
        {
          name: "quality / meta / year / safety",
          description:
            "The switches, first. Quality ladder, score tag, and the safety gate.",
          required: true,
          examples: ["masterpiece", "best quality", "score_7", "safe"],
        },
        {
          name: "subject count",
          description: "How many figures, as a count tag.",
          required: true,
          examples: ["1girl", "1boy", "1other", "2girls"],
        },
        {
          name: "character",
          description: "Named character, when you want a specific one.",
          examples: ["hatsune miku"],
        },
        {
          name: "series",
          description:
            "The work the character is from. Anchors the character tag.",
          examples: ["vocaloid"],
        },
        {
          name: "artist",
          description: "Artist style tag, when you want a particular look.",
        },
        {
          name: "general tags",
          description:
            "Everything else: pose, clothing, expression, setting, lighting. Free order within this block.",
          examples: ["looking at viewer", "cowboy shot", "cherry blossoms"],
        },
      ],
      filledExample:
        "masterpiece, best quality, score_7, safe, 1girl, hatsune miku, vocaloid, looking at viewer, cowboy shot, twintails, detached sleeves, cherry blossoms, spring, soft lighting",
      notes:
        "Order is by block, not by individual tag - within a block the order is free. Anima also accepts natural-language sentences mixed into the general-tags block, which most booru models do not.",
    },
    specialTags: {
      quality: ["masterpiece", "best quality", "score_7", "score_8", "score_9"],
      negativeQuality: [
        "worst quality",
        "low quality",
        "score_1",
        "score_2",
        "score_3",
        "artist name",
      ],
      rating: ["safe", "sensitive", "nsfw", "explicit"],
      notes:
        BOORU_SYNTAX +
        " Put the rating tag you want in the positive prompt and the ones you do not in the negative - that is the documented way to hold the model to a rating.",
    },
    syntax: COMFY_TEXT_ENCODE_SYNTAX,
    vocabulary: DANBOORU_VOCABULARY,
    tips: [
      "Lead with the switch block: quality, score, then the safety tag",
      "A character tag works far better when the series tag follows it",
      "Tags and natural language can be mixed freely - a rare capability, use it for anything with no tag",
      "Turbo is a distilled variant: CFG 1 and 8-12 steps, not the Base settings",
      "The anime training data has a September 2025 cutoff - characters newer than that are unknown",
      "Base gives the widest style range; Aesthetic is pre-tuned toward one consistent look",
      "Resolution is flexible from 512 to 1536 square, unusual for a 2B model",
    ],
    commonMistakes: [
      "Running Turbo at Base settings (CFG 4-5) - it wants CFG 1",
      "Omitting the safety tag, then being surprised by the rating drift",
      "Writing score tags without underscores (score 7 does nothing; score_7 does)",
      "Naming a character with no series tag to anchor it",
      "Assuming it is SDXL-based - the Qwen-Image VAE is required, not interchangeable",
    ],
    examplePrompt:
      "masterpiece, best quality, score_7, safe, 1girl, solo, long white hair, red eyes, black gothic dress, standing in a moonlit cathedral, stained glass windows, volumetric light, detailed background",
    starters: [
      {
        label: "Character portrait, safe",
        prompt:
          "masterpiece, best quality, score_7, safe, 1girl, solo, looking at viewer, upper body, long black hair, blue eyes, school uniform, classroom, afternoon light, detailed face",
        negativePrompt:
          "worst quality, low quality, score_1, score_2, score_3, artist name, blurry, extra digits",
        notes: "Base variant: 35 steps, CFG 4.5, 1024x1024.",
      },
      {
        label: "Scenery, no figure",
        prompt:
          "masterpiece, best quality, score_8, safe, no humans, scenery, ancient shrine on a mountainside, torii gate, autumn maple leaves, morning mist, wide shot, detailed background",
        negativePrompt:
          "worst quality, low quality, score_1, score_2, score_3, 1girl, 1boy, text, watermark",
        notes: "`no humans` plus `scenery` is the reliable way to suppress figures.",
      },
      {
        label: "Tags plus natural language",
        prompt:
          "masterpiece, best quality, score_7, safe, 1girl, solo, cowboy shot, silver armor, holding a sword. She stands at the edge of a battlefield at dusk, exhausted but unbowed, banners torn behind her.",
        negativePrompt: "worst quality, low quality, score_1, score_2, score_3",
        notes:
          "Demonstrates the mixed mode - the tag block sets the frame, the sentence carries the mood.",
      },
    ],
    models: [
      {
        name: "Anima (Base / Turbo / Aesthetic)",
        huggingFace: "circlestone-labs/Anima",
        note: "Base for range, Turbo for speed at CFG 1, Aesthetic for a consistent default style.",
      },
      {
        name: "Anima ComfyUI tutorial",
        homepage: "https://docs.comfy.org/tutorials/image/anima/anima",
        note: "Loads through UNETLoader + CLIPLoader (qwen_3_06b_base) + VAELoader (qwen_image_vae).",
      },
    ],
  },

  illustrious: {
    modelType: "Illustrious XL",
    description:
      "OnomaAI's SDXL-based anime model, notable for a native 1536x1536 resolution and for accepting Danbooru tags and natural language together. The base that most current anime finetunes descend from.",
    promptingStyle: "booru_tags",
    supportsNegativePrompt: true,
    supportsPromptWeights: true,
    recommendedSettings: {
      steps: "24-32",
      cfg: "5-7",
      resolution: "1536x1536 native; 1024x1024 and standard SDXL ratios also work",
    },
    structure: {
      separator: ", ",
      slots: [
        {
          name: "quality",
          description: "Quality ladder, first.",
          required: true,
          examples: ["masterpiece", "best quality", "very aesthetic", "absurdres"],
        },
        {
          name: "subject count",
          description: "Figure count tag.",
          required: true,
          examples: ["1girl", "1boy", "no humans"],
        },
        {
          name: "character, series",
          description: "Named character followed by its source work.",
          examples: ["ganyu (genshin impact)"],
        },
        {
          name: "general tags",
          description: "Pose, clothing, expression, composition, setting.",
          examples: ["looking at viewer", "upper body", "detached sleeves"],
        },
        {
          name: "style / rating",
          description: "Artist style tags and the rating gate, last.",
          examples: ["safe", "sensitive"],
        },
      ],
      filledExample:
        "masterpiece, best quality, very aesthetic, absurdres, 1girl, solo, looking at viewer, upper body, blue hair, hair ornament, white dress, garden, dappled sunlight, safe",
      notes:
        "Illustrious is more forgiving of order than Anima or Animagine, but leading with quality tags and closing with the rating is what the card documents.",
    },
    specialTags: {
      quality: [
        "masterpiece",
        "best quality",
        "very aesthetic",
        "absurdres",
        "highres",
      ],
      negativeQuality: [
        "worst quality",
        "low quality",
        "normal quality",
        "lowres",
        "bad anatomy",
        "bad hands",
        "watermark",
      ],
      rating: ["safe", "sensitive", "nsfw", "explicit"],
      notes: BOORU_SYNTAX,
    },
    syntax: COMFY_TEXT_ENCODE_SYNTAX,
    vocabulary: DANBOORU_VOCABULARY,
    tips: [
      SPATIAL_CONTROL_NOTE,
      "Native 1536x1536 - generating at 1024 leaves resolution on the table",
      "Danbooru tag vocabulary: check the tag exists rather than inventing a phrase",
      "Natural language is understood and can be mixed in, unlike earlier anime finetunes",
      "LoRAs and ControlNets trained for Illustrious v0.1 remain compatible",
      "Quality tags matter here in a way they do not for base SDXL",
      "Artist tags are a strong style lever - one tag can carry the whole look",
    ],
    commonMistakes: [
      "Treating it as plain SDXL and writing photographic prose",
      "Skipping quality tags because 'SDXL does not need them' - this is not base SDXL",
      "Using SD 1.5 LoRAs or negative embeddings (incompatible)",
      "Generating below 1024 and losing the detail the model was trained for",
    ],
    examplePrompt:
      "masterpiece, best quality, very aesthetic, absurdres, 1girl, solo, silver hair, long hair, red eyes, ornate black dress, sitting on a throne, candlelight, detailed background, safe",
    starters: [
      {
        label: "High-res character",
        prompt:
          "masterpiece, best quality, very aesthetic, absurdres, 1girl, solo, looking at viewer, cowboy shot, long orange hair, green eyes, white blouse, autumn park, falling leaves, warm lighting, safe",
        negativePrompt:
          "worst quality, low quality, lowres, bad anatomy, bad hands, extra digits, watermark, signature",
        notes: "1536x1536, 28 steps, CFG 6.",
      },
      {
        label: "Landscape, no figure",
        prompt:
          "masterpiece, best quality, absurdres, no humans, scenery, floating islands, waterfalls, distant airships, cumulus clouds, golden hour, wide shot, detailed background",
        negativePrompt: "worst quality, low quality, lowres, 1girl, 1boy, text, watermark",
      },
    ],
    models: [
      {
        name: "Illustrious-XL v1.0",
        huggingFace: "OnomaAIResearch/Illustrious-XL-v1.0",
        note: "Official release from OnomaAI Research.",
      },
    ],
  },

  noobai: {
    modelType: "NoobAI-XL",
    description:
      "Trained onward from Illustrious-XL against the full Danbooru and e621 datasets with native tag captions. The most tag-literal model in this family - it knows a very large vocabulary and rewards using it precisely.",
    promptingStyle: "booru_tags",
    supportsNegativePrompt: true,
    supportsPromptWeights: true,
    recommendedSettings: {
      steps: "28-32",
      cfg: "5-7 for EPS variants, 3.5-4.5 for v-prediction variants",
      resolution: "1024x1024 and standard SDXL ratios",
    },
    structure: {
      separator: ", ",
      slots: [
        {
          name: "quality",
          description: "Quality ladder.",
          required: true,
          examples: ["masterpiece", "best quality", "newest"],
        },
        {
          name: "subject count",
          description: "Figure count.",
          required: true,
          examples: ["1girl", "1boy", "no humans"],
        },
        {
          name: "character, series",
          description: "Character tag anchored by its series.",
        },
        {
          name: "general tags",
          description: "Danbooru/e621 tags for pose, clothing, setting.",
        },
        {
          name: "rating",
          description: "Rating gate, last.",
          examples: ["safe", "sensitive"],
        },
      ],
      filledExample:
        "masterpiece, best quality, newest, 1girl, solo, looking at viewer, black hair, twin braids, sailor uniform, train station, evening, safe",
    },
    specialTags: {
      quality: ["masterpiece", "best quality", "high quality"],
      negativeQuality: [
        "worst quality",
        "low quality",
        "normal quality",
        "lowres",
        "bad anatomy",
        "jpeg artifacts",
      ],
      rating: ["safe", "sensitive", "nsfw", "explicit"],
      other: {
        "recency buckets":
          // These are NoobAI's distinguishing feature: the training data is
          // bucketed by era, and the bucket tag selects an art-style period.
          ["newest", "recent", "late", "mid", "early", "old"],
      },
      notes:
        BOORU_SYNTAX +
        " The recency tags select an era of art style rather than a subject - `newest` pulls toward contemporary Danbooru style, `old` toward mid-2000s.",
    },
    syntax: COMFY_TEXT_ENCODE_SYNTAX,
    vocabulary: DANBOORU_VOCABULARY,
    tips: [
      SPATIAL_CONTROL_NOTE,
      "Recency tags are the strongest single style lever: `newest` versus `old` changes the whole look",
      "Knows e621 tags as well as Danbooru ones, so the vocabulary is wider than Illustrious",
      "Check which variant you have - v-prediction builds want noticeably lower CFG than EPS builds",
      "Very literal about tags: a precise tag beats a descriptive phrase every time",
      "Character knowledge is broad; anchor with the series tag for reliability",
    ],
    commonMistakes: [
      "Running a v-prediction checkpoint at EPS CFG and getting burnt contrast",
      "Writing natural-language prose - this model is less tolerant of it than Illustrious",
      "Ignoring the recency tags, then fighting the default style with artist tags",
      "Assuming Illustrious LoRAs always transfer cleanly (often, but not always)",
    ],
    examplePrompt:
      "masterpiece, best quality, newest, 1girl, solo, looking at viewer, upper body, white hair, blue eyes, winter coat, snowy street, streetlights, safe",
    starters: [
      {
        label: "Contemporary style",
        prompt:
          "masterpiece, best quality, newest, 1girl, solo, looking at viewer, upper body, short pink hair, hoodie, city rooftop, sunset, detailed background, safe",
        negativePrompt:
          "worst quality, low quality, lowres, bad anatomy, bad hands, jpeg artifacts, watermark",
      },
      {
        label: "Retro style, same subject",
        prompt:
          "masterpiece, best quality, old, 1girl, solo, looking at viewer, upper body, short pink hair, hoodie, city rooftop, sunset, detailed background, safe",
        negativePrompt: "worst quality, low quality, lowres, bad anatomy",
        notes:
          "Identical but for the recency tag - a cheap way to see how much that one token carries.",
      },
    ],
    models: [
      {
        name: "NoobAI-XL v1.0",
        huggingFace: "Laxhar/noobai-XL-1.0",
        note: "Later point releases and v-prediction variants live under the same Laxhar org.",
      },
    ],
  },

  pony: {
    modelType: "Pony Diffusion V6 XL",
    description:
      "An SDXL finetune with its own quality vocabulary. Distinctive for the `score_*` ladder and `source_*` tags, which are mandatory in practice - a Pony prompt without them looks nothing like the model's showcase images.",
    promptingStyle: "booru_tags",
    supportsNegativePrompt: true,
    supportsPromptWeights: true,
    recommendedSettings: {
      steps: "25-30",
      cfg: "7",
      resolution: "1024x1024 and standard SDXL ratios",
    },
    structure: {
      separator: ", ",
      slots: [
        {
          name: "score ladder",
          description:
            "The score prefix. Effectively required - it is how the model was taught 'good'.",
          required: true,
          examples: ["score_9", "score_8_up", "score_7_up"],
        },
        {
          name: "source",
          description: "Which visual domain to pull from.",
          required: true,
          examples: ["source_anime", "source_cartoon", "source_furry", "source_pony"],
        },
        {
          name: "rating",
          description: "Content rating gate.",
          examples: ["rating_safe", "rating_questionable", "rating_explicit"],
        },
        {
          name: "subject and general tags",
          description: "Count tag, character, then everything else.",
          examples: ["1girl", "solo", "looking at viewer"],
        },
      ],
      filledExample:
        "score_9, score_8_up, score_7_up, source_anime, rating_safe, 1girl, solo, looking at viewer, long blue hair, white sundress, sunflower field, clear sky",
      notes:
        "The conventional opening is the descending score chain `score_9, score_8_up, score_7_up` rather than a single score tag - it reads as 'at least this good' across several bands.",
    },
    specialTags: {
      quality: ["score_9", "score_8_up", "score_7_up", "score_6_up", "score_5_up", "score_4_up"],
      negativeQuality: [
        "score_6",
        "score_5",
        "score_4",
        "worst quality",
        "low quality",
        "bad anatomy",
        "watermark",
      ],
      rating: ["rating_safe", "rating_questionable", "rating_explicit"],
      other: {
        source: ["source_pony", "source_furry", "source_anime", "source_cartoon"],
      },
      notes:
        BOORU_SYNTAX +
        " Pony's tokens all keep underscores - `score_9`, `source_anime`, `rating_safe` - and the score chain belongs at the very front of the positive prompt.",
    },
    syntax: COMFY_TEXT_ENCODE_SYNTAX,
    vocabulary: DANBOORU_VOCABULARY,
    tips: [
      SPATIAL_CONTROL_NOTE,
      "Open with the score chain; without it output quality drops sharply",
      "`source_anime` versus `source_cartoon` versus `source_furry` is the biggest style switch available",
      "Rating tags are explicit tokens here (`rating_safe`), not bare words like other booru models",
      "Base Pony has no artist tags - artist style comes from LoRAs instead",
      "V6 is SDXL-shaped; Pony V7 moved to an AuraFlow base and prompts differently",
    ],
    commonMistakes: [
      "Omitting the score chain and concluding the model is bad",
      "Using bare `safe` instead of `rating_safe`",
      "Expecting artist tags to work (they were stripped from training)",
      "Applying V6 score tags to a V7/AuraFlow checkpoint, where they do nothing",
    ],
    examplePrompt:
      "score_9, score_8_up, score_7_up, source_anime, rating_safe, 1girl, solo, silver hair, twin tails, futuristic bodysuit, neon city street at night, rain, reflections",
    starters: [
      {
        label: "Anime source",
        prompt:
          "score_9, score_8_up, score_7_up, source_anime, rating_safe, 1girl, solo, looking at viewer, upper body, brown hair, green eyes, denim jacket, coffee shop interior, warm lighting",
        negativePrompt:
          "score_6, score_5, score_4, worst quality, low quality, bad anatomy, bad hands, watermark, signature",
      },
      {
        label: "Cartoon source, same subject",
        prompt:
          "score_9, score_8_up, score_7_up, source_cartoon, rating_safe, 1girl, solo, looking at viewer, upper body, brown hair, green eyes, denim jacket, coffee shop interior, warm lighting",
        negativePrompt: "score_6, score_5, score_4, worst quality, low quality",
        notes: "Only the source tag differs - it carries most of the style.",
      },
    ],
    models: [
      {
        name: "Pony Diffusion V6 XL",
        civitai: "models/257749/pony-diffusion-v6-xl",
        note: "Distributed through Civitai rather than an official Hugging Face repo; HF copies are community mirrors.",
      },
    ],
  },

  animagine: {
    modelType: "Animagine XL",
    description:
      "Cagliostro Lab's anime SDXL series. The model card publishes an explicit tag ordering template, and following it is what separates a working Animagine prompt from a mediocre one.",
    promptingStyle: "booru_tags",
    supportsNegativePrompt: true,
    supportsPromptWeights: true,
    recommendedSettings: {
      steps: "25-28",
      cfg: "5-7",
      resolution: "1024x1024 and standard SDXL ratios",
    },
    structure: {
      separator: ", ",
      slots: [
        {
          name: "subject count",
          description: "Figure count tag, first in the published template.",
          required: true,
          examples: ["1girl", "1boy"],
        },
        {
          name: "character",
          description: "Named character.",
          required: true,
          examples: ["firefly"],
        },
        {
          name: "series",
          description: "Source work for the character.",
          required: true,
          examples: ["honkai: star rail"],
        },
        {
          name: "rating",
          description: "Content rating.",
          examples: ["safe", "sensitive"],
        },
        {
          name: "general tags",
          description: "Pose, clothing, setting, composition.",
        },
        {
          name: "quality",
          description: "Quality ladder, at the END for this model.",
          required: true,
          examples: ["masterpiece", "high score", "great score", "absurdres"],
        },
      ],
      filledExample:
        "1girl, firefly, honkai: star rail, safe, looking at viewer, upper body, white hair, orange eyes, standing in a field of flowers, masterpiece, high score, great score, absurdres",
      notes:
        "Note the inversion: Animagine puts quality tags LAST, where Illustrious and Pony put them first. Carrying the habit across models is a common source of disappointing output.",
    },
    specialTags: {
      quality: ["masterpiece", "high score", "great score", "absurdres", "very aesthetic"],
      negativeQuality: [
        "lowres",
        "bad anatomy",
        "bad hands",
        "worst quality",
        "low quality",
        "jpeg artifacts",
        "signature",
        "watermark",
      ],
      rating: ["safe", "sensitive", "nsfw", "explicit"],
      notes:
        BOORU_SYNTAX +
        " Quality tags go at the end of the positive prompt, not the beginning.",
    },
    syntax: COMFY_TEXT_ENCODE_SYNTAX,
    vocabulary: DANBOORU_VOCABULARY,
    tips: [
      SPATIAL_CONTROL_NOTE,
      "Follow the published order: count, character, series, rating, general, quality",
      "Character plus series is the pair that makes character recall reliable",
      "Quality tags belong at the end - the opposite of Pony and Illustrious",
      "v4 uses `high score` / `great score` where v3 used a plain quality ladder",
      "Strong at known characters; weaker at original ones with no tag to anchor",
    ],
    commonMistakes: [
      "Leading with quality tags out of habit from other anime models",
      "Naming a character with no series tag",
      "Mixing Pony `score_*` tags in - they mean nothing here",
      "Writing natural-language sentences instead of tags",
    ],
    examplePrompt:
      "1girl, solo, safe, long black hair, red ribbon, school uniform, cherry blossom courtyard, wind, looking at viewer, masterpiece, high score, great score, absurdres",
    starters: [
      {
        label: "Named character",
        prompt:
          "1girl, hatsune miku, vocaloid, safe, looking at viewer, cowboy shot, twintails, detached sleeves, stage lighting, concert, masterpiece, high score, great score, absurdres",
        negativePrompt:
          "lowres, bad anatomy, bad hands, worst quality, low quality, jpeg artifacts, signature, watermark",
      },
      {
        label: "Original character",
        prompt:
          "1girl, solo, safe, short silver hair, heterochromia, military coat, snowy fortress, overcast, upper body, masterpiece, high score, great score, absurdres",
        negativePrompt: "lowres, bad anatomy, bad hands, worst quality, low quality, watermark",
        notes:
          "With no character tag to anchor, lean harder on descriptive general tags.",
      },
    ],
    models: [
      {
        name: "Animagine XL 4.0",
        huggingFace: "cagliostrolab/animagine-xl-4.0",
      },
      {
        name: "Animagine XL 3.1",
        huggingFace: "cagliostrolab/animagine-xl-3.1",
        note: "Earlier series; uses a plain quality ladder rather than the score wording.",
      },
    ],
  },
};
