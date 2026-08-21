import { test } from "node:test";
import assert from "node:assert/strict";

import { comboOptions } from "./comfyui.js";

/**
 * ComfyUI serves both combo-input formats from a single instance - core nodes
 * still use the legacy one while others have moved to the tagged one. Reading
 * only the legacy form reports an installed model as missing rather than
 * failing, which is why each shape is pinned here.
 */

test("comboOptions reads the legacy [options, meta] form", () => {
  const spec = [["a.safetensors", "b.safetensors"], { tooltip: "pick one" }];
  assert.deepEqual(comboOptions(spec), ["a.safetensors", "b.safetensors"]);
});

test("comboOptions reads the current COMBO form", () => {
  // Verbatim shape served by UpscaleModelLoader on a stock desktop install.
  const spec = [
    "COMBO",
    { multiselect: false, options: ["RealESRGAN_x4plus.safetensors", "remacri_original.safetensors"] },
  ];
  assert.deepEqual(comboOptions(spec), [
    "RealESRGAN_x4plus.safetensors",
    "remacri_original.safetensors",
  ]);
});

test("comboOptions reports an empty combo as empty, not as absent data", () => {
  assert.deepEqual(comboOptions([[], {}]), []);
  assert.deepEqual(comboOptions(["COMBO", { options: [] }]), []);
});

test("comboOptions ignores a non-combo input rather than throwing", () => {
  // Loader fields are not always combos - INT/STRING/BOOLEAN inputs reach here
  // too when a node's shape differs from what the table assumes.
  assert.deepEqual(comboOptions(["INT", { default: 20, min: 1 }]), []);
  assert.deepEqual(comboOptions(["STRING", { multiline: true }]), []);
  assert.deepEqual(comboOptions(undefined), []);
  assert.deepEqual(comboOptions(null), []);
  assert.deepEqual(comboOptions([]), []);
  assert.deepEqual(comboOptions("COMBO"), []);
});

test("comboOptions drops non-string options", () => {
  // Some custom nodes put objects in a combo; those are not model filenames.
  assert.deepEqual(comboOptions([["a.safetensors", 3, null, "b.ckpt"], {}]), [
    "a.safetensors",
    "b.ckpt",
  ]);
  assert.deepEqual(
    comboOptions(["COMBO", { options: ["a.safetensors", { name: "x" }] }]),
    ["a.safetensors"]
  );
});
