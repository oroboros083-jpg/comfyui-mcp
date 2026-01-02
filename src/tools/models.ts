import { z } from "zod";
import { ComfyUIClient } from "../client/comfyui.js";

export const listModelsSchema = z.object({
  type: z
    .enum([
      "all",
      "checkpoints",
      "loras",
      "vae",
      "controlnet",
      "upscale_models",
      "embeddings",
      "clip",
      "unet",
    ])
    .optional()
    .default("all")
    .describe("Type of models to list"),
});

export type ListModelsInput = z.infer<typeof listModelsSchema>;

export async function listModels(
  client: ComfyUIClient,
  input: ListModelsInput
): Promise<string> {
  const models = await client.getModels();

  if (input.type === "all") {
    const result: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(models)) {
      if (value.length > 0) {
        result[key] = value;
      }
    }
    return JSON.stringify(result, null, 2);
  }

  const typeModels = models[input.type as keyof typeof models];
  if (!typeModels || typeModels.length === 0) {
    return JSON.stringify({ [input.type]: [] });
  }

  return JSON.stringify({ [input.type]: typeModels }, null, 2);
}

export const listNodesSchema = z.object({
  category: z
    .string()
    .optional()
    .describe("Filter nodes by category (e.g., 'loaders', 'conditioning')"),
  search: z.string().optional().describe("Search term to filter node names"),
});

export type ListNodesInput = z.infer<typeof listNodesSchema>;

export async function listNodes(
  client: ComfyUIClient,
  input: ListNodesInput
): Promise<string> {
  const objectInfo = await client.getObjectInfo();

  let nodes = Object.entries(objectInfo).map(([name, info]) => ({
    name,
    displayName: info.display_name,
    category: info.category,
    description: info.description,
  }));

  if (input.category) {
    const categoryLower = input.category.toLowerCase();
    nodes = nodes.filter((n) => n.category.toLowerCase().includes(categoryLower));
  }

  if (input.search) {
    const searchLower = input.search.toLowerCase();
    nodes = nodes.filter(
      (n) =>
        n.name.toLowerCase().includes(searchLower) ||
        n.displayName.toLowerCase().includes(searchLower) ||
        n.description.toLowerCase().includes(searchLower)
    );
  }

  // Group by category
  const grouped: Record<string, typeof nodes> = {};
  for (const node of nodes) {
    if (!grouped[node.category]) {
      grouped[node.category] = [];
    }
    grouped[node.category].push(node);
  }

  return JSON.stringify(grouped, null, 2);
}

// === Node Info Tool ===

export const getNodeInfoSchema = z.object({
  node: z.string().describe("The node class_type name (e.g., 'KSampler', 'CheckpointLoaderSimple')"),
});

export type GetNodeInfoInput = z.infer<typeof getNodeInfoSchema>;

/**
 * Parse a ComfyUI input spec into a structured format
 */
function parseInputSpec(spec: unknown): {
  type: string;
  options?: string[];
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  multiline?: boolean;
  dynamicPrompts?: boolean;
} {
  if (!Array.isArray(spec) || spec.length === 0) {
    return { type: "UNKNOWN" };
  }

  const [typeOrOptions, config] = spec;

  // If first element is an array, it's a COMBO (dropdown options)
  if (Array.isArray(typeOrOptions)) {
    return {
      type: "COMBO",
      options: typeOrOptions as string[],
      default: config?.default,
    };
  }

  // Otherwise it's a type string
  const type = String(typeOrOptions);
  const result: ReturnType<typeof parseInputSpec> = { type };

  if (config && typeof config === "object") {
    const c = config as Record<string, unknown>;
    if (c.default !== undefined) result.default = c.default;
    if (typeof c.min === "number") result.min = c.min;
    if (typeof c.max === "number") result.max = c.max;
    if (typeof c.step === "number") result.step = c.step;
    if (typeof c.multiline === "boolean") result.multiline = c.multiline;
    if (typeof c.dynamicPrompts === "boolean") result.dynamicPrompts = c.dynamicPrompts;
  }

  return result;
}

export async function getNodeInfo(
  client: ComfyUIClient,
  input: GetNodeInfoInput
): Promise<string> {
  const objectInfo = await client.getObjectInfo();
  const nodeInfo = objectInfo[input.node];

  if (!nodeInfo) {
    // Try case-insensitive search
    const nodeLower = input.node.toLowerCase();
    const match = Object.keys(objectInfo).find((k) => k.toLowerCase() === nodeLower);
    if (match) {
      return getNodeInfo(client, { node: match });
    }
    return JSON.stringify({ error: `Node '${input.node}' not found` });
  }

  // Parse inputs into structured format
  const requiredInputs: Record<string, ReturnType<typeof parseInputSpec>> = {};
  const optionalInputs: Record<string, ReturnType<typeof parseInputSpec>> = {};

  if (nodeInfo.input.required) {
    for (const [name, spec] of Object.entries(nodeInfo.input.required)) {
      requiredInputs[name] = parseInputSpec(spec);
    }
  }

  if (nodeInfo.input.optional) {
    for (const [name, spec] of Object.entries(nodeInfo.input.optional)) {
      optionalInputs[name] = parseInputSpec(spec);
    }
  }

  // Format outputs
  const outputs = nodeInfo.output.map((type, i) => ({
    index: i,
    name: nodeInfo.output_name[i] || type,
    type,
    isList: nodeInfo.output_is_list[i] || false,
  }));

  const result = {
    name: nodeInfo.name,
    displayName: nodeInfo.display_name,
    category: nodeInfo.category,
    description: nodeInfo.description,
    inputs: {
      required: requiredInputs,
      optional: Object.keys(optionalInputs).length > 0 ? optionalInputs : undefined,
    },
    outputs,
  };

  return JSON.stringify(result, null, 2);
}

// === Find Nodes by Type Tool ===

export const findNodesByTypeSchema = z.object({
  inputType: z
    .string()
    .optional()
    .describe("Find nodes that accept this input type (e.g., 'MODEL', 'LATENT', 'IMAGE', 'CONDITIONING')"),
  outputType: z
    .string()
    .optional()
    .describe("Find nodes that produce this output type (e.g., 'MODEL', 'LATENT', 'IMAGE', 'CONDITIONING')"),
});

export type FindNodesByTypeInput = z.infer<typeof findNodesByTypeSchema>;

export async function findNodesByType(
  client: ComfyUIClient,
  input: FindNodesByTypeInput
): Promise<string> {
  if (!input.inputType && !input.outputType) {
    return JSON.stringify({ error: "Must specify either inputType or outputType (or both)" });
  }

  const objectInfo = await client.getObjectInfo();
  const inputTypeUpper = input.inputType?.toUpperCase();
  const outputTypeUpper = input.outputType?.toUpperCase();

  const matches: Array<{
    name: string;
    displayName: string;
    category: string;
    matchedInputs?: string[];
    matchedOutputs?: string[];
  }> = [];

  for (const [nodeName, nodeInfo] of Object.entries(objectInfo)) {
    let matchedInputs: string[] = [];
    let matchedOutputs: string[] = [];

    // Check inputs
    if (inputTypeUpper) {
      const allInputs = {
        ...nodeInfo.input.required,
        ...nodeInfo.input.optional,
      };

      for (const [inputName, spec] of Object.entries(allInputs)) {
        if (Array.isArray(spec) && spec.length > 0) {
          const inputType = Array.isArray(spec[0]) ? "COMBO" : String(spec[0]).toUpperCase();
          if (inputType === inputTypeUpper) {
            matchedInputs.push(inputName);
          }
        }
      }
    }

    // Check outputs
    if (outputTypeUpper) {
      nodeInfo.output.forEach((outType, i) => {
        if (outType.toUpperCase() === outputTypeUpper) {
          matchedOutputs.push(nodeInfo.output_name[i] || outType);
        }
      });
    }

    // Include node if it matches the criteria
    const matchesInput = !inputTypeUpper || matchedInputs.length > 0;
    const matchesOutput = !outputTypeUpper || matchedOutputs.length > 0;

    if (matchesInput && matchesOutput) {
      const entry: (typeof matches)[0] = {
        name: nodeName,
        displayName: nodeInfo.display_name,
        category: nodeInfo.category,
      };
      if (matchedInputs.length > 0) entry.matchedInputs = matchedInputs;
      if (matchedOutputs.length > 0) entry.matchedOutputs = matchedOutputs;
      matches.push(entry);
    }
  }

  // Group by category
  const grouped: Record<string, typeof matches> = {};
  for (const node of matches) {
    if (!grouped[node.category]) {
      grouped[node.category] = [];
    }
    grouped[node.category].push(node);
  }

  // Sort categories and nodes
  const sortedResult: Record<string, typeof matches> = {};
  for (const category of Object.keys(grouped).sort()) {
    sortedResult[category] = grouped[category].sort((a, b) => a.name.localeCompare(b.name));
  }

  return JSON.stringify(
    {
      query: {
        inputType: input.inputType || null,
        outputType: input.outputType || null,
      },
      totalMatches: matches.length,
      byCategory: sortedResult,
    },
    null,
    2
  );
}
