/**
 * The workflow library: documentation examples, saved templates, model
 * download URLs, and the prompting guides. All available without a live
 * ComfyUI except comfyui_get_template, which validates against installed nodes.
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
  paginatedOutputSchema,
} from "../../utils/response.js";
import { safeFetch } from "../../utils/safe-fetch.js";
import {
  listExamplesSchema,
  listExamples,
  renderExamples,
  getExampleWorkflowSchema,
  getExampleWorkflow,
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
  getDownloadUrlSchema,
  getDownloadUrl,
} from "../../tools/examples/index.js";
import {
  getPromptingGuide,
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

export function registerLibraryTools(server: McpServer): void {
  defineTool(server, {
    name: "list_examples",
    description:
      "List official ComfyUI example workflows from the documentation. Check here before building a " +
      "workflow from scratch - these are tested templates for txt2img, img2img, ControlNet, LoRA, " +
      "video, audio and more. Paginated; use 'search'/'category' to narrow and detail:'names' to " +
      "survey cheaply, then comfyui_get_example_workflow to fetch one.\n\n" +
      "Returns: { total, count, offset, categories, examples, has_more, next_offset }",
    schema: listExamplesSchema,
    requiresConnection: false,
    annotations: {
      title: "List Example Workflows",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputSchema: paginatedOutputSchema("examples"),
    handler: (input) => {
      const result = listExamples(input);
      return formattedResult(
        input.response_format,
        result,
        () => renderExamples(result, input),
        "Narrow with 'search'/'category', lower 'detail', or page with 'offset'."
      );
    },
  });

  defineTool(server, {
    name: "get_example_workflow",
    description:
      "Fetch one example workflow, extracting the embedded JSON from the documentation image. Returns " +
      "runnable API-format JSON that can go straight to comfyui_run_workflow, plus the models it needs. " +
      "Use as a starting point and edit prompts, models and parameters rather than building from zero.",
    schema: getExampleWorkflowSchema,
    requiresConnection: false,
    annotations: {
      title: "Get Example Workflow",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) =>
      textResult(
        await getExampleWorkflow(input),
        "This workflow is unusually large; fetch it from the documentation URL instead."
      ),
  });

  defineTool(server, {
    name: "extract_workflow",
    description:
      "Extract the workflow JSON embedded in a ComfyUI-generated PNG. Accepts a local file path or a " +
      "URL. Returns API-format JSON ready for comfyui_run_workflow, plus any Note nodes found in the " +
      "graph. Local files must be .png and under 50MB.\n\n" +
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
        imageData = await response.arrayBuffer();
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
    name: "search_templates",
    description:
      "Search workflow templates by model type, task type, category or free text, across built-in " +
      "workflows, documentation examples, and templates this user saved. Paginated. Results carry only " +
      "what is needed to choose one - call comfyui_get_template with an id for parameters, settings " +
      "and runnable JSON.\n\n" +
      "Returns: { query, total, count, offset, results, has_more, next_offset }",
    schema: searchTemplatesSchema,
    requiresConnection: false,
    annotations: {
      title: "Search Workflow Templates",
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
    name: "get_template",
    description:
      "Generate runnable workflow JSON from a template, filling in the parameters given. Returns a " +
      "complete workflow for comfyui_run_workflow. Works with built-in and custom templates, and " +
      "validates against the nodes actually installed.",
    schema: getTemplateSchema,
    requiresConnection: true,
    annotations: {
      title: "Get Workflow from Template",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) => {
      const { client } = await ensureConnected();
      return textResult(await getTemplate(client, input));
    },
  });

  defineTool(server, {
    name: "save_template",
    description:
      "Save a workflow as a reusable template, stored persistently and searchable later. Name it for " +
      "its purpose ('portrait_lighting_studio', 'product_photo_white_bg'), not its ordering.",
    schema: saveTemplateSchema,
    requiresConnection: false,
    annotations: {
      title: "Save Custom Template",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    handler: (input) => textResult(saveCustomTemplate(input)),
  });

  defineTool(server, {
    name: "delete_template",
    description:
      "Delete a custom saved template by id. Built-in templates and documentation examples cannot be " +
      "deleted and will report so.",
    schema: deleteTemplateSchema,
    requiresConnection: false,
    annotations: {
      title: "Delete Custom Template",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: (input) => textResult(deleteCustomTemplate(input)),
  });

  defineTool(server, {
    name: "get_download_url",
    description:
      "Get the download URL for a model by name, with its destination folder and a ready-to-run wget " +
      "command. Use when comfyui_list_models shows a model is missing.",
    schema: getDownloadUrlSchema,
    requiresConnection: false,
    annotations: {
      title: "Get Model Download URL",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: (input) => textResult(getDownloadUrl(input)),
  });

  defineTool(server, {
    name: "get_prompting_guide",
    description:
      "Get prompting best practices for a model architecture. These differ substantially - Flux and SD3 " +
      "want natural language and ignore negative prompts, while SD1.5 wants keyword lists and depends " +
      "on them. Ask for one architecture rather than 'all' unless you actually need the comparison.",
    schema: z
      .object({
        modelType: z
          .enum(["sd15", "sdxl", "sd3", "flux", "all"])
          .optional()
          .default("all")
          .describe("Which architecture's guide to return; 'all' returns the full comparison"),
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
        return textResult(
          getComprehensiveGuide(),
          "Request a single modelType instead of 'all'."
        );
      }

      const guide = getPromptingGuide(input.modelType);
      if (!guide) {
        return errorResult(
          `Unknown model type: ${input.modelType}.`,
          `Available: ${Object.keys(PROMPTING_GUIDES).join(", ")}`
        );
      }
      return textResult(formatPromptingGuide(guide));
    },
  });
}
