/**
 * MCP Prompts Handler
 *
 * Provides pre-built prompts to guide users through common ComfyUI workflows.
 */

import { ServerContext } from "../context.js";
import {
  getPromptingGuide,
  PROMPTING_GUIDES,
} from "../resources/prompting-guide.js";
import { EXAMPLE_WORKFLOWS } from "../tools/examples.js";

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
    {
      name: "setup-comfyui",
      title: "Setup ComfyUI",
      description:
        "Get step-by-step instructions for setting up ComfyUI with models",
      arguments: [
        {
          name: "platform",
          description: "Your operating system: macos, windows, or linux",
          required: false,
        },
        {
          name: "model_type",
          description:
            "What type of models to set up: flux, sdxl, sd15, or all",
          required: false,
        },
      ],
    },
    {
      name: "run-example",
      title: "Run Example Workflow",
      description:
        "Get an example workflow ready to run with guidance on required models",
      arguments: [
        {
          name: "example_name",
          description: "Name of the example (use list_examples to see options)",
          required: true,
        },
      ],
    },
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
  ctx: ServerContext,
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
        systemContext += `Model will be auto-detected. Call get_capabilities first to determine the best prompting approach.\n`;
      }

      return {
        description: "Generate an image with appropriate settings",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `${systemContext}\n\nGenerate an image of: ${prompt}\n\nAspect ratio preference: ${aspectRatio}\n\nPlease:\n1. First call get_capabilities to understand the available models\n2. Then call get_prompting_guide with the detected model type\n3. Finally, use generate_image with an optimized prompt based on the guide`,
            },
          },
        ],
      };
    }

    case "setup-comfyui": {
      const platform = args.platform || "auto";
      const modelType = args.model_type || "flux";

      return {
        description: "Setup instructions for ComfyUI",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Help me set up ComfyUI for ${modelType} image generation on ${platform}.\n\nPlease:\n1. First call get_status to check if ComfyUI is already installed/running\n2. If not installed, call get_install_guide for platform: ${platform}\n3. Then call get_model_guide for model type: ${modelType}\n4. List the specific models I need to download with list_downloads\n5. Provide step-by-step instructions for a complete working setup`,
            },
          },
        ],
      };
    }

    case "run-example": {
      const exampleName = args.example_name || "Basic txt2img";

      // Find the example to provide context
      const example = EXAMPLE_WORKFLOWS.find(
        (e) => e.name.toLowerCase() === exampleName.toLowerCase()
      );

      let contextInfo = "";
      if (example) {
        contextInfo = `\n\nExample info:\n- Category: ${example.category}\n- Description: ${example.description}`;
        if (example.requiredModels && example.requiredModels.length > 0) {
          contextInfo += `\n- Required models: ${example.requiredModels.map((m) => `${m.type} (${m.suggestions.join(", ")})`).join(", ")}`;
        }
      }

      return {
        description: `Run the ${exampleName} example workflow`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `I want to run the "${exampleName}" example workflow.${contextInfo}\n\nPlease:\n1. Call get_example_workflow with name: "${exampleName}"\n2. Check what models are required and compare against installed models with list_models\n3. If any required models are missing, show how to download them with download_model\n4. Once ready, help me run the workflow with run_workflow\n5. Explain what this workflow does and how I can customize it`,
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
              text: `Teach me how to write effective prompts for ${modelType === "all" ? "AI image generation" : modelType}.\n\n${modelType === "all" ? `Available model types:\n${modelList}\n\n` : ""}Please:\n1. Call get_prompting_guide with model type: ${modelType}\n2. Explain the key differences between model types${modelType === "all" ? "" : " compared to others"}\n3. Provide 3 example prompts showing the correct style\n4. Highlight common mistakes to avoid\n5. Give me a practice exercise to try`,
            },
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}
