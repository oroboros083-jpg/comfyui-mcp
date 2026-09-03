/**
 * Tag discovery for booru-vocabulary models.
 *
 * NOTE ON HTTP: like workflow-files.ts, these call ComfyUI with plain `fetch`
 * rather than `safeFetch`. safeFetch is the SSRF guard for UNTRUSTED urls and
 * refuses loopback on purpose, which is where ComfyUI lives.
 *
 * The prompting guides carry a curated vocabulary - about 150 tags, enough to
 * describe framing, pose, lighting and so on. That is the right size for a
 * guide, and the wrong size for "is `looking_over_shoulder` a real tag, and
 * what usually goes with it". Danbooru has six figures of tags and the answer
 * is a lookup, not a list.
 *
 * ComfyUI-Autocomplete-Plus already solves the data half: it downloads two
 * CSVs from Hugging Face and serves them over ComfyUI's own HTTP server. It
 * does the searching in the browser, so this module does the searching here
 * instead - fetch once, index in memory, answer queries against the index.
 *
 *   https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus
 *
 * Without that node installed the tools still answer, from the built-in
 * curated vocabulary, and say which source they used. A smaller answer beats
 * no answer, and the caller needs to know which it got.
 */

import { z } from "zod";

import { paginationFields, responseFormatField } from "../utils/response.js";
import { renderListing } from "../utils/render.js";
import { DANBOORU_VOCABULARY } from "../resources/prompting/guides/vocabulary.js";
import type { ComfyUITarget } from "./workflow-files.js";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/**
 * Danbooru's category codes, as the CSV stores them. Index 2 is unused by
 * Danbooru itself, not by us.
 */
export const DANBOORU_CATEGORIES = [
  "general",
  "artist",
  "unused",
  "copyright",
  "character",
  "meta",
] as const;

export type TagCategory = (typeof DANBOORU_CATEGORIES)[number];

export interface TagRecord {
  tag: string;
  category: TagCategory;
  /** Danbooru post count. A proxy for how well a model knows the tag. */
  count: number;
  aliases: string[];
  /**
   * What the tag controls - "framing", "hair colour". Only the builtin
   * vocabulary carries these; the CSVs have no such column.
   *
   * Separate from `category` because the two answer different questions, and
   * folding one into the other is what this field replaced: the builtin index
   * used to file the group under `aliases`, so `search_tags("framing")`
   * matched every framing tag as though "framing" were another name for it.
   */
  group?: string;
}

/** Which body of tags answered a query. */
export type TagSourceKind = "autocomplete-plus" | "builtin";

export interface TagIndex {
  source: TagSourceKind;
  tags: TagRecord[];
  /** tag -> (other tag -> times seen together). Empty on the builtin source. */
  cooccurrence: Map<string, Map<string, number>>;
  note?: string;
}

export const AUTOCOMPLETE_MISSING_HINT =
  "Only the built-in curated vocabulary (~150 tags) is available. For the full Danbooru set and related-tag lookup, install " +
  "ComfyUI-Autocomplete-Plus (https://github.com/newtextdoc1111/ComfyUI-Autocomplete-Plus) into ComfyUI's custom_nodes and restart, " +
  "then call comfyui_reconnect.";

/**
 * Rows to keep from the tag CSV.
 *
 * The published set is filtered to post_count >= 100 and runs to six figures
 * of rows. Parsing all of it costs tens of MB of heap in a process whose job
 * is to answer small questions, and the rows past this cap are the least-used
 * tags - the ones a model is least likely to know anyway. Sorted by count, so
 * the cap drops the tail rather than an arbitrary slice.
 */
const MAX_TAG_ROWS = 120_000;

/** Same reasoning for the pair file, which is larger still. */
const MAX_COOCCURRENCE_ROWS = 400_000;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const searchTagsSchema = z
  .object({
    query: z
      .string()
      .min(1, "query must not be empty")
      .describe(
        "Substring to look for in tag names and aliases. Underscores and spaces are interchangeable, so 'looking at' finds 'looking_at_viewer'."
      ),
    category: z
      .enum(["general", "artist", "copyright", "character", "meta", "any"])
      .optional()
      .default("any")
      .describe(
        "Restrict to one Danbooru category. 'character' and 'copyright' are the ones that need escaping in a prompt."
      ),
    minCount: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe(
        "Only tags with at least this many Danbooru posts. Raise it to drop tags too rare for a model to have learned."
      ),
    ...paginationFields,
    response_format: responseFormatField,
  })
  .strict();

export type SearchTagsInput = z.infer<typeof searchTagsSchema>;

export const relatedTagsSchema = z
  .object({
    tags: z
      .array(z.string().min(1))
      .min(1, "give at least one tag")
      .max(20)
      .describe(
        "Tags already in the prompt. Results are ranked by how often they appear alongside ALL of these."
      ),
    category: z
      .enum(["general", "artist", "copyright", "character", "meta", "any"])
      .optional()
      .default("any")
      .describe("Restrict suggestions to one category."),
    ...paginationFields,
    response_format: responseFormatField,
  })
  .strict();

export type RelatedTagsInput = z.infer<typeof relatedTagsSchema>;

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/**
 * Split one CSV line, honouring double-quoted fields.
 *
 * The alias column is quoted whenever it holds several aliases, and tag names
 * legitimately contain commas inside quotes, so a bare `split(",")` corrupts
 * both. Escaped quotes are `""`, per RFC 4180.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      fields.push(field);
      field = "";
    } else field += ch;
  }

  fields.push(field);
  return fields;
}

/** Parse the `tag,category,count,alias` CSV the autocomplete node serves. */
export function parseTagCsv(text: string): TagRecord[] {
  const rows: TagRecord[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const columns = parseCsvLine(trimmed);
    if (columns.length < 3) continue;

    const tag = columns[0]!.trim();
    // A header row is optional in this format, so it is skipped by shape
    // rather than by position - user CSVs may or may not carry one.
    if (!tag || tag === "tag") continue;

    const category = Number.parseInt(columns[1]!.trim(), 10);
    const count = Number.parseInt(columns[2]!.trim(), 10);
    if (Number.isNaN(count)) continue;

    rows.push({
      tag,
      category: DANBOORU_CATEGORIES[category] ?? "general",
      count,
      aliases: (columns[3] ?? "")
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
    });
  }

  return rows;
}

/** Parse the `tagA,tagB,count` pair CSV into a bidirectional map. */
export function parseCooccurrenceCsv(
  text: string,
  maxRows = MAX_COOCCURRENCE_ROWS
): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  let rows = 0;

  for (const line of text.split("\n")) {
    if (rows >= maxRows) break;
    const trimmed = line.trim();
    if (!trimmed) continue;

    const columns = parseCsvLine(trimmed);
    if (columns.length < 3) continue;

    const a = columns[0]!.trim();
    const b = columns[1]!.trim();
    const count = Number.parseInt(columns[2]!.trim(), 10);
    if (!a || !b || Number.isNaN(count)) continue;

    // Bidirectional: the file records each pair once, but "what goes with X"
    // has to work whichever side X was written on.
    if (!map.has(a)) map.set(a, new Map());
    map.get(a)!.set(b, count);
    if (!map.has(b)) map.set(b, new Map());
    map.get(b)!.set(a, count);

    rows++;
  }

  return map;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/**
 * Danbooru's own category for a curated tag, where it is not `general`.
 *
 * The vocabulary is grouped by what a tag controls, and those groups are not
 * Danbooru categories - "framing" and "hair colour" are not categories at
 * all, and nearly every tag in the set is `general` on Danbooru whatever
 * group it sits in. These three are the exceptions, and listing them is what
 * lets `search_tags({category: "meta"})` return anything from the builtin
 * source: it previously filed every tag as `general`, so the filter could
 * never match.
 */
const BUILTIN_TAG_CATEGORIES: Record<string, TagCategory> = {
  highres: "meta",
  absurdres: "meta",
  official_art: "meta",
};

/**
 * The curated vocabulary from the prompting guides, as an index.
 *
 * No post counts exist for these, so they are given a nominal count that
 * sorts them above nothing and below anything real. There is no co-occurrence
 * data, so `related_tags` reports that rather than inventing it.
 */
export function builtinIndex(): TagIndex {
  const tags: TagRecord[] = [];

  for (const [group, list] of Object.entries(DANBOORU_VOCABULARY.categories)) {
    for (const tag of list) {
      tags.push({
        tag,
        category: BUILTIN_TAG_CATEGORIES[tag] ?? "general",
        count: 0,
        aliases: [],
        group,
      });
    }
  }

  return {
    source: "builtin",
    tags,
    cooccurrence: new Map(),
    note: AUTOCOMPLETE_MISSING_HINT,
  };
}

async function fetchCsv(target: ComfyUITarget, path: string): Promise<string | null> {
  try {
    const headers: Record<string, string> = {};
    if (target.apiKey) headers["Authorization"] = `Bearer ${target.apiKey}`;

    const response = await fetch(`${target.baseUrl}${path}`, { headers });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    // Node absent, ComfyUI down, or the CSVs never downloaded. All of these
    // mean the same thing to the caller: use the builtin source.
    return null;
  }
}

/** Cached per base url, since parsing the full set is not cheap. */
const INDEX_CACHE = new Map<string, TagIndex>();

/**
 * Builds already running, shared by concurrent callers.
 *
 * Same shape as ComfyUIClient.getObjectInfo and for the same reason: two tools
 * called together (search_tags and related_tags) both missed the cache and both
 * downloaded and parsed 120k tag rows plus 400k co-occurrence pairs, doubling
 * the one operation in this module expensive enough to be worth caching.
 */
const INDEX_INFLIGHT = new Map<string, Promise<TagIndex>>();

/**
 * Bumped by clearTagIndexCache so a build already in flight cannot repopulate
 * the cache after a reconnect. Without it the index that lands is the one built
 * against the instance that was just dropped.
 */
let indexEpoch = 0;

/** Drop cached indexes. Called on reconnect, when the instance may have changed. */
export function clearTagIndexCache(): void {
  INDEX_CACHE.clear();
  INDEX_INFLIGHT.clear();
  indexEpoch++;
}

/**
 * Get a tag index, preferring the autocomplete node's data.
 *
 * Falls back to the builtin vocabulary whenever the node is absent or has not
 * downloaded its CSVs yet. Never throws: an unavailable richer source is a
 * smaller answer, not a failure.
 */
export async function getTagIndex(
  target: ComfyUITarget | null
): Promise<TagIndex> {
  if (!target) return builtinIndex();

  const cached = INDEX_CACHE.get(target.baseUrl);
  if (cached) return cached;

  // Share one build rather than starting a second download and parse when
  // concurrent callers both miss.
  const existing = INDEX_INFLIGHT.get(target.baseUrl);
  if (existing) return existing;

  const epoch = indexEpoch;
  const pending = (async () => {
    const tagCsv = await fetchCsv(target, "/autocomplete-plus/csv/danbooru/tags/base");
    if (!tagCsv) return builtinIndex();

    const tags = parseTagCsv(tagCsv)
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_TAG_ROWS);

    if (tags.length === 0) return builtinIndex();

    const pairCsv = await fetchCsv(
      target,
      "/autocomplete-plus/csv/danbooru/tags_cooccurrence/base"
    );

    return {
      source: "autocomplete-plus" as const,
      tags,
      cooccurrence: pairCsv ? parseCooccurrenceCsv(pairCsv) : new Map(),
    };
  })();
  INDEX_INFLIGHT.set(target.baseUrl, pending);

  try {
    const index = await pending;
    // Only a real autocomplete-plus index is cached; a builtin fallback stays
    // uncached so the node appearing later is picked up on the next call. And
    // a reconnect landing mid-build discards this one rather than storing an
    // index describing the instance that was just dropped.
    if (epoch === indexEpoch && index.source === "autocomplete-plus") {
      INDEX_CACHE.set(target.baseUrl, index);
    }
    return index;
  } finally {
    if (INDEX_INFLIGHT.get(target.baseUrl) === pending) {
      INDEX_INFLIGHT.delete(target.baseUrl);
    }
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Underscores and spaces are the same character to a searcher. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[_\s]+/g, " ").trim();
}

/**
 * Per-index derived data, built once on first use.
 *
 * Both of these were recomputed per call over a table that never changes for
 * the life of an index: relatedTags rebuilt a 120k-entry Map before doing any
 * work, and searchTags re-normalised every tag name on every query.
 *
 * Held in WeakMaps rather than as fields on TagIndex so the exported interface
 * is unchanged - builtinIndex() and the test stubs construct TagIndex literals,
 * and a new required field would break them - and so the memo is collected with
 * the index it belongs to.
 */
const BY_NAME = new WeakMap<TagIndex, Map<string, TagRecord>>();
const NORMALISED_NAMES = new WeakMap<TagIndex, string[]>();

function byNameOf(index: TagIndex): Map<string, TagRecord> {
  let map = BY_NAME.get(index);
  if (!map) {
    map = new Map(index.tags.map((t) => [t.tag, t]));
    BY_NAME.set(index, map);
  }
  return map;
}

/** Normalised tag names, positionally aligned with `index.tags`. */
function normalisedNamesOf(index: TagIndex): string[] {
  let names = NORMALISED_NAMES.get(index);
  if (!names) {
    names = index.tags.map((t) => normalise(t.tag));
    NORMALISED_NAMES.set(index, names);
  }
  return names;
}

export interface TagSearchResult {
  source: TagSourceKind;
  query: string;
  matches: TagRecord[];
  total: number;
  note?: string;
}

/**
 * Find tags whose name or alias contains the query.
 *
 * Ranked by whether the match is a prefix of the tag, then by post count.
 * Post count is the useful tiebreak because it stands in for how much of the
 * training data used the tag: a tag with 400 posts is technically valid and
 * practically inert.
 */
export function searchTags(
  index: TagIndex,
  input: SearchTagsInput
): TagSearchResult {
  const needle = normalise(input.query);

  const scored: Array<{ record: TagRecord; rank: number }> = [];
  // Iterated by position so a record and its normalised name cannot drift.
  const names = normalisedNamesOf(index);

  for (let i = 0; i < index.tags.length; i++) {
    const record = index.tags[i]!;
    if (input.category !== "any" && record.category !== input.category) continue;
    if (record.count < input.minCount) continue;

    const name = names[i]!;
    let rank: number | null = null;

    if (name === needle) rank = 0;
    else if (name.startsWith(needle)) rank = 1;
    else if (name.includes(needle)) rank = 2;
    else if (record.aliases.some((a) => normalise(a).includes(needle))) rank = 3;

    if (rank !== null) scored.push({ record, rank });
  }

  scored.sort((a, b) => a.rank - b.rank || b.record.count - a.record.count);

  return {
    source: index.source,
    query: input.query,
    matches: scored.map((s) => s.record),
    total: scored.length,
    note: index.note,
  };
}

export interface RelatedTag extends TagRecord {
  /** Times seen alongside the input tags, summed. */
  cooccurrence: number;
  /** How many of the input tags this one co-occurs with. */
  matchedInputs: number;
}

export interface RelatedTagsResult {
  source: TagSourceKind;
  tags: string[];
  /** Input tags the co-occurrence data knows nothing about. */
  unknown: string[];
  related: RelatedTag[];
  total: number;
  note?: string;
}

/**
 * Tags that commonly appear alongside the ones given.
 *
 * With several inputs, a tag that co-occurs with all of them outranks one
 * that is merely very common next to a single input - otherwise every query
 * returns `1girl` and `solo`, which the caller already knew.
 */
export function relatedTags(
  index: TagIndex,
  input: RelatedTagsInput
): RelatedTagsResult {
  const byName = byNameOf(index);
  const inputSet = new Set(input.tags);

  const totals = new Map<string, { sum: number; inputs: number }>();
  const unknown: string[] = [];

  for (const tag of input.tags) {
    const partners = index.cooccurrence.get(tag);
    if (!partners || partners.size === 0) {
      unknown.push(tag);
      continue;
    }

    for (const [other, count] of partners) {
      if (inputSet.has(other)) continue;

      const entry = totals.get(other) ?? { sum: 0, inputs: 0 };
      entry.sum += count;
      entry.inputs += 1;
      totals.set(other, entry);
    }
  }

  const related: RelatedTag[] = [];
  for (const [tag, { sum, inputs }] of totals) {
    const record = byName.get(tag);
    const category = record?.category ?? "general";
    if (input.category !== "any" && category !== input.category) continue;

    related.push({
      tag,
      category,
      count: record?.count ?? 0,
      aliases: record?.aliases ?? [],
      ...(record?.group ? { group: record.group } : {}),
      cooccurrence: sum,
      matchedInputs: inputs,
    });
  }

  related.sort(
    (a, b) => b.matchedInputs - a.matchedInputs || b.cooccurrence - a.cooccurrence
  );

  return {
    source: index.source,
    tags: input.tags,
    unknown,
    related,
    total: related.length,
    note:
      index.cooccurrence.size === 0
        ? AUTOCOMPLETE_MISSING_HINT
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** One tag as a markdown row. Count is what tells a reader how safe a tag is. */
function tagRow(record: TagRecord): string {
  const count = record.count > 0 ? ` — ${record.count.toLocaleString()} posts` : "";
  const aliases = record.aliases.length ? ` (aka ${record.aliases.join(", ")})` : "";
  const group = record.group ? `, ${record.group}` : "";
  return `- \`${record.tag}\` [${record.category}${group}]${count}${aliases}`;
}

export function renderTagSearch(
  result: TagSearchResult,
  page: { items: TagRecord[]; total: number; count: number; offset: number; has_more: boolean; next_offset?: number }
): string {
  return renderListing({
    title: `Tags matching '${result.query}'`,
    facets: { source: result.source },
    rows: page.items.map(tagRow),
    page,
    empty:
      `No tag matches '${result.query}'. Booru vocabularies are fixed - if there is no tag, ` +
      `describe the idea with tags that do exist rather than inventing one.` +
      (result.note ? `\n\n${result.note}` : ""),
    next: result.note,
  });
}

export function renderRelatedTags(
  result: RelatedTagsResult,
  page: { items: RelatedTag[]; total: number; count: number; offset: number; has_more: boolean; next_offset?: number }
): string {
  const facets: Record<string, string | number> = { source: result.source };
  if (result.unknown.length) facets["not in the data"] = result.unknown.join(", ");

  return renderListing({
    title: `Tags that go with ${result.tags.map((t) => `\`${t}\``).join(", ")}`,
    facets,
    rows: page.items.map(
      (r) =>
        `${tagRow(r)} — with ${r.matchedInputs}/${result.tags.length} inputs, ${r.cooccurrence.toLocaleString()} co-occurrences`
    ),
    page,
    empty:
      result.unknown.length === result.tags.length
        ? `None of those tags appear in the co-occurrence data.` +
          (result.note ? `\n\n${result.note}` : "")
        : `No related tags found.` + (result.note ? `\n\n${result.note}` : ""),
    next: result.note,
  });
}
