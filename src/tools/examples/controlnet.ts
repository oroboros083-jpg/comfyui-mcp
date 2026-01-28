import { ExampleWorkflow } from "./types.js";

export const CONTROLNET_EXAMPLES: ExampleWorkflow[] = [
  {
    name: "ControlNet (Scribble/Lineart)",
    description: "Generate images guided by scribbles or line drawings. Great for sketches or doodles as input.",
    category: "controlnet",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/controlnet_example.png",
    ],
    requiredNodes: ["ControlNetLoader", "ControlNetApply"],
    requiredModels: [
      {
        type: "controlnet",
        name: "control_v11p_sd15_scribble.pth",
        url: "https://huggingface.co/lllyasviel/ControlNet-v1-1/tree/main",
        destination: "ComfyUI/models/controlnet",
      },
    ],
    notes: "Use rough sketches or scribbles as input. Model interprets structure and generates detailed image.",
  },
  {
    name: "ControlNet (Depth)",
    description: "Generate images guided by depth maps. Maintains 3D spatial structure of the input image.",
    category: "controlnet",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/depth_controlnet.png",
    ],
    requiredNodes: ["ControlNetLoader", "ControlNetApply"],
    requiredModels: [
      {
        type: "controlnet",
        name: "control_v11f1p_sd15_depth.pth",
        url: "https://huggingface.co/lllyasviel/ControlNet-v1-1/tree/main",
        destination: "ComfyUI/models/controlnet",
      },
    ],
    notes: "Create depth map from input image using MiDaS or DepthAnything, then use as control signal.",
  },
  {
    name: "T2I-Adapter (Depth)",
    description: "Depth-guided generation using T2I-Adapter. More efficient than ControlNet with minimal quality loss.",
    category: "controlnet",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/depth_t2i_adapter.png",
    ],
    requiredNodes: ["ControlNetLoader", "ControlNetApply"],
    requiredModels: [
      {
        type: "controlnet",
        name: "t2i-adapter_depth_sd15v2.pth",
        url: "https://huggingface.co/TencentARC/T2I-Adapter/tree/main",
        destination: "ComfyUI/models/controlnet",
      },
    ],
    notes: "T2I-Adapters are faster than ControlNets with similar results. Recommended for production use.",
  },
  {
    name: "ControlNet (Pose/OpenPose)",
    description: "Generate images guided by pose skeletons. Control body positioning and gestures of characters.",
    category: "controlnet",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/2_pass_pose_worship.png",
    ],
    requiredNodes: ["ControlNetLoader", "ControlNetApply"],
    requiredModels: [
      {
        type: "controlnet",
        name: "control_v11p_sd15_openpose.pth",
        url: "https://huggingface.co/lllyasviel/ControlNet-v1-1/tree/main",
        destination: "ComfyUI/models/controlnet",
      },
    ],
    notes: "Extract pose from reference image using OpenPose, then generate new image with same pose.",
  },
  {
    name: "ControlNet (Multiple/Combined)",
    description: "Combine multiple ControlNets for complex guidance. E.g., pose + scribble for character with specific appearance.",
    category: "controlnet",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/controlnet/mixing_controlnets.png",
    ],
    requiredNodes: ["ControlNetLoader", "ControlNetApply"],
    requiredModels: [
      {
        type: "controlnet",
        name: "ControlNet v1.1 models",
        url: "https://huggingface.co/lllyasviel/ControlNet-v1-1/tree/main",
        destination: "ComfyUI/models/controlnet",
      },
    ],
    notes: "Chain multiple ControlNetApply nodes. Each adds guidance. Adjust strength per control type.",
  },
  {
    name: "GLIGEN (Text Box Positioning)",
    description: "Spatial control for image generation - specify location and size of multiple objects using text boxes",
    category: "controlnet",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/gligen/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/gligen/gligen_textbox_example.png",
    ],
    requiredModels: [
      {
        type: "other",
        name: "GLIGEN (Pruned)",
        url: "https://huggingface.co/comfyanonymous/GLIGEN_pruned_safetensors/tree/main",
        destination: "ComfyUI/models/gligen",
      },
    ],
    notes: "Use GLIGEN Textbox Apply nodes to position specific concepts precisely within generated imagery.",
  },
  {
    name: "unCLIP (Single Image)",
    description: "Use a single image as a prompt by encoding through CLIPVision. Generate variations of the input image.",
    category: "unclip",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/unclip/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/unclip/unclip_example.png",
    ],
    requiredNodes: ["unCLIPCheckpointLoader", "CLIPVisionEncode", "unCLIPConditioning"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "SD 2.1 unCLIP",
        url: "https://huggingface.co/stabilityai/stable-diffusion-2-1-unclip/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Encode input image with CLIP Vision, use as conditioning. Creates variations maintaining style and content.",
  },
  {
    name: "unCLIP (Multiple Images)",
    description: "Blend concepts from multiple reference images. Combine styles, subjects, or themes from different sources.",
    category: "unclip",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/unclip/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/unclip/unclip_example_multiple.png",
    ],
    requiredNodes: ["unCLIPCheckpointLoader", "CLIPVisionEncode", "unCLIPConditioning"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "SD 2.1 unCLIP",
        url: "https://huggingface.co/stabilityai/stable-diffusion-2-1-unclip/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Chain multiple CLIPVisionEncode + unCLIPConditioning nodes. Adjust strength per image to control influence.",
  },
  {
    name: "unCLIP (Two-Pass)",
    description: "Two-stage unCLIP generation. First pass creates initial image, second pass refines with higher detail.",
    category: "unclip",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/unclip/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/unclip/unclip_2pass.png",
    ],
    requiredNodes: ["unCLIPCheckpointLoader", "CLIPVisionEncode", "unCLIPConditioning"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "SD 2.1 unCLIP",
        url: "https://huggingface.co/stabilityai/stable-diffusion-2-1-unclip/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "First pass at low resolution, second pass upscales and adds detail. Better quality for complex images.",
  }
];
