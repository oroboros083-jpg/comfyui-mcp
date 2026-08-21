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
import { EXAMPLE_WORKFLOWS, fetchExampleWorkflow } from "../tools/examples/index.js";
import { getCapabilitySummary } from "../capabilities/index.js";
import { jsonText, capText } from "../utils/response.js";

/**
 * A resource body costs the reader context exactly as a tool response does,
 * so the same two rules apply: compact JSON, and a cap with a message saying
 * which tool to use instead when the body is too big to be worth reading
 * whole.
 */
function jsonResource(uri: string, value: unknown, narrowingHint: string) {
  return {
    contents: [
      {
        uri,
        text: capText(jsonText(value), narrowingHint),
        mimeType: "application/json",
      },
    ],
  };
}

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

    return jsonResource(
      uri,
      {
        name: example.name,
        description: example.description,
        category: example.category,
        pageUrl: example.pageUrl,
        requiredNodes: example.requiredNodes,
        requiredModels: example.requiredModels,
        workflow: result.prompt,
      },
      "Call comfyui_get_example_workflow for this example instead."
    );
  }

  // Dynamic resources (require connection)
  if (uri.startsWith("comfyui://models/")) {
    if (!ctx.client) {
      throw new Error("ComfyUI is not connected");
    }

    const modelType = uri.split("/").pop();
    const models = await ctx.client.getModels();

    if (modelType === "all") {
      // An install with hundreds of LoRAs makes this the largest thing the
      // server can hand back, and a resource has no limit/offset to narrow it.
      return jsonResource(
        uri,
        models,
        "Call comfyui_list_models, which filters by type and pages."
      );
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
      return jsonResource(
        uri,
        { [modelKey]: models[modelKey as keyof typeof models] },
        `Call comfyui_list_models with type:'${modelKey}' and a 'search' filter.`
      );
    }

    throw new Error(`Unknown model type: ${modelType}`);
  }

  // Capabilities
  if (uri === "comfyui://capabilities") {
    if (!ctx.capabilities) {
      throw new Error("ComfyUI is not connected");
    }

    // userPreferences carries every analysed workflow and can run to hundreds
    // of KB. get_capabilities excludes it for that reason and points at
    // get_user_preferences; the resource has no reason to differ.
    const { userPreferences, ...details } = ctx.capabilities;

    return jsonResource(
      uri,
      {
        summary: getCapabilitySummary(ctx.capabilities),
        details,
        ...(userPreferences
          ? {
              historyAnalysed: {
                totalImagesAnalyzed: userPreferences.totalImagesAnalyzed,
                uniqueWorkflows: userPreferences.uniqueWorkflows,
                hint: "Call comfyui_get_user_preferences for the analysed workflows themselves.",
              },
            }
          : {}),
      },
      "Call comfyui_get_capabilities instead."
    );
  }

  throw new Error(`Resource not found: ${uri}`);
}
