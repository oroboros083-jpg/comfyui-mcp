import { test } from "node:test";
import assert from "node:assert/strict";

import {
  detectCapabilities,
  getCapabilitySummary,
  primaryArchitectureOf,
  promptingAdviceFor,
} from "./index.js";
import type { ObjectInfo } from "../client/comfyui.js";

/** An object_info that publishes exactly the given node names. */
function withNodes(...names: string[]): ObjectInfo {
  const info: Record<string, unknown> = {};
  for (const name of names) {
    info[name] = { input: { required: {} }, output: [], output_name: [] };
  }
  return info as unknown as ObjectInfo;
}

test("a stock ComfyUI with Stable Audio reports audio generation", () => {
  // StableAudioSampler is a custom pack and was the only audio node mapped,
  // while hasAudioGen - the other half of canGenerateAudio - was never
  // assigned anywhere. So an install with full core audio support answered
  // canGenerateAudio: false.
  const caps = detectCapabilities(
    withNodes("EmptyLatentAudio", "VAEDecodeAudio", "SaveAudio")
  );

  assert.equal(caps.canGenerateAudio, true);
  assert.equal(caps.hasStableAudio, true);
});

test("a stock ComfyUI with ACE-Step reports audio generation", () => {
  const caps = detectCapabilities(
    withNodes("EmptyAceStepLatentAudio", "TextEncodeAceStepAudio", "VAEDecodeAudio", "SaveAudioMP3")
  );

  assert.equal(caps.canGenerateAudio, true);
  assert.equal(caps.hasAudioGen, true);
});

test("the custom StableAudioSampler pack still counts", () => {
  const caps = detectCapabilities(withNodes("StableAudioSampler"));

  assert.equal(caps.canGenerateAudio, true);
  assert.equal(caps.hasStableAudio, true);
});

test("an install with no audio nodes still reports none", () => {
  const caps = detectCapabilities(withNodes("KSampler", "SaveImage", "CLIPTextEncode"));

  assert.equal(caps.canGenerateAudio, false);
  assert.equal(caps.hasAudioGen, false);
  assert.equal(caps.hasStableAudio, false);
});

test("the capability summary names audio when it is available", () => {
  // getCapabilitySummary reads canGenerateAudio, so the dead flag made it
  // omit "Audio generation" on every install.
  const caps = detectCapabilities(
    withNodes("EmptyAceStepLatentAudio", "VAEDecodeAudio", "SaveAudio")
  );

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
  // Most registry rows have no guide of their own, so naming the id sent the
  // agent to a get_prompting_guide call that errors.
  const objectInfo = {
    CheckpointLoaderSimple: {
      input: { required: { ckpt_name: ["COMBO", { options: ["wan2.1_t2v.safetensors"] }] } },
    },
  } as unknown as ObjectInfo;

  const caps = detectCapabilities(objectInfo);
  const primary = primaryArchitectureOf(caps);

  assert.equal(primary?.id, "wan");
  assert.equal(primary?.guide, undefined, "wan has no guide of its own");
  assert.equal(
    /get_prompting_guide\('wan'\)/.test(promptingAdviceFor(caps)),
    false,
    "so nothing may tell the agent to call one"
  );
});
