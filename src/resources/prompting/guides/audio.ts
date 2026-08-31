/**
 * Audio models.
 *
 * Prompting audio has nothing in common with prompting images, which is why
 * routing an audio model to the Flux guide - as this server used to, because
 * ACE-Step shares the Flux graph shape - was actively misleading. There is no
 * composition, no lighting, no camera. There is genre, instrumentation, mood,
 * tempo and production.
 */

import { ModelPromptingGuide } from "../types.js";

export const AUDIO_GUIDES: Record<string, ModelPromptingGuide> = {
  aceaudio: {
    modelType: "ACE-Step / Stable Audio",
    description:
      "Music and sound generation. ACE-Step generates full songs from a tag prompt plus optional lyrics; Stable Audio Open generates instrumental audio and sound effects from a description. Both want production vocabulary, not visual description.",
    promptingStyle: "keywords",
    supportsNegativePrompt: true,
    supportsPromptWeights: false,
    recommendedSettings: {
      steps: "50 (ACE-Step), 100 (Stable Audio Open)",
      cfg: "5 for ACE-Step, 6-7 for Stable Audio Open",
      resolution:
        "Not applicable - duration is the parameter. Up to ~4 minutes (ACE-Step), ~47 seconds (Stable Audio Open)",
    },
    structure: {
      separator: ", ",
      slots: [
        {
          name: "genre",
          description: "The style, first and most load-bearing.",
          required: true,
          examples: ["lo-fi hip hop", "baroque chamber", "synthwave", "field recording"],
        },
        {
          name: "instrumentation",
          description: "What is actually playing.",
          required: true,
          examples: ["fingerpicked acoustic guitar", "upright bass", "brushed snare"],
        },
        {
          name: "mood",
          description: "Emotional register.",
          examples: ["melancholy", "hopeful", "menacing"],
        },
        {
          name: "tempo and key",
          description: "Numeric BPM if you care about it, plus key or mode.",
          examples: ["90 bpm", "in D minor"],
        },
        {
          name: "production",
          description: "Recording character and processing.",
          examples: ["tape saturation", "close-miked", "wide reverb", "vinyl crackle"],
        },
      ],
      filledExample:
        "lo-fi hip hop, fingerpicked acoustic guitar, upright bass, brushed snare, melancholy, 82 bpm, in D minor, tape saturation, vinyl crackle, warm and close-miked",
      notes:
        "Genre first is the single biggest lever. BPM is respected reasonably well when given as a number.",
    },
    specialTags: {
      negativeQuality: ["distorted", "clipping", "noise", "muffled", "off-key"],
      notes:
        "ACE-Step takes lyrics in a separate field from the tag prompt, with structure markers such as [verse], [chorus] and [bridge]. Put tags in the prompt and words in the lyrics field - mixing them degrades both.",
    },
    tips: [
      "Lead with genre, then instrumentation - those two carry most of the result",
      "Give tempo as a number ('96 bpm'); vague words like 'upbeat' are much weaker",
      "Name production character: 'tape saturation', 'close-miked', 'roomy', 'lo-fi'",
      "For ACE-Step vocals, use the separate lyrics field with [verse]/[chorus] markers",
      "'instrumental' is a useful tag when you do not want vocals at all",
      "Stable Audio Open is built for loops and sound effects, not full songs - keep requests short",
      "Duration is a parameter, not something to ask for in the prompt",
    ],
    commonMistakes: [
      "Writing visual or narrative description ('a song about a lonely lighthouse at dusk')",
      "Putting lyrics into the tag prompt instead of the lyrics field",
      "Asking Stable Audio Open for a multi-minute structured song",
      "Omitting tempo and then fighting the default groove",
      "Expecting a named artist's voice or style to be reproduced",
    ],
    examplePrompt:
      "synthwave, analog pads, gated reverb drums, arpeggiated bass, nostalgic, 110 bpm, in F minor, wide stereo, tape hiss, instrumental",
    starters: [
      {
        label: "Instrumental bed (ACE-Step)",
        prompt:
          "lo-fi hip hop, dusty rhodes piano, upright bass, brushed drums, mellow, 84 bpm, in E-flat major, vinyl crackle, tape saturation, instrumental",
        negativePrompt: "distorted, clipping, harsh, off-key",
        notes: "Around 50 steps, CFG 5. Leave the lyrics field empty for instrumental.",
      },
      {
        label: "Song with lyrics (ACE-Step)",
        prompt:
          "indie folk, fingerpicked acoustic guitar, close-miked female vocal, subtle strings, wistful, 76 bpm, in G major, warm room reverb",
        notes:
          "Lyrics go in the separate lyrics field, e.g. '[verse] ... [chorus] ...', not in this prompt.",
      },
      {
        label: "Sound effect (Stable Audio Open)",
        prompt:
          "heavy rain on a tin roof, occasional distant thunder, no music, field recording, stereo",
        negativePrompt: "music, voices, clipping",
        notes: "Short duration; Stable Audio Open tops out around 47 seconds.",
      },
    ],
    models: [
      {
        name: "ACE-Step (ComfyUI repackaged)",
        huggingFace: "Comfy-Org/ACE-Step_ComfyUI_repackaged",
        note:
          "The one to reach for when you want a *song*: it takes a style/genre prompt and a separate lyrics input, sings them, and holds structure over minutes rather than seconds. The lyrics field is not decoration - leave it empty and you get an instrumental.",
      },
      {
        name: "Stable Audio Open 1.0",
        huggingFace: "stabilityai/stable-audio-open-1.0",
        note:
          "The opposite job: sound effects, foley, one-shot samples and short instrumental loops from a text description, capped around 47 seconds of 44.1kHz stereo. No vocals, and asking it for a song wastes the run.",
      },
    ],
  },
};
