import { test } from "node:test";
import assert from "node:assert/strict";

import { validateWorkflow } from "./validation.js";
import { ResponseFormat } from "../utils/response.js";
import type { ComfyUIClient, ObjectInfo } from "../client/comfyui.js";

function node(overrides: Record<string, unknown>): ObjectInfo[string] {
  return {
    name: "N",
    display_name: "N",
    category: "testing",
    description: "",
    input: { required: {}, optional: {} },
    output: [],
    output_name: [],
    output_is_list: [],
    ...overrides,
  } as unknown as ObjectInfo[string];
}

function clientReturning(objectInfo: ObjectInfo): ComfyUIClient {
  return { getObjectInfo: async () => objectInfo } as unknown as ComfyUIClient;
}

const base = { response_format: ResponseFormat.JSON } as const;

function warnings(result: { warnings: Array<{ type: string }> }): string[] {
  return result.warnings.map((w) => w.type);
}

test("a custom video sink counts as an output node", async () => {
  // VHS_VideoCombine is the standard video output from ComfyUI-VideoHelperSuite
  // and contains neither "Save" nor "Preview", so the old name heuristic warned
  // that a working video workflow might produce nothing retrievable.
  const client = clientReturning({
    VHS_VideoCombine: node({ name: "VHS_VideoCombine", output_node: true }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: { "1": { class_type: "VHS_VideoCombine", inputs: {} } },
  });

  assert.equal(warnings(result).includes("no_output_node"), false);
});

test("a workflow that really has no sink is still warned about", async () => {
  const client = clientReturning({
    KSampler: node({ name: "KSampler", output_node: false, output: ["LATENT"] }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: { "1": { class_type: "KSampler", inputs: {} } },
  });

  assert.equal(warnings(result).includes("no_output_node"), true);
});

test("SaveImage is recognised through the flag as before", async () => {
  const client = clientReturning({
    SaveImage: node({ name: "SaveImage", output_node: true }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: { "1": { class_type: "SaveImage", inputs: {} } },
  });

  assert.equal(warnings(result).includes("no_output_node"), false);
});

test("a build that does not publish the flag falls back to the name", async () => {
  // output_node absent entirely - very old ComfyUI.
  const client = clientReturning({
    SaveImage: node({ name: "SaveImage" }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: { "1": { class_type: "SaveImage", inputs: {} } },
  });

  assert.equal(warnings(result).includes("no_output_node"), false);
});

test("a COMBO output does not take validate_workflow down", async () => {
  // The output slot arrives as its array of options; a bare toUpperCase on
  // it threw TypeError and failed the whole call, which is the crash
  // outputTypeName was written to stop.
  const client = clientReturning({
    ComboSource: node({
      name: "ComboSource",
      output: [["euler", "dpmpp_2m"]],
      output_name: ["sampler"],
    }),
    SaveImage: node({ name: "SaveImage", output: [], output_name: [] }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: {
      "1": { class_type: "ComboSource", inputs: {} },
      "2": { class_type: "SaveImage", inputs: {} },
    },
  });

  assert.equal(Array.isArray(result.errors), true);
  assert.equal(
    result.errors.some((e) => e.type === "unknown_node"),
    false
  );
});

test("a node that declares no output array is not a crash either", async () => {
  const client = clientReturning({
    Odd: node({ name: "Odd", output: undefined, output_name: undefined }),
  });

  const result = await validateWorkflow(client, {
    ...base,
    workflow: { "1": { class_type: "Odd", inputs: {} } },
  });

  assert.equal(Array.isArray(result.errors), true);
});
