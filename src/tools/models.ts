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
