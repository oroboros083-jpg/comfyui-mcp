import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ARCHITECTURES,
  architectureById,
  architectureFor,
  detectArchitectures,
  primaryArchitecture,
  isUnetShape,
} from "./registry.js";
import { PROMPTING_GUIDES, getPromptingGuide } from "../resources/prompting-guide.js";
import { ObjectInfo } from "../client/comfyui.js";

/** An object_info carrying just the two loaders detection reads. */
function withModels(checkpoints: string[], unets: string[] = []): ObjectInfo {
  return {
    CheckpointLoaderSimple: {
      input: { required: { ckpt_name: [checkpoints, {}] } },
    },
    UNETLoader: {
      input: { required: { unet_name: ["COMBO", { options: unets }] } },
    },
  } as unknown as ObjectInfo;
}

test("every architecture id is unique", () => {
  const ids = ARCHITECTURES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every declared guide key exists in PROMPTING_GUIDES", () => {
  // The registry pointing at a guide that does not exist would silently
  // produce "no guide" at runtime.
  for (const spec of ARCHITECTURES) {
    if (!spec.guide) continue;
    assert.ok(
      PROMPTING_GUIDES[spec.guide],
      `${spec.id} declares guide '${spec.guide}', which does not exist`
    );
  }
});

test("every bundled prompting guide is now reachable", () => {
  // The finding this registry exists to fix: 11 guides shipped, but the two
  // hand-written advice ladders only ever named 4 of them, so 7 - including
  // cascade, which WAS detected - could not be reached without already
  // knowing the key.
  const reachable = new Set(
    ARCHITECTURES.map((a) => a.guide).filter((g): g is string => !!g)
  );

  for (const key of Object.keys(PROMPTING_GUIDES)) {
    assert.ok(reachable.has(key), `guide '${key}' is not reachable from any architecture`);
  }
});

test("detection recognises the legacy five exactly as before", () => {
  const cases: Array<[string, string]> = [
    ["v1-5-pruned.safetensors", "sd15"],
    ["sd_xl_base_1.0.safetensors", "sdxl"],
    ["sd3.5_large.safetensors", "sd3"],
    ["flux1-dev.safetensors", "flux"],
    ["stable_cascade_stage_c.safetensors", "cascade"],
  ];

  for (const [file, expected] of cases) {
    const detected = detectArchitectures(withModels([file])).map((a) => a.id);
    assert.ok(detected.includes(expected), `${file} should detect ${expected}, got ${detected}`);
  }
});

test("detection reads both ComfyUI combo formats", () => {
  // Checkpoints go in as the legacy [options, meta] form and UNETs as the
  // tagged COMBO form; both must be seen.
  const detected = detectArchitectures(
    withModels(["v1-5-pruned.safetensors"], ["qwen_image_fp8_e4m3fn.safetensors"])
  ).map((a) => a.id);

  assert.ok(detected.includes("sd15"), "legacy combo format read");
  assert.ok(detected.includes("qwen"), "COMBO format read");
});

test("architectures that only had a guide are now detectable", () => {
  // qwen, hunyuan, auraflow, kolors, pixart and playground all shipped a
  // prompting guide that nothing could ever detect.
  for (const [file, expected] of [
    ["qwen_image_fp8_e4m3fn.safetensors", "qwen"],
    ["hunyuan_dit_1.2.safetensors", "hunyuan"],
    ["auraflow_v0.3.safetensors", "auraflow"],
    ["kolors_diffusion.safetensors", "kolors"],
    ["pixart_sigma_xl.safetensors", "pixart"],
    ["playground-v2.5.safetensors", "playground"],
  ] as Array<[string, string]>) {
    const detected = detectArchitectures(withModels([file])).map((a) => a.id);
    assert.ok(detected.includes(expected), `${file} should detect ${expected}, got ${detected}`);
  }
});

test("a specific architecture outranks the generic base beside it", () => {
  // The install this was built against has Flux, Qwen, HiDream and an SDXL
  // checkpoint at once. Picking a primary must not just return whichever the
  // table lists first.
  const detected = detectArchitectures(
    withModels(["waiIllustriousSDXL_v170.safetensors"], [
      "qwen_image_fp8_e4m3fn.safetensors",
      "flux1-fill-dev.safetensors",
    ])
  );

  assert.equal(primaryArchitecture(detected)?.id, "qwen");
  // The WAI checkpoint matches both `illustrious` and SDXL's deliberately
  // loose bare `xl`, so both are reported - detectArchitectures returns every
  // match, and ranking is priority's job, not filtering's. `illustrious`
  // outranks `sdxl`, which is the point: this file is a booru-tag model that
  // merely happens to be SDXL-shaped.
  assert.deepEqual(
    detected.map((a) => a.id).sort(),
    ["flux", "illustrious", "qwen", "sdxl"]
  );

  const ranked = detected.map((a) => a.id);
  assert.ok(
    ranked.indexOf("illustrious") < ranked.indexOf("sdxl"),
    "the specific anime finetune must rank above the generic base it is built on"
  );
});

test("primaryArchitecture reports nothing rather than guessing SD 1.5", () => {
  // The old ladder's final `else` claimed SD 1.5 for an install with no
  // recognisable model at all.
  assert.equal(primaryArchitecture(detectArchitectures(withModels([]))), undefined);
});

test("architectureFor resolves a raw model filename", () => {
  assert.equal(architectureFor("qwen_image_edit_2509_fp8.safetensors")?.id, "qwen");
  assert.equal(architectureFor("hidream_i1_dev_fp8.safetensors")?.id, "hidream");
  assert.equal(architectureFor("flux1-dev.safetensors")?.id, "flux");
  assert.equal(architectureFor("nonesuch_model.safetensors"), undefined);
});

test("a specific match beats the loose legacy SDXL pattern", () => {
  // The SDXL pattern matches a bare "xl" anywhere, so resolution has to be
  // ordered by specificity or half the catalogue becomes SDXL.
  assert.equal(architectureFor("qwen_image_xl.safetensors")?.id, "qwen");
});

test("a low-priority alias does not outrank a high-priority pattern", () => {
  // SD 1.5 is the lowest-priority row and carries the alias "1.5", which is
  // a substring of every checkpoint with a v1.5 version string - and
  // community checkpoints routinely have one. Resolving all the aliases
  // before any of the detection patterns made priority meaningless across
  // the two, so these all came back as SD 1.5 and their users were handed
  // the SD 1.5 prompting guide.
  assert.equal(architectureFor("juggernautXL_v1.5.safetensors")?.id, "sdxl");
  assert.equal(architectureFor("flux1-dev-v1.5.safetensors")?.id, "flux");
  assert.equal(architectureFor("qwen_image_v1.5.safetensors")?.id, "qwen");

  // An actual SD 1.5 checkpoint still resolves, by id and by pattern.
  assert.equal(architectureFor("sd15")?.id, "sd15");
  assert.equal(architectureFor("v1-5-pruned-emaonly.safetensors")?.id, "sd15");
});

test("every architecture still resolves by its own id", () => {
  // Merging the two loops means a higher-priority detection pattern now runs
  // before a lower-priority id. Nothing in the table may shadow another
  // row's identity.
  for (const spec of ARCHITECTURES) {
    assert.equal(architectureFor(spec.id)?.id, spec.id, spec.id);
  }
});

test("every alias still resolves to the row that declares it", () => {
  for (const spec of ARCHITECTURES) {
    for (const alias of spec.aliases ?? []) {
      assert.equal(architectureFor(alias)?.id, spec.id, `${spec.id}: ${alias}`);
    }
  }
});

test("architectureById is case-insensitive and rejects unknowns", () => {
  assert.equal(architectureById("FLUX")?.id, "flux");
  assert.equal(architectureById("nope"), undefined);
});

test("a Qwen model is sent to the Qwen guide, not the Flux one", () => {
  // The headline symptom: recommend.ts labelled Qwen "flux", so its users
  // were pointed at Flux prompting rules that do not apply.
  const guide = getPromptingGuide("qwen_image_fp8_e4m3fn.safetensors");
  assert.ok(guide);
  assert.match(guide.modelType, /qwen/i);
});

test("getPromptingGuide still answers for the keys callers already used", () => {
  for (const key of Object.keys(PROMPTING_GUIDES)) {
    assert.ok(getPromptingGuide(key), `exact key '${key}' still resolves`);
  }
  assert.equal(getPromptingGuide("sd 3")?.modelType, PROMPTING_GUIDES["sd3"].modelType);
  assert.equal(getPromptingGuide("nonesuch"), null);
});

test("detected architectures lead with the most specific", () => {
  // The interface documents "most specific first", but a plain filter
  // preserved table order - roughly least-specific first - so
  // detectedArchitectures[0] was the generic base that priority exists to
  // demote, and getCapabilitySummary led with it too.
  const detected = detectArchitectures(
    withModels(["juggernautXL.safetensors"], ["qwen_image_fp8.safetensors", "flux1-dev.safetensors"])
  );
  const ids = detected.map((a) => a.id);

  assert.deepEqual(ids, ["qwen", "flux", "sdxl"], ids.join(", "));
  assert.equal(primaryArchitecture(detected)?.id, ids[0], "and it agrees with primaryArchitecture");
});

test("detected architectures are ordered, not merely filtered", () => {
  const detected = detectArchitectures(
    withModels(["sd_xl_base_1.0.safetensors", "v1-5-pruned.safetensors"])
  );
  const priorities = detected.map((a) => a.priority);

  assert.deepEqual(
    priorities,
    [...priorities].sort((a, b) => b - a),
    "descending priority"
  );
});

test("isUnetShape covers both bare-UNET shapes", () => {
  // The predicate exists because several call sites tested `=== "flux"` when
  // what they meant was "loads a bare UNET rather than a checkpoint".
  assert.equal(isUnetShape("flux"), true);
  assert.equal(isUnetShape("unet_clip"), true);
  assert.equal(isUnetShape("standard"), false);
});

test("single-encoder architectures declare the unet_clip shape", () => {
  // Both load UNETLoader + ONE CLIPLoader. Marked "flux" they were built a
  // DualCLIPLoader graph naming a second encoder they do not use.
  for (const id of ["anima", "qwen"]) {
    const spec = architectureById(id);
    assert.equal(spec?.workflow, "unet_clip", id);
    assert.ok(spec?.clipTypeHints?.length, `${id} should hint a CLIPLoader type`);
  }
});

test("Flux itself keeps the dual-encoder shape", () => {
  assert.equal(architectureById("flux")?.workflow, "flux");
});

test("every unet_clip architecture carries clipTypeHints", () => {
  // Without a hint the builder falls back to whatever the combo lists first,
  // which is usually "flux" and wrong for these models.
  for (const spec of ARCHITECTURES) {
    if (spec.workflow !== "unet_clip") continue;
    assert.ok(
      spec.clipTypeHints?.length,
      `${spec.id} uses unet_clip but names no preferred CLIPLoader type`
    );
  }
});
