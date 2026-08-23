import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PROMPTING_GUIDES,
  getPromptingGuide,
  getGuideIndex,
  formatPromptingGuide,
  huggingFaceUrl,
  sectionsPresent,
  GUIDE_SECTIONS,
} from "./index.js";
import { ARCHITECTURES, architectureFor } from "../../architectures/registry.js";
import { CHARACTER_LIMIT } from "../../constants.js";

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

  // Pony has no official HF repo, so it carries a homepage instead - and must
  // not invent an HF link.
  const pony = formatPromptingGuide(PROMPTING_GUIDES.pony!, ["models"]);
  assert.ok(!pony.includes("huggingface.co"));
  assert.match(pony, /civitai\.com/);
});

test("huggingFaceUrl builds a repo URL", () => {
  assert.equal(
    huggingFaceUrl("stabilityai/stable-cascade"),
    "https://huggingface.co/stabilityai/stable-cascade"
  );
});

test("every model reference has a link of some kind", () => {
  for (const [key, guide] of Object.entries(PROMPTING_GUIDES)) {
    for (const model of guide.models ?? []) {
      assert.ok(
        model.huggingFace || model.homepage,
        `${key}: '${model.name}' has neither a huggingFace repo nor a homepage`
      );
      if (model.huggingFace) {
        assert.match(
          model.huggingFace,
          /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/,
          `${key}: '${model.huggingFace}' is not an owner/name repo id`
        );
      }
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
