import { test } from "node:test";
import assert from "node:assert/strict";

import {
  detectCapabilities,
  getCapabilitySummary,
  primaryArchitectureOf,
  promptingAdviceFor,
} from "./index.js";
import type { ObjectInfo } from "../client/comfyui.js";
import { ARCHITECTURES } from "../architectures/registry.js";
import { PROMPTING_GUIDES } from "../resources/prompting-guide.js";

/** An object_info that publishes exactly the given node names. */
function withNodes(...names: string[]): ObjectInfo {
  const info: Record<string, unknown> = {};
  for (const name of names) {
    info[name] = { input: { required: {} }, output: [], output_name: [] };
  }
  return info as unknown as ObjectInfo;
}

/** An object_info whose checkpoint loader lists the given files. */
function withCheckpoints(...names: string[]): ObjectInfo {
  return {
    CheckpointLoaderSimple: {
      input: { required: { ckpt_name: ["COMBO", { options: names }] } },
    },
  } as unknown as ObjectInfo;
}

test("an installed audio model means audio generation", () => {
  // hasAudioGen was initialised false and assigned nowhere, so
  // canGenerateAudio was false even with an ACE-Step checkpoint installed.
  const caps = detectCapabilities(withCheckpoints("ace_step_v1_3.5b.safetensors"));

  assert.equal(caps.canGenerateAudio, true);
  assert.equal(caps.hasAudioGen, true);
});

test("a Stable Audio checkpoint counts too", () => {
  const caps = detectCapabilities(withCheckpoints("stable_audio_open_1.0.safetensors"));

  assert.equal(caps.canGenerateAudio, true);
});

test("the core audio nodes alone do not mean audio generation", () => {
  // EmptyLatentAudio, VAEDecodeAudio and SaveAudio ship unconditionally in
  // comfy_extras, so keying on them would report "Audio generation" on a
  // stock SD 1.5-only install. Whether an audio model is installed is the
  // signal.
  const objectInfo = {
    ...withNodes("EmptyLatentAudio", "VAEDecodeAudio", "SaveAudio"),
    ...withCheckpoints("v1-5-pruned-emaonly.safetensors"),
  } as ObjectInfo;

  const caps = detectCapabilities(objectInfo);

  assert.equal(caps.canGenerateAudio, false);
  assert.equal(caps.hasSD15, true, "the install is detected, just not as audio");
});

test("the custom StableAudioSampler pack still counts", () => {
  const caps = detectCapabilities(withNodes("StableAudioSampler"));

  assert.equal(caps.canGenerateAudio, true);
  assert.equal(caps.hasStableAudio, true);
});

test("an install with no audio at all reports none", () => {
  const caps = detectCapabilities(withCheckpoints("v1-5-pruned-emaonly.safetensors"));

  assert.equal(caps.canGenerateAudio, false);
  assert.equal(caps.hasAudioGen, false);
  assert.equal(caps.hasStableAudio, false);
});

test("the capability summary names audio when a model is installed", () => {
  const caps = detectCapabilities(withCheckpoints("ace_step_v1_3.5b.safetensors"));

  assert.ok(getCapabilitySummary(caps).includes("Audio generation"));
});

test("nothing detected is reported as nothing, not as SD 1.5", () => {
  // get_status substituted "sd15" when primaryArchitectureOf returned
  // undefined, publishing a guess as a positive detection on any install
  // whose checkpoints are custom-named. That is the old ladder's final
  // `else` reappearing.
  const caps = detectCapabilities(withNodes("KSampler", "SaveImage"));

  assert.equal(primaryArchitectureOf(caps), undefined);
  assert.match(promptingAdviceFor(caps), /No model architecture detected/);
  assert.equal(/sd 1\.5|sd15/i.test(promptingAdviceFor(caps)), false);
});

test("a detected architecture is named by its guide key, not its id", () => {
  // This used to assert the opposite for wan: that it had NO guide, so the
  // advice must not name one. Every architecture now ships a guide, so the
  // case it guarded against cannot arise from wan any more - but the
  // invariant it existed to protect still can, the moment someone adds a row
  // with a typo'd or missing `guide`. It is asserted over the whole table
  // below rather than through one row that happens to demonstrate it.
  const objectInfo = {
    CheckpointLoaderSimple: {
      input: { required: { ckpt_name: ["COMBO", { options: ["wan2.1_t2v.safetensors"] }] } },
    },
  } as unknown as ObjectInfo;

  const caps = detectCapabilities(objectInfo);
  const primary = primaryArchitectureOf(caps);

  assert.equal(primary?.id, "wan");
  assert.equal(primary?.guide, "wan");
  assert.match(promptingAdviceFor(caps), /get_prompting_guide\('wan'\)/);
});

test("prompting advice never names a guide that does not exist", () => {
  // The failure this prevents is silent and lands at the worst moment: the
  // agent is told to call get_prompting_guide('x'), does, and gets an error.
  for (const spec of ARCHITECTURES) {
    if (!spec.guide) continue;
    assert.ok(
      PROMPTING_GUIDES[spec.guide],
      `${spec.id} would send the agent to get_prompting_guide('${spec.guide}'), which does not exist`
    );
  }
});
