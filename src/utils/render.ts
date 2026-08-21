/**
 * Markdown rendering for paginated listings.
 *
 * Every list tool answers the same shape of question - here is a page of
 * things, here is how much you did not see - so they share one renderer
 * rather than each growing its own. Tools supply the rows; the title, the
 * facet line and the pagination footer are handled here.
 */

import { PageEnvelope, pageFooter } from "./response.js";

export interface ListingView {
  /** Markdown H1 for the listing, without the leading '#'. */
  title: string;
  /** The page, one markdown line per item. */
  rows: string[];
  /** Envelope from `paginate`, used for the footer. */
  page: PageEnvelope;
  /** Shown instead of everything else when the page is empty. */
  empty: string;
  /**
   * Counts that describe the whole result set rather than this page - node
   * categories, running/pending splits. Rendered as one line so a wide facet
   * map cannot outweigh the rows it labels.
   */
  facets?: Record<string, number | string>;
  /** One line under the title, before the facets. */
  lead?: string;
  /** Closing suggestion, e.g. which tool to call for detail. */
  next?: string;
}

/** Render a paginated listing as markdown. */
export function renderListing(view: ListingView): string {
  if (view.page.total === 0) return view.empty;

  const lines = [`# ${view.title}`, ""];

  if (view.lead) lines.push(view.lead, "");

  if (view.facets) {
    const pairs = Object.entries(view.facets);
    if (pairs.length) {
      lines.push(pairs.map(([k, v]) => `**${k}**: ${v}`).join(" · "), "");
    }
  }

  lines.push(...view.rows);
  lines.push(pageFooter(view.page));

  if (view.next) lines.push(view.next);

  return lines.join("\n");
}

/**
 * Render a flat `key: [value, ...]` map as grouped markdown sections.
 *
 * Used where a page is regrouped for readability - list_models pages over
 * models but presents them under their type.
 */
export function renderGroups(groups: Record<string, string[]>): string[] {
  const lines: string[] = [];
  for (const [group, values] of Object.entries(groups)) {
    lines.push(`## ${group} (${values.length})`);
    for (const value of values) lines.push(`- ${value}`);
    lines.push("");
  }
  return lines;
}
