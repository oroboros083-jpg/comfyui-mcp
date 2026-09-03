/**
 * The knowledge layer: prompting guides, Danbooru tag vocabulary, the user's
 * own saved snippets, model-to-workflow recommendations, and PNG workflow
 * extraction. None of it has an equivalent in the official Comfy MCP.
 *
 * All available without a live ComfyUI except comfyui_get_user_snippet, which
 * validates against installed nodes.
 *
 * The documentation-example browsing tools and the model download URLs used to
 * live here, and so did the bundled example catalogue behind them. All gone:
 * the Comfy template gallery (official's `search_templates`) covers browsing
 * starter workflows, `download_model` covers fetching a model, and starter
 * graphs now come from BUILTIN_TEMPLATES, the user's own saved snippets, or
 * that gallery. comfyui_recommend_workflow answers "which shape and what
 * settings" and no longer carries a graph of its own.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, stat } from "fs/promises";

import { defineTool } from "../register.js";
import { ensureConnected } from "../connection.js";
import {
  dataResult,
  textResult,
  errorResult,
  formattedResult,
  paginate,
  paginatedOutputSchema,
} from "../../utils/response.js";
import { safeFetch } from "../../utils/safe-fetch.js";
import {
  planIterationSchema,
  planIteration,
  renderIterationPlan,
} from "../../tools/iteration.js";
import { architectureFor } from "../../architectures/registry.js";
import { ServerContext } from "../../context.js";
import {
  searchTagsSchema,
  searchTags,
  renderTagSearch,
  relatedTagsSchema,
  relatedTags,
  renderRelatedTags,
  getTagIndex,
} from "../../tools/tags.js";
import {
  extractWorkflowFromPng,
  recommendWorkflowSchema,
  recommendWorkflow,
  formatWorkflowRecommendation,
  searchTemplatesSchema,
  searchTemplates,
  renderTemplateSearch,
  getTemplateSchema,
  getTemplate,
  saveTemplateSchema,
  saveCustomTemplate,
  deleteTemplateSchema,
  deleteCustomTemplate,
} from "../../tools/library/index.js";
import {
  getPromptingGuide,
  GUIDE_SECTIONS,
  GuideSection,
  sectionsPresent,
  getComprehensiveGuide,
  formatPromptingGuide,
  PROMPTING_GUIDES,
} from "../../resources/prompting-guide.js";

/**
 * extract_workflow's local-file branch reads whatever path it is given with no
 * directory sandboxing, since users legitimately point it at PNGs anywhere on
 * disk. Restricting it to a .png extension and this size cap narrows that from
 * "read any file the process can access" to "read a PNG-sized PNG", closing
 * the realistic path to exfiltrating unrelated files through this tool.
 */
const MAX_LOCAL_IMAGE_BYTES = 50 * 1024 * 1024;

/**
 * The same ceiling for a URL source.
 *
 * The remote branch used to read the whole body into memory with no bound at
 * all, so a URL serving gigabytes exhausted the process - while the local
 * branch had been careful about exactly that. `readCappedBody` streams and
 * stops at the cap rather than buffering first and measuring afterwards,
 * because measuring afterwards does not prevent the exhaustion.
 */
async function readCappedBody(
  response: Response,
  cap: number
): Promise<{ bytes: Uint8Array } | { tooLarge: true; size: string }> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) {
    return { tooLarge: true, size: `${declared} bytes` };
  }

  const reader = response.body?.getReader();
  if (!reader) return { bytes: new Uint8Array(await response.arrayBuffer()) };

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      // Stop the moment the cap is passed - a server may under-declare or omit
      // content-length entirely, so the running total is the real guard.
      if (total > cap) {
        await reader.cancel();
        return { tooLarge: true, size: `over ${cap} bytes` };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes };
}

/**
 * Which ComfyUI the tag tools should ask for CSVs, or null when nothing is
 * connected - in which case they answer from the builtin vocabulary rather
 * than failing.
 */
function tagTarget(c: ServerContext) {
  return c.discoveredUrl
    ? { baseUrl: c.discoveredUrl, apiKey: c.config.comfyui.apiKey }
    : null;
}

export function registerLibraryTools(
  server: McpServer,
  ctx: () => ServerContext
): void {
  defineTool(server, {
    name: "extract_workflow",
    description:
      "Extract the workflow JSON embedded in a ComfyUI-generated PNG. Accepts a local file path or a " +
      "URL. Returns API-format JSON ready for comfyui_run_workflow, plus any Note nodes found in the " +
      "graph. The image must be under 50MB, whether local or fetched; local files must also be .png.\n\n" +
      "Errors: reports clearly when the image carries no ComfyUI metadata (i.e. it was not generated " +
      "by ComfyUI, or was re-encoded and lost its metadata).",
    schema: z
      .object({
        source: z
          .string()
          .min(1)
          .describe("Path to a local PNG, or the URL of a PNG with an embedded ComfyUI workflow"),
      })
      .strict(),
    requiresConnection: false,
    annotations: {
      title: "Extract Workflow from Image",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) => {
      const { source } = input;
      let imageData: ArrayBuffer;

      if (source.startsWith("http://") || source.startsWith("https://")) {
        const response = await safeFetch(source);
        if (!response.ok) {
          return errorResult(
            `Failed to fetch image: ${response.status} ${response.statusText}`
          );
        }
        const body = await readCappedBody(response, MAX_LOCAL_IMAGE_BYTES);
        if ("tooLarge" in body) {
          return errorResult(
            `Image too large (${body.size}, max ${MAX_LOCAL_IMAGE_BYTES}).`,
            "Download it, downscale it, and pass the local path instead."
          );
        }
        imageData = body.bytes.buffer.slice(
          body.bytes.byteOffset,
          body.bytes.byteOffset + body.bytes.byteLength
        ) as ArrayBuffer;
      } else {
        if (!/\.png$/i.test(source)) {
          return errorResult(
            "Local file source must be a .png file.",
            "ComfyUI only embeds workflow metadata in PNG output."
          );
        }
        const stats = await stat(source);
        if (!stats.isFile()) return errorResult(`Not a file: ${source}`);
        if (stats.size > MAX_LOCAL_IMAGE_BYTES) {
          return errorResult(
            `File too large (${stats.size} bytes, max ${MAX_LOCAL_IMAGE_BYTES}).`
          );
        }
        const buffer = await readFile(source);
        imageData = buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        );
      }

      const metadata = await extractWorkflowFromPng(imageData);
      if (!metadata) {
        return errorResult(
          "No workflow metadata found in image.",
          "The image must be a ComfyUI-generated PNG. Re-encoding (screenshot, conversion, upload through some services) strips the metadata."
        );
      }

      // Prefer the API-format prompt over the UI graph: it is what executes.
      const workflow = metadata.prompt || metadata.workflow;

      // Note nodes carry the author's documentation for the graph, which is
      // often the only explanation of why it is built the way it is.
      const notes: string[] = [];
      const uiWorkflow = metadata.workflow as
        | {
            nodes?: Array<{
              type?: string;
              widgets_values?: unknown[];
              properties?: { text?: string };
            }>;
          }
        | undefined;
      for (const node of uiWorkflow?.nodes ?? []) {
        if (node.type === "Note" || node.type === "PrimitiveNode") {
          const noteText = node.widgets_values?.[0] || node.properties?.text;
          if (typeof noteText === "string" && noteText.trim()) {
            notes.push(noteText.trim());
          }
        }
      }

      return dataResult({
        source,
        format: metadata.prompt ? "api" : "ui",
        workflow,
        ...(notes.length ? { notes } : {}),
        hint: "Pass the 'workflow' field to comfyui_run_workflow.",
      });
    },
  });

  defineTool(server, {
    name: "recommend_workflow",
    description:
      "Given a model filename, return the workflow that matches it plus optimal settings (steps, CFG, " +
      "sampler, resolution) and the prompting style it expects. Call this BEFORE generating with an " +
      "unfamiliar model - checkpoint and UNET models need structurally different workflows, and using " +
      "the wrong one fails or produces noise.",
    schema: recommendWorkflowSchema,
    requiresConnection: false,
    annotations: {
      title: "Recommend Workflow for Model",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (input) => {
      const recommendation = await recommendWorkflow(input);
      // The formatted view and the raw object carry the same facts; returning
      // both doubled the cost of every call for no added information.
      return {
        content: [{ type: "text" as const, text: formatWorkflowRecommendation(recommendation) }],
        structuredContent: recommendation,
      };
    },
  });

  defineTool(server, {
    name: "search_user_snippets",
    description:
      "Search THIS USER'S OWN saved workflow snippets, plus the built-in starter workflows - by model " +
      "type, task type, category or free text. Paginated. Results carry only what is needed to choose " +
      "one; call comfyui_get_user_snippet with an id for parameters and runnable JSON.\n\n" +
      "NOT the Comfy template gallery. For the official first-party gallery (hundreds of curated " +
      "templates, kept current by Comfy Org), use the official Comfy MCP's `search_templates` / " +
      "`get_template` instead. This tool only ever returns workflows saved on this machine.\n\n" +
      "Returns: { query, total, count, offset, results, has_more, next_offset }",
    schema: searchTemplatesSchema,
    requiresConnection: false,
    annotations: {
      title: "Search User's Saved Snippets",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputSchema: paginatedOutputSchema("results"),
    handler: (input) => {
      const result = searchTemplates(input);
      return formattedResult(
        input.response_format,
        result,
        () => renderTemplateSearch(result),
        "Add filters, or page with 'offset'."
      );
    },
  });

  defineTool(server, {
    name: "get_user_snippet",
    description:
      "Generate runnable workflow JSON from one of this user's saved snippets (or a built-in starter), " +
      "filling in the parameters given, and validated against the nodes actually installed. Returns a " +
      "complete workflow for comfyui_run_workflow.\n\n" +
      "For the official Comfy template gallery use the official Comfy MCP's `get_template`; ids from " +
      "that gallery are not resolvable here.",
    schema: getTemplateSchema,
    requiresConnection: true,
    annotations: {
      title: "Get Workflow from User Snippet",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) => {
      const { client } = await ensureConnected();
      // Not-found and cannot-build are ToolErrors now; defineTool surfaces
      // them with their hints. This used to be a success carrying an `error`
      // field, which the caller could not distinguish from a real result.
      return dataResult(
        await getTemplate(client, input),
        "This workflow is very large; comfyui_search_user_snippets has smaller ones."
      );
    },
  });

  defineTool(server, {
    name: "save_user_snippet",
    description:
      "Save a workflow to this user's own snippet library - stored on this machine and searchable " +
      "later with comfyui_search_user_snippets. Name it for its purpose " +
      "('portrait_lighting_studio', 'product_photo_white_bg'), not its ordering.\n\n" +
      "This is a personal library. Nothing here is published, and it is unrelated to the official " +
      "Comfy template gallery.",
    schema: saveTemplateSchema,
    requiresConnection: false,
    annotations: {
      title: "Save Workflow to User Snippets",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    handler: (input) => dataResult(saveCustomTemplate(input)),
  });

  defineTool(server, {
    name: "delete_user_snippet",
    description:
      "Delete one of this user's saved snippets by id. Built-in starter workflows cannot be deleted " +
      "and will report so.",
    schema: deleteTemplateSchema,
    requiresConnection: false,
    annotations: {
      title: "Delete User Snippet",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: (input) => dataResult(deleteCustomTemplate(input)),
  });

  defineTool(server, {
    name: "plan_iteration",
    description:
      "Given the model you want the FINAL image on, return a two-stage plan: a cheap draft stage for " +
      "farming prompts and seeds, then the final render, each with its own steps/CFG/sampler. Call this " +
      "before starting a batch - iterating on a 20-step model when a 4-step draft path is installed " +
      "wastes most of the time budget.\n\n" +
      "The field that matters is 'seedCarryOver'. A distill LoRA over the same base weights gives " +
      "'composition': the draft previews the final image at the same seed, so seed farming pays off. A " +
      "separate distilled checkpoint (flux1-schnell against flux1-dev) gives 'prompt-only': different " +
      "weights, so the same seed renders a DIFFERENT image and only prompt wording transfers. 'none' " +
      "means nothing fast is installed, and the response names distill LoRAs to fetch through " +
      "the official Comfy MCP's download_model.\n\n" +
      "Returns: { draft?, final, seedCarryOver, note, suggestedDownloads? }.",
    schema: planIterationSchema,
    requiresConnection: false,
    annotations: {
      title: "Plan Draft-then-Final Iteration",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (input) => {
      // Connection is optional rather than required: the caller may pass the
      // model lists itself, and a plan built from those is just as correct
      // with ComfyUI stopped.
      const ctxValue = ctx();
      const plan = await planIteration(ctxValue.client ?? undefined, input);
      return formattedResult(
        input.response_format,
        plan,
        () => renderIterationPlan(plan),
        "Pass availableLoras/availableCheckpoints to plan against a specific set."
      );
    },
  });

  // === Tag discovery ===

  defineTool(server, {
    name: "search_tags",
    description:
      "Search the Danbooru tag vocabulary by substring, for the booru-tag models (illustrious, noobai, " +
      "pony, animagine, anima). Use it to CHECK a tag exists before putting it in a prompt, and to find " +
      "the real tag for an idea - an unrecognised tag contributes almost nothing on these models, so " +
      "'looking over her shoulder' is dead weight where 'looking_back' works.\n\n" +
      "Underscores and spaces are interchangeable in the query. Results are ranked exact, then prefix, " +
      "then substring, then alias, and within each by Danbooru post count - a high count means the tag " +
      "is well represented in training data.\n\n" +
      "Returns: { source, query, total, count, offset, tags, has_more, next_offset }. 'source' is " +
      "'autocomplete-plus' for the full vocabulary or 'builtin' for the ~150-tag curated fallback.",
    schema: searchTagsSchema,
    requiresConnection: false,
    annotations: {
      title: "Search Danbooru Tags",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) => {
      const index = await getTagIndex(tagTarget(ctx()));
      const result = searchTags(index, input);
      const { items, ...envelope } = paginate(result.matches, input.limit, input.offset);
      const page = { items, ...envelope };

      return formattedResult(
        input.response_format,
        { source: result.source, query: result.query, ...envelope, tags: items, ...(result.note ? { note: result.note } : {}) },
        () => renderTagSearch(result, page),
        "Narrow the query, raise 'minCount', or page with 'offset'."
      );
    },
  });

  defineTool(server, {
    name: "related_tags",
    description:
      "Given tags already in a prompt, find tags that commonly appear alongside them on Danbooru. Use " +
      "to fill out a booru prompt with vocabulary that actually co-occurs, rather than guessing.\n\n" +
      "With several input tags, results are ranked first by how many of them a tag co-occurs with, then " +
      "by total co-occurrence - so the suggestions fit the whole prompt instead of just its most common " +
      "tag.\n\n" +
      "Needs ComfyUI-Autocomplete-Plus installed for its co-occurrence data; without it this reports " +
      "that and the built-in vocabulary is all comfyui_search_tags can offer.",
    schema: relatedTagsSchema,
    requiresConnection: false,
    annotations: {
      title: "Find Related Tags",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) => {
      const index = await getTagIndex(tagTarget(ctx()));
      const result = relatedTags(index, input);
      const { items, ...envelope } = paginate(result.related, input.limit, input.offset);
      const page = { items, ...envelope };

      return formattedResult(
        input.response_format,
        {
          source: result.source,
          tags: result.tags,
          ...(result.unknown.length ? { unknown: result.unknown } : {}),
          ...envelope,
          related: items,
          ...(result.note ? { note: result.note } : {}),
        },
        () => renderRelatedTags(result, page),
        "Give fewer input tags, or page with 'offset'."
      );
    },
  });

  defineTool(server, {
    name: "get_prompting_guide",
    description:
      "Get prompting best practices for a model architecture. These differ substantially - Flux and SD3 " +
      "want natural language and ignore negative prompts, SD1.5 wants keyword lists and depends on them, " +
      "and the booru-tag anime models (illustrious, noobai, pony, animagine, anima) want a fixed tag " +
      "vocabulary in a specific ORDER, which is close to the opposite of the SDXL advice.\n\n" +
      "Progressive: 'all' returns a one-table index of every guide, a modelType returns that guide's " +
      "overview, and section/detail fetch the rest. Sections are overview, structure (the tag order), " +
      "tags (quality/rating tokens), tips, mistakes, starters (paste-ready prompts) and models " +
      "(Hugging Face cards). Take the overview first and ask for a section only when you need it.",
    schema: z
      .object({
        // A free string, validated against the guides that actually exist,
        // rather than a hand-written enum. The enum listed four values while
        // eleven guides shipped, so asking for the qwen or cascade guide -
        // which other tools now recommend by name - was rejected before the
        // handler ever ran. Unknown values get an error naming every option.
        modelType: z
          .string()
          .optional()
          .default("all")
          .describe(
            `Which architecture's guide to return: ${Object.keys(PROMPTING_GUIDES).join(", ")}, ` +
              "or a raw model filename. 'all' returns the index of every guide."
          ),
        detail: z
          .enum(["overview", "full"])
          .optional()
          .default("overview")
          .describe(
            "'overview' (default) returns style, settings and the prompt order, then names the " +
              "sections it withheld. 'full' returns the entire guide. Ignored when modelType is 'all'."
          ),
        section: z
          .enum(GUIDE_SECTIONS)
          .optional()
          .describe(
            `Return only this section: ${GUIDE_SECTIONS.join(", ")}. Overrides 'detail'.`
          ),
      })
      .strict(),
    requiresConnection: false,
    annotations: {
      title: "Get Prompting Guide",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: (input) => {
      if (input.modelType === "all") {
        // The index is a table of every guide, not every guide concatenated,
        // so there is nothing left to narrow and no hint to give.
        return textResult(getComprehensiveGuide());
      }

      const guide = getPromptingGuide(input.modelType);
      if (!guide) {
        // Two different failures. The architecture may be recognised and
        // simply have no guide written yet, which is worth saying - listing
        // the available keys implies the caller named something invalid.
        const spec = architectureFor(input.modelType);
        if (spec) {
          // Unreachable while every row carries a guide, which a test
          // enforces - but it is the guard for the row that forgets one.
          const closest =
            spec.workflow === "flux"
              ? "flux"
              : spec.workflow === "unet_clip"
                ? "qwen"
                : "sdxl";
          return errorResult(
            `No prompting guide for ${spec.displayName} yet.`,
            `It uses the ${spec.workflow} workflow shape, so comfyui_get_prompting_guide('${closest}') is the closest fit. ` +
              `${spec.advice}`
          );
        }
        return errorResult(
          `Unknown model type: ${input.modelType}.`,
          `Available: ${Object.keys(PROMPTING_GUIDES).join(", ")}. A model filename works too.`
        );
      }
      // section wins over detail; detail:"full" means every section, which
      // formatPromptingGuide renders when given no list at all.
      const sections = input.section
        ? [input.section]
        : input.detail === "full"
          ? undefined
          : (["overview"] as GuideSection[]);

      return textResult(
        formatPromptingGuide(guide, sections),
        `Ask for one section instead: ${sectionsPresent(guide).join(", ")}.`
      );
    },
  });
}
