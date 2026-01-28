import { ExampleWorkflow } from "./types.js";

export const _3D_EXAMPLES: ExampleWorkflow[] = [
  {
    name: "Stable Zero123 (3D)",
    description: "Generate images of objects from different camera angles. Input image should have simple background.",
    category: "3d",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/3d/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/3d/stable_zero123_example.png",
    ],
    requiredModels: [
      {
        type: "checkpoint",
        name: "stable_zero123.ckpt",
        url: "https://huggingface.co/stabilityai/stable-zero123/blob/main/stable_zero123.ckpt",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Controls object rotation via elevation and azimuth parameters (in degrees).",
  }
];
