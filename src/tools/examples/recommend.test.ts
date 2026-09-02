import { test } from "node:test";
import assert from "node:assert/strict";

import {
  recommendWorkflow,
  formatWorkflowRecommendation,
  type WorkflowRecommendation,
} from "./recommend.js";
import { PROMPTING_GUIDES } from "../../resources/prompting-guide.js";

async function recommend(modelName: string): Promise<WorkflowRecommendation> {
  return recommendWorkflow({ modelName } as Parameters<typeof recommendWorkflow>[0]);
}

test("a Flux 2 filename reaches the Flux 2 row", async () => {
  // MODEL_PATTERNS is first-match-wins in declaration order, and the Flux Dev
  // pattern matches "flux2-dev.safetensors" - the real BFL filename - so the
  // Flux 2 row sat below it and could never be reached. Its users got Flux
  // Dev's CFG of 1 instead of 3.
  for (const name of [
    "flux2-dev.safetensors",
    "FLUX.2-dev.safetensors",
    "flux_2_klein.safetensors",
    "flux-2-schnell.safetensors",
  ]) {
    const rec = await recommend(name);
    assert.equal(rec.matchedWorkflow, "Flux 2", name);
    assert.equal(rec.recommendedSettings.cfg, 3, name);
  }
});

test("a Flux 1 model is not swallowed by the Flux 2 pattern", async () => {
  // The 2 is anchored to the word "flux", so a v2 quantization of a Flux 1
  // model still resolves to Flux 1.
  assert.equal(
    (await recommend("flux1-dev.safetensors")).matchedWorkflow,
    "Flux Dev Checkpoint"
  );
  assert.equal(
    (await recommend("flux1-schnell.safetensors")).matchedWorkflow,
    "Flux Schnell Checkpoint"
  );
  assert.equal(
    (await recommend("flux1-dev-fp8_v2.safetensors")).matchedWorkflow,
    "Flux Dev Checkpoint"
  );
});

test("the next steps never name a prompting guide that does not exist", async () => {
  // modelType was a four-value union when this line was written, and all four
  // were guide keys. It is now any registry id, most of which have no guide -
  // so the rendered instruction told the agent to call one that errors.
  const guideless = [
    "wan2.1_t2v_14B.safetensors",
    "hidream_i1_dev.safetensors",
    "lumina_2.safetensors",
    "chroma_v1.safetensors",
  ];

  for (const name of guideless) {
    const rec = await recommend(name);
    const output = formatWorkflowRecommendation(rec);

    const named = [...output.matchAll(/comfyui_get_prompting_guide\('?"?([a-z0-9]+)'?"?\)/gi)];
    assert.ok(named.length > 0, `${name}: no guide named at all`);

    for (const [, guide] of named) {
      assert.ok(
        guide in PROMPTING_GUIDES,
        `${name}: next steps name '${guide}', which is not a guide`
      );
    }
  }
});

test("a model with its own guide still points at that guide", async () => {
  const rec = await recommend("flux1-dev.safetensors");
  const output = formatWorkflowRecommendation(rec);

  assert.ok(output.includes("comfyui_get_prompting_guide('flux')"), output);
});

test("the rendered next steps agree with the computed guide line", async () => {
  // Two copies of the same answer drifted apart; the rendered one now reuses
  // the computed sentence rather than re-deriving it from modelType.
  const rec = await recommend("wan2.1_t2v_14B.safetensors");
  const output = formatWorkflowRecommendation(rec);

  assert.ok(output.includes(rec.promptingGuide), output);
});

/** Same, but for a task other than the default txt2img. */
async function recommendFor(
  modelName: string,
  taskType: "txt2img" | "img2img" | "inpaint" | "edit" | "video"
): Promise<WorkflowRecommendation> {
  return recommendWorkflow({ modelName, taskType } as Parameters<
    typeof recommendWorkflow
  >[0]);
}

test("a Qwen model editing is sent to Qwen Image Edit, not Flux Kontext", async () => {
  // Qwen was flux-shaped under the old conflated label, so "edit" recommended
  // Flux Kontext - while the Qwen Image Edit examples sat unused in the same
  // library. Separating the single-encoder shape from Flux fixed the routing.
  const rec = await recommendFor("qwen_image_fp8_e4m3fn.safetensors", "edit");

  assert.ok(
    rec.alternativeWorkflows?.some((w) => w.includes("Qwen Image Edit")),
    `expected a Qwen edit workflow, got ${JSON.stringify(rec.alternativeWorkflows)}`
  );
  assert.ok(
    !rec.alternativeWorkflows?.some((w) => w.includes("Kontext")),
    "Flux Kontext is a Flux workflow and does not apply to Qwen"
  );
});

test("a Flux model editing still gets Flux Kontext", async () => {
  const rec = await recommendFor("flux1-dev.safetensors", "edit");
  assert.ok(rec.alternativeWorkflows?.some((w) => w.includes("Kontext")));
});

test("single-encoder architectures still get UNET sampler defaults", async () => {
  // The sampler/scheduler defaults key off "loads a bare UNET", which is true
  // of both UNET shapes - that predicate was written as `=== "flux"`.
  const rec = await recommend("qwen_image_fp8_e4m3fn.safetensors");
  assert.equal(rec.recommendedSettings.sampler, "euler");
  assert.equal(rec.recommendedSettings.scheduler, "simple");
});
