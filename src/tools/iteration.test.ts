import { test } from "node:test";
import assert from "node:assert/strict";

import {
  planIteration,
  distillLoraFor,
  patternFor,
  renderIterationPlan,
  DISTILL_LORA_PATTERNS,
  type PlanIterationInput,
} from "./iteration.js";
import { MODEL_PATTERNS } from "./library/recommend.js";

/** Defaults the zod schema would have supplied. */
function input(over: Partial<PlanIterationInput> & { model: string }): PlanIterationInput {
  return { seed: 12345, response_format: "json", ...over } as PlanIterationInput;
}

// --- the claim worth pinning ---------------------------------------------

test("a distill LoRA over the same base carries composition", async () => {
  const plan = await planIteration(undefined, input({
    model: "flux1-dev.safetensors",
    availableCheckpoints: ["flux1-dev.safetensors"],
    availableUnets: [],
    availableLoras: ["flux-hyper-8step.safetensors"],
  }));

  assert.equal(plan.seedCarryOver, "composition");
  assert.equal(plan.draft?.model, "flux1-dev.safetensors", "the draft must be the same weights");
  assert.equal(plan.draft?.lora, "flux-hyper-8step.safetensors");
  assert.equal(plan.final.model, "flux1-dev.safetensors");
  // Both stages must echo the seed, or the two runs cannot be compared.
  assert.equal(plan.draft?.seed, 12345);
  assert.equal(plan.final.seed, 12345);
});

test("a separate distilled checkpoint carries the prompt only", async () => {
  // This is the case a naive tool gets wrong. flux1-schnell is not flux1-dev
  // with fewer steps - it is different weights, so the same seed renders a
  // different image and farming seeds on it is wasted work.
  const plan = await planIteration(undefined, input({
    model: "flux1-dev.safetensors",
    availableCheckpoints: ["flux1-dev.safetensors", "flux1-schnell.safetensors"],
    availableUnets: [],
    availableLoras: [],
  }));

  assert.equal(plan.seedCarryOver, "prompt-only");
  assert.equal(plan.draft?.model, "flux1-schnell.safetensors");
  assert.match(plan.note, /DIFFERENT image/);
  assert.match(plan.note, /not to farm seeds/);
});

test("the LoRA path is preferred when both are installed", async () => {
  // Only one of the two previews composition, so it wins even though the
  // separate checkpoint is nominally faster.
  const plan = await planIteration(undefined, input({
    model: "flux1-dev.safetensors",
    availableCheckpoints: ["flux1-dev.safetensors", "flux1-schnell.safetensors"],
    availableUnets: [],
    availableLoras: ["flux-turbo-alpha.safetensors"],
  }));

  assert.equal(plan.seedCarryOver, "composition");
  assert.equal(plan.draft?.lora, "flux-turbo-alpha.safetensors");
});

test("the final model is never offered as its own draft", async () => {
  const plan = await planIteration(undefined, input({
    model: "sdxl_turbo.safetensors",
    availableCheckpoints: ["sdxl_turbo.safetensors"],
    availableUnets: [],
    availableLoras: [],
  }));

  assert.equal(plan.draft, undefined);
  assert.equal(plan.seedCarryOver, "none");
});

// --- nothing fast installed ----------------------------------------------

test("with nothing fast installed the gap is named, with the download tool", async () => {
  const plan = await planIteration(undefined, input({
    model: "sd_xl_base_1.0.safetensors",
    availableCheckpoints: ["sd_xl_base_1.0.safetensors"],
    availableUnets: [],
    availableLoras: ["some_style_lora.safetensors"],
  }));

  assert.equal(plan.seedCarryOver, "none");
  assert.equal(plan.draft, undefined);
  // CLAUDE.md: a failure that names no tool makes that tool undiscoverable.
  assert.match(plan.note, /download_model/);
  assert.ok(plan.suggestedDownloads?.length);
  assert.ok(
    plan.suggestedDownloads!.some((s) => /lightning|hyper|dmd2/i.test(s)),
    "suggestions must name real distill LoRA families"
  );
});

test("suggestions follow the architecture rather than being generic", async () => {
  const sd15 = await planIteration(undefined, input({
    model: "v1-5-pruned-emaonly.safetensors",
    availableCheckpoints: [],
    availableUnets: [],
    availableLoras: [],
  }));
  assert.ok(sd15.suggestedDownloads!.some((s) => /SD1\.?5/i.test(s)));
});

// --- matching -------------------------------------------------------------

test("dmd2 is matched before the bare lcm pattern", () => {
  // DMD2 filenames routinely mention LCM, and the two want different steps.
  assert.equal(distillLoraFor("dmd2_sdxl_4step_lora.safetensors")?.id, "dmd2");
  assert.equal(distillLoraFor("lcm-lora-sdxl.safetensors")?.id, "lcm");
});

test("a plain style LoRA is not mistaken for a distillation", () => {
  assert.equal(distillLoraFor("watercolor_style_v2.safetensors"), undefined);
  assert.equal(distillLoraFor("add_detail.safetensors"), undefined);
});

test("every distill LoRA asks for a low CFG", () => {
  // Leaving CFG at 7 is the single most common way a distilled model looks
  // broken, so no row may quietly omit the correction.
  for (const lora of DISTILL_LORA_PATTERNS) {
    assert.ok(lora.cfg <= 2, `${lora.id} recommends CFG ${lora.cfg}`);
    assert.ok(lora.steps <= 8, `${lora.id} recommends ${lora.steps} steps`);
  }
});

test("the tiered draft models are the distilled ones", () => {
  const drafts = MODEL_PATTERNS.filter((p) => p.tier === "draft");
  assert.ok(drafts.length > 0);
  for (const pattern of drafts) {
    assert.ok(
      pattern.defaultSteps <= 8,
      `${pattern.workflowName} is tiered draft but wants ${pattern.defaultSteps} steps`
    );
    assert.ok(
      pattern.defaultCfg <= 2,
      `${pattern.workflowName} is tiered draft but wants CFG ${pattern.defaultCfg}`
    );
  }
});

test("full-quality models are not tiered as drafts", () => {
  assert.equal(patternFor("flux1-dev.safetensors")?.tier, "standard");
  assert.equal(patternFor("flux1-schnell.safetensors")?.tier, "draft");
  assert.equal(patternFor("sd_xl_turbo_1.0.safetensors")?.tier, "draft");
});

// --- rendering ------------------------------------------------------------

test("the rendered plan states the carry-over up front", async () => {
  const composition = await planIteration(undefined, input({
    model: "flux1-dev.safetensors",
    availableCheckpoints: ["flux1-dev.safetensors"],
    availableUnets: [],
    availableLoras: ["hyper-flux-8steps.safetensors"],
  }));
  assert.match(renderIterationPlan(composition), /Composition carries over/);

  const promptOnly = await planIteration(undefined, input({
    model: "flux1-dev.safetensors",
    availableCheckpoints: ["flux1-dev.safetensors", "flux1-schnell.safetensors"],
    availableUnets: [],
    availableLoras: [],
  }));
  const rendered = renderIterationPlan(promptOnly);
  assert.match(rendered, /same seed gives a different image/i);
  // Both stages, both seeds, so a caller can act without a second call.
  assert.match(rendered, /1\. Draft/);
  assert.match(rendered, /2\. Final/);
});

test("the real release filenames are matched", () => {
  // Every one of these is a filename as actually published; a pattern that
  // only matches the tidied-up name is a pattern that never fires.
  assert.equal(distillLoraFor("Hyper-FLUX.1-dev-8steps-lora.safetensors")?.id, "hyper");
  assert.equal(distillLoraFor("Hyper-SDXL-8steps-lora.safetensors")?.id, "hyper");
  assert.equal(distillLoraFor("sdxl_lightning_8step_lora.safetensors")?.id, "lightning");
  assert.equal(distillLoraFor("dmd2_sdxl_4step_lora_fp16.safetensors")?.id, "dmd2");
  assert.equal(distillLoraFor("TCD-SDXL-LoRA.safetensors")?.id, "tcd");

  // And the near-misses that must not fire.
  assert.equal(distillLoraFor("hyper_realistic_skin_v3.safetensors"), undefined);
  // PCM is its own distillation family, not LCM, and wants different
  // settings - so "lcmlike" in a PCM filename must not be claimed.
  assert.equal(distillLoraFor("pcm_sdxl_lcmlike_lora_converted.safetensors"), undefined);
});

test("the real turbo checkpoint filename reaches its own row", () => {
  // Stability ships sd_xl_turbo_1.0_fp16.safetensors, not sdxl_turbo.
  const match = patternFor("sd_xl_turbo_1.0_fp16.safetensors");
  assert.equal(match?.workflowName, "SDXL Turbo");
  assert.equal(match?.defaultCfg, 1);
});

test("the composition promise says where it stops holding", async () => {
  // "Composition carries over" is true for a distill LoRA on the same weights
  // - but regional conditioning rides on CFG, and the whole point of the
  // draft stage is CFG 1. Someone farming seeds on a regional workflow would
  // watch the areas do nothing and blame the seed.
  const plan = await planIteration(undefined, input({
    model: "flux1-dev.safetensors",
    availableCheckpoints: ["flux1-dev.safetensors"],
    availableUnets: [],
    availableLoras: ["hyper-flux-8steps.safetensors"],
  }));

  assert.equal(plan.seedCarryOver, "composition");
  assert.match(plan.note, /regional/i);
  assert.match(plan.note, /CFG/);
});
