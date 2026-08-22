import { z } from "zod";
import { ExampleWorkflow } from "./types.js";
import { EXAMPLE_WORKFLOWS } from "./data.js";
import { safeFetch } from "../../utils/safe-fetch.js";
import {
  paginate,
  paginationFields,
  responseFormatField,
  jsonText,
  PageEnvelope,
} from "../../utils/response.js";
import { renderListing } from "../../utils/render.js";

// Refuse to even attempt parsing implausibly large "PNG" data. Without
// this, a URL-fetching caller (extract_workflow, fetchExampleWorkflow) that
// hits a malicious/misbehaving server with a huge response body would carry
// that entire body through TextDecoder + JSON.parse below.
const MAX_PNG_SIZE = 50 * 1024 * 1024; // 50MB - generous for a real PNG

// workflow/prompt metadata is normally KB-sized JSON; cap what we'll
// attempt to JSON.parse so a crafted chunk can't force a huge parse/alloc.
const MAX_TEXT_VALUE_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * Extract workflow JSON from PNG metadata
 * ComfyUI embeds workflow data in PNG tEXt chunks with key "workflow" or "prompt"
 */
export async function extractWorkflowFromPng(
  imageData: ArrayBuffer
): Promise<{ workflow?: Record<string, unknown>; prompt?: Record<string, unknown> } | null> {
  if (imageData.byteLength > MAX_PNG_SIZE) {
    return null;
  }

  const data = new Uint8Array(imageData);

  // PNG signature check
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (data[i] !== pngSignature[i]) {
      return null; // Not a PNG
    }
  }

  const result: { workflow?: Record<string, unknown>; prompt?: Record<string, unknown> } = {};

  // Parse PNG chunks. Every declared length is untrusted input from the
  // file itself, so it's validated against what's actually left in the
  // buffer before being used to slice - a corrupt or crafted file could
  // otherwise declare a length far past the end of the data.
  let offset = 8;
  while (offset + 8 <= data.length) {
    // Read chunk length (4 bytes, big-endian, unsigned)
    const length =
      ((data[offset] << 24) |
        (data[offset + 1] << 16) |
        (data[offset + 2] << 8) |
        data[offset + 3]) >>>
      0;
    offset += 4;

    // Read chunk type (4 bytes)
    const type = String.fromCharCode(
      data[offset],
      data[offset + 1],
      data[offset + 2],
      data[offset + 3]
    );
    offset += 4;

    // A declared length that runs past the end of the buffer means the
    // file is malformed or hostile - stop parsing rather than trusting it.
    if (length > data.length - offset) {
      break;
    }

    // Read chunk data
    const chunkData = data.slice(offset, offset + length);
    offset += length;

    // Skip CRC (4 bytes)
    offset += 4;

    // Check for tEXt or iTXt chunks
    if (type === "tEXt" || type === "iTXt") {
      // Find null separator between key and value
      let nullIndex = 0;
      for (let i = 0; i < chunkData.length; i++) {
        if (chunkData[i] === 0) {
          nullIndex = i;
          break;
        }
      }

      const key = new TextDecoder().decode(chunkData.slice(0, nullIndex));
      let value: string;

      if (type === "tEXt") {
        // tEXt: key\0value
        value = new TextDecoder().decode(chunkData.slice(nullIndex + 1));
      } else {
        // iTXt: key\0 flag method language\0 translated\0 text
        //
        // The compression flag and method are two *fixed* bytes, not
        // NUL-terminated fields, and both are normally zero - so counting
        // NULs from the keyword separator spends two of them on those bytes
        // and stops one field early, leaving a leading NUL on every value.
        // Skip the two bytes first, then two NUL-terminated strings.
        const flag = chunkData[nullIndex + 1];
        let valueStart = nullIndex + 3;
        let nullCount = 0;
        while (valueStart < chunkData.length && nullCount < 2) {
          if (chunkData[valueStart] === 0) nullCount++;
          valueStart++;
        }

        // A compression flag of 1 means the text is zlib-deflated. Decoding
        // it as UTF-8 would yield noise that fails JSON.parse anyway, so
        // report nothing rather than a value this parser did not read.
        value = nullCount === 2 && flag === 0
          ? new TextDecoder().decode(chunkData.slice(valueStart))
          : "";
      }

      // Parse workflow or prompt JSON
      if ((key === "workflow" || key === "prompt") && value.length <= MAX_TEXT_VALUE_SIZE) {
        try {
          const parsed = JSON.parse(value);
          if (key === "workflow") {
            result.workflow = parsed;
          } else {
            result.prompt = parsed;
          }
        } catch {
          // Invalid JSON, skip
        }
      }
    }

    // Stop at IEND chunk
    if (type === "IEND") {
      break;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Fetch an example workflow image and extract the embedded workflow
 */
export async function fetchExampleWorkflow(
  imageUrl: string
): Promise<{
  success: boolean;
  workflow?: Record<string, unknown>;
  prompt?: Record<string, unknown>;
  error?: string;
}> {
  try {
    const response = await safeFetch(imageUrl);
    if (!response.ok) {
      return { success: false, error: `Failed to fetch: ${response.statusText}` };
    }

    const imageData = await response.arrayBuffer();
    const extracted = await extractWorkflowFromPng(imageData);

    if (!extracted) {
      return { success: false, error: "No workflow data found in image" };
    }

    return {
      success: true,
      workflow: extracted.workflow,
      prompt: extracted.prompt,
    };
  } catch (error) {
    return {
      success: false,
      error: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Fetch a JSON workflow file directly
 */
export async function fetchJsonWorkflow(
  jsonUrl: string
): Promise<{
  success: boolean;
  workflow?: Record<string, unknown>;
  error?: string;
}> {
  try {
    const response = await safeFetch(jsonUrl);
    if (!response.ok) {
      return { success: false, error: `Failed to fetch: ${response.statusText}` };
    }

    const workflow = await response.json() as Record<string, unknown>;
    return {
      success: true,
      workflow,
    };
  } catch (error) {
    return {
      success: false,
      error: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export const listExamplesSchema = z.object({
  category: z
    .string()
    .optional()
    .describe(
      "Filter by category (basics, sdxl, flux, video, audio, controlnet, etc.)"
    ),
  search: z
    .string()
    .optional()
    .describe("Only return examples whose name or description matches this term"),
  detail: z
    .enum(["names", "summary", "full"])
    .optional()
    .default("summary")
    .describe(
      "How much to return per example: 'names' (name + category), 'summary' (adds description and doc link), " +
        "'full' (adds required models, nodes, and notes). Use comfyui_get_example_workflow for the actual workflow JSON."
    ),
  ...paginationFields,
  response_format: responseFormatField,
}).strict();

export type ListExamplesInput = z.infer<typeof listExamplesSchema>;

/** One example as listed, projected to the caller's requested `detail`. */
export interface ExampleRow {
  name: string;
  category: string;
  description?: string;
  docs?: string;
  workflows?: number;
  requiredModels?: Array<{ type: string; name: string; url: string; destination?: string }>;
  requiredNodes?: string[];
  notes?: string;
}

export type ListExamplesResult = PageEnvelope & {
  categories: Record<string, number>;
  examples: ExampleRow[];
  hint: string;
};

/**
 * List example workflows, filtered and paged.
 *
 * The full catalogue with every required-model URL runs to ~50KB, most of it
 * download links the agent cannot act on from a listing anyway - those live
 * in get_example_workflow and get_download_url. So 'summary' is the default
 * and the heavy fields only appear under detail: 'full'.
 */
export function listExamples(input: ListExamplesInput): ListExamplesResult {
  let examples: ExampleWorkflow[] = EXAMPLE_WORKFLOWS;

  if (input.category) {
    const cat = input.category.toLowerCase();
    examples = examples.filter((e) => e.category.toLowerCase().includes(cat));
  }

  if (input.search) {
    const term = input.search.toLowerCase();
    examples = examples.filter(
      (e) =>
        e.name.toLowerCase().includes(term) ||
        e.description.toLowerCase().includes(term)
    );
  }

  const categoryCounts: Record<string, number> = {};
  for (const e of examples) {
    categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
  }

  const page = paginate(examples, input.limit, input.offset);

  const project = (e: ExampleWorkflow): ExampleRow => {
    if (input.detail === "names") {
      return { name: e.name, category: e.category };
    }

    const base: ExampleRow = {
      name: e.name,
      category: e.category,
      description: e.description,
      docs: e.pageUrl,
      workflows: (e.imageUrls?.length ?? 0) + (e.jsonUrls?.length ?? 0),
    };

    if (input.detail === "full") {
      if (e.requiredModels?.length) {
        base.requiredModels = e.requiredModels.map((m) => ({
          type: m.type,
          name: m.name,
          url: m.url,
          ...(m.destination ? { destination: m.destination } : {}),
        }));
      }
      if (e.requiredNodes?.length) base.requiredNodes = e.requiredNodes;
      if (e.notes) base.notes = e.notes;
    }

    return base;
  };

  const { items, ...envelope } = page;

  return {
    ...envelope,
    categories: categoryCounts,
    examples: items.map(project),
    hint: "Call comfyui_get_example_workflow with an example's name to fetch its runnable workflow JSON.",
  };
}

export function renderExamples(
  result: ListExamplesResult,
  input: ListExamplesInput
): string {
  const filters = [
    input.search ? `search '${input.search}'` : null,
    input.category ? `category '${input.category}'` : null,
  ].filter(Boolean);

  return renderListing({
    title: filters.length ? `Example Workflows - ${filters.join(", ")}` : "Example Workflows",
    facets: result.categories,
    rows: result.examples.map((e) => {
      const description = e.description ? ` - ${e.description}` : "";
      const models = e.requiredModels?.length
        ? ` _(needs ${e.requiredModels.length} model(s))_`
        : "";
      return `- **${e.name}** _(${e.category})_${description}${models}`;
    }),
    page: result,
    empty: filters.length
      ? `No example workflows for ${filters.join(" and ")}. Call comfyui_list_examples with no filter to see the catalogue.`
      : "No example workflows are bundled with this build.",
    next: result.hint,
  });
}

export const getExampleWorkflowSchema = z.object({
  name: z.string().describe("Name of the example workflow to fetch"),
  variant: z
    .number()
    .optional()
    .default(0)
    .describe("Which variant to get (0 = first/default)"),
}).strict();

export type GetExampleWorkflowInput = z.infer<typeof getExampleWorkflowSchema>;

export async function getExampleWorkflow(
  input: GetExampleWorkflowInput
): Promise<string> {
  const searchName = input.name.toLowerCase();
  const example = EXAMPLE_WORKFLOWS.find(
    (e) =>
      e.name.toLowerCase().includes(searchName) ||
      e.category.toLowerCase() === searchName
  );

  if (!example) {
    return `Example "${input.name}" not found. Use comfyui_list_examples to see available examples.`;
  }

  // Determine if we have PNG images or JSON files
  const hasPngWorkflows = example.imageUrls.length > 0;
  const hasJsonWorkflows = example.jsonUrls && example.jsonUrls.length > 0;

  if (!hasPngWorkflows && !hasJsonWorkflows) {
    let output = `# ${example.name}\n\n`;
    output += `${example.description}\n\n`;
    output += `This example does not have downloadable workflow files.\n`;
    output += `Visit ${example.pageUrl} for more information.\n\n`;

    if (example.requiredModels && example.requiredModels.length > 0) {
      output += `## Required Models\n\n`;
      for (const model of example.requiredModels) {
        output += `### ${model.name}\n`;
        output += `- Type: ${model.type}\n`;
        output += `- URL: ${model.url}\n`;
        if (model.destination) {
          output += `- Install to: ${model.destination}\n`;
        }
        output += "\n";
      }
    }

    if (example.notes) {
      output += `## Notes\n${example.notes}\n`;
    }

    return output;
  }

  let result: { success: boolean; workflow?: Record<string, unknown>; prompt?: Record<string, unknown>; error?: string };
  let sourceUrl: string;

  // Prefer JSON workflows if available, then PNG
  if (hasJsonWorkflows) {
    const variantIndex = Math.min(input.variant, example.jsonUrls!.length - 1);
    sourceUrl = example.jsonUrls![variantIndex];
    result = await fetchJsonWorkflow(sourceUrl);
  } else {
    const variantIndex = Math.min(input.variant, example.imageUrls.length - 1);
    sourceUrl = example.imageUrls[variantIndex];
    result = await fetchExampleWorkflow(sourceUrl);
  }

  if (!result.success) {
    return `Failed to fetch workflow: ${result.error}\n\nYou can manually visit: ${sourceUrl}`;
  }

  let output = `# ${example.name} Workflow\n\n`;
  output += `${example.description}\n\n`;
  output += `Source: ${sourceUrl}\n\n`;

  // Return the prompt (API format) which is what ComfyUI actually executes
  const workflowData = result.prompt || result.workflow;
  if (workflowData) {
    output += `## Workflow (API Format)\n`;
    output += "This can be used directly with the `comfyui_run_workflow` tool:\n\n";
    output += "```json\n";
    output += jsonText(workflowData);
    output += "\n```\n";
  }

  if (example.requiredModels && example.requiredModels.length > 0) {
    output += `\n## Required Models\n\n`;
    for (const model of example.requiredModels) {
      output += `### ${model.name}\n`;
      output += `- Type: ${model.type}\n`;
      output += `- URL: ${model.url}\n`;
      if (model.destination) {
        output += `- Install to: ${model.destination}\n`;
      }
      output += "\n";
    }
  }

  if (example.notes) {
    output += `## Notes\n${example.notes}\n`;
  }

  return output;
}

// Model patterns for workflow recommendation
