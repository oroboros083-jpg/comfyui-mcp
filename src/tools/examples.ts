import { z } from "zod";

// ComfyUI examples from https://comfyanonymous.github.io/ComfyUI_examples/
// Workflows are distributed as PNG images with embedded metadata
export interface ExampleWorkflow {
  name: string;
  description: string;
  category: string;
  pageUrl: string;
  imageUrls: string[]; // PNG images with embedded workflows
  requiredNodes?: string[];
  requiredModels?: {
    type: string;
    suggestions: string[];
  }[];
}

// Map of example pages to their workflow images
export const EXAMPLE_WORKFLOWS: ExampleWorkflow[] = [
  // Basic Text-to-Image
  {
    name: "Basic txt2img",
    description: "Simple text-to-image generation with a checkpoint model",
    category: "basics",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/ComfyUI_00001_.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        suggestions: [
          "sd_xl_base_1.0.safetensors",
          "v1-5-pruned-emaonly.safetensors",
        ],
      },
    ],
  },
  // Image-to-Image
  {
    name: "Image-to-Image (img2img)",
    description: "Transform an existing image using a prompt",
    category: "basics",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/img2img/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/img2img/img2img_example.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        suggestions: ["sd_xl_base_1.0.safetensors"],
      },
    ],
  },
  // Inpainting
  {
    name: "Inpainting",
    description: "Edit specific regions of an image using a mask",
    category: "inpainting",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/inpaint_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/inpaint/inpaint_model_example.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        suggestions: ["sd_xl_base_1.0_inpainting.safetensors"],
      },
    ],
  },
  // LoRA
  {
    name: "LoRA",
    description: "Apply LoRA models to modify style or concepts",
    category: "lora",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/lora/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/lora/lora_example.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        suggestions: ["sd_xl_base_1.0.safetensors"],
      },
      {
        type: "lora",
        suggestions: ["example_lora.safetensors"],
      },
    ],
  },
  // ControlNet
  {
    name: "ControlNet",
    description: "Guide image generation with control images (pose, depth, edges)",
    category: "controlnet",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/controlnet_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/controlnet_preprocessor_example.png",
    ],
    requiredNodes: ["ControlNetLoader", "ControlNetApply"],
    requiredModels: [
      {
        type: "controlnet",
        suggestions: [
          "control_v11p_sd15_canny.safetensors",
          "diffusers_xl_canny_full.safetensors",
        ],
      },
    ],
  },
  // Upscaling
  {
    name: "Upscaling",
    description: "Increase image resolution using upscale models",
    category: "upscale",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/upscale_models/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/upscale_models/upscale_example.png",
    ],
    requiredNodes: ["UpscaleModelLoader", "ImageUpscaleWithModel"],
    requiredModels: [
      {
        type: "upscale_models",
        suggestions: ["4x-UltraSharp.pth", "RealESRGAN_x4plus.pth"],
      },
    ],
  },
  // SDXL
  {
    name: "SDXL with Refiner",
    description: "Two-stage SDXL generation with base and refiner models",
    category: "sdxl",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/sdxl/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/sdxl/sdxl_simple_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/sdxl/sdxl_refiner_example.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        suggestions: ["sd_xl_base_1.0.safetensors", "sd_xl_refiner_1.0.safetensors"],
      },
    ],
  },
  // SD3
  {
    name: "Stable Diffusion 3",
    description: "Generate with SD3 architecture",
    category: "sd3",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/sd3/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/sd3/sd3_simple_example.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        suggestions: ["sd3_medium.safetensors", "sd3.5_large.safetensors"],
      },
    ],
  },
  // Flux
  {
    name: "Flux",
    description: "High-quality generation with Flux models",
    category: "flux",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/flux/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_dev_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/flux/flux_schnell_example.png",
    ],
    requiredNodes: ["UNETLoader", "DualCLIPLoader"],
    requiredModels: [
      {
        type: "unet",
        suggestions: ["flux1-dev.safetensors", "flux1-schnell.safetensors"],
      },
      {
        type: "clip",
        suggestions: ["t5xxl_fp16.safetensors", "clip_l.safetensors"],
      },
      {
        type: "vae",
        suggestions: ["ae.safetensors"],
      },
    ],
  },
  // Video - AnimateDiff
  {
    name: "AnimateDiff",
    description: "Generate animated videos from text or images",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/animatediff/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/animatediff/animatediff_example.png",
    ],
    requiredNodes: ["ADE_AnimateDiffLoaderWithContext"],
  },
  // Video - SVD
  {
    name: "Stable Video Diffusion",
    description: "Generate videos from images using SVD",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/svd/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/svd/svd_example.png",
    ],
    requiredNodes: ["ImageOnlyCheckpointLoader", "SVD_img2vid_Conditioning"],
    requiredModels: [
      {
        type: "checkpoint",
        suggestions: ["svd_xt_1_1.safetensors"],
      },
    ],
  },
  // Audio
  {
    name: "Stable Audio",
    description: "Generate audio and music",
    category: "audio",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/audio/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/audio/stable_audio_example.png",
    ],
    requiredNodes: ["StableAudioSampler"],
  },
  // Area Composition
  {
    name: "Area Composition",
    description: "Generate different content in specific image regions",
    category: "advanced",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/area_composition/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/area_composition/area_example.png",
    ],
  },
  // Embeddings
  {
    name: "Textual Inversion / Embeddings",
    description: "Use trained embeddings for specific concepts",
    category: "embeddings",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/textual_inversion_embeddings/",
    imageUrls: [],
  },
];

/**
 * Extract workflow JSON from PNG metadata
 * ComfyUI embeds workflow data in PNG tEXt chunks with key "workflow" or "prompt"
 */
export async function extractWorkflowFromPng(
  imageData: ArrayBuffer
): Promise<{ workflow?: Record<string, unknown>; prompt?: Record<string, unknown> } | null> {
  const data = new Uint8Array(imageData);

  // PNG signature check
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (data[i] !== pngSignature[i]) {
      return null; // Not a PNG
    }
  }

  const result: { workflow?: Record<string, unknown>; prompt?: Record<string, unknown> } = {};

  // Parse PNG chunks
  let offset = 8;
  while (offset < data.length) {
    // Read chunk length (4 bytes, big-endian)
    const length =
      (data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3];
    offset += 4;

    // Read chunk type (4 bytes)
    const type = String.fromCharCode(
      data[offset],
      data[offset + 1],
      data[offset + 2],
      data[offset + 3]
    );
    offset += 4;

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
        // iTXt: key\0compression\0language\0translated\0text
        // Skip compression flag, method, language tag, translated keyword
        let valueStart = nullIndex + 1;
        let nullCount = 0;
        for (let i = valueStart; i < chunkData.length && nullCount < 3; i++) {
          if (chunkData[i] === 0) {
            nullCount++;
            valueStart = i + 1;
          }
        }
        value = new TextDecoder().decode(chunkData.slice(valueStart));
      }

      // Parse workflow or prompt JSON
      if (key === "workflow" || key === "prompt") {
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
    const response = await fetch(imageUrl);
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

export const listExamplesSchema = z.object({
  category: z
    .string()
    .optional()
    .describe(
      "Filter by category (basics, sdxl, flux, video, audio, controlnet, etc.)"
    ),
});

export type ListExamplesInput = z.infer<typeof listExamplesSchema>;

export function listExamples(input: ListExamplesInput): string {
  let examples = EXAMPLE_WORKFLOWS;

  if (input.category) {
    const cat = input.category.toLowerCase();
    examples = examples.filter((e) => e.category.toLowerCase().includes(cat));
  }

  // Group by category
  const grouped: Record<string, ExampleWorkflow[]> = {};
  for (const example of examples) {
    if (!grouped[example.category]) {
      grouped[example.category] = [];
    }
    grouped[example.category].push(example);
  }

  let result = "# ComfyUI Example Workflows\n\n";
  result +=
    "These examples are from the official ComfyUI documentation.\n";
  result += "Use `get_example_workflow` to fetch the actual workflow JSON.\n\n";

  for (const [category, categoryExamples] of Object.entries(grouped)) {
    result += `## ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
    for (const example of categoryExamples) {
      result += `### ${example.name}\n`;
      result += `${example.description}\n`;
      result += `- Documentation: ${example.pageUrl}\n`;
      result += `- Workflow images: ${example.imageUrls.length}\n`;
      if (example.requiredModels) {
        result += `- Required models:\n`;
        for (const model of example.requiredModels) {
          result += `  - ${model.type}: ${model.suggestions.join(" or ")}\n`;
        }
      }
      if (example.requiredNodes) {
        result += `- Required nodes: ${example.requiredNodes.join(", ")}\n`;
      }
      result += "\n";
    }
  }

  return result;
}

export const getExampleWorkflowSchema = z.object({
  name: z.string().describe("Name of the example workflow to fetch"),
  variant: z
    .number()
    .optional()
    .default(0)
    .describe("Which variant to get (0 = first/default)"),
});

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
    return `Example "${input.name}" not found. Use list_examples to see available examples.`;
  }

  if (example.imageUrls.length === 0) {
    return `Example "${example.name}" does not have workflow images available. Visit ${example.pageUrl} for more information.`;
  }

  const variantIndex = Math.min(input.variant, example.imageUrls.length - 1);
  const imageUrl = example.imageUrls[variantIndex];

  const result = await fetchExampleWorkflow(imageUrl);

  if (!result.success) {
    return `Failed to fetch workflow: ${result.error}\n\nYou can manually visit: ${imageUrl}`;
  }

  let output = `# ${example.name} Workflow\n\n`;
  output += `Source: ${imageUrl}\n\n`;

  // Return the prompt (API format) which is what ComfyUI actually executes
  if (result.prompt) {
    output += `## Workflow (API Format)\n`;
    output += "This can be used directly with the `run_workflow` tool:\n\n";
    output += "```json\n";
    output += JSON.stringify(result.prompt, null, 2);
    output += "\n```\n";
  }

  if (example.requiredModels) {
    output += `\n## Required Models\n`;
    for (const model of example.requiredModels) {
      output += `- ${model.type}: ${model.suggestions.join(" or ")}\n`;
    }
  }

  return output;
}
