import { test } from "node:test";
import assert from "node:assert/strict";

import {
  recommendWorkflow,
  formatWorkflowRecommendation,
  type WorkflowRecommendation,
} from "./recommend.js";
import { apiFormatOf } from "./list-examples.js";
import { PROMPTING_GUIDES } from "../../resources/prompting-guide.js";

/** Recommend without letting the docs-PNG fetch reach the network. */
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
    const output = formatWorkflowRecommendation({ ...rec, exampleWorkflow: undefined });

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
  const output = formatWorkflowRecommendation({ ...rec, exampleWorkflow: undefined });

  assert.ok(output.includes("comfyui_get_prompting_guide('flux')"), output);
});

test("the rendered next steps agree with the computed guide line", async () => {
  // Two copies of the same answer drifted apart; the rendered one now reuses
  // the computed sentence rather than re-deriving it from modelType.
  const rec = await recommend("wan2.1_t2v_14B.safetensors");
  const output = formatWorkflowRecommendation({ ...rec, exampleWorkflow: undefined });

  assert.ok(output.includes(rec.promptingGuide), output);
});

test("an example workflow is offered in the format run_workflow accepts", () => {
  // The docs PNGs embed both graphs: "prompt" is the API format /prompt
  // accepts, "workflow" is the UI graph it rejects. recommend_workflow took
  // .workflow while its own field doc and rendered text both said the value
  // could go straight to run_workflow.
  const api = { "1": { class_type: "KSampler", inputs: {} } };
  const ui = { nodes: [{ id: 1, type: "KSampler" }], links: [] };

  assert.deepEqual(apiFormatOf({ prompt: api, workflow: ui }), api, "prefers API format");
  assert.deepEqual(apiFormatOf({ workflow: ui }), ui, "falls back when that is all there is");
  assert.equal(apiFormatOf({}), undefined);
});
