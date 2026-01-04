import { z } from "zod";
import { ComfyUIClient, ObjectInfo } from "../client/comfyui.js";

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
export function parseInputSpec(spec: unknown): {
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

/**
 * Get a placeholder value for a given type (for example JSON generation)
 */
function getPlaceholderForType(type: string, name: string): unknown {
  const upperType = type.toUpperCase();
  switch (upperType) {
    case "STRING":
      return `<${name}>`;
    case "INT":
      return 0;
    case "FLOAT":
      return 1.0;
    case "BOOLEAN":
      return false;
    case "MODEL":
      return ["<model_node_id>", 0];
    case "CLIP":
      return ["<clip_node_id>", 0];
    case "VAE":
      return ["<vae_node_id>", 0];
    case "CONDITIONING":
      return ["<conditioning_node_id>", 0];
    case "LATENT":
      return ["<latent_node_id>", 0];
    case "IMAGE":
      return ["<image_node_id>", 0];
    case "MASK":
      return ["<mask_node_id>", 0];
    case "CONTROL_NET":
      return ["<controlnet_node_id>", 0];
    case "AUDIO":
      return ["<audio_node_id>", 0];
    default:
      // For unknown types, assume it's a connection
      return [`<${type.toLowerCase()}_node_id>`, 0];
  }
}

/**
 * Common node producers for each type (for connection guide)
 */
const TYPE_PRODUCERS: Record<string, string[]> = {
  MODEL: ["CheckpointLoaderSimple", "UNETLoader", "LoraLoader"],
  CLIP: ["CheckpointLoaderSimple", "CLIPLoader", "DualCLIPLoader"],
  VAE: ["CheckpointLoaderSimple", "VAELoader"],
  CONDITIONING: ["CLIPTextEncode", "ConditioningCombine", "ControlNetApply"],
  LATENT: ["EmptyLatentImage", "EmptySD3LatentImage", "VAEEncode", "KSampler"],
  IMAGE: ["LoadImage", "VAEDecode", "PreviewImage", "SaveImage"],
  MASK: ["LoadImage", "ImageToMask", "MaskComposite"],
  CONTROL_NET: ["ControlNetLoader", "DiffControlNetLoader"],
  AUDIO: ["LoadAudio", "EmptyAudioNode"],
};

/**
 * Get special tips for certain node types
 */
function getNodeTips(nodeType: string): string[] | undefined {
  const tips: Record<string, string[]> = {
    SaveImage: [
      "Use descriptive filename_prefix values like 'portrait_sunset' or 'logo_v2' to make outputs easy to find",
      "The filename_prefix supports subdirectories, e.g., 'project_name/variant_blue'",
      "Avoid generic names like 'output' or 'image' - be specific about the content",
    ],
    PreviewImage: [
      "Preview images are temporary and not saved to disk",
      "Use SaveImage if you need to keep the output",
    ],
  };
  return tips[nodeType];
}

/**
 * Generate example JSON for using a node in a workflow
 */
function generateNodeExample(
  nodeType: string,
  nodeInfo: ObjectInfo[string],
  nodeId: string = "1"
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};

  // Process required inputs
  if (nodeInfo.input.required) {
    for (const [name, spec] of Object.entries(nodeInfo.input.required)) {
      const parsed = parseInputSpec(spec);
      if (parsed.type === "COMBO" && parsed.options?.length) {
        inputs[name] = parsed.options[0];
      } else if (parsed.default !== undefined) {
        inputs[name] = parsed.default;
      } else {
        // Use more descriptive examples for certain inputs
        if (nodeType === "SaveImage" && name === "filename_prefix") {
          inputs[name] = "descriptive_name_here";
        } else {
          inputs[name] = getPlaceholderForType(parsed.type, name);
        }
      }
    }
  }

  return {
    [nodeId]: {
      class_type: nodeType,
      inputs,
    },
  };
}

/**
 * Generate connection guide for a node's inputs
 */
function generateConnectionGuide(
  nodeInfo: ObjectInfo[string]
): Record<string, string> | undefined {
  const guide: Record<string, string> = {};

  if (nodeInfo.input.required) {
    for (const [name, spec] of Object.entries(nodeInfo.input.required)) {
      const parsed = parseInputSpec(spec);
      const upperType = parsed.type.toUpperCase();

      // Only include connection types (not primitives like STRING, INT, FLOAT, COMBO)
      if (!["STRING", "INT", "FLOAT", "BOOLEAN", "COMBO"].includes(upperType)) {
        const producers = TYPE_PRODUCERS[upperType];
        if (producers) {
          guide[upperType] = `Connect from: ${producers.join(", ")}`;
        } else {
          guide[upperType] = `Connect from a node that outputs ${upperType}`;
        }
      }
    }
  }

  return Object.keys(guide).length > 0 ? guide : undefined;
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

  // Generate example JSON, connection guide, and tips
  const exampleJson = generateNodeExample(input.node, nodeInfo);
  const connectionGuide = generateConnectionGuide(nodeInfo);
  const tips = getNodeTips(input.node);

  const result: Record<string, unknown> = {
    name: nodeInfo.name,
    displayName: nodeInfo.display_name,
    category: nodeInfo.category,
    description: nodeInfo.description,
    inputs: {
      required: requiredInputs,
      optional: Object.keys(optionalInputs).length > 0 ? optionalInputs : undefined,
    },
    outputs,
    exampleJson,
    connectionGuide,
  };

  // Include tips if available for this node type
  if (tips) {
    result.tips = tips;
  }

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

// === Build Node Tool ===

export const buildNodeSchema = z.object({
  nodeType: z
    .string()
    .describe("The node class_type (e.g., 'KSampler', 'CheckpointLoaderSimple')"),
  nodeId: z
    .string()
    .describe("The node ID for this node in the workflow (e.g., '1', '5')"),
  inputs: z
    .record(z.unknown())
    .optional()
    .describe("Input values to set. For connections, use [nodeId, slotIndex] format. Omitted inputs use defaults."),
});

export type BuildNodeInput = z.infer<typeof buildNodeSchema>;

export async function buildNode(
  client: ComfyUIClient,
  input: BuildNodeInput
): Promise<string> {
  const objectInfo = await client.getObjectInfo();
  const nodeInfo = objectInfo[input.nodeType];

  if (!nodeInfo) {
    // Try case-insensitive search
    const typeLower = input.nodeType.toLowerCase();
    const match = Object.keys(objectInfo).find((k) => k.toLowerCase() === typeLower);
    if (match) {
      return buildNode(client, { ...input, nodeType: match });
    }
    return JSON.stringify({
      error: `Node type '${input.nodeType}' not found`,
      suggestion: "Use list_nodes or get_node_info to find available node types",
    });
  }

  // Start with defaults from node info
  const nodeInputs: Record<string, unknown> = {};
  const missingConnections: Array<{ input: string; type: string; description: string }> = [];

  // Process required inputs - set defaults or placeholders
  if (nodeInfo.input.required) {
    for (const [name, spec] of Object.entries(nodeInfo.input.required)) {
      const parsed = parseInputSpec(spec);

      // Check if user provided this input
      if (input.inputs && name in input.inputs) {
        nodeInputs[name] = input.inputs[name];
      } else if (parsed.default !== undefined) {
        nodeInputs[name] = parsed.default;
      } else if (parsed.type === "COMBO" && parsed.options?.length) {
        nodeInputs[name] = parsed.options[0];
      } else if (["STRING", "INT", "FLOAT", "BOOLEAN"].includes(parsed.type.toUpperCase())) {
        // Primitive with no default
        switch (parsed.type.toUpperCase()) {
          case "STRING":
            nodeInputs[name] = "";
            break;
          case "INT":
            nodeInputs[name] = parsed.min ?? 0;
            break;
          case "FLOAT":
            nodeInputs[name] = parsed.min ?? 0.0;
            break;
          case "BOOLEAN":
            nodeInputs[name] = false;
            break;
        }
      } else {
        // Connection type - needs to be connected
        missingConnections.push({
          input: name,
          type: parsed.type,
          description: `Connect from a node that outputs ${parsed.type}`,
        });
        // Use placeholder that will fail validation
        nodeInputs[name] = [`<${parsed.type.toLowerCase()}_node_id>`, 0];
      }
    }
  }

  // Add any optional inputs the user provided
  if (input.inputs && nodeInfo.input.optional) {
    for (const [name, value] of Object.entries(input.inputs)) {
      if (name in nodeInfo.input.optional) {
        nodeInputs[name] = value;
      }
    }
  }

  const node = {
    [input.nodeId]: {
      class_type: input.nodeType,
      inputs: nodeInputs,
    },
  };

  // Build output info for connecting downstream nodes
  const outputs = nodeInfo.output.map((type, i) => ({
    slot: i,
    type,
    name: nodeInfo.output_name[i] || type,
    reference: [input.nodeId, i] as [string, number],
  }));

  const result: Record<string, unknown> = {
    node,
    outputs,
    usage: `Connect this node's outputs to other nodes using the reference arrays. For example, to connect output 0 to another node's input: "inputName": ["${input.nodeId}", 0]`,
  };

  if (missingConnections.length > 0) {
    result.missingConnections = missingConnections;
    result.note = "This node has inputs that need to be connected to other nodes. Replace the placeholder values with actual node references.";
  }

  // Include tips for certain node types
  const tips = getNodeTips(input.nodeType);
  if (tips) {
    result.tips = tips;
  }

  return JSON.stringify(result, null, 2);
}
