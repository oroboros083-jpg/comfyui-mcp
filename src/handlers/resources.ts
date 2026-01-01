/**
 * MCP Resources Handler
 *
 * Exposes ComfyUI data as MCP resources for clients to browse and read.
 */

import { ServerContext } from "../context.js";
import {
  PROMPTING_GUIDES,
  formatPromptingGuide,
  getComprehensiveGuide,
} from "../resources/prompting-guide.js";
import { EXAMPLE_WORKFLOWS, fetchExampleWorkflow } from "../tools/examples.js";
import { KNOWN_MODELS } from "../tools/download.js";
import { getCapabilitySummary } from "../capabilities/index.js";

/**
 * MCP Resource definition
 */
export interface Resource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

/**
 * MCP Resource content
 */
export interface ResourceContent {
  uri: string;
  text?: string;
  blob?: string;
  mimeType?: string;
}

/**
 * Get static resources that are always available
 */
export function getStaticResources(): Resource[] {
  const resources: Resource[] = [];

  // Comprehensive prompting guide
  resources.push({
    uri: "comfyui://guides/prompting/all",
    name: "prompting-guide-all",
    title: "Complete Prompting Guide",
    description:
      "Comprehensive prompting guide for all AI image models (SD1.5, SDXL, SD3, Flux)",
    mimeType: "text/markdown",
  });

  // Model-specific prompting guides
  for (const [modelType, guide] of Object.entries(PROMPTING_GUIDES)) {
    resources.push({
      uri: `comfyui://guides/prompting/${modelType}`,
      name: `prompting-guide-${modelType}`,
      title: `${guide.modelType} Prompting Guide`,
      description: guide.description,
      mimeType: "text/markdown",
    });
  }

  // Example workflows
  for (const example of EXAMPLE_WORKFLOWS) {
    if (example.imageUrls.length > 0) {
      const slug = example.name.toLowerCase().replace(/\s+/g, "-").replace(/[()]/g, "");
      resources.push({
        uri: `comfyui://examples/${slug}`,
        name: `example-${slug}`,
        title: `Example: ${example.name}`,
        description: `${example.description} (Category: ${example.category})`,
        mimeType: "application/json",
      });
    }
  }

  // Downloads catalog
  resources.push({
    uri: "comfyui://downloads/catalog",
    name: "downloads-catalog",
    title: "Model Downloads Catalog",
    description: "List of popular models available for direct download",
    mimeType: "application/json",
  });

  return resources;
}

/**
 * Get dynamic resources that require ComfyUI connection
 */
export function getDynamicResources(ctx: ServerContext): Resource[] {
  const resources: Resource[] = [];

  if (ctx.client && ctx.capabilities) {
    // Installed models by type
    resources.push({
      uri: "comfyui://models/checkpoints",
      name: "models-checkpoints",
      title: "Installed Checkpoints",
      description: "List of checkpoint models installed in ComfyUI",
      mimeType: "application/json",
    });

    resources.push({
      uri: "comfyui://models/loras",
      name: "models-loras",
      title: "Installed LoRAs",
      description: "List of LoRA models installed in ComfyUI",
      mimeType: "application/json",
    });

    resources.push({
      uri: "comfyui://models/all",
      name: "models-all",
      title: "All Installed Models",
      description: "Complete list of all models installed in ComfyUI",
      mimeType: "application/json",
    });

    // Capabilities
    resources.push({
      uri: "comfyui://capabilities",
      name: "capabilities",
      title: "ComfyUI Capabilities",
      description: "Detected capabilities of the connected ComfyUI instance",
      mimeType: "application/json",
    });
  }

  return resources;
}

/**
 * Read a resource by URI
 */
export async function readResource(
  ctx: ServerContext,
  uri: string
): Promise<{ contents: ResourceContent[] }> {
  // Prompting guides
  if (uri === "comfyui://guides/prompting/all") {
    return {
      contents: [
        {
          uri,
          text: getComprehensiveGuide(),
          mimeType: "text/markdown",
        },
      ],
    };
  }

  if (uri.startsWith("comfyui://guides/prompting/")) {
    const modelType = uri.split("/").pop();
    const guide = PROMPTING_GUIDES[modelType!];
    if (guide) {
      return {
        contents: [
          {
            uri,
            text: formatPromptingGuide(guide),
            mimeType: "text/markdown",
          },
        ],
      };
    }
    throw new Error(`Unknown model type: ${modelType}`);
  }

  // Example workflows
  if (uri.startsWith("comfyui://examples/")) {
    const slug = uri.split("/").pop()!;
    const example = EXAMPLE_WORKFLOWS.find(
      (e) =>
        e.name.toLowerCase().replace(/\s+/g, "-").replace(/[()]/g, "") === slug
    );

    if (!example) {
      throw new Error(`Example not found: ${slug}`);
    }

    if (example.imageUrls.length === 0) {
      throw new Error(`No workflow images available for: ${example.name}`);
    }

    // Fetch the workflow from the first image
    const result = await fetchExampleWorkflow(example.imageUrls[0]);
    if (!result.success || !result.prompt) {
      throw new Error(`Failed to extract workflow: ${result.error}`);
    }

    return {
      contents: [
        {
          uri,
          text: JSON.stringify(
            {
              name: example.name,
              description: example.description,
              category: example.category,
              pageUrl: example.pageUrl,
              requiredNodes: example.requiredNodes,
              requiredModels: example.requiredModels,
              workflow: result.prompt,
            },
            null,
            2
          ),
          mimeType: "application/json",
        },
      ],
    };
  }

  // Downloads catalog
  if (uri === "comfyui://downloads/catalog") {
    return {
      contents: [
        {
          uri,
          text: JSON.stringify(KNOWN_MODELS, null, 2),
          mimeType: "application/json",
        },
      ],
    };
  }

  // Dynamic resources (require connection)
  if (uri.startsWith("comfyui://models/")) {
    if (!ctx.client) {
      throw new Error("ComfyUI is not connected");
    }

    const modelType = uri.split("/").pop();
    const models = await ctx.client.getModels();

    if (modelType === "all") {
      return {
        contents: [
          {
            uri,
            text: JSON.stringify(models, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }

    // Map URL path to model key
    const typeMap: Record<string, string> = {
      checkpoints: "checkpoints",
      loras: "loras",
      vae: "vae",
      controlnet: "controlnet",
      embeddings: "embeddings",
      clip: "clip",
      unet: "unet",
    };

    const modelKey = typeMap[modelType!];
    if (modelKey && models[modelKey as keyof typeof models]) {
      return {
        contents: [
          {
            uri,
            text: JSON.stringify(
              { [modelKey]: models[modelKey as keyof typeof models] },
              null,
              2
            ),
            mimeType: "application/json",
          },
        ],
      };
    }

    throw new Error(`Unknown model type: ${modelType}`);
  }

  // Capabilities
  if (uri === "comfyui://capabilities") {
    if (!ctx.capabilities) {
      throw new Error("ComfyUI is not connected");
    }

    return {
      contents: [
        {
          uri,
          text: JSON.stringify(
            {
              summary: getCapabilitySummary(ctx.capabilities),
              details: ctx.capabilities,
            },
            null,
            2
          ),
          mimeType: "application/json",
        },
      ],
    };
  }

  throw new Error(`Resource not found: ${uri}`);
}
