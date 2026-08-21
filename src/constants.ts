/**
 * Shared limits and tuning constants.
 */

/**
 * Maximum characters any single tool response may put into the model's
 * context. Responses over this are truncated with an actionable message
 * telling the agent how to narrow the request.
 *
 * Sized to roughly 6k tokens: large enough that ordinary calls never trip it,
 * small enough that one careless call cannot eat a context window.
 */
export const CHARACTER_LIMIT = 25000;

/** Default page size for list/search tools. */
export const DEFAULT_PAGE_SIZE = 25;

/** Hard ceiling on page size, so `limit: 100000` cannot be used to bypass paging. */
export const MAX_PAGE_SIZE = 200;
