import { ExampleWorkflow } from "./types.js";

export const AUDIO_EXAMPLES: ExampleWorkflow[] = [
  {
    name: "Audio Generation (ACE Step / Stable Audio)",
    description: "Generate audio and music using ACE Step or Stable Audio Open models",
    category: "audio",
    pageUrl: "https://comfyanonymous.github.io/ComfyUI_examples/audio/",
    imageUrls: [], // FLAC files with embedded workflows
    requiredNodes: ["StableAudioSampler"],
    requiredModels: [
      {
        type: "checkpoint",
        name: "ace_step_v1_3.5b.safetensors",
        url: "https://huggingface.co/Comfy-Org/ACE-Step_ComfyUI_repackaged/blob/main/all_in_one/ace_step_v1_3.5b.safetensors",
        destination: "ComfyUI/models/checkpoints",
      },
      {
        type: "text_encoder",
        name: "t5_base.safetensors",
        url: "https://huggingface.co/google-t5/t5-base/blob/main/model.safetensors",
        destination: "ComfyUI/models/text_encoders",
      },
      {
        type: "checkpoint",
        name: "stable_audio_open_1.0.safetensors",
        url: "https://huggingface.co/stabilityai/stable-audio-open-1.0/tree/main",
        destination: "ComfyUI/models/checkpoints",
      },
    ],
    notes: "FLAC audio files contain embedded workflows that can be loaded into ComfyUI.",
  }
];
