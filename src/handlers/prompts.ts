import { ToolError } from "../utils/errors.js";
/**
 * MCP Prompts Handler
 *
 * Provides pre-built prompts to guide users through common ComfyUI workflows.
 */

import {
  getPromptingGuide,
  PROMPTING_GUIDES,
} from "../resources/prompting-guide.js";

/**
 * MCP Prompt definition
 */
export interface Prompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

/**
 * MCP Prompt message
 */
export interface PromptMessage {
  role: "user" | "assistant";
  content: {
    type: "text";
    text: string;
  };
}

/**
 * List available prompts
 */
export function listPrompts(): Prompt[] {
  return [
    {
      name: "generate-image",
      title: "Generate Image",
      description:
        "Generate an image with ComfyUI using appropriate settings for your model type",
      arguments: [
        {
          name: "prompt",
          description: "What you want to generate",
          required: true,
        },
        {
          name: "model_type",
          description:
            "Model type: sd15, sdxl, sd3, or flux (auto-detected if omitted)",
          required: false,
        },
        {
          name: "aspect_ratio",
          description:
            "Image aspect ratio: square, portrait, landscape, widescreen",
          required: false,
        },
      ],
    },
    // `setup-comfyui` and `run-example` used to live here. Both were flows
    // through tools this server no longer has: installing ComfyUI and
    // downloading models are the official Comfy MCP's job, and browsing
    // documentation examples is covered by its template gallery. A prompt that
    // walks an agent through calling tools that do not exist is worse than no
    // prompt at all.
    {
      name: "learn-prompting",
      title: "Learn Prompting",
      description: "Get comprehensive prompting guidance for your model type",
      arguments: [
        {
          name: "model_type",
          description: "Model type: sd15, sdxl, sd3, flux, or all",
          required: false,
        },
      ],
    },
  ];
}

/**
 * Get a specific prompt with its messages
 */
export async function getPrompt(
  name: string,
  args: Record<string, string>
): Promise<{
  description?: string;
  messages: PromptMessage[];
}> {
  switch (name) {
    case "generate-image": {
      const prompt = args.prompt || "a beautiful landscape";
      const modelType = args.model_type || "auto";
      const aspectRatio = args.aspect_ratio || "square";

      // Get prompting guide for context
      const guide =
        modelType !== "auto" ? getPromptingGuide(modelType) : null;

      let systemContext = `You are helping generate an image with ComfyUI.\n\n`;

      if (guide) {
        systemContext += `Model type: ${guide.modelType}\n`;
        systemContext += `Prompting style: ${guide.promptingStyle.replace("_", " ")}\n`;
        systemContext += `Supports negative prompts: ${guide.supportsNegativePrompt}\n`;
        systemContext += `Supports weights: ${guide.supportsPromptWeights}\n\n`;
        systemContext += `Tips for this model:\n`;
        guide.tips.slice(0, 3).forEach((tip) => {
          systemContext += `- ${tip}\n`;
        });
      } else {
        systemContext += `Model will be auto-detected. Call comfyui_get_status first - it reports the detected architecture and which guide it calls for.\n`;
      }

      return {
        description: "Generate an image with appropriate settings",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `${systemContext}\n\nGenerate an image of: ${prompt}\n\nAspect ratio preference: ${aspectRatio}\n\nPlease:\n1. First call comfyui_get_status to see the detected architecture\n2. Then call comfyui_get_prompting_guide for it, and comfyui_search_tags if it wants a fixed tag vocabulary\n3. Finally, use comfyui_run_workflow with a prompt written to that guide`,
            },
          },
        ],
      };
    }

    case "learn-prompting": {
      const modelType = args.model_type || "all";

      let modelList = "";
      if (modelType === "all") {
        modelList = Object.entries(PROMPTING_GUIDES)
          .map(([key, guide]) => `- ${key}: ${guide.modelType}`)
          .join("\n");
      }

      return {
        description: "Learn prompting techniques",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Teach me how to write effective prompts for ${modelType === "all" ? "AI image generation" : modelType}.\n\n${modelType === "all" ? `Available model types:\n${modelList}\n\n` : ""}Please:\n1. Call comfyui_get_prompting_guide with model type: ${modelType}\n2. Explain the key differences between model types${modelType === "all" ? "" : " compared to others"}\n3. Provide 3 example prompts showing the correct style\n4. Highlight common mistakes to avoid\n5. Give me a practice exercise to try`,
            },
          },
        ],
      };
    }

    default:
      throw new ToolError(
        `Unknown prompt: ${name}`,
        `Available prompts: ${listPrompts().map((prompt) => prompt.name).join(", ")}.`
      );
  }
}
