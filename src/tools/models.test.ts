import { test } from "node:test";
import assert from "node:assert/strict";

import {
  outputTypeName,
  listNodes,
  findNodesByType,
  type ListNodesResult,
  type NodeRow,
  renderNodes,
  renderFoundNodes,
  NoTypeFilterError,
  parseInputSpec,
  buildNode,
  listModels,
  listModelsSchema,
} from "./models.js";
import type { ComfyUIClient, ObjectInfo } from "../client/comfyui.js";
import { ToolError } from "../utils/errors.js";
import { ResponseFormat } from "../utils/response.js";

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

/** Defaults every call shares, so each test states only what it varies. */
const base = {
  limit: 25,
  offset: 0,
  response_format: ResponseFormat.JSON,
} as const;

/** listNodes projects to bare strings at detail:'names'; narrow for assertions. */
function row(page: ListNodesResult, i: number): NodeRow {
  const entry = page.nodes[i];
  assert.notEqual(typeof entry, "string", "expected a projected node object");
  return entry as NodeRow;
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

test("findNodesByType survives nodes with COMBO array outputs", async () => {
  const client = clientReturning({
    Plain: node({ name: "Plain", output: ["IMAGE"], output_name: ["IMAGE"] }),
    Combo: node({
      name: "Combo",
      // The shape that crashed the tool on a modded install.
      output: [["euler", "dpmpp_2m"]],
      output_name: ["sampler"],
    }),
  });

  const page = await findNodesByType(client, { ...base, outputType: "IMAGE" });

  assert.equal(page.total, 1, "the IMAGE node matches");
  assert.equal(page.nodes[0].name, "Plain");
});

test("findNodesByType can select the COMBO-output nodes themselves", async () => {
  const client = clientReturning({
    Combo: node({
      name: "Combo",
      output: [["euler", "dpmpp_2m"]],
      output_name: ["sampler"],
    }),
  });

  const page = await findNodesByType(client, { ...base, outputType: "COMBO" });

  assert.equal(page.total, 1);
  assert.deepEqual(page.nodes[0].matchedOutputs, ["sampler"]);
});

test("findNodesByType asks for a type instead of dumping every node", async () => {
  // Reported as a tool error, not as a success carrying an `error` field: the
  // caller has to be able to tell the two apart.
  await assert.rejects(
    () => findNodesByType(clientReturning({ A: node() }), base),
    (err: unknown) => err instanceof NoTypeFilterError
  );
});

test("listNodes pages rather than returning every node type", async () => {
  const many: Record<string, unknown> = {};
  for (let i = 0; i < 60; i++) {
    many[`Node${String(i).padStart(2, "0")}`] = node({
      name: `Node${i}`,
      category: i % 2 === 0 ? "even" : "odd",
    });
  }

  const page = await listNodes(clientReturning(many), { ...base, detail: "summary" });

  assert.equal(page.total, 60);
  assert.equal(page.nodes.length, 25, "a page, not the whole set");
  assert.equal(page.has_more, true);
  assert.equal(page.next_offset, 25);
});

test("listNodes detail levels control per-node cost", async () => {
  const client = clientReturning({
    Only: node({ name: "Only", description: "a long description" }),
  });
  const names = await listNodes(client, { ...base, detail: "names" });
  assert.equal(typeof names.nodes[0], "string", "'names' returns bare strings");

  const summary = await listNodes(client, { ...base, detail: "summary" });
  assert.equal(row(summary, 0).description, undefined, "'summary' omits descriptions");

  const full = await listNodes(client, { ...base, detail: "full" });
  assert.equal(row(full, 0).description, "a long description");
});

test("listNodes caps the category map instead of listing hundreds", async () => {
  const many: Record<string, unknown> = {};
  for (let i = 0; i < 50; i++) {
    many[`Node${i}`] = node({ name: `Node${i}`, category: `category-${i}` });
  }

  const page = await listNodes(clientReturning(many), {
    ...base,
    limit: 5,
    detail: "summary",
  });

  assert.equal(page.categoryCount, 50, "the true category count is reported");
  assert.ok(
    Object.keys(page.topCategories ?? {}).length <= 20,
    "only the largest categories are enumerated"
  );
});

test("renderNodes says where the rest of the results are", async () => {
  const many: Record<string, unknown> = {};
  for (let i = 0; i < 60; i++) many[`Node${i}`] = node({ name: `Node${i}` });

  const input = { ...base, limit: 10, detail: "summary" } as const;
  const markdown = renderNodes(await listNodes(clientReturning(many), input), input);

  assert.match(markdown, /offset: 10/, "the next page is reachable from the text");
  assert.match(markdown, /comfyui_get_node_info/, "points at the detail tool");
});

test("renderNodes explains an empty result instead of printing a bare heading", async () => {
  const input = { ...base, search: "nonesuch", detail: "summary" } as const;
  const markdown = renderNodes(
    await listNodes(clientReturning({ A: node() }), input),
    input
  );

  assert.match(markdown, /No nodes matching/);
  assert.doesNotMatch(markdown, /^#/, "no empty listing scaffold");
});

test("renderFoundNodes names the types that were searched for", async () => {
  const page = await findNodesByType(clientReturning({ A: node({ name: "A" }) }), {
    ...base,
    outputType: "IMAGE",
  });

  assert.match(renderFoundNodes(page), /produce \*\*IMAGE\*\*/);
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

  const built = JSON.parse(
    await buildNode(client, { nodeType: "CheckpointLoaderSimple", nodeId: "1" })
  );

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

  const built = JSON.parse(
    await buildNode(client, {
      nodeType: "Sampler",
      nodeId: "5",
      inputs: { denoise: 0.5 },
    })
  );

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

  const built = JSON.parse(await buildNode(client, { nodeType: "Combo", nodeId: "1" }));
  const outputs = built.outputs as Array<{ type: string; name: string }>;

  assert.equal(outputs[0].type, "COMBO");
  assert.equal(outputs[0].name, "COMBO", "falls back to the type name, not the array");
  assert.equal(outputs[1].type, "IMAGE");
  assert.equal(outputs[1].name, "image");
});

test("buildNode survives a node that declares no outputs at all", async () => {
  // getNodeInfo and findNodesByType both guard this; buildNode threw.
  const client = clientReturning({
    Sink: node({ name: "Sink", input: { required: {}, optional: {} }, output: undefined }),
  });

  const built = JSON.parse(await buildNode(client, { nodeType: "Sink", nodeId: "1" }));

  assert.deepEqual(built.outputs, []);
});

test("every model type getModels populates can be filtered for", async () => {
  // hypernetworks was added to MODEL_SOURCES and to ModelInfo but not to the
  // enum, so it appeared under type:"all" and Zod rejected the call that
  // would page into it. The agent could see the models and not enumerate
  // them.
  const client = {
    getModels: async () => ({
      checkpoints: ["a.safetensors"],
      loras: ["b.safetensors"],
      vae: ["c.safetensors"],
      controlnet: ["d.safetensors"],
      upscale_models: ["e.safetensors"],
      embeddings: ["f.pt"],
      hypernetworks: ["g.pt"],
      clip: ["h.safetensors"],
      unet: ["i.safetensors"],
    }),
  } as unknown as ComfyUIClient;

  const everything = await listModels(client, listModelsSchema.parse({}));
  const populated = Object.keys(everything.models);
  assert.ok(populated.includes("hypernetworks"), "the group is visible under 'all'");

  for (const type of populated) {
    const parsed = listModelsSchema.safeParse({ type });
    assert.ok(parsed.success, `type:"${type}" is visible but not accepted by the schema`);

    const page = await listModels(client, parsed.data!);
    assert.deepEqual(Object.keys(page.models), [type], type);
  }
});
