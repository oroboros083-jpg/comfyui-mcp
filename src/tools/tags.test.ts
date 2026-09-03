import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseCsvLine,
  parseTagCsv,
  parseCooccurrenceCsv,
  builtinIndex,
  searchTags,
  relatedTags,
  renderTagSearch,
  getTagIndex,
  clearTagIndexCache,
  type TagIndex,
  type SearchTagsInput,
  type RelatedTagsInput,
} from "./tags.js";
import { paginate } from "../utils/response.js";

/** Defaults the zod schema would have supplied. */
function search(over: Partial<SearchTagsInput> & { query: string }): SearchTagsInput {
  return {
    category: "any",
    minCount: 0,
    limit: 25,
    offset: 0,
    response_format: "json",
    ...over,
  } as SearchTagsInput;
}

function related(over: Partial<RelatedTagsInput> & { tags: string[] }): RelatedTagsInput {
  return {
    category: "any",
    limit: 25,
    offset: 0,
    response_format: "json",
    ...over,
  } as RelatedTagsInput;
}

// The real column layout: tag,category,count,alias - category being
// Danbooru's numeric code, and alias quoted when there is more than one.
const TAG_CSV = `tag,category,count,alias
1girl,0,6000000,
looking_at_viewer,0,3000000,
looking_back,0,400000,
cowboy_shot,0,900000,
hatsune_miku,4,500000,"miku,初音ミク"
vocaloid,3,700000,
greg_rutkowski,1,12000,
highres,5,4000000,
ganyu_\\(genshin_impact\\),4,120000,
`;

const PAIR_CSV = `1girl,looking_at_viewer,2500000
1girl,cowboy_shot,700000
1girl,highres,3000000
looking_at_viewer,cowboy_shot,400000
hatsune_miku,vocaloid,480000
`;

function stubIndex(): TagIndex {
  return {
    source: "autocomplete-plus",
    tags: parseTagCsv(TAG_CSV),
    cooccurrence: parseCooccurrenceCsv(PAIR_CSV),
  };
}

// --- CSV parsing ----------------------------------------------------------

test("parseCsvLine honours quoted fields", () => {
  // The alias column is quoted whenever it holds several aliases, so a bare
  // split(",") would turn one tag into three.
  assert.deepEqual(parseCsvLine('hatsune_miku,4,500000,"miku,初音ミク"'), [
    "hatsune_miku",
    "4",
    "500000",
    "miku,初音ミク",
  ]);
});

test("parseCsvLine unescapes doubled quotes", () => {
  assert.deepEqual(parseCsvLine('a,"say ""hi""",1'), ["a", 'say "hi"', "1"]);
});

test("parseTagCsv maps Danbooru category codes to names", () => {
  const byTag = new Map(parseTagCsv(TAG_CSV).map((t) => [t.tag, t]));

  assert.equal(byTag.get("1girl")?.category, "general");
  assert.equal(byTag.get("greg_rutkowski")?.category, "artist");
  assert.equal(byTag.get("vocaloid")?.category, "copyright");
  assert.equal(byTag.get("hatsune_miku")?.category, "character");
  assert.equal(byTag.get("highres")?.category, "meta");
});

test("parseTagCsv skips the optional header row", () => {
  // The format documents the header as optional, so it is dropped by shape
  // rather than by position - a user CSV may not have one.
  assert.ok(!parseTagCsv(TAG_CSV).some((t) => t.tag === "tag"));
  assert.equal(parseTagCsv("1girl,0,10,").length, 1);
});

test("parseTagCsv splits multiple aliases", () => {
  const miku = parseTagCsv(TAG_CSV).find((t) => t.tag === "hatsune_miku")!;
  assert.deepEqual(miku.aliases, ["miku", "初音ミク"]);
});

test("parseCooccurrenceCsv is bidirectional", () => {
  // The file records each pair once, but "what goes with X" has to work
  // whichever side X was written on.
  const map = parseCooccurrenceCsv(PAIR_CSV);
  assert.equal(map.get("1girl")?.get("cowboy_shot"), 700000);
  assert.equal(map.get("cowboy_shot")?.get("1girl"), 700000);
});

test("parseCooccurrenceCsv honours its row cap", () => {
  const map = parseCooccurrenceCsv(PAIR_CSV, 1);
  assert.equal(map.get("1girl")?.get("looking_at_viewer"), 2500000);
  assert.equal(map.get("1girl")?.get("cowboy_shot"), undefined);
});

// --- search ---------------------------------------------------------------

test("underscores and spaces are interchangeable in a query", () => {
  // A model writing prose will type spaces; the vocabulary uses underscores.
  const spaced = searchTags(stubIndex(), search({ query: "looking at" }));
  assert.equal(spaced.matches[0]?.tag, "looking_at_viewer");

  const scored = searchTags(stubIndex(), search({ query: "looking_at" }));
  assert.equal(scored.matches[0]?.tag, "looking_at_viewer");
});

test("results rank exact, then prefix, then substring", () => {
  const result = searchTags(stubIndex(), search({ query: "looking" }));
  const names = result.matches.map((m) => m.tag);

  // Both are prefix matches, so post count breaks the tie.
  assert.deepEqual(names, ["looking_at_viewer", "looking_back"]);
});

test("an exact match outranks a more popular prefix match", () => {
  const index = stubIndex();
  index.tags.push({ tag: "looking", category: "general", count: 5, aliases: [] });

  const result = searchTags(index, search({ query: "looking" }));
  assert.equal(result.matches[0]?.tag, "looking");
});

test("aliases are searchable but rank below tag names", () => {
  const result = searchTags(stubIndex(), search({ query: "miku" }));
  assert.equal(result.matches[0]?.tag, "hatsune_miku");
});

test("category narrows the result", () => {
  const index = stubIndex();

  // "k" matches greg_rutkowski, looking_at_viewer and looking_back; the
  // category filter leaves only the artist.
  assert.deepEqual(
    searchTags(index, search({ query: "k", category: "artist" })).matches.map((m) => m.tag),
    ["greg_rutkowski"]
  );
});

test("minCount drops tags too rare to be well learned", () => {
  const index = stubIndex();

  const all = searchTags(index, search({ query: "k" }));
  assert.ok(all.matches.some((m) => m.tag === "greg_rutkowski"));

  // greg_rutkowski has 12k posts; the other "k" matches have far more.
  const popular = searchTags(index, search({ query: "k", minCount: 100000 }));
  assert.ok(!popular.matches.some((m) => m.tag === "greg_rutkowski"));
  assert.ok(popular.matches.some((m) => m.tag === "looking_back"));
});

test("a miss says so rather than inventing a tag", () => {
  const result = searchTags(stubIndex(), search({ query: "zzzznotatag" }));
  assert.equal(result.total, 0);

  const rendered = renderTagSearch(result, paginate(result.matches, 25, 0));
  assert.match(rendered, /No tag matches/);
  assert.match(rendered, /rather than inventing one/);
});

// --- related --------------------------------------------------------------

test("related tags exclude the inputs themselves", () => {
  const result = relatedTags(stubIndex(), related({ tags: ["1girl"] }));
  assert.ok(!result.related.some((r) => r.tag === "1girl"));
  assert.ok(result.related.some((r) => r.tag === "looking_at_viewer"));
});

test("a tag matching more of the inputs outranks a more common one", () => {
  // Otherwise every query returns whatever is globally most frequent, which
  // the caller already had in their prompt.
  const result = relatedTags(
    stubIndex(),
    related({ tags: ["1girl", "looking_at_viewer"] })
  );

  assert.equal(result.related[0]?.tag, "cowboy_shot");
  assert.equal(result.related[0]?.matchedInputs, 2);

  // highres has a far higher raw count but only touches one input.
  const highres = result.related.find((r) => r.tag === "highres")!;
  assert.equal(highres.matchedInputs, 1);
  assert.ok(highres.cooccurrence > result.related[0]!.cooccurrence);
});

test("related tags carry their category and post count from the tag data", () => {
  const result = relatedTags(stubIndex(), related({ tags: ["hatsune_miku"] }));
  const vocaloid = result.related.find((r) => r.tag === "vocaloid")!;

  assert.equal(vocaloid.category, "copyright");
  assert.equal(vocaloid.count, 700000);
});

test("inputs absent from the data are reported, not silently dropped", () => {
  const result = relatedTags(
    stubIndex(),
    related({ tags: ["1girl", "zzzznotatag"] })
  );
  assert.deepEqual(result.unknown, ["zzzznotatag"]);
});

// --- the builtin fallback -------------------------------------------------

test("the builtin source answers searches without the custom node", () => {
  // The whole point of the fallback: a smaller answer beats no answer.
  const index = builtinIndex();
  assert.equal(index.source, "builtin");

  const result = searchTags(index, search({ query: "cowboy" }));
  assert.equal(result.matches[0]?.tag, "cowboy_shot");
  assert.equal(result.source, "builtin");
});

test("the builtin source names what is missing and how to get it", () => {
  const index = builtinIndex();
  const result = searchTags(index, search({ query: "1girl" }));

  assert.ok(result.note, "a degraded answer must say it is degraded");
  assert.match(result.note!, /ComfyUI-Autocomplete-Plus/);
});

test("related tags on the builtin source report the gap rather than empty", () => {
  // No co-occurrence data exists offline, and an empty list would read as
  // "these tags have no relatives" rather than "this needs the node".
  const result = relatedTags(builtinIndex(), related({ tags: ["1girl"] }));

  assert.equal(result.related.length, 0);
  assert.match(result.note!, /ComfyUI-Autocomplete-Plus/);
});

// --- index building -------------------------------------------------------

test("concurrent callers share one index build", async () => {
  // search_tags and related_tags issued together both missed the cache and both
  // downloaded and parsed 120k tag rows plus 400k pairs. Same fix as
  // ComfyUIClient.getObjectInfo: one in-flight build, shared.
  clearTagIndexCache();
  const original = globalThis.fetch;
  let fetches = 0;
  try {
    globalThis.fetch = (async (url: string) => {
      fetches++;
      const body = String(url).includes("cooccurrence") ? PAIR_CSV : TAG_CSV;
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;

    const target = { baseUrl: "http://one" };
    const [a, b, c] = await Promise.all([
      getTagIndex(target),
      getTagIndex(target),
      getTagIndex(target),
    ]);

    assert.equal(fetches, 2, "one tag CSV and one pair CSV, not three of each");
    assert.equal(a, b, "the same index object is handed to every caller");
    assert.equal(b, c);
    assert.equal(a.source, "autocomplete-plus");

    // And it is cached afterwards, so a later call costs nothing.
    await getTagIndex(target);
    assert.equal(fetches, 2, "served from cache");
  } finally {
    globalThis.fetch = original;
    clearTagIndexCache();
  }
});

test("a builtin fallback is not cached, so a node installed later is picked up", async () => {
  clearTagIndexCache();
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    const target = { baseUrl: "http://later" };
    assert.equal((await getTagIndex(target)).source, "builtin");

    globalThis.fetch = (async (url: string) =>
      new Response(
        String(url).includes("cooccurrence") ? PAIR_CSV : TAG_CSV,
        { status: 200 }
      )) as unknown as typeof fetch;
    assert.equal((await getTagIndex(target)).source, "autocomplete-plus");
  } finally {
    globalThis.fetch = original;
    clearTagIndexCache();
  }
});

test("repeated queries against one index are stable under memoisation", () => {
  // relatedTags rebuilt a 120k-entry Map per call and searchTags re-normalised
  // every tag name per query; both are now derived once and cached per index.
  const index = stubIndex();
  const search = { query: "looking", category: "any", minCount: 0, limit: 25, offset: 0 } as never;
  const first = searchTags(index, search);
  assert.deepEqual(searchTags(index, search), first, "second query agrees with the first");

  const related = { tags: ["1girl"], category: "any", limit: 25, offset: 0 } as never;
  const firstRelated = relatedTags(index, related);
  assert.deepEqual(relatedTags(index, related), firstRelated);
  assert.ok(firstRelated.related.length > 0, "the stub does produce results");
});
