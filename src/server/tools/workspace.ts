/**
 * The agent's own workspace: persistent notes, learned user preferences, and
 * the SVG/font tools for building precise input images.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { defineTool, noArgs } from "../register.js";
import { ensureConnected } from "../connection.js";
import {
  dataResult,
  errorResult,
  paginate,
  paginationFields,
} from "../../utils/response.js";
import * as db from "../../db/index.js";
import { renderSvgSchema, renderSvg } from "../../tools/svg.js";
import {
  downloadFontSchema,
  downloadFont,
  listFontsSchema,
  listFonts,
  RECOMMENDED_MAP_FONTS,
} from "../../tools/fonts.js";

export function registerWorkspaceTools(server: McpServer): void {
  // === Notes ===

  defineTool(server, {
    name: "save_note",
    description:
      "Save something learned while generating - a model's behaviour, a prompt that worked, a workflow " +
      "quirk. Notes persist across sessions and are searchable, so record findings worth not " +
      "rediscovering. Group related notes under a consistent 'topic'.",
    schema: z
      .object({
        topic: z
          .string()
          .min(1)
          .describe("Category for the note, e.g. 'flux-models', 'prompting-tips', 'workflow-patterns'"),
        content: z.string().min(1).describe("The note itself"),
        tags: z.array(z.string()).optional().describe("Optional tags for retrieval"),
      })
      .strict(),
    requiresConnection: false,
    annotations: {
      title: "Save Note",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    handler: (input) => {
      const note = db.saveNote(input.topic, input.content, input.tags || []);
      return dataResult({
        saved: true,
        id: note.id,
        topic: note.topic,
        tags: note.tags,
        createdAt: note.createdAt,
      });
    },
  });

  defineTool(server, {
    name: "get_notes",
    description:
      "Retrieve saved notes, newest first, optionally filtered to one topic. Paginated. Use " +
      "comfyui_search_notes for full-text search and comfyui_list_topics to see what topics exist.\n\n" +
      "Returns: { total, count, offset, notes, has_more, next_offset }",
    schema: z
      .object({
        topic: z.string().optional().describe("Only return notes under this topic"),
        ...paginationFields,
      })
      .strict(),
    requiresConnection: false,
    annotations: {
      title: "Get Notes",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: (input) => {
      // getNotesByTopic has no limit of its own; page both paths here so the
      // response size does not depend on which branch was taken.
      const notes = input.topic
        ? db.getNotesByTopic(input.topic)
        : db.getAllNotes(1000);
      const page = paginate(notes, input.limit, input.offset);

      return dataResult({
        total: page.total,
        count: page.count,
        offset: page.offset,
        notes: page.items,
        has_more: page.has_more,
        ...(page.next_offset !== undefined ? { next_offset: page.next_offset } : {}),
      });
    },
  });

  defineTool(server, {
    name: "search_notes",
    description:
      "Full-text search across note topics, content and tags. Paginated.\n\n" +
      "Returns: { query, total, count, offset, notes, has_more, next_offset }",
    schema: z
      .object({
        query: z.string().min(1).describe("Search terms"),
        ...paginationFields,
      })
      .strict(),
    requiresConnection: false,
    annotations: {
      title: "Search Notes",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: (input) => {
      const notes = db.searchNotes(input.query, 1000);
      const page = paginate(notes, input.limit, input.offset);

      return dataResult({
        query: input.query,
        total: page.total,
        count: page.count,
        offset: page.offset,
        notes: page.items,
        has_more: page.has_more,
        ...(page.next_offset !== undefined ? { next_offset: page.next_offset } : {}),
      });
    },
  });

  defineTool(server, {
    name: "delete_note",
    description: "Delete a note by its numeric id, as returned by comfyui_get_notes.",
    schema: z.object({ id: z.number().int().describe("The note id to delete") }).strict(),
    requiresConnection: false,
    annotations: {
      title: "Delete Note",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: (input) => {
      if (!db.deleteNote(input.id)) {
        return errorResult(
          `Note not found: ${input.id}`,
          "Use comfyui_get_notes to list note ids."
        );
      }
      return dataResult({ deleted: true, id: input.id });
    },
  });

  defineTool(server, {
    name: "list_topics",
    description:
      "List every topic that has notes, with a count for each. Cheap way to see what has been recorded " +
      "before searching.",
    schema: noArgs,
    requiresConnection: false,
    annotations: {
      title: "List Note Topics",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: () => {
      const topics = db.getTopics();
      return dataResult({ count: topics.length, topics });
    },
  });

  // === Learned preferences ===

  defineTool(server, {
    name: "get_user_preferences",
    description:
      "Get this user's habits, derived from analysing the workflow metadata in their existing ComfyUI " +
      "output: the workflows they actually use (as runnable templates), the models they favour, and " +
      "their usual settings. Use to match their established style instead of guessing.\n\n" +
      "Full workflow JSON is large, so it is off by default - set includeWorkflowJson:true when you " +
      "intend to run one, after picking it from the summaries.",
    schema: z
      .object({
        includeWorkflows: z
          .boolean()
          .optional()
          .default(true)
          .describe("Include the workflow templates they use"),
        includeModels: z
          .boolean()
          .optional()
          .default(true)
          .describe("Include model usage statistics"),
        includeSettings: z
          .boolean()
          .optional()
          .default(true)
          .describe("Include their common generation settings"),
        includeWorkflowJson: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Include each template's full workflow JSON. Large - leave off until you have chosen one"
          ),
        workflowLimit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(10)
          .describe("Maximum workflow templates to return"),
        modelLimit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(20)
          .describe("Maximum models to return"),
      })
      .strict(),
    requiresConnection: true,
    annotations: {
      title: "Get User Preferences",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (input) => {
      const { capabilities } = await ensureConnected();
      const prefs = capabilities.userPreferences;

      if (!prefs) {
        return dataResult({
          available: false,
          reason:
            "No output history has been analysed - either no images with workflow metadata were found, or analysis has not run.",
          hint: "Generate some images first, then call comfyui_reconnect to re-analyse the output folder.",
        });
      }

      const result: Record<string, unknown> = {
        summary: {
          totalImagesAnalyzed: prefs.totalImagesAnalyzed,
          imagesWithWorkflows: prefs.imagesWithWorkflows,
          uniqueWorkflows: prefs.uniqueWorkflows,
          analyzedAt: prefs.analyzedAt,
        },
      };

      if (input.includeWorkflows) {
        result.workflowTemplates = prefs.workflowTemplates
          .slice(0, input.workflowLimit)
          .map((wf) => ({
            hash: wf.hash,
            description: wf.description,
            usageCount: wf.usageCount,
            lastUsed: wf.lastUsed,
            models: wf.models,
            samplePrompts: wf.samplePrompts.slice(0, 2),
            nodeCount: Object.keys(wf.workflow ?? {}).length,
            ...(input.includeWorkflowJson ? { workflow: wf.workflow } : {}),
          }));

        result.workflowHint = input.includeWorkflowJson
          ? "Pass a template's 'workflow' to comfyui_run_workflow, editing CLIPTextEncode nodes for the prompt."
          : "Pick one by hash, then call again with includeWorkflowJson:true and workflowLimit:1 to get its runnable JSON.";
      }

      if (input.includeModels) {
        result.frequentModels = prefs.modelUsage.slice(0, input.modelLimit);
      }
      if (input.includeSettings) {
        result.commonSettings = prefs.commonSettings;
      }

      return dataResult(
        result,
        "Lower 'workflowLimit', or leave includeWorkflowJson off."
      );
    },
  });

  // === SVG and fonts ===

  defineTool(server, {
    name: "render_svg",
    description:
      "Render SVG markup to PNG and upload it into ComfyUI's input folder, returning the filename to " +
      "use in a LoadImage node. Use to build precise base images - layouts, masks, text, diagrams - " +
      "for img2img and ControlNet workflows. Embed downloaded fonts via the 'fonts' parameter.",
    schema: renderSvgSchema,
    requiresConnection: true,
    annotations: {
      title: "Render SVG to PNG",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    handler: async (input) => {
      const result = await renderSvg(input);
      if (!result.success || !result.buffer || !result.filename) {
        return errorResult(
          result.error || "Failed to render SVG.",
          "Check the SVG markup is well-formed and has explicit width/height."
        );
      }

      const { client } = await ensureConnected();
      const uploaded = await client.uploadImage(result.buffer, result.filename, true);

      return dataResult({
        success: true,
        filename: uploaded.name,
        subfolder: uploaded.subfolder,
        type: uploaded.type,
        hint: `Use "${uploaded.name}" in a LoadImage node.`,
      });
    },
  });

  defineTool(server, {
    name: "download_font",
    description:
      "Download a font from Google Fonts or a direct URL for use in comfyui_render_svg. Fonts are " +
      "cached locally and embedded into rendered SVGs. Fantasy/map faces: Cinzel, Pirata One, " +
      "MedievalSharp, UnifrakturMaguntia, Almendra.",
    schema: downloadFontSchema,
    requiresConnection: false,
    annotations: {
      title: "Download Font",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) => {
      const result = await downloadFont(input);
      if (!result.success) {
        return errorResult(
          result.error ?? "Font download failed.",
          `Check the font name, or try one of: ${RECOMMENDED_MAP_FONTS.join(", ")}`
        );
      }
      return dataResult({
        ...result,
        hint: `Downloaded. Use in comfyui_render_svg with fonts: [{ name: "${result.font?.name}" }].`,
      });
    },
  });

  defineTool(server, {
    name: "list_fonts",
    description:
      "List fonts already downloaded and available to comfyui_render_svg. Use comfyui_download_font to " +
      "add more.",
    schema: listFontsSchema,
    requiresConnection: false,
    annotations: {
      title: "List Downloaded Fonts",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async () => {
      const result = await listFonts();
      return dataResult({ ...result, recommended: RECOMMENDED_MAP_FONTS });
    },
  });
}
