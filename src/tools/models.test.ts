import { test } from "node:test";
import assert from "node:assert/strict";

import { outputTypeName, listNodes, findNodesByType } from "./models.js";
import type { ComfyUIClient, ObjectInfo } from "../client/comfyui.js";

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

/** The paginated envelope these tools return, for readable assertions. */
interface NodePage {
  total: number;
  count: number;
  offset: number;
  categoryCount?: number;
  topCategories?: Record<string, number>;
  nodes: Array<Record<string, unknown> | string>;
  has_more: boolean;
  next_offset?: number;
}

const asPage = (r: Record<string, unknown>) => r as unknown as NodePage;
const row = (page: NodePage, i: number) =>
  page.nodes[i] as Record<string, unknown>;

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

  const page = asPage(
    await findNodesByType(client, { outputType: "IMAGE", limit: 25, offset: 0 })
  );

  assert.equal(page.total, 1, "the IMAGE node matches");
  assert.equal(row(page, 0).name, "Plain");
});

test("findNodesByType can select the COMBO-output nodes themselves", async () => {
  const client = clientReturning({
    Combo: node({
      name: "Combo",
      output: [["euler", "dpmpp_2m"]],
      output_name: ["sampler"],
    }),
  });

  const page = asPage(
    await findNodesByType(client, { outputType: "COMBO", limit: 25, offset: 0 })
  );

  assert.equal(page.total, 1);
  assert.deepEqual(row(page, 0).matchedOutputs, ["sampler"]);
});

test("findNodesByType asks for a type instead of dumping every node", async () => {
  const page = asPage(
    await findNodesByType(clientReturning({ A: node() }), { limit: 25, offset: 0 })
  );

  assert.equal(page.total, 0, "no criteria returns nothing, not everything");
  assert.match(String((page as unknown as { error: string }).error), /inputType or outputType/);
});

test("listNodes pages rather than returning every node type", async () => {
  const many: Record<string, unknown> = {};
  for (let i = 0; i < 60; i++) {
    many[`Node${String(i).padStart(2, "0")}`] = node({
      name: `Node${i}`,
      category: i % 2 === 0 ? "even" : "odd",
    });
  }

  const page = asPage(
    await listNodes(clientReturning(many), {
      limit: 25,
      offset: 0,
      detail: "summary",
    })
  );

  assert.equal(page.total, 60);
  assert.equal(page.nodes.length, 25, "a page, not the whole set");
  assert.equal(page.has_more, true);
  assert.equal(page.next_offset, 25);
});

test("listNodes detail levels control per-node cost", async () => {
  const client = clientReturning({
    Only: node({ name: "Only", description: "a long description" }),
  });
  const base = { limit: 25, offset: 0 } as const;

  const names = asPage(await listNodes(client, { ...base, detail: "names" }));
  assert.equal(typeof names.nodes[0], "string", "'names' returns bare strings");

  const summary = asPage(await listNodes(client, { ...base, detail: "summary" }));
  assert.equal(row(summary, 0).description, undefined, "'summary' omits descriptions");

  const full = asPage(await listNodes(client, { ...base, detail: "full" }));
  assert.equal(row(full, 0).description, "a long description");
});

test("listNodes caps the category map instead of listing hundreds", async () => {
  const many: Record<string, unknown> = {};
  for (let i = 0; i < 50; i++) {
    many[`Node${i}`] = node({ name: `Node${i}`, category: `category-${i}` });
  }

  const page = asPage(
    await listNodes(clientReturning(many), {
      limit: 5,
      offset: 0,
      detail: "summary",
    })
  );

  assert.equal(page.categoryCount, 50, "the true category count is reported");
  assert.ok(
    Object.keys(page.topCategories ?? {}).length <= 20,
    "only the largest categories are enumerated"
  );
});
