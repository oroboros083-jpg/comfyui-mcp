// === Template Search System ===

import { z } from "zod";
import {
  paginate,
  paginationFields,
  responseFormatField,
  PageEnvelope,
} from "../../utils/response.js";
import { renderListing } from "../../utils/render.js";
import { DEFAULT_PAGE_SIZE } from "../../constants.js";
import {
  BUILTIN_TEMPLATES,
  buildFromTemplate,
  getTemplateById,
  WorkflowTemplate,
} from "../../workflows/builder.js";
import { ComfyUIClient } from "../../client/comfyui.js";
import { ToolError } from "../../utils/errors.js";
import {
  saveTemplate as dbSaveTemplate,
  listTemplates as dbListTemplates,
  searchTemplatesInDb,
  deleteTemplate as dbDeleteTemplate,
  getTemplateById as dbGetTemplateById,
  CustomTemplate,
  incrementTemplateUseCount,
} from "../../db/index.js";

export const searchTemplatesSchema = z.object({
  modelType: z
    // `qwen` and `anima` are here because they have built-in templates of
    // their own: their single-encoder graph is a different shape from Flux's,
    // so they are not reachable through the `flux` filter.
    .enum(["sd15", "sdxl", "sd3", "flux", "qwen", "anima", "any"])
    .optional()
    .describe("Filter by model architecture"),
  taskType: z
    .enum(["txt2img", "img2img", "inpaint", "outpaint", "upscale", "controlnet", "video", "audio", "any"])
    .optional()
    .describe("Filter by task type"),
  category: z
    .string()
    .optional()
    .describe("Filter by category (e.g., 'basics', 'flux', 'controlnet', 'lora', 'custom')"),
  query: z
    .string()
    .optional()
    .describe("Free text search across workflow names and descriptions"),
  includeBuiltIn: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include built-in workflow templates"),
  includeCustom: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include custom saved templates from the database"),
  ...paginationFields,
  response_format: responseFormatField,
}).strict();

export type SearchTemplatesInput = z.infer<typeof searchTemplatesSchema>;

/**
 * One search hit. Carries only what is needed to pick a template - the
 * parameters, default settings and workflow JSON come back from get_template
 * for the id actually chosen.
 */
export interface TemplateSearchRow {
  source: "builtin" | "custom";
  id: string;
  name: string;
  description: string;
  modelType?: string;
  taskType?: string;
  category?: string;
  parameterCount?: number;
  useCount?: number;
}

export type SearchTemplatesResult = PageEnvelope & {
  query: SearchTemplatesInput;
  results: TemplateSearchRow[];
  hint: string;
};

interface TemplateMatch {
  source: "builtin" | "custom";
  id: string;
  name: string;
  description: string;
  modelType?: string;
  taskType?: string;
  category: string;
  parameters?: WorkflowTemplate["parameters"] | Array<{ name: string; type: string; required: boolean; default?: unknown; description: string }>;
  defaultSettings?: WorkflowTemplate["defaultSettings"] | Record<string, unknown>;
  requiredNodes?: string[];
  fetchCommand?: string;
  useCount?: number;
  tags?: string[];
}

function matchesTemplateFilters(template: WorkflowTemplate, input: SearchTemplatesInput): boolean {
  if (input.modelType && input.modelType !== "any" && template.modelType !== input.modelType && template.modelType !== "any") {
    return false;
  }
  if (input.taskType && input.taskType !== "any" && template.taskType !== input.taskType) {
    return false;
  }
  if (input.category && !template.category.toLowerCase().includes(input.category.toLowerCase())) {
    return false;
  }
  if (input.query) {
    const queryLower = input.query.toLowerCase();
    const matches =
      template.name.toLowerCase().includes(queryLower) ||
      template.description.toLowerCase().includes(queryLower) ||
      template.id.toLowerCase().includes(queryLower);
    if (!matches) return false;
  }
  return true;
}

function matchesCustomTemplateFilters(template: CustomTemplate, input: SearchTemplatesInput): boolean {
  if (input.modelType && input.modelType !== "any" && template.modelType !== input.modelType && template.modelType !== "any") {
    return false;
  }
  if (input.taskType && input.taskType !== "any" && template.taskType !== input.taskType) {
    return false;
  }
  if (input.category && !template.category.toLowerCase().includes(input.category.toLowerCase())) {
    return false;
  }
  if (input.query) {
    const queryLower = input.query.toLowerCase();
    const matches =
      template.name.toLowerCase().includes(queryLower) ||
      template.description.toLowerCase().includes(queryLower) ||
      template.id.toLowerCase().includes(queryLower) ||
      template.tags.some((t) => t.toLowerCase().includes(queryLower));
    if (!matches) return false;
  }
  return true;
}

export function searchTemplates(input: SearchTemplatesInput): SearchTemplatesResult {
  const results: TemplateMatch[] = [];

  // Search custom templates first (user's saved templates take priority)
  if (input.includeCustom !== false) {
    try {
      const customTemplates = input.query
        ? searchTemplatesInDb(input.query, 100)
        : dbListTemplates({
            modelType: input.modelType,
            taskType: input.taskType,
            category: input.category,
            limit: 100,
          });

      for (const template of customTemplates) {
        if (matchesCustomTemplateFilters(template, input)) {
          results.push({
            source: "custom",
            id: template.id,
            name: template.name,
            description: template.description,
            modelType: template.modelType,
            taskType: template.taskType,
            category: template.category,
            parameters: template.parameters,
            defaultSettings: template.defaultSettings,
            requiredNodes: template.requiredNodes,
            useCount: template.useCount,
            tags: template.tags,
          });
        }
      }
    } catch {
      // Database not available, continue without custom templates
    }
  }

  // Search built-in templates
  if (input.includeBuiltIn !== false) {
    for (const template of BUILTIN_TEMPLATES) {
      if (matchesTemplateFilters(template, input)) {
        results.push({
          source: "builtin",
          id: template.id,
          name: template.name,
          description: template.description,
          modelType: template.modelType,
          taskType: template.taskType,
          category: template.category,
          parameters: template.parameters,
          defaultSettings: template.defaultSettings,
          requiredNodes: template.requiredNodes,
        });
      }
    }
  }

  const page = paginate(results, input.limit ?? DEFAULT_PAGE_SIZE, input.offset ?? 0);

  // A search result only has to carry enough to pick one. The full parameter
  // list, default settings, required nodes and model download URLs all come
  // back from get_template for the id the agent actually chooses - carrying
  // them for 25 candidates costs several times more than the choice is worth.
  const slim = page.items.map((r) => ({
    source: r.source,
    id: r.id,
    name: r.name,
    description: r.description,
    ...(r.modelType ? { modelType: r.modelType } : {}),
    ...(r.taskType ? { taskType: r.taskType } : {}),
    category: r.category,
    ...(r.parameters?.length ? { parameterCount: r.parameters.length } : {}),
    ...(r.useCount !== undefined ? { useCount: r.useCount } : {}),
  }));

  const { items: _items, ...envelope } = page;

  return {
    query: input,
    ...envelope,
    results: slim,
    hint: "Call comfyui_get_user_snippet with a result's id for its parameters, default settings and runnable workflow JSON.",
  };
}

export function renderTemplateSearch(result: SearchTemplatesResult): string {
  const filters = [
    result.query.query ? `'${result.query.query}'` : null,
    result.query.modelType && result.query.modelType !== "any" ? result.query.modelType : null,
    result.query.taskType && result.query.taskType !== "any" ? result.query.taskType : null,
    result.query.category ?? null,
  ].filter(Boolean);

  return renderListing({
    title: filters.length ? `Templates - ${filters.join(", ")}` : "Templates",
    rows: result.results.map((r) => {
      const badges = [r.modelType, r.taskType, r.category].filter(Boolean).join("/");
      return `- \`${r.id}\` **${r.name}** _(${r.source}${badges ? `; ${badges}` : ""})_ - ${r.description}`;
    }),
    page: result,
    empty:
      "No templates match. Widen the filters, or call comfyui_recommend_workflow to browse the documented workflows.",
    next: result.hint,
  });
}

// === Get Template Tool ===

export const getTemplateSchema = z.object({
  templateId: z
    .string()
    .describe("The template ID (from comfyui_search_user_snippets results)"),
  parameters: z
    .record(z.unknown())
    .optional()
    .describe("Parameters for the template (e.g., { prompt: 'a cat', width: 1024 })"),
}).strict();

export type GetTemplateInput = z.infer<typeof getTemplateSchema>;

/**
 * A template resolved to runnable workflow JSON.
 *
 * A declared interface rather than a JSON string: a tool that returns a string
 * cannot populate structuredContent, and a renderer cannot be written over one
 * without casting the typing away.
 */
export interface GetTemplateResult {
  templateId: string;
  templateName: string;
  source: "builtin" | "custom";
  appliedParameters: Record<string, unknown>;
  defaultSettings: unknown;
  workflow: Record<string, unknown>;
  useCount?: number;
  usage: string;
}

/** Raised when nothing - built-in or custom - answers to the id. */
export class TemplateNotFoundError extends ToolError {
  constructor(templateId: string) {
    super(
      `Template '${templateId}' not found`,
      `Call comfyui_search_user_snippets to find one. The built-in ids are: ${BUILTIN_TEMPLATES.map(
        (t) => t.id
      ).join(", ")}.`
    );
  }
}

export async function getTemplate(
  client: ComfyUIClient,
  input: GetTemplateInput
): Promise<GetTemplateResult> {
  // First check built-in templates
  const builtInTemplate = getTemplateById(input.templateId);

  if (builtInTemplate) {
    // Build the workflow from the template. buildFromTemplate throws a
    // ToolError of its own when the instance has no model the template can
    // use, which says which model to install; that is more useful than
    // anything this layer could add, so it is left to propagate.
    const objectInfo = await client.getObjectInfo();
    const workflow = buildFromTemplate(input.templateId, input.parameters || {}, objectInfo);

    if (!workflow) {
      // A built-in template with no builder branch. Reported as a failure
      // rather than a success carrying an `error` field, so the caller can
      // tell the two apart.
      throw new ToolError(
        `Template '${input.templateId}' is listed but cannot be built.`,
        "This is a gap in the server, not in your request. comfyui_search_user_snippets lists the others, and comfyui_recommend_workflow has documented workflows that need no builder."
      );
    }

    return {
      templateId: input.templateId,
      templateName: builtInTemplate.name,
      source: "builtin",
      appliedParameters: input.parameters || {},
      defaultSettings: builtInTemplate.defaultSettings,
      workflow,
      usage: "Pass the 'workflow' object to comfyui_run_workflow() to execute it",
    };
  }

  // Check custom templates in database
  let customTemplate;
  try {
    customTemplate = dbGetTemplateById(input.templateId);
  } catch {
    // Database not available
  }

  if (customTemplate) {
    // Increment use count
    incrementTemplateUseCount(input.templateId);

    // Apply parameters to the workflow
    let workflow = customTemplate.workflow;

    // If parameters provided, try to apply them to CLIPTextEncode nodes
    if (input.parameters) {
      workflow = applyParametersToWorkflow(workflow, input.parameters);
    }

    return {
      templateId: input.templateId,
      templateName: customTemplate.name,
      source: "custom",
      appliedParameters: input.parameters || {},
      defaultSettings: customTemplate.defaultSettings,
      workflow,
      useCount: customTemplate.useCount + 1,
      usage: "Pass the 'workflow' object to comfyui_run_workflow() to execute it",
    };
  }

  throw new TemplateNotFoundError(input.templateId);
}

/**
 * Apply parameters to a workflow by replacing values in CLIPTextEncode nodes
 */
function applyParametersToWorkflow(
  workflow: Record<string, unknown>,
  params: Record<string, unknown>
): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(workflow)); // Deep clone

  // "Apply the prompt to the first CLIPTextEncode only" used to be enforced
  // with `delete params.prompt`, which mutated the caller's object - and
  // get_template reports that same object back as appliedParameters, so the
  // response said the prompt had not been applied when it had. A local flag
  // keeps the once-only rule without touching the input.
  let promptApplied = false;

  for (const node of Object.values(result)) {
    const nodeObj = node as Record<string, unknown>;
    if (nodeObj.class_type === "CLIPTextEncode" && nodeObj.inputs) {
      const inputs = nodeObj.inputs as Record<string, unknown>;
      // Apply prompt parameter to first CLIPTextEncode (positive)
      if (!promptApplied && params.prompt !== undefined && inputs.text !== undefined) {
        inputs.text = params.prompt;
        promptApplied = true;
      }
    }
    // Apply other parameters (width, height, steps, etc.)
    if (nodeObj.inputs) {
      const inputs = nodeObj.inputs as Record<string, unknown>;
      for (const [key, value] of Object.entries(params)) {
        if (key === "prompt") continue; // handled above, once
        if (key in inputs) {
          inputs[key] = value;
        }
      }
    }
  }

  return result;
}

// === Save Template Tool ===

export const saveTemplateSchema = z.object({
  id: z
    .string()
    .describe(
      "Template ID (e.g., 'my_flux_style', 'upscale_4x'). An id that already " +
        "exists is OVERWRITTEN in place, so pass a fresh one unless replacing " +
        "that snippet is the intent."
    ),
  name: z
    .string()
    .describe("Human-readable template name"),
  description: z
    .string()
    .describe("Description of what this template does"),
  workflow: z
    .record(z.unknown())
    .describe("The ComfyUI workflow JSON (API format)"),
  modelType: z
    .enum(["sd15", "sdxl", "sd3", "flux", "any"])
    .optional()
    .default("any")
    .describe("Model architecture this template is designed for"),
  taskType: z
    .enum(["txt2img", "img2img", "inpaint", "controlnet", "upscale", "video", "audio"])
    .optional()
    .default("txt2img")
    .describe("Type of task this template performs"),
  category: z
    .string()
    .optional()
    .default("custom")
    .describe("Category for organizing templates"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Tags for searching and filtering"),
  defaultSettings: z
    .record(z.unknown())
    .optional()
    .describe("Default settings (steps, cfg, width, height, etc.)"),
}).strict();

export type SaveTemplateInput = z.infer<typeof saveTemplateSchema>;

/** Raised when SQLite refuses the write. */
export class TemplateSaveError extends ToolError {
  constructor(cause: unknown) {
    super(
      `Failed to save template: ${cause instanceof Error ? cause.message : String(cause)}`,
      "Check the id is a plain identifier and the workflow is a JSON object. comfyui_search_user_snippets lists what is already stored."
    );
  }
}

/** Raised when SQLite refuses the delete. Separate, so the message fits. */
export class TemplateDeleteError extends ToolError {
  constructor(templateId: string, cause: unknown) {
    super(
      `Failed to delete template '${templateId}': ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      "The store may be locked by another process. comfyui_search_user_snippets shows whether it is still there."
    );
  }
}

/** Raised when the id names a built-in, which is not the caller's to delete. */
export class BuiltinTemplateError extends ToolError {
  constructor(templateId: string) {
    super(
      `'${templateId}' is a built-in template and cannot be deleted`,
      "Only templates saved with comfyui_save_user_snippet can be deleted. comfyui_search_user_snippets shows which are custom."
    );
  }
}

/** One saved template, as reported back to the caller. */
export interface SaveTemplateResult {
  template: {
    id: string;
    name: string;
    description: string;
    modelType: string;
    taskType: string;
    category: string;
    tags?: string[];
    createdAt: string;
    updatedAt: string;
  };
  usage: string;
}

export function saveCustomTemplate(input: SaveTemplateInput): SaveTemplateResult {
  let saved;
  try {
    saved = dbSaveTemplate({
      id: input.id,
      name: input.name,
      description: input.description,
      workflow: input.workflow as Record<string, unknown>,
      modelType: input.modelType,
      taskType: input.taskType,
      category: input.category,
      tags: input.tags,
      defaultSettings: input.defaultSettings as Record<string, unknown>,
    });
  } catch (cause) {
    // A failure has to be distinguishable from a success. This used to return
    // {"success":false,...} through textResult, which never sets isError, so
    // the caller could not tell a refused save from a completed one.
    throw new TemplateSaveError(cause);
  }

  return {
    template: {
      id: saved.id,
      name: saved.name,
      description: saved.description,
      modelType: saved.modelType,
      taskType: saved.taskType,
      category: saved.category,
      tags: saved.tags,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    },
    usage: `Use comfyui_get_user_snippet({ templateId: "${saved.id}" }) to retrieve this workflow`,
  };
}

// === Delete Template Tool ===

export const deleteTemplateSchema = z.object({
  id: z
    .string()
    .describe("The template ID to delete"),
}).strict();

export type DeleteTemplateInput = z.infer<typeof deleteTemplateSchema>;

/** What a successful delete reports. */
export interface DeleteTemplateResult {
  id: string;
  deleted: true;
  message: string;
}

export function deleteCustomTemplate(input: DeleteTemplateInput): DeleteTemplateResult {
  // Deleting a built-in is not something the caller can do, so it is a
  // failure rather than a success carrying success:false.
  if (BUILTIN_TEMPLATES.some((t) => t.id === input.id)) {
    throw new BuiltinTemplateError(input.id);
  }

  let deleted: boolean;
  try {
    deleted = dbDeleteTemplate(input.id);
  } catch (cause) {
    throw new TemplateDeleteError(input.id, cause);
  }

  // A missing id is a failure, matching get_template for the same
  // condition: the common cause is a wrong id, and the caller needs to be
  // told so rather than shown a success. idempotentHint stays true - the
  // hint is about effect on the store, which a repeat call does not change.
  if (!deleted) throw new TemplateNotFoundError(input.id);

  return { id: input.id, deleted: true, message: `Template '${input.id}' deleted` };
}
