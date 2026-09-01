import { test } from "node:test";
import assert from "node:assert/strict";

import {
  outputTypeName,
  parseInputSpec,
  buildNode,
} from "./models.js";
import type { ComfyUIClient, ObjectInfo } from "../client/comfyui.js";
import { ToolError } from "../utils/errors.js";

/**
 * Minimal stand-in for ComfyUIClient. Only getObjectInfo is exercised by the
 * node-listing tools, so the rest stays unimplemented rather than mocked.
 */
function clientReturning(objectInfo: unknown): ComfyUIClient {
  return { getObjectInfo: async () => objectInfo } as unknown as ComfyUIClient;
}

function node(overrides: Record<string, unknown> = {}): ObjectInfo[string] {
  return {
    name: "Test",
    display_name: "Test",
    category: "testing",
    description: "",
    input: { required: {}, optional: {} },
    output: ["IMAGE"],
    output_name: ["IMAGE"],
    output_is_list: [false],
    ...overrides,
  } as unknown as ObjectInfo[string];
}

test("outputTypeName normalises a plain type name", () => {
  assert.equal(outputTypeName("image"), "IMAGE");
  assert.equal(outputTypeName("MODEL"), "MODEL");
});

test("outputTypeName maps an options array to COMBO", () => {
  // ComfyUI declares a COMBO output as the array of its options rather than
  // a type name. This used to reach .toUpperCase() and throw.
  assert.equal(outputTypeName(["euler", "dpmpp_2m", "ddim"]), "COMBO");
  assert.equal(outputTypeName([]), "COMBO");
});

test("parseInputSpec reads options from both combo forms", () => {
  // comboOptions in the client is the one place that knows both spellings.
  // Reading only the legacy form here reported every dropdown as an empty
  // COMBO, which sent buildNode into its connection branch.
  assert.deepEqual(parseInputSpec([["euler", "ddim"], {}]), {
    type: "COMBO",
    options: ["euler", "ddim"],
    default: undefined,
  });

  assert.deepEqual(
    parseInputSpec(["COMBO", { options: ["a.safetensors"], default: "a.safetensors" }]),
    { type: "COMBO", options: ["a.safetensors"], default: "a.safetensors" }
  );
});

test("parseInputSpec still reads primitive specs", () => {
  const parsed = parseInputSpec(["INT", { default: 20, min: 1, max: 100 }]);
  assert.equal(parsed.type, "INT");
  assert.equal(parsed.default, 20);
  assert.equal(parsed.min, 1);
  assert.equal(parsed.max, 100);
  assert.equal(parsed.options, undefined);
});

test("buildNode fills a current-form combo instead of faking a connection", async () => {
  const client = clientReturning({
    CheckpointLoaderSimple: node({
      name: "CheckpointLoaderSimple",
      input: {
        required: { ckpt_name: ["COMBO", { options: ["sdxl.safetensors"] }] },
        optional: {},
      },
      output: ["MODEL", "CLIP", "VAE"],
      output_name: ["MODEL", "CLIP", "VAE"],
    }),
  });

  const built = await buildNode(client, { nodeType: "CheckpointLoaderSimple", nodeId: "1" });

  assert.equal(built.node["1"].inputs.ckpt_name, "sdxl.safetensors");
  assert.equal(
    built.missingConnections,
    undefined,
    "a model dropdown is not something to wire from another node"
  );
});

test("buildNode rejects an input the node does not have", async () => {
  // `inputs` is a free-form record, so the schema cannot be .strict() about
  // its keys. A misspelling used to be dropped in silence and the node came
  // back carrying the default.
  const client = clientReturning({
    KSampler: node({
      name: "KSampler",
      input: {
        required: { denoise: ["FLOAT", { default: 1.0 }] },
        optional: {},
      },
    }),
  });

  await assert.rejects(
    () =>
      buildNode(client, {
        nodeType: "KSampler",
        nodeId: "5",
        inputs: { denoise_strength: 0.5 },
      }),
    (err: unknown) =>
      err instanceof ToolError &&
      /denoise_strength/.test(err.message) &&
      /denoise/.test(err.hint ?? "")
  );
});

test("buildNode still accepts optional inputs the node declares", async () => {
  const client = clientReturning({
    Sampler: node({
      name: "Sampler",
      input: {
        required: { steps: ["INT", { default: 20 }] },
        optional: { denoise: ["FLOAT", { default: 1.0 }] },
      },
    }),
  });

  const built = await buildNode(client, {
    nodeType: "Sampler",
    nodeId: "5",
    inputs: { denoise: 0.5 },
  });

  assert.equal(built.node["5"].inputs.denoise, 0.5);
  assert.equal(built.node["5"].inputs.steps, 20, "unspecified inputs keep their default");
});

test("buildNode normalises a COMBO output instead of inlining its options", async () => {
  // A COMBO slot arrives as its full array of options. Emitted raw it landed
  // in `type` and again in `name`, putting hundreds of option strings in the
  // response twice - the bloat getNodeInfo deliberately avoids.
  const options = Array.from({ length: 400 }, (_, i) => `option_${i}`);
  const client = clientReturning({
    Combo: node({
      name: "Combo",
      input: { required: {}, optional: {} },
      output: [options, "IMAGE"],
      output_name: ["", "image"],
    }),
  });

  const built = await buildNode(client, { nodeType: "Combo", nodeId: "1" });
  const outputs = built.outputs;

  assert.equal(outputs[0].type, "COMBO");
  assert.equal(outputs[0].name, "COMBO", "falls back to the type name, not the array");
  assert.equal(outputs[1].type, "IMAGE");
  assert.equal(outputs[1].name, "image");
});

test("buildNode survives a node that declares no outputs at all", async () => {
  // getNodeInfo guards this; buildNode threw.
  const client = clientReturning({
    Sink: node({ name: "Sink", input: { required: {}, optional: {} }, output: undefined }),
  });

  const built = await buildNode(client, { nodeType: "Sink", nodeId: "1" });

  assert.deepEqual(built.outputs, []);
});
