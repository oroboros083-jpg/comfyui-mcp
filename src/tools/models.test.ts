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
} from "./models.js";
import type { ComfyUIClient, ObjectInfo } from "../client/comfyui.js";
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
