// Re-export types
export { ModelDownload, ExampleWorkflow } from "./types.js";

// Import all example arrays
import { BASICS_EXAMPLES } from "./basics.js";
import { CONTROLNET_EXAMPLES } from "./controlnet.js";
import { SDXL_EXAMPLES } from "./sdxl.js";
import { SD3_EXAMPLES } from "./sd3.js";
import { FLUX_EXAMPLES } from "./flux.js";
import { NEXT_GEN_EXAMPLES } from "./next-gen.js";
import { HUNYUAN_EXAMPLES } from "./hunyuan.js";
import { VIDEO_EXAMPLES } from "./video.js";
import { AUDIO_EXAMPLES } from "./audio.js";
import { _3D_EXAMPLES } from "./3d.js";

// Combined array of all examples
export const EXAMPLE_WORKFLOWS = [
  ...BASICS_EXAMPLES,
  ...CONTROLNET_EXAMPLES,
  ...SDXL_EXAMPLES,
  ...SD3_EXAMPLES,
  ...FLUX_EXAMPLES,
  ...NEXT_GEN_EXAMPLES,
  ...HUNYUAN_EXAMPLES,
  ...VIDEO_EXAMPLES,
  ...AUDIO_EXAMPLES,
  ..._3D_EXAMPLES,
];

// Re-export individual arrays for direct access
export {
  BASICS_EXAMPLES,
  CONTROLNET_EXAMPLES,
  SDXL_EXAMPLES,
  SD3_EXAMPLES,
  FLUX_EXAMPLES,
  NEXT_GEN_EXAMPLES,
  HUNYUAN_EXAMPLES,
  VIDEO_EXAMPLES,
  AUDIO_EXAMPLES,
  _3D_EXAMPLES,
};
