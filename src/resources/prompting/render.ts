/**
 * Rendering a guide, one section at a time.
 *
 * The whole point of splitting a guide into sections is that a caller can be
 * handed one. `formatPromptingGuide` with no section list still renders
 * everything - that is what the MCP resource for a guide wants, since the
 * reader asked for that document by URI. The TOOL passes an explicit list,
 * which is where the saving actually matters: a full guide is 2-4KB and there
 * are two dozen of them.
 */

import {
  GuideSection,
  GUIDE_SECTIONS,
  ModelPromptingGuide,
  sectionsPresent,
} from "./types.js";

/** Build the Hugging Face URL for a repo id. */
export function huggingFaceUrl(repoId: string): string {
  return `https://huggingface.co/${repoId}`;
}

/** Build the Civitai URL for a model path. */
export function civitaiUrl(path: string): string {
  return `https://civitai.com/${path.replace(/^\/+/, "")}`;
}

function renderOverview(guide: ModelPromptingGuide): string[] {
  const lines = [
    guide.description,
    "",
    "## Prompting Style",
    `- Style: ${guide.promptingStyle.replace(/_/g, " ")}`,
    `- Negative prompts: ${guide.supportsNegativePrompt ? "Supported" : "Not supported"}`,
    `- Prompt weights: ${guide.supportsPromptWeights ? "Supported" : "Not supported"}`,
    "",
    "## Recommended Settings",
  ];

  const { steps, cfg, resolution } = guide.recommendedSettings;
  if (steps) lines.push(`- Steps: ${steps}`);
  if (cfg) lines.push(`- CFG: ${cfg}`);
  if (resolution) lines.push(`- Resolution: ${resolution}`);

  // A one-line taste of the ordering, so the overview alone is enough to
  // tell whether the structure section is worth fetching.
  if (guide.structure) {
    lines.push(
      "",
      "## Prompt Order",
      guide.structure.slots.map((s) => `[${s.name}]`).join(guide.structure.separator),
      "",
      "Ask for section 'structure' for what belongs in each slot."
    );
  }

  return lines;
}

function renderStructure(guide: ModelPromptingGuide): string[] {
  if (!guide.structure) return [];
  const { slots, separator, filledExample, notes } = guide.structure;

  const lines = ["## Prompt Structure", ""];
  lines.push("| # | Slot | Required | What goes here |");
  lines.push("|---|------|----------|----------------|");
  slots.forEach((slot, i) => {
    lines.push(
      `| ${i + 1} | ${slot.name} | ${slot.required ? "yes" : "optional"} | ${slot.description} |`
    );
  });

  const withExamples = slots.filter((s) => s.examples?.length);
  if (withExamples.length) {
    lines.push("", "Examples per slot:");
    for (const slot of withExamples) {
      lines.push(`- **${slot.name}**: ${slot.examples!.join(separator)}`);
    }
  }

  lines.push("", "Filled in:", "", "```", filledExample, "```");
  if (notes) lines.push("", notes);

  return lines;
}

function renderSyntax(guide: ModelPromptingGuide): string[] {
  if (!guide.syntax) return [];
  const { separator, caseSensitive, underscores, constructs, notes } = guide.syntax;

  const lines = [
    "## Prompt Syntax",
    "",
    `- Separator: \`${separator}\``,
    `- Case sensitive: ${caseSensitive ? "yes" : "no"}`,
    `- Underscores in multi-word tags: ${underscores}`,
  ];

  const supported = constructs.filter((c) => !c.unsupported);
  const unsupported = constructs.filter((c) => c.unsupported);

  if (supported.length) {
    lines.push("", "### Supported");
    for (const c of supported) {
      lines.push("", `**${c.name}** — \`${c.syntax}\``, "", c.description);
      if (c.example) lines.push("", "```", c.example, "```");
    }
  }

  // Listed as loudly as the supported ones on purpose: silently-ignored
  // syntax is worse than absent syntax, because the prompt still looks right.
  if (unsupported.length) {
    lines.push("", "### NOT supported here (silently ignored)");
    for (const c of unsupported) {
      lines.push("", `**${c.name}** — \`${c.syntax}\``, "", c.description);
    }
  }

  if (notes) lines.push("", notes);
  return lines;
}

function renderVocabulary(guide: ModelPromptingGuide): string[] {
  if (!guide.vocabulary) return [];
  const { source, reference, categories, notes } = guide.vocabulary;

  const total = Object.values(categories).reduce((n, tags) => n + tags.length, 0);
  const lines = [
    "## Tag Vocabulary",
    "",
    `${total} exact ${source} tags across ${Object.keys(categories).length} groups.` +
      (reference ? ` Anything absent: ${reference}` : ""),
    "",
  ];

  for (const [category, tags] of Object.entries(categories)) {
    lines.push(`**${category}**`, tags.join(", "), "");
  }

  if (notes) lines.push(notes, "");

  // The curated list is deliberately small. An agent that has read this far
  // is about to want a tag it does not contain, so name the lookup here
  // rather than leaving it to be found in the tool list.
  lines.push(
    "Beyond this list: `comfyui_search_tags` looks up any tag by substring and " +
      "reports its post count, and `comfyui_related_tags` returns what commonly " +
      "co-occurs with the tags already in your prompt."
  );

  return lines;
}

function renderTags(guide: ModelPromptingGuide): string[] {
  if (!guide.specialTags) return [];
  const { quality, negativeQuality, rating, other, notes } = guide.specialTags;

  const lines = ["## Special Tags", ""];
  if (quality?.length) lines.push(`- **Quality (positive)**: ${quality.join(", ")}`);
  if (negativeQuality?.length) {
    lines.push(`- **Quality (negative prompt)**: ${negativeQuality.join(", ")}`);
  }
  if (rating?.length) lines.push(`- **Rating**: ${rating.join(", ")}`);
  for (const [name, values] of Object.entries(other ?? {})) {
    lines.push(`- **${name}**: ${values.join(", ")}`);
  }
  if (notes) lines.push("", notes);

  return lines;
}

function renderTips(guide: ModelPromptingGuide): string[] {
  if (!guide.tips.length) return [];
  return ["## Tips", ...guide.tips.map((t) => `- ${t}`)];
}

function renderMistakes(guide: ModelPromptingGuide): string[] {
  if (!guide.commonMistakes.length) return [];
  return [
    "## Common Mistakes to Avoid",
    ...guide.commonMistakes.map((m) => `- ${m}`),
  ];
}

function renderStarters(guide: ModelPromptingGuide): string[] {
  const lines: string[] = ["## Starter Prompts"];

  // `starters` is the richer form; `examplePrompt` is the older single-prompt
  // field, kept because three callers still read it. Prefer starters, fall
  // back so a guide without them still shows something runnable.
  if (guide.starters?.length) {
    for (const starter of guide.starters) {
      lines.push("", `### ${starter.label}`, "", "```", starter.prompt, "```");
      if (starter.negativePrompt) {
        lines.push("", "Negative:", "```", starter.negativePrompt, "```");
      }
      if (starter.notes) lines.push("", starter.notes);
    }
    return lines;
  }

  lines.push("", "```", guide.examplePrompt, "```");
  return lines;
}

function renderModels(guide: ModelPromptingGuide): string[] {
  if (!guide.models?.length) return [];

  const lines = ["## Models", ""];
  for (const model of guide.models) {
    // The HF card leads when there is one: it states the file layout, the
    // licence and the base model in one place. Civitai is listed alongside
    // rather than instead, because for a finetune it is where the version
    // history and the trigger words are.
    const sources: string[] = [];
    if (model.huggingFace) {
      sources.push(`[${model.huggingFace}](${huggingFaceUrl(model.huggingFace)})`);
    }
    if (model.civitai) sources.push(`[civitai](${civitaiUrl(model.civitai)})`);
    if (model.homepage) sources.push(`[homepage](${model.homepage})`);

    const link = sources.length ? sources.join(", ") : "no canonical link";
    lines.push(`- **${model.name}** — ${link}${model.note ? `. ${model.note}` : ""}`);
  }

  // Said once, at the foot of the section, rather than as a second URL on
  // every row that has one.
  if (guide.models.some((m) => m.civitai)) {
    lines.push(
      "",
      "Civitai links work against `civitai.red` too — same paths, different host, " +
        "which is the way through when civitai.com is blocked or gated where you are."
    );
  }
  return lines;
}

const RENDERERS: Record<GuideSection, (g: ModelPromptingGuide) => string[]> = {
  overview: renderOverview,
  structure: renderStructure,
  syntax: renderSyntax,
  tags: renderTags,
  vocabulary: renderVocabulary,
  tips: renderTips,
  mistakes: renderMistakes,
  starters: renderStarters,
  models: renderModels,
};

/**
 * Render a guide.
 *
 * `sections` omitted renders the whole guide, which is what the resource
 * handler wants. Pass a list to render only those, in canonical order
 * regardless of the order given.
 */
export function formatPromptingGuide(
  guide: ModelPromptingGuide,
  sections?: GuideSection[]
): string {
  const wanted = sections?.length
    ? GUIDE_SECTIONS.filter((s) => sections.includes(s))
    : GUIDE_SECTIONS;

  const lines: string[] = [`# ${guide.modelType} Prompting Guide`, ""];

  for (const section of wanted) {
    const rendered = RENDERERS[section](guide);
    if (rendered.length) lines.push(...rendered, "");
  }

  // Only worth saying when something was actually withheld.
  if (sections?.length) {
    const omitted = sectionsPresent(guide).filter((s) => !sections.includes(s));
    if (omitted.length) {
      lines.push(
        `More available — sections: ${omitted.join(", ")}. ` +
          `Request one with comfyui_get_prompting_guide({ section: "<name>" }), ` +
          `or detail:"full" for everything.`
      );
    }
  }

  return lines.join("\n").trimEnd();
}
