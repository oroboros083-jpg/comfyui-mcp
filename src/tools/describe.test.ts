import { test } from "node:test";
import assert from "node:assert/strict";

import { ObjectInfo } from "../client/comfyui.js";
import {
  DESCRIBE_BACKENDS,
  availableBackends,
  backendById,
  preferredBackendIds,
  resolveBackend,
  splitTags,
} from "./describe/backends.js";
import {
  chooseBackends,
  describeImage,
  renderDescription,
  NoDescribeBackendError,
} from "./describe.js";

/** An object_info carrying just the node types named. */
function instanceWith(...nodeTypes: string[]): ObjectInfo {
  const info: Record<string, unknown> = {};
  for (const nodeType of nodeTypes) {
    info[nodeType] = { input: { required: {} }, output: [] };
  }
  return info as ObjectInfo;
}

const WD14_ONLY = instanceWith("LoadImage", "WD14Tagger|pysssss");
const FLORENCE_ONLY = instanceWith(
  "LoadImage",
  "Florence2Run",
  "DownloadAndLoadFlorence2Model",
  "PreviewAny"
);
const EVERYTHING = instanceWith(
  "LoadImage",
  "WD14Tagger|pysssss",
  "Florence2Run",
  "DownloadAndLoadFlorence2Model",
  "JJC_JoyCaption",
  "JJC_DownloadAndLoadJoyCaptionModel",
  "PreviewAny"
);

// --- candidate resolution -------------------------------------------------

test("a backend resolves to whichever of its node types is installed", () => {
  const joycaption = backendById("joycaption")!;

  const authors = resolveBackend(joycaption, instanceWith("JJC_JoyCaption", "PreviewAny"));
  assert.equal(authors?.nodeType, "JJC_JoyCaption");
});

test("a fork further down the candidate list still runs", () => {
  // The reason nodeTypes is a list at all: JoyCaption has several competing
  // ComfyUI wrappers, and pinning one name picks a winner the user may not
  // have installed.
  const joycaption = backendById("joycaption")!;
  assert.ok(joycaption.nodeTypes.length > 1, "the multi-fork case is what the list is for");

  const secondChoice = joycaption.nodeTypes[2]!;
  const resolved = resolveBackend(joycaption, instanceWith(secondChoice, "PreviewAny"));

  assert.equal(resolved?.nodeType, secondChoice);
});

test("a backend with none of its node types installed does not resolve", () => {
  assert.equal(resolveBackend(backendById("wd14")!, FLORENCE_ONLY), undefined);
});

test("a captioner without a text preview node does not resolve", () => {
  // Florence2Run is not an OUTPUT_NODE, so without a preview node the graph
  // submits happily and returns nothing at all - a failure worth catching
  // before it runs rather than after.
  const withoutPreview = instanceWith(
    "LoadImage",
    "Florence2Run",
    "DownloadAndLoadFlorence2Model"
  );
  assert.equal(resolveBackend(backendById("florence2")!, withoutPreview), undefined);

  assert.ok(resolveBackend(backendById("florence2")!, FLORENCE_ONLY));
});

test("the tagger needs no preview node, because it is its own output node", () => {
  assert.equal(backendById("wd14")!.terminalNode, undefined);
  assert.ok(resolveBackend(backendById("wd14")!, WD14_ONLY));
});

test("availableBackends reports only what this instance can run", () => {
  assert.deepEqual(availableBackends(WD14_ONLY).map((r) => r.backend.id), ["wd14"]);
  assert.deepEqual(availableBackends(FLORENCE_ONLY).map((r) => r.backend.id), ["florence2"]);
  assert.equal(availableBackends(EVERYTHING).length, DESCRIBE_BACKENDS.length);
  assert.deepEqual(availableBackends(instanceWith("LoadImage")), []);
});

// --- choosing -------------------------------------------------------------

test("a booru-tag model gets the tagger", () => {
  // Describing an image in the same vocabulary the model learned is the whole
  // point; a prose caption would have to be translated before it is usable.
  const chosen = chooseBackends(EVERYTHING, { promptingStyle: "booru_tags" });
  assert.deepEqual(chosen.map((r) => r.backend.id), ["wd14"]);
});

test("a natural-language model gets a captioner, JoyCaption first", () => {
  const chosen = chooseBackends(EVERYTHING, { promptingStyle: "natural_language" });
  assert.deepEqual(chosen.map((r) => r.backend.id), ["joycaption"]);
});

test("preference falls through to what is actually installed", () => {
  // A smaller answer beats no answer: a booru model on an instance with only
  // a captioner still gets a description.
  const chosen = chooseBackends(FLORENCE_ONLY, { promptingStyle: "booru_tags" });
  assert.deepEqual(chosen.map((r) => r.backend.id), ["florence2"]);
});

test("explicit backends run in the order given, and pair tags with prose", () => {
  const chosen = chooseBackends(EVERYTHING, { backends: ["wd14", "florence2"] });
  assert.deepEqual(chosen.map((r) => r.backend.id), ["wd14", "florence2"]);
  assert.deepEqual(chosen.map((r) => r.backend.kind), ["tags", "prose"]);
});

test("an unknown backend id is an error naming the known ones", () => {
  assert.throws(
    () => chooseBackends(EVERYTHING, { backends: ["clip_interrogator"] }),
    (error: Error) => /Unknown describe backend/.test(error.message)
  );
});

test("nothing installed names the repos rather than returning empty", () => {
  // A success with an empty array reads as "this image has nothing in it",
  // which is the wrong lesson entirely.
  assert.throws(
    () => chooseBackends(instanceWith("LoadImage"), {}),
    (error: Error) => {
      assert.ok(error instanceof NoDescribeBackendError);
      assert.match((error as NoDescribeBackendError).hint!, /github\.com/);
      assert.match((error as NoDescribeBackendError).hint!, /PreviewAny/);
      return true;
    }
  );
});

test("requesting only uninstalled backends says which were requested", () => {
  assert.throws(
    () => chooseBackends(WD14_ONLY, { backends: ["florence2"] }),
    (error: Error) => /florence2/.test(error.message)
  );
});

test("every backend id is unique and every row is resolvable in principle", () => {
  const ids = DESCRIBE_BACKENDS.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const backend of DESCRIBE_BACKENDS) {
    assert.ok(backend.nodeTypes.length, `${backend.id} names no node types`);
    assert.ok(backend.install.startsWith("https://"), `${backend.id} has no install link`);
    assert.ok(backend.goodFor.length > 20, `${backend.id} does not say when to use it`);
  }
});

test("preference order always lists every backend", () => {
  // Otherwise a fall-through can silently exclude the only installed one.
  for (const style of ["booru_tags", "natural_language", undefined]) {
    assert.deepEqual(
      [...preferredBackendIds(style)].sort(),
      DESCRIBE_BACKENDS.map((b) => b.id).sort()
    );
  }
});

// --- graphs and parsing ---------------------------------------------------

test("each backend builds a graph that loads the image it was given", () => {
  for (const resolved of availableBackends(EVERYTHING)) {
    const built = resolved.backend.build({
      imageRef: "refs/photo.png",
      nodeType: resolved.nodeType,
      terminalType: resolved.terminalType,
    });

    const load = built.workflow["1"] as { class_type: string; inputs: { image: string } };
    assert.equal(load.class_type, "LoadImage");
    assert.equal(load.inputs.image, "refs/photo.png");

    assert.ok(built.textNodes.length, `${resolved.backend.id} names no text nodes`);
    for (const id of built.textNodes) {
      assert.ok(id in built.workflow, `${resolved.backend.id} collects from a node it did not build`);
    }
  }
});

test("the captioners walk their caption to the preview node, not their query", () => {
  // JoyCaption returns ("query","caption") and Florence2Run returns
  // ("image","mask","caption","data"). Taking index 0 from either would hand
  // back the prompt that was sent instead of the answer.
  const joycaption = backendById("joycaption")!;
  const jc = joycaption.build({
    imageRef: "a.png",
    nodeType: "JJC_JoyCaption",
    terminalType: "PreviewAny",
  });
  assert.deepEqual((jc.workflow["4"] as { inputs: { source: unknown } }).inputs.source, ["3", 1]);

  const florence = backendById("florence2")!;
  const fl = florence.build({
    imageRef: "a.png",
    nodeType: "Florence2Run",
    terminalType: "PreviewAny",
  });
  assert.deepEqual((fl.workflow["4"] as { inputs: { source: unknown } }).inputs.source, ["3", 2]);
});

test("WD14 output is split into tags and unescaped", () => {
  // The tagger emits one comma-joined string, with booru parenthesis escapes
  // that belong in a prompt box rather than in a reader.
  const parsed = backendById("wd14")!.parse([
    {
      nodeId: "2",
      key: "tags",
      text: "1girl, solo, ganyu_\\(genshin_impact\\), looking_back",
    },
  ]);

  assert.deepEqual(parsed, ["1girl", "solo", "ganyu_(genshin_impact)", "looking_back"]);
});

test("splitTags drops empties from a trailing comma", () => {
  assert.deepEqual(splitTags("1girl, solo, "), ["1girl", "solo"]);
});

test("a captioner's output is kept whole rather than split on commas", () => {
  const parsed = backendById("florence2")!.parse([
    { nodeId: "4", key: "text", text: "  A woman, in a red coat, glances back.  " },
  ]);
  assert.deepEqual(parsed, ["A woman, in a red coat, glances back."]);
});

// --- orchestration --------------------------------------------------------

/** A runner returning canned outputs keyed by the text node each graph names. */
function runnerReturning(byNode: Record<string, unknown>) {
  return async () => byNode;
}

test("multi-backend results stay labelled by backend id", async () => {
  const chosen = chooseBackends(EVERYTHING, { backends: ["wd14", "florence2"] });
  const result = await describeImage(
    "refs/photo.png",
    chosen,
    runnerReturning({
      "2": { tags: ["1girl, solo, looking_back"] },
      "4": { text: ["A woman glances back."] },
      // Noise from the same graph, which must not appear in either answer.
      "8": { text: ["[INFO] model loaded in 4.2s"] },
    })
  );

  assert.deepEqual(result.descriptions.map((d) => d.backend), ["wd14", "florence2"]);
  assert.deepEqual(result.descriptions[0]!.values, ["1girl", "solo", "looking_back"]);
  assert.deepEqual(result.descriptions[1]!.values, ["A woman glances back."]);

  const rendered = renderDescription(result);
  assert.ok(!rendered.includes("[INFO]"), "graph logging must not reach the response");
});

test("the resolved node type is reported, so the caller knows which fork ran", () => {
  const chosen = chooseBackends(EVERYTHING, { backends: ["joycaption"] });
  assert.equal(chosen[0]!.nodeType, "JJC_JoyCaption");
});

test("one backend failing does not lose the other's answer", async () => {
  const chosen = chooseBackends(EVERYTHING, { backends: ["wd14", "florence2"] });

  let call = 0;
  const result = await describeImage("refs/photo.png", chosen, async () => {
    if (call++ === 0) throw new Error("WD14 model file missing");
    return { "4": { text: ["A woman glances back."] } };
  });

  assert.match(result.descriptions[0]!.error!, /model file missing/);
  assert.deepEqual(result.descriptions[1]!.values, ["A woman glances back."]);
});

test("a tag answer names the tools that check and extend it", () => {
  // Closing the loop between "what is in this image" and "what do I write".
  const chosen = chooseBackends(WD14_ONLY, { promptingStyle: "booru_tags" });
  return describeImage(
    "refs/photo.png",
    chosen,
    runnerReturning({ "2": { tags: ["1girl, solo"] } })
  ).then((result) => {
    assert.match(result.hint, /comfyui_search_tags/);
    assert.match(result.hint, /comfyui_related_tags/);
  });
});

test("a prose answer points a booru user at the tagger instead", async () => {
  const chosen = chooseBackends(FLORENCE_ONLY, {});
  const result = await describeImage(
    "refs/photo.png",
    chosen,
    runnerReturning({ "4": { text: ["A woman glances back."] } })
  );

  assert.match(result.hint, /wd14/);
});

test("no text at all says what to check rather than staying silent", async () => {
  const chosen = chooseBackends(WD14_ONLY, {});
  const result = await describeImage("refs/photo.png", chosen, runnerReturning({}));

  assert.deepEqual(result.descriptions[0]!.values, []);
  assert.match(result.hint, /nodes/);
});

// --- what these backends do NOT do ----------------------------------------

test("no backend advertises grounding, because none of them expose it", () => {
  // This shipped as a claim before it shipped as a feature: the tool
  // description and the florence2 row both promised "grounded/region tasks
  // via prompt", while backends.ts hardcodes task: "more_detailed_caption"
  // and reads only output index 2. Florence2Run CAN ground; this graph
  // cannot ask it to. A guard rather than a comment, because the wording is
  // what misleads and the wording is what drifts.
  for (const backend of DESCRIBE_BACKENDS) {
    const promise = /\b(grounded|grounding|bounding box|coordinates)\b/i;
    const claim = backend.goodFor.match(promise);
    if (!claim) continue;

    // Mentioning it is fine; promising it is not. Anything that names
    // grounding must also say this backend does not do it.
    assert.match(
      backend.goodFor,
      /\b(not|NOT|does not|cannot|no)\b/,
      `${backend.id} mentions '${claim[0]}' without saying it is unavailable here`
    );
  }
});

test("the florence2 graph asks for a caption, matching what its goodFor says", () => {
  // The row's text and the graph it builds have to agree. If someone wires
  // task selection later, this fails and the text gets updated with it.
  const built = backendById("florence2")!.build({
    imageRef: "a.png",
    nodeType: "Florence2Run",
    terminalType: "PreviewAny",
  });
  const run = built.workflow["3"] as { inputs: { task: string } };

  assert.match(run.inputs.task, /caption/);
  assert.deepEqual(
    (built.workflow["4"] as { inputs: { source: unknown } }).inputs.source,
    ["3", 2],
    "reads the caption output, not the JSON data output that carries boxes"
  );
});
