import { ExampleWorkflow } from "./types.js";

export const NEXT_GEN_EXAMPLES: ExampleWorkflow[] = [
  {
    name: "AuraFlow",
    description: "True open source model with FOSS license for both code and weights",
    category: "aura_flow",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/aura_flow/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/aura_flow/aura_flow_0.2_example.png",
      "https://comfyanonymous.github.io/ComfyUI_examples/aura_flow/aura_flow_0.1_example.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        name: "aura_flow_0.2.safetensors",
        url: "https://huggingface.co/fal/AuraFlow-v0.2/blob/main/aura_flow_0.2.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "aura_flow_0.1.safetensors",
        url: "https://huggingface.co/fal/AuraFlow/blob/main/aura_flow_0.1.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
  },
  {
    name: "SDXL Edit (CosXL Edit)",
    description: "Image editing using text prompts, InstructPix2Pix-style",
    category: "edit",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/edit_models/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/edit_models/sdxl_edit_model.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        name: "cosxl_edit.safetensors",
        url: "https://huggingface.co/stabilityai/cosxl",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
  },
];
