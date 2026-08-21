import { z } from "zod";

export const restartComfyUISchema = z.object({
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Restart even if generations are running or queued. Restarting drops them."
    ),
  timeoutSeconds: z
    .number()
    .int()
    .min(10)
    .max(600)
    .optional()
    .default(180)
    .describe(
      "How long to wait for ComfyUI to come back before reporting failure. Loading many custom nodes or large models can take a while."
    ),
}).strict();

export type RestartComfyUIInput = z.infer<typeof restartComfyUISchema>;
