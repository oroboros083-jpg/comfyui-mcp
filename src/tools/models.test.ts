import { test } from "node:test";
import assert from "node:assert/strict";

import { outputTypeName, listNodes, findNodesByType } from "./models.js";
import type { ComfyUIClient, ObjectInfo } from "../client/comfyui.js";

/**
 * Minimal stand-in for ComfyUIClient. Only getObjectInfo is exercised by the
 * node-listing tools, so the rest stays unimplemented rather than mocked.
 */
function clientReturning(objectInfo: ObjectInfo): ComfyUIClient {
  return { getObjectInfo: async () => objectInfo } as unknown as ComfyUIClient;
}

function node(overrides: Partial<ObjectInfo[string]> = {}): ObjectInfo[string] {
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
  } as ObjectInfo[string];
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
      output: [["euler", "dpmpp_2m"]] as unknown as string[],
      output_name: ["sampler"],
    }),
  } as unknown as ObjectInfo);

  const result = JSON.parse(
    await findNodesByType(client, { outputType: "IMAGE", limit: 25, offset: 0 })
  );

  assert.equal(result.total, 1, "the IMAGE node matches");
  assert.equal(result.nodes[0].name, "Plain");
});

test("findNodesByType can select the COMBO-output nodes themselves", async () => {
  const client = clientReturning({
    Combo: node({
      name: "Combo",
      output: [["euler", "dpmpp_2m"]] as unknown as string[],
      output_name: ["sampler"],
    }),
  } as unknown as ObjectInfo);

  const result = JSON.parse(
    await findNodesByType(client, { outputType: "COMBO", limit: 25, offset: 0 })
  );

  assert.equal(result.total, 1);
  assert.deepEqual(result.nodes[0].matchedOutputs, ["sampler"]);
});

test("listNodes pages rather than returning every node type", async () => {
  const many: Record<string, unknown> = {};
  for (let i = 0; i < 60; i++) {
    many[`Node${String(i).padStart(2, "0")}`] = node({
      name: `Node${i}`,
      category: i % 2 === 0 ? "even" : "odd",
    });
  }

  const result = JSON.parse(
    await listNodes(clientReturning(many as ObjectInfo), {
      limit: 25,
      offset: 0,
      detail: "summary",
    })
  );

  assert.equal(result.total, 60);
  assert.equal(result.nodes.length, 25, "a page, not the whole set");
  assert.equal(result.has_more, true);
  assert.equal(result.next_offset, 25);
});

test("listNodes detail levels control per-node cost", async () => {
  const client = clientReturning({
    Only: node({ name: "Only", description: "a long description" }),
  } as unknown as ObjectInfo);
  const base = { limit: 25, offset: 0 };

  const names = JSON.parse(await listNodes(client, { ...base, detail: "names" }));
  assert.equal(typeof names.nodes[0], "string", "'names' returns bare strings");

  const summary = JSON.parse(await listNodes(client, { ...base, detail: "summary" }));
  assert.equal(summary.nodes[0].description, undefined, "'summary' omits descriptions");

  const full = JSON.parse(await listNodes(client, { ...base, detail: "full" }));
  assert.equal(full.nodes[0].description, "a long description");
});

test("listNodes caps the category map instead of listing hundreds", async () => {
  const many: Record<string, unknown> = {};
  for (let i = 0; i < 50; i++) {
    many[`Node${i}`] = node({ name: `Node${i}`, category: `category-${i}` });
  }

  const result = JSON.parse(
    await listNodes(clientReturning(many as ObjectInfo), {
      limit: 5,
      offset: 0,
      detail: "summary",
    })
  );

  assert.equal(result.categoryCount, 50, "the true category count is reported");
  assert.ok(
    Object.keys(result.topCategories).length <= 20,
    "only the largest categories are enumerated"
  );
});
