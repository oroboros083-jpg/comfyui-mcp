// === Template Search System ===

import { z } from "zod";
import { ExampleWorkflow, ModelDownload } from "./types.js";
import { EXAMPLE_WORKFLOWS } from "./data.js";
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
    .enum(["sd15", "sdxl", "sd3", "flux", "any"])
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
  includeExamples: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include example workflows from ComfyUI docs"),
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
  source: "builtin" | "example" | "custom";
  id: string;
  name: string;
  description: string;
  modelType?: string;
  taskType?: string;
  category?: string;
  parameterCount?: number;
  requiredModelCount?: number;
  useCount?: number;
}

export type SearchTemplatesResult = PageEnvelope & {
  query: SearchTemplatesInput;
  results: TemplateSearchRow[];
  hint: string;
};

interface TemplateMatch {
  source: "builtin" | "example" | "custom";
  id: string;
  name: string;
  description: string;
  modelType?: string;
  taskType?: string;
  category: string;
  parameters?: WorkflowTemplate["parameters"] | Array<{ name: string; type: string; required: boolean; default?: unknown; description: string }>;
  defaultSettings?: WorkflowTemplate["defaultSettings"] | Record<string, unknown>;
  requiredNodes?: string[];
  requiredModels?: ModelDownload[];
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

function matchesExampleFilters(example: ExampleWorkflow, input: SearchTemplatesInput): boolean {
  if (input.category && !example.category.toLowerCase().includes(input.category.toLowerCase())) {
    return false;
  }
  if (input.query) {
    const queryLower = input.query.toLowerCase();
    const matches =
      example.name.toLowerCase().includes(queryLower) ||
      example.description.toLowerCase().includes(queryLower) ||
      example.category.toLowerCase().includes(queryLower);
    if (!matches) return false;
  }
  // Model type filtering for examples - infer from category/name
  if (input.modelType && input.modelType !== "any") {
    const nameLower = example.name.toLowerCase();
    const categoryLower = example.category.toLowerCase();
    if (input.modelType === "flux" && !nameLower.includes("flux") && !categoryLower.includes("flux")) {
      return false;
    }
    if (input.modelType === "sdxl" && !nameLower.includes("sdxl") && !categoryLower.includes("sdxl")) {
      return false;
    }
    if (input.modelType === "sd3" && !nameLower.includes("sd3") && !categoryLower.includes("sd3")) {
      return false;
    }
  }
  // Task type filtering for examples - infer from category/name
  if (input.taskType && input.taskType !== "any") {
    const nameLower = example.name.toLowerCase();
    const categoryLower = example.category.toLowerCase();
    if (input.taskType === "inpaint" && !nameLower.includes("inpaint") && !categoryLower.includes("inpaint")) {
      return false;
    }
    if (input.taskType === "img2img" && !nameLower.includes("img2img") && !nameLower.includes("image-to-image")) {
      return false;
    }
    if (input.taskType === "controlnet" && !nameLower.includes("controlnet") && !categoryLower.includes("controlnet")) {
      return false;
    }
    if (input.taskType === "upscale" && !nameLower.includes("upscale") && !categoryLower.includes("upscale")) {
      return false;
    }
    if (input.taskType === "video" && !nameLower.includes("video") && !categoryLower.includes("video")) {
      return false;
    }
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

  // Search example workflows
  if (input.includeExamples !== false) {
    for (const example of EXAMPLE_WORKFLOWS) {
      if (matchesExampleFilters(example, input)) {
        results.push({
          source: "example",
          id: example.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
          name: example.name,
          description: example.description,
          category: example.category,
          requiredNodes: example.requiredNodes,
          requiredModels: example.requiredModels,
          fetchCommand: `comfyui_get_example_workflow({ name: "${example.name}" })`,
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
    ...(r.requiredModels?.length
      ? { requiredModelCount: r.requiredModels.length }
      : {}),
    ...(r.useCount !== undefined ? { useCount: r.useCount } : {}),
  }));

  const { items: _items, ...envelope } = page;

  return {
    query: input,
    ...envelope,
    results: slim,
    hint: "Call comfyui_get_template with a result's id for its parameters, default settings and runnable workflow JSON.",
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
      const needs = r.requiredModelCount ? ` _(needs ${r.requiredModelCount} model(s))_` : "";
      return `- \`${r.id}\` **${r.name}** _(${r.source}${badges ? `; ${badges}` : ""})_ - ${r.description}${needs}`;
    }),
    page: result,
    empty:
      "No templates match. Widen the filters, or call comfyui_list_examples to browse the documented workflows.",
    next: result.hint,
  });
}

// === Get Template Tool ===

export const getTemplateSchema = z.object({
  templateId: z
    .string()
    .describe("The template ID (from comfyui_search_templates results)"),
  parameters: z
    .record(z.unknown())
    .optional()
    .describe("Parameters for the template (e.g., { prompt: 'a cat', width: 1024 })"),
}).strict();

export type GetTemplateInput = z.infer<typeof getTemplateSchema>;

export async function getTemplate(
  client: ComfyUIClient,
  input: GetTemplateInput
): Promise<string> {
  // First check built-in templates
  const builtInTemplate = getTemplateById(input.templateId);

  if (builtInTemplate) {
    // Build the workflow from the template
    const objectInfo = await client.getObjectInfo();
    const workflow = buildFromTemplate(input.templateId, input.parameters || {}, objectInfo);

    if (!workflow) {
      return JSON.stringify({
        error: `Failed to build workflow from template '${input.templateId}'`,
      });
    }

    return JSON.stringify({
      templateId: input.templateId,
      templateName: builtInTemplate.name,
      source: "builtin",
      appliedParameters: input.parameters || {},
      defaultSettings: builtInTemplate.defaultSettings,
      workflow,
      usage: "Pass the 'workflow' object to comfyui_run_workflow() to execute it",
    });
  }

  // Check custom templates in database
  try {
    const customTemplate = dbGetTemplateById(input.templateId);
    if (customTemplate) {
      // Increment use count
      incrementTemplateUseCount(input.templateId);

      // Apply parameters to the workflow
      let workflow = customTemplate.workflow;

      // If parameters provided, try to apply them to CLIPTextEncode nodes
      if (input.parameters) {
        workflow = applyParametersToWorkflow(workflow, input.parameters);
      }

      return JSON.stringify({
        templateId: input.templateId,
        templateName: customTemplate.name,
        source: "custom",
        appliedParameters: input.parameters || {},
        defaultSettings: customTemplate.defaultSettings,
        workflow,
        useCount: customTemplate.useCount + 1,
        usage: "Pass the 'workflow' object to comfyui_run_workflow() to execute it",
      });
    }
  } catch {
    // Database not available
  }

  // Check if it's an example workflow name instead
  const example = EXAMPLE_WORKFLOWS.find(
    (e) => e.name.toLowerCase().replace(/[^a-z0-9]+/g, "_") === input.templateId
  );
  if (example) {
    return JSON.stringify({
      error: `'${input.templateId}' is an example workflow, not a template`,
      suggestion: `Use comfyui_get_example_workflow({ name: "${example.name}" }) to fetch the example workflow`,
    });
  }

  return JSON.stringify({
    error: `Template '${input.templateId}' not found`,
    availableBuiltIn: BUILTIN_TEMPLATES.map((t) => t.id),
    hint: "Use comfyui_search_templates to find available templates",
  });
}

/**
 * Apply parameters to a workflow by replacing values in CLIPTextEncode nodes
 */
function applyParametersToWorkflow(
  workflow: Record<string, unknown>,
  params: Record<string, unknown>
): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(workflow)); // Deep clone

  for (const node of Object.values(result)) {
    const nodeObj = node as Record<string, unknown>;
    if (nodeObj.class_type === "CLIPTextEncode" && nodeObj.inputs) {
      const inputs = nodeObj.inputs as Record<string, unknown>;
      // Apply prompt parameter to first CLIPTextEncode (positive)
      if (params.prompt !== undefined && inputs.text !== undefined) {
        inputs.text = params.prompt;
        delete params.prompt; // Only apply once
      }
    }
    // Apply other parameters (width, height, steps, etc.)
    if (nodeObj.inputs) {
      const inputs = nodeObj.inputs as Record<string, unknown>;
      for (const [key, value] of Object.entries(params)) {
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
    .describe("Unique template ID (e.g., 'my_flux_style', 'upscale_4x')"),
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

export function saveCustomTemplate(input: SaveTemplateInput): string {
  try {
    const saved = dbSaveTemplate({
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

    return JSON.stringify({
      success: true,
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
      usage: `Use comfyui_get_template({ templateId: "${saved.id}" }) to retrieve this workflow`,
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Failed to save template",
    });
  }
}

// === Delete Template Tool ===

export const deleteTemplateSchema = z.object({
  id: z
    .string()
    .describe("The template ID to delete"),
}).strict();

export type DeleteTemplateInput = z.infer<typeof deleteTemplateSchema>;

export function deleteCustomTemplate(input: DeleteTemplateInput): string {
  // Don't allow deleting built-in templates
  if (BUILTIN_TEMPLATES.some((t) => t.id === input.id)) {
    return JSON.stringify({
      success: false,
      error: "Cannot delete built-in templates",
    });
  }

  try {
    const deleted = dbDeleteTemplate(input.id);
    return JSON.stringify({
      success: deleted,
      message: deleted ? `Template '${input.id}' deleted` : `Template '${input.id}' not found`,
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete template",
    });
  }
}

