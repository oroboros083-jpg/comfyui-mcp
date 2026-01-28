import { ExampleWorkflow } from "./types.js";

export const VIDEO_EXAMPLES: ExampleWorkflow[] = [
  {
    name: "Stable Video Diffusion (Image-to-Video)",
    description: "Generate videos from images using SVD. 14-frame version for shorter clips.",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/video/",
    imageUrls: [],
    jsonUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/video/workflow_image_to_video.json",
    ],
    requiredNodes: ["ImageOnlyCheckpointLoader", "SVD_img2vid_Conditioning"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "svd.safetensors (14-frame)",
        url: "https://huggingface.co/stabilityai/stable-video-diffusion-img2vid/blob/main/svd.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Generates 14 frames of video from a single image. Use svd_xt for 25 frames.",
  },
  {
    name: "Stable Video Diffusion XT (25-frame)",
    description: "Extended SVD for longer 25-frame video generation from images.",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/video/",
    imageUrls: [],
    jsonUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/video/workflow_image_to_video.json",
    ],
    requiredNodes: ["ImageOnlyCheckpointLoader", "SVD_img2vid_Conditioning"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "svd_xt.safetensors (25-frame)",
        url: "https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/blob/main/svd_xt.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Extended version generates 25 frames. Same workflow as SVD, just swap the checkpoint.",
  },
  {
    name: "Text-to-Video (SDXL + SVD)",
    description: "Full text-to-video pipeline. Generate image with SDXL, then animate with SVD.",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/video/",
    imageUrls: [],
    jsonUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/video/workflow_txt_to_img_to_video.json",
    ],
    requiredNodes: ["ImageOnlyCheckpointLoader", "SVD_img2vid_Conditioning", "CheckpointLoaderSimple"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "sd_xl_base_1.0.safetensors",
        url: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/sd_xl_base_1.0.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "checkpoint",
        name: "svd_xt.safetensors (25-frame)",
        url: "https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/blob/main/svd_xt.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "Two-stage pipeline: SDXL generates base image, SVD animates it. Full text-to-video workflow.",
  },
  {
    name: "Mochi Video",
    description: "State of the art video model for text-to-video generation",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/mochi/",
    imageUrls: [], // WebP files
    requiredModels: [
      {
        type: "diffusion_model",
        name: "mochi_preview_bf16.safetensors",
        url: "https://huggingface.co/Comfy-Org/mochi_preview_repackaged/tree/main/split_files",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "text_encoder",
        name: "t5xxl_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/mochi_preview_repackaged/tree/main/split_files",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "mochi_vae.safetensors",
        url: "https://huggingface.co/Comfy-Org/mochi_preview_repackaged/tree/main/split_files",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "checkpoint",
        name: "mochi_preview_fp8_scaled.safetensors (all-in-one)",
        url: "https://huggingface.co/Comfy-Org/mochi_preview_repackaged/blob/main/all_in_one/mochi_preview_fp8_scaled.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "fp8 files give lower quality than 16-bit versions but may be faster on compatible hardware.",
  },
  {
    name: "LTX-Video",
    description: "Text-to-video and image-to-video generation. Use long descriptive prompts for best results.",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/ltxv/",
    imageUrls: [], // WebP files
    requiredModels: [
      {
        type: "checkpoint",
        name: "ltx-video-2b-v0.9.5.safetensors",
        url: "https://huggingface.co/Lightricks/LTX-Video/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "text_encoder",
        name: "t5xxl_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/mochi_preview_repackaged/tree/main/split_files",
        destination: "ComfyUI/models/text_encoders",
      },
    ],
    notes: "Image-to-video supports guiding images for keyframe control.",
  },
  {
    name: "Hunyuan Video",
    description: "Text-to-video and image-to-video. V2 (replace) follows guiding image closely, V1 (concat) has more dynamic motion.",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/hunyuan_video/",
    imageUrls: [], // WebP files
    requiredModels: [
      {
        type: "text_encoder",
        name: "clip_l.safetensors",
        url: "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/tree/main/split_files/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "text_encoder",
        name: "llava_llama3_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/tree/main/split_files/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "hunyuan_video_vae_bf16.safetensors",
        url: "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/tree/main/split_files/vae",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "diffusion_model",
        name: "hunyuan_video_t2v_720p_bf16.safetensors",
        url: "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/tree/main/split_files/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "hunyuan_video_image_to_video_720p_bf16.safetensors",
        url: "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/tree/main/split_files/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "hunyuan_video_v2_replace_image_to_video_720p_bf16.safetensors",
        url: "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/tree/main/split_files/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "clip_vision",
        name: "llava_llama3_vision.safetensors",
        url: "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/tree/main/split_files/clip_vision",
        destination: "ComfyUI/models/clip_vision",
      },
    ],
    notes: "Can produce static images by setting video length to 1.",
  },
  {
    name: "Nvidia Cosmos",
    description: "Text-to-video and image/video-to-video. Supports motion continuation and interpolation between images.",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/cosmos/",
    imageUrls: [], // WebP files
    jsonUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/cosmos/text_to_video_cosmos_7B.json",
      "https://comfyanonymous.github.io/ComfyUI_examples/cosmos/image_to_video_cosmos_7B.json",
    ],
    requiredModels: [
      {
        type: "text_encoder",
        name: "oldt5_xxl_fp8_e4m3fn_scaled.safetensors",
        url: "https://huggingface.co/comfyanonymous/cosmos_1.0_text_encoder_and_VAE_ComfyUI/tree/main",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "cosmos_cv8x8x8_1.0.safetensors",
        url: "https://huggingface.co/comfyanonymous/cosmos_1.0_text_encoder_and_VAE_ComfyUI/tree/main",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "diffusion_model",
        name: "Cosmos-1_0-Diffusion-7B-Text2World.safetensors",
        url: "https://huggingface.co/mcmonkey/cosmos-1.0/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "Cosmos-1_0-Diffusion-7B-Video2World.safetensors",
        url: "https://huggingface.co/mcmonkey/cosmos-1.0/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
    ],
    notes: "14B variants available from official Nvidia HuggingFace.",
  },
  {
    name: "Nvidia Cosmos Predict2",
    description: "Text-to-image and image-to-video using Cosmos Predict2 models (2B and 14B variants)",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/cosmos_predict2/",
    imageUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/cosmos_predict2/cosmos_predict2_2b_t2i_example.png",
    ],
    requiredModels: [
      {
        type: "text_encoder",
        name: "oldt5_xxl_fp8_e4m3fn_scaled.safetensors",
        url: "https://huggingface.co/comfyanonymous/cosmos_1.0_text_encoder_and_VAE_ComfyUI/tree/main/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "wan_2.1_vae.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/blob/main/split_files/vae/wan_2.1_vae.safetensors",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "diffusion_model",
        name: "cosmos_predict2_2B_t2i.safetensors",
        url: "https://huggingface.co/Comfy-Org/Cosmos_Predict2_repackaged/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "cosmos_predict2_14B_t2i.safetensors",
        url: "https://huggingface.co/Comfy-Org/Cosmos_Predict2_repackaged/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "cosmos_predict2_2B_video2world_480p_16fps.safetensors",
        url: "https://huggingface.co/Comfy-Org/Cosmos_Predict2_repackaged/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
    ],
    notes: "Resolution settings must match model (480p or 720p).",
  },
  {
    name: "Wan 2.1",
    description: "Text-to-video, image-to-video (480p/720p), VACE reference generation, and camera motion control",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/wan/",
    imageUrls: [], // WebP files
    jsonUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/wan/text_to_video_wan.json",
      "https://comfyanonymous.github.io/ComfyUI_examples/wan/image_to_video_wan_example.json",
      "https://comfyanonymous.github.io/ComfyUI_examples/wan/vace_reference_to_video.json",
      "https://comfyanonymous.github.io/ComfyUI_examples/wan/camera_image_to_video_wan_example.json",
    ],
    requiredModels: [
      {
        type: "text_encoder",
        name: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/text_encoders",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "wan_2.1_vae.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/vae",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "diffusion_model",
        name: "wan2.1_t2v_1.3B_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "wan2.1_i2v_480p_14B_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "wan2.1_i2v_720p_14B_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "wan2.1_vace_14B_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "wan2.1_fun_camera_v1.1_1.3B_bf16.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/diffusion_models",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "clip_vision",
        name: "clip_vision_h.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/clip_vision",
        destination: "ComfyUI/models/clip_vision",
      },
    ],
    notes: "VACE reference creates videos derived from reference images without containing the actual image. Camera motion applies dynamic movements.",
  },
  {
    name: "Wan 2.2",
    description: "Text-to-video and image-to-video with 5B and 14B model variants",
    category: "video",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/wan22/",
    imageUrls: [], // WebP files
    jsonUrls: [
      "https://comfyanonymous.github.io/ComfyUI_examples/wan22/text_to_video_wan22_5B.json",
      "https://comfyanonymous.github.io/ComfyUI_examples/wan22/image_to_video_wan22_5B.json",
      "https://comfyanonymous.github.io/ComfyUI_examples/wan22/text_to_video_wan22_14B.json",
      "https://comfyanonymous.github.io/ComfyUI_examples/wan22/image_to_video_wan22_14B.json",
    ],
    requiredModels: [
      {
        type: "text_encoder",
        name: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "vae",
        name: "wan_2.1_vae.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "vae",
        name: "wan2.2_vae.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main",
        destination: "ComfyUI/models/vae",
      },
      {
        type: "diffusion_model",
        name: "wan2.2_ti2v_5B_fp16.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
      {
        type: "diffusion_model",
        name: "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors",
        url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main",
        destination: "ComfyUI/models/diffusion_models",
      },
    ],
    notes: "14B models require both high_noise and low_noise model files.",
  }
];
