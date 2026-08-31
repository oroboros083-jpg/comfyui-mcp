import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PROMPTING_GUIDES,
  getPromptingGuide,
  getGuideIndex,
  formatPromptingGuide,
  huggingFaceUrl,
  civitaiUrl,
  sectionsPresent,
  GUIDE_SECTIONS,
} from "./index.js";
import { ARCHITECTURES, architectureFor } from "../../architectures/registry.js";
import { CHARACTER_LIMIT } from "../../constants.js";
import { EXAMPLE_WORKFLOWS } from "../../tools/examples/data.js";
import { SPATIAL_CONTROL_NOTE } from "./guides/vocabulary.js";

// --- coverage -------------------------------------------------------------

test("every architecture names a guide that exists", () => {
  // The whole point of `guide` is that get_prompting_guide can follow it. A
  // row pointing at a missing key produced an error at the moment the user
  // asked for help, which is the worst possible time.
  for (const spec of ARCHITECTURES) {
    assert.ok(spec.guide, `${spec.id} has no guide`);
    assert.ok(
      PROMPTING_GUIDES[spec.guide!],
      `${spec.id} points at missing guide '${spec.guide}'`
    );
  }
});

test("every guide is reachable from some architecture", () => {
  for (const key of Object.keys(PROMPTING_GUIDES)) {
    assert.ok(
      ARCHITECTURES.some((a) => a.guide === key),
      `guide '${key}' has no architecture pointing at it, so nothing can route to it`
    );
  }
});

// --- routing --------------------------------------------------------------

test("booru anime finetunes no longer resolve to the SDXL guide", () => {
  // They were aliases of sdxl, so their users were told to write natural
  // language and skip quality tags - close to the inverse of correct.
  const cases: Array<[string, string]> = [
    ["waiIllustriousSDXL_v170.safetensors", "illustrious"],
    ["noobaiXL_epsilonPred11.safetensors", "noobai"],
    ["ponyDiffusionV6XL.safetensors", "pony"],
    ["animagine-xl-4.0.safetensors", "animagine"],
  ];

  for (const [filename, expected] of cases) {
    assert.equal(architectureFor(filename)?.id, expected, filename);
    assert.equal(
      getPromptingGuide(filename)?.promptingStyle,
      "booru_tags",
      `${filename} should get booru-tag guidance`
    );
  }
});

test("the anima pattern does not swallow animagine or animatediff", () => {
  assert.equal(architectureFor("anima_base_v1.0.safetensors")?.id, "anima");
  assert.equal(architectureFor("Anima-2.9B-v1.0.safetensors")?.id, "anima");

  // Its own architecture, and a much older unrelated one.
  assert.equal(architectureFor("animagine-xl-4.0.safetensors")?.id, "animagine");
  assert.notEqual(architectureFor("animatediff_sd15_v3.safetensors")?.id, "anima");
});

test("plain SDXL checkpoints still resolve to sdxl", () => {
  assert.equal(architectureFor("sd_xl_base_1.0.safetensors")?.id, "sdxl");
  assert.equal(architectureFor("juggernautXL_v9.safetensors")?.id, "sdxl");
});

// --- progressive disclosure ----------------------------------------------

test("the index is a table, not every guide concatenated", () => {
  const index = getGuideIndex();

  // Every guide key appears, so the index is complete...
  for (const key of Object.keys(PROMPTING_GUIDES)) {
    assert.match(index, new RegExp(`\\\`${key}\\\``), `index omits ${key}`);
  }

  // ...but it stays well inside the response cap, which concatenating the
  // guides in full does not: that runs to roughly 70k characters.
  assert.ok(
    index.length < CHARACTER_LIMIT,
    `index is ${index.length} chars, over the ${CHARACTER_LIMIT} cap`
  );

  const concatenated = Object.values(PROMPTING_GUIDES).reduce(
    (n, g) => n + formatPromptingGuide(g).length,
    0
  );
  assert.ok(
    concatenated > CHARACTER_LIMIT,
    "if the full set now fits, this test is no longer measuring anything"
  );
});

test("overview is much smaller than the full guide", () => {
  const guide = PROMPTING_GUIDES.anima!;
  const overview = formatPromptingGuide(guide, ["overview"]);
  const full = formatPromptingGuide(guide);

  assert.ok(overview.length < full.length / 2, "overview should be a fraction of full");
  // The overview still has to be enough to write a prompt from.
  assert.match(overview, /Prompting Style/);
  assert.match(overview, /Recommended Settings/);
});

test("a withheld-section footer names only sections that exist", () => {
  const guide = PROMPTING_GUIDES.anima!;
  const overview = formatPromptingGuide(guide, ["overview"]);

  for (const section of sectionsPresent(guide)) {
    if (section === "overview") continue;
    assert.ok(overview.includes(section), `footer should offer '${section}'`);
  }

  // zimage has no structure section; its footer must not advertise one.
  const sparse = PROMPTING_GUIDES.zimage!;
  assert.ok(!sectionsPresent(sparse).includes("structure"));
  const sparseOverview = formatPromptingGuide(sparse, ["overview"]);
  assert.ok(!/sections:.*structure/.test(sparseOverview));
});

test("requesting one section returns that section and not the others", () => {
  const guide = PROMPTING_GUIDES.pony!;
  const tags = formatPromptingGuide(guide, ["tags"]);

  assert.match(tags, /## Special Tags/);
  assert.ok(!tags.includes("## Tips"));
  assert.ok(!tags.includes("## Starter Prompts"));
});

test("full rendering includes every section the guide has", () => {
  const guide = PROMPTING_GUIDES.anima!;
  const full = formatPromptingGuide(guide);

  assert.match(full, /## Prompt Structure/);
  assert.match(full, /## Special Tags/);
  assert.match(full, /## Tips/);
  assert.match(full, /## Common Mistakes/);
  assert.match(full, /## Starter Prompts/);
  assert.match(full, /## Models/);

  // Nothing left to offer, so no footer.
  assert.ok(!full.includes("More available"));
});

// --- content shape --------------------------------------------------------

test("ordered structures render their slots in order", () => {
  const guide = PROMPTING_GUIDES.animagine!;
  const structure = formatPromptingGuide(guide, ["structure"]);

  const positions = guide.structure!.slots.map((s) => structure.indexOf(s.name));
  assert.ok(
    positions.every((p) => p >= 0),
    "every slot name should appear"
  );
  const sorted = [...positions].sort((a, b) => a - b);
  assert.deepEqual(positions, sorted, "slots must render in declared order");
});

test("Animagine puts quality last and Pony puts its score chain first", () => {
  // The inversion between these two is the single most common way to write a
  // bad prompt for one of them out of habit from the other, so pin it.
  const animagine = PROMPTING_GUIDES.animagine!.structure!;
  assert.equal(animagine.slots[animagine.slots.length - 1]!.name, "quality");

  const pony = PROMPTING_GUIDES.pony!.structure!;
  assert.equal(pony.slots[0]!.name, "score ladder");
});

test("every guide offers at least one starter prompt", () => {
  for (const [key, guide] of Object.entries(PROMPTING_GUIDES)) {
    const starters = formatPromptingGuide(guide, ["starters"]);
    assert.match(starters, /## Starter Prompts/, `${key} has no starters section`);
    assert.ok(
      (guide.starters?.length ?? 0) > 0 || guide.examplePrompt.length > 0,
      `${key} has nothing runnable to paste`
    );
  }
});

test("negative prompts only appear on guides that support them", () => {
  for (const [key, guide] of Object.entries(PROMPTING_GUIDES)) {
    if (guide.supportsNegativePrompt) continue;
    for (const starter of guide.starters ?? []) {
      assert.equal(
        starter.negativePrompt,
        undefined,
        `${key} says negatives are unsupported but starter '${starter.label}' has one`
      );
    }
  }
});

test("model references render as Hugging Face links", () => {
  const flux = formatPromptingGuide(PROMPTING_GUIDES.flux!, ["models"]);
  assert.match(flux, /https:\/\/huggingface\.co\/black-forest-labs\/FLUX\.1-dev/);

  // Pony has no official HF repo, so it carries a Civitai path instead - and
  // must not invent an HF link.
  const pony = formatPromptingGuide(PROMPTING_GUIDES.pony!, ["models"]);
  assert.ok(!pony.includes("huggingface.co"));
  assert.match(pony, /civitai\.com\/models\/257749/);
});

test("huggingFaceUrl builds a repo URL", () => {
  assert.equal(
    huggingFaceUrl("stabilityai/stable-cascade"),
    "https://huggingface.co/stabilityai/stable-cascade"
  );
});

test("civitaiUrl builds a model URL, with or without a leading slash", () => {
  assert.equal(civitaiUrl("models/4201"), "https://civitai.com/models/4201");
  assert.equal(civitaiUrl("/models/4201"), "https://civitai.com/models/4201");
});

test("a model with both sources leads with the Hugging Face card", () => {
  // Both are worth having - the HF card states file layout and licence, the
  // Civitai page states version history and trigger words - but only one can
  // be first, and the caller reads the first.
  const rendered = formatPromptingGuide(
    {
      ...PROMPTING_GUIDES.sdxl!,
      models: [
        { name: "Both", huggingFace: "owner/name", civitai: "models/1" },
      ],
    },
    ["models"]
  );

  assert.ok(
    rendered.indexOf("huggingface.co") < rendered.indexOf("civitai.com"),
    "the HF card is the primary link when a model has one"
  );
});

test("the civitai.red mirror is mentioned once, and only where it applies", () => {
  // A second URL on every Civitai row would be the same guidance paid for
  // per row; a guide with no Civitai link should not carry it at all.
  const sd15 = formatPromptingGuide(PROMPTING_GUIDES.sd15!, ["models"]);
  assert.equal(sd15.match(/civitai\.red/g)?.length, 1);

  const flux = formatPromptingGuide(PROMPTING_GUIDES.flux!, ["models"]);
  assert.ok(!flux.includes("civitai.red"));
});

test("every model reference has a link of some kind", () => {
  for (const [key, guide] of Object.entries(PROMPTING_GUIDES)) {
    for (const model of guide.models ?? []) {
      assert.ok(
        model.huggingFace || model.civitai || model.homepage,
        `${key}: '${model.name}' names no source at all`
      );
      if (model.huggingFace) {
        assert.match(
          model.huggingFace,
          /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/,
          `${key}: '${model.huggingFace}' is not an owner/name repo id`
        );
      }
      if (model.civitai) {
        // A path, not a URL: the renderer supplies the host, which is what
        // lets it offer the civitai.red mirror as well.
        assert.ok(
          !/^https?:/.test(model.civitai),
          `${key}: '${model.name}' has a full URL where a civitai path belongs`
        );
      }
    }
  }
});

test("every non-text-to-image model says what it is", () => {
  // A bare repo link answers "where do I get it" and nothing else. For the
  // image models the architecture name usually carries the rest; for video
  // and audio it does not - which of Wan's four files, and whether ACE-Step
  // or Stable Audio is the one that sings, are not guessable from a name.
  for (const key of ["wan", "ltxvideo", "mochi", "cosmos", "aceaudio"]) {
    const guide = PROMPTING_GUIDES[key];
    assert.ok(guide, `no guide for ${key}`);
    for (const model of guide.models ?? []) {
      assert.ok(model.note, `${key}: '${model.name}' has no description`);
    }
  }
});

test("GUIDE_SECTIONS is the full set the renderer handles", () => {
  const guide = PROMPTING_GUIDES.anima!;
  for (const section of GUIDE_SECTIONS) {
    // Should not throw, and overview/structure/etc all produce something for
    // a guide as complete as anima's.
    const rendered = formatPromptingGuide(guide, [section]);
    assert.ok(rendered.length > 0, `${section} rendered nothing`);
  }
});

// --- syntax ---------------------------------------------------------------

test("weighting is marked unsupported exactly where weights do not work", () => {
  // The silent failure this guards: (tag:1.2) parses fine on every model
  // because CLIPTextEncode parses it - it just does nothing on an encoder
  // that ignores attention weighting. So the prompt looks right and is not.
  for (const [key, guide] of Object.entries(PROMPTING_GUIDES)) {
    if (!guide.syntax) continue;
    const weighting = guide.syntax.constructs.find((c) => c.name === "weighting");
    if (!weighting) continue;

    assert.equal(
      !weighting.unsupported,
      guide.supportsPromptWeights,
      `${key}: supportsPromptWeights=${guide.supportsPromptWeights} but weighting.unsupported=${weighting.unsupported}`
    );
  }
});

test("the syntax section flags A1111 constructs ComfyUI ignores", () => {
  const syntax = formatPromptingGuide(PROMPTING_GUIDES.illustrious!, ["syntax"]);

  assert.match(syntax, /NOT supported/);
  assert.match(syntax, /BREAK/);
  // Escaping is the one that silently corrupts booru character tags.
  assert.match(syntax, /\\\(/);
});

test("every guide with a syntax lists escaping", () => {
  // Character tags carry their series in parentheses, and an unescaped
  // bracket is read as a weight group rather than as text.
  for (const [key, guide] of Object.entries(PROMPTING_GUIDES)) {
    if (!guide.syntax) continue;
    assert.ok(
      guide.syntax.constructs.some((c) => c.name === "escaping"),
      `${key} does not say how to escape a literal parenthesis`
    );
  }
});

// --- vocabulary -----------------------------------------------------------

test("every booru-tag guide carries an exact tag vocabulary", () => {
  for (const [key, guide] of Object.entries(PROMPTING_GUIDES)) {
    if (guide.promptingStyle !== "booru_tags") continue;
    assert.ok(guide.vocabulary, `${key} is booru-tag styled but has no vocabulary`);
    assert.ok(
      guide.vocabulary!.reference,
      `${key} must name where to look up tags the curated list omits`
    );
  }
});

test("vocabulary tags are lowercase and space-free", () => {
  // A tag with a space in it is two tags after the comma split, and a tag
  // with a capital is a tag the lookup will miss.
  for (const [key, guide] of Object.entries(PROMPTING_GUIDES)) {
    for (const [category, tags] of Object.entries(guide.vocabulary?.categories ?? {})) {
      for (const tag of tags) {
        assert.equal(tag, tag.toLowerCase(), `${key}/${category}: '${tag}' is not lowercase`);
        assert.ok(!/\s/.test(tag), `${key}/${category}: '${tag}' contains a space`);
      }
    }
  }
});

test("the vocabulary section renders every category with a count", () => {
  const guide = PROMPTING_GUIDES.noobai!;
  const rendered = formatPromptingGuide(guide, ["vocabulary"]);

  for (const category of Object.keys(guide.vocabulary!.categories)) {
    assert.ok(rendered.includes(category), `vocabulary section omits '${category}'`);
  }

  const total = Object.values(guide.vocabulary!.categories).reduce(
    (n, tags) => n + tags.length,
    0
  );
  assert.match(rendered, new RegExp(`${total} exact`));
});

test("a full booru guide stays inside the response cap", () => {
  // Adding two sections to the largest guides is exactly how a response
  // starts getting truncated, so pin it.
  for (const [key, guide] of Object.entries(PROMPTING_GUIDES)) {
    const full = formatPromptingGuide(guide);
    assert.ok(
      full.length < CHARACTER_LIMIT,
      `${key} renders ${full.length} chars, over the ${CHARACTER_LIMIT} cap`
    );
  }
});

test("the index names the sections that actually exist", () => {
  const index = getGuideIndex();
  for (const section of GUIDE_SECTIONS) {
    assert.ok(index.includes(section), `index does not mention section '${section}'`);
  }
});

// --- eval-suite counts ----------------------------------------------------

/**
 * The counting questions in `evals/library.xml` are derived from these
 * numbers, and the eval suites are not run by `npm test`. That combination is
 * how those answers went stale for three PRs without anything failing. These
 * assertions are the tripwire: adding a guide changes a count here, and the
 * message says which file to go and re-derive.
 */
test("guide counts used by evals/library.xml", () => {
  const stale = (what: string) =>
    `${what} changed - re-derive the counting questions in evals/library.xml`;

  const keys = Object.keys(PROMPTING_GUIDES);
  assert.equal(keys.length, 26, stale("guide count"));

  const neither = keys.filter(
    (k) =>
      !PROMPTING_GUIDES[k]!.supportsNegativePrompt &&
      !PROMPTING_GUIDES[k]!.supportsPromptWeights
  );
  assert.deepEqual(
    neither.sort(),
    ["flux", "omnigen", "qwen", "zimage"],
    stale("the set of guides supporting neither negatives nor weights")
  );

  const weights = keys.filter((k) => PROMPTING_GUIDES[k]!.supportsPromptWeights);
  assert.equal(weights.length, 9, stale("the number of guides supporting prompt weights"));

  const structured = keys.filter((k) => PROMPTING_GUIDES[k]!.structure);
  assert.equal(structured.length, 10, stale("the number of guides with a prompt structure"));

  const booru = keys.filter((k) => PROMPTING_GUIDES[k]!.promptingStyle === "booru_tags");
  assert.equal(booru.length, 5, stale("the number of booru-tag guides"));

  assert.equal(
    PROMPTING_GUIDES.anima!.structure!.slots.length,
    6,
    stale("the Anima prompt structure")
  );

  // One question crosses the two data sets: of the "neither" guides, only
  // those whose name is also an example-workflow category count, and the
  // answer is the total size of those categories.
  const perCategory = new Map<string, number>();
  for (const example of EXAMPLE_WORKFLOWS) {
    perCategory.set(example.category, (perCategory.get(example.category) ?? 0) + 1);
  }
  const shared = neither.filter((k) => perCategory.has(k));
  assert.deepEqual(shared.sort(), ["flux", "omnigen", "qwen"], stale("that overlap"));
  assert.equal(
    shared.reduce((n, k) => n + perCategory.get(k)!, 0),
    15,
    stale("the example counts in those categories")
  );
});

// --- spatial control ------------------------------------------------------

test("the regional example is findable from the symptom, not just the cure", () => {
  // The whole deliverable. An agent watching two subjects merge does not know
  // to search for "ConditioningSetArea" - that IS the answer it is hunting
  // for. Since list_examples was dropped, this description is what reaches a
  // reader through the resource listing, so the symptoms have to be in it.
  const area = EXAMPLE_WORKFLOWS.find((e) => e.name === "Area Composition")!;
  const text = `${area.description} ${area.notes ?? ""}`.toLowerCase();

  for (const symptom of ["merg", "swap", "left", "place"]) {
    assert.ok(text.includes(symptom), `Area Composition never mentions '${symptom}'`);
  }

  // And the nodes, so a reader knows nothing needs installing.
  assert.deepEqual(area.requiredNodes, [
    "ConditioningSetArea",
    "ConditioningSetAreaPercentage",
    "ConditioningCombine",
  ]);
});

test("the example says where regional conditioning stops working", () => {
  // Advice that omits "and this breaks at CFG 1" sends someone to spend an
  // afternoon on a Turbo model wondering why the regions do nothing.
  const area = EXAMPLE_WORKFLOWS.find((e) => e.name === "Area Composition")!;
  assert.match(area.notes!, /CFG 1/);
  assert.match(area.notes!, /seam/i);
});

test("the spatial note says wording cannot fix placement", () => {
  // The misconception it exists to correct. Two guides instruct "describe
  // spatial relationships explicitly", which cannot work - a weight scales a
  // token everywhere and a plain graph has no "here".
  assert.match(SPATIAL_CONTROL_NOTE, /weights do not help|no way to say 'here'/);
  assert.match(SPATIAL_CONTROL_NOTE, /Area Composition/);
  assert.match(SPATIAL_CONTROL_NOTE, /CFG 1/);
});

test("the spatial note reaches the guides where area conditioning works", () => {
  const carrying = Object.entries(PROMPTING_GUIDES)
    .filter(([, guide]) => guide.tips.includes(SPATIAL_CONTROL_NOTE))
    .map(([key]) => key)
    .sort();

  assert.deepEqual(carrying, [
    "animagine",
    "flux",
    "illustrious",
    "noobai",
    "pixart",
    "pony",
    "sd15",
    "sdxl",
  ]);

  // anima sits beside the booru rows but is single-encoder unet_clip - a
  // different graph shape, untested for this. chroma is CFG-1 Flux-shaped.
  // Both are excluded on purpose, so pin it.
  assert.ok(!carrying.includes("anima"));
  assert.ok(!carrying.includes("chroma"));
});

test("the note routes only at surfaces that still exist", () => {
  // list_examples and get_example_workflow were dropped. Naming either here
  // would be a dead pointer at the moment it is needed - and would fail
  // server/tool-references.test.ts, which is the belt to this braces.
  assert.ok(!/comfyui_list_examples|comfyui_get_example_workflow/.test(SPATIAL_CONTROL_NOTE));
  assert.match(SPATIAL_CONTROL_NOTE, /comfyui:\/\/examples\/area-composition/);
});
