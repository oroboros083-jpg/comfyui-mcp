/**
 * Shared response construction for every tool.
 *
 * Three jobs, all of them about not wasting the agent's context:
 *  - paginate list results instead of dumping whole collections
 *  - emit compact JSON rather than 2-space-indented JSON
 *  - cap any response at CHARACTER_LIMIT with a message saying how to narrow it
 */

import { z } from "zod";
import { CHARACTER_LIMIT, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

/**
 * Reusable schema fields, spread into a tool's own z.object({...}).
 *
 * The MCP guidance suggests markdown as the default format. This server
 * defaults to JSON instead, deliberately: the reader here is a model, and for
 * the listings these tools return, compact JSON is both smaller than the
 * equivalent markdown and directly parseable. Markdown stays available for
 * callers that surface tool output to a person.
 */
export const responseFormatField = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.JSON)
  .describe(
    "Output format: 'json' (default) for compact structured data, 'markdown' for human-readable text"
  );

export const paginationFields = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .describe(`Maximum results to return (1-${MAX_PAGE_SIZE})`),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of results to skip, for paging through a large set"),
};

/**
 * The navigation half of a paginated response, without the rows.
 *
 * Tools name their own item key - `models`, `nodes`, `jobs`, `entries` - so
 * they spread this and add that one field. Keeping the envelope separate is
 * what stops a response carrying the same array under two names.
 */
export interface PageEnvelope {
  total: number;
  count: number;
  offset: number;
  has_more: boolean;
  next_offset?: number;
}

export interface Page<T> extends PageEnvelope {
  items: T[];
}

/**
 * Slice one page out of an in-memory collection.
 *
 * ComfyUI's REST API has no server-side paging (`/object_info` is one giant
 * document), so paging happens here. The point is not to save a round trip -
 * it is to keep 2000+ node types from reaching the model at once.
 */
export function paginate<T>(items: T[], limit: number, offset: number): Page<T> {
  const total = items.length;
  const slice = items.slice(offset, offset + limit);
  const consumed = offset + slice.length;
  const has_more = consumed < total;

  return {
    total,
    count: slice.length,
    offset,
    items: slice,
    has_more,
    ...(has_more ? { next_offset: consumed } : {}),
  };
}

/**
 * The same envelope for data the *source* already paged.
 *
 * paginate() slices an in-memory array, which needs the whole collection in
 * hand - fine for ComfyUI's REST responses, wrong for SQLite. Reading a
 * capped list and slicing that made `total` the cap rather than the real
 * count, so the caller was told it had seen everything while rows sat
 * unreachable past the cap. A LIMIT/OFFSET query plus a COUNT(*) reports
 * through this instead.
 */
export function envelopeFor(total: number, count: number, offset: number): PageEnvelope {
  const consumed = offset + count;
  const has_more = consumed < total;

  return {
    total,
    count,
    offset,
    has_more,
    ...(has_more ? { next_offset: consumed } : {}),
  };
}

/** Compact JSON. Indentation is pure token cost for a machine reader. */
export function jsonText(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (v === undefined ? undefined : v));
}

/**
 * Enforce CHARACTER_LIMIT on a finished response body.
 *
 * Truncation is a last-resort backstop for responses that slipped past
 * pagination (a single enormous workflow, a node with a 5000-option combo).
 * The suffix tells the agent what to do rather than leaving it with a
 * silently clipped payload it may believe is complete.
 */
export function capText(text: string, narrowingHint: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;

  const keep = CHARACTER_LIMIT - 300;
  return (
    text.slice(0, keep) +
    `\n\n[TRUNCATED: response was ${text.length} characters, limit is ${CHARACTER_LIMIT}. ` +
    `${narrowingHint}]`
  );
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  /**
   * Typed channel for clients that read it. Any object: on the wire this is
   * a JSON object, and requiring Record<string, unknown> only meant every
   * caller with a declared result interface had to cast the typing away.
   */
  structuredContent?: object;
  isError?: boolean;
}

/** Plain text result, capped. */
export function textResult(text: string, narrowingHint = "Narrow the request."): ToolResult {
  return { content: [{ type: "text", text: capText(text, narrowingHint) }] };
}

/**
 * Structured result: compact JSON in `content` plus `structuredContent` for
 * clients that read the typed channel.
 *
 * `structuredContent` is deliberately NOT capped - it is the machine-readable
 * copy, and clients that consume it do not pay context for it the way the
 * text channel does.
 */
export function dataResult<T extends object>(
  data: T,
  narrowingHint = "Use 'limit' and 'offset', or add a filter."
): ToolResult {
  return {
    content: [{ type: "text", text: capText(jsonText(data), narrowingHint) }],
    structuredContent: data,
  };
}

/**
 * Result for a tool that can answer as markdown or JSON.
 * `markdown` is a thunk so the (often more expensive) rendering is skipped
 * when JSON was requested.
 */
export function formattedResult<T extends object>(
  format: ResponseFormat,
  data: T,
  markdown: () => string,
  narrowingHint = "Use 'limit' and 'offset', or add a filter."
): ToolResult {
  if (format === ResponseFormat.JSON) return dataResult(data, narrowingHint);
  return {
    content: [{ type: "text", text: capText(markdown(), narrowingHint) }],
    structuredContent: data,
  };
}

/** Error result carrying a suggested next step. */
export function errorResult(message: string, hint?: string): ToolResult {
  return {
    content: [{ type: "text", text: hint ? `${message}\n\nHint: ${hint}` : message }],
    isError: true,
  };
}

/**
 * Output schema for the paginated envelope every list/search tool returns.
 *
 * The rows themselves are left loose by default: tools project them to
 * different shapes depending on the caller's `detail`, and pinning that here
 * would make the schema lie. The envelope is what clients navigate by, and it
 * is identical everywhere.
 *
 * `itemsSchema` exists because not every tool returns a flat array - list_models
 * groups its page by model type, so its container is a record of arrays. Declare
 * the real shape: the SDK validates each response against this and fails the
 * call outright on a mismatch.
 */
export function paginatedOutputSchema(
  itemsKey: string,
  itemsSchema: z.ZodTypeAny = z.array(z.unknown())
) {
  return z
    .object({
      total: z.number().int().describe("Total matches, ignoring pagination"),
      count: z.number().int().describe("Number of items in this response"),
      offset: z.number().int().describe("Offset this page starts at"),
      [itemsKey]: itemsSchema.describe("This page of results"),
      has_more: z.boolean().describe("Whether further pages exist"),
      next_offset: z
        .number()
        .int()
        .optional()
        .describe("Offset to pass for the next page; absent on the final page"),
    })
    .passthrough();
}

/** Standard pagination footer for markdown renderings. */
export function pageFooter(page: PageEnvelope): string {
  if (!page.has_more) {
    return page.total > page.count
      ? `\n_Showing ${page.count} of ${page.total} (offset ${page.offset}). End of results._\n`
      : `\n_${page.total} result${page.total === 1 ? "" : "s"}._\n`;
  }
  return (
    `\n_Showing ${page.count} of ${page.total} (offset ${page.offset}). ` +
    `${page.total - (page.offset + page.count)} more - pass offset: ${page.next_offset} for the next page._\n`
  );
}
