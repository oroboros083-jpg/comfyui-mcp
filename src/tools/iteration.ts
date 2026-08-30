/**
 * Two-stage planning: farm cheap, render properly.
 *
 * The failure this exists to stop is farming seeds and prompts on a
 * 20-step model because nothing said a 4-step one was installed. The
 * inverse failure is worse though, and is the reason this tool says more
 * than "use the fast one": **what survives the jump to the final render
 * depends entirely on which kind of fast path you took.**
 *
 * | Draft path | Carries over |
 * |---|---|
 * | Same base model + a distill LoRA (Lightning, Hyper, LCM, DMD2, TCD) | Composition largely survives at the same seed. The draft is a real preview. |
 * | A separate distilled checkpoint (flux1-schnell -> flux1-dev) | Different weights, so the same seed gives a different image. Only the prompt and the framing intent transfer. |
 *
 * Implying a free upgrade in the second case is worse than saying nothing,
 * because it invites farming fifty seeds that mean nothing. So every result
 * carries `seedCarryOver` and every rendering states it.
 */

import { z } from "zod";
import { ComfyUIClient } from "../client/comfyui.js";
import { MODEL_PATTERNS, ModelPattern } from "./examples/recommend.js";
import { responseFormatField } from "../utils/response.js";

/**
 * LoRAs that distil a base model down to a handful of steps.
 *
 * These are the ones that keep the base weights, which is what makes the
 * draft a genuine preview of the final render rather than a different
 * picture of the same idea. Ordered most-specific-first: `dmd2` before the
 * bare `lcm`, because a DMD2 file often names LCM in the same filename.
 */
export const DISTILL_LORA_PATTERNS: ReadonlyArray<{
  id: string;
  pattern: RegExp;
  /** Steps this LoRA is trained for. */
  steps: number;
  /** Distilled LoRAs want CFG at or near 1; higher burns the image out. */
  cfg: number;
  sampler: string;
  scheduler: string;
  note: string;
}> = [
  {
    id: "dmd2",
    pattern: /dmd2/i,
    steps: 4,
    cfg: 1,
    sampler: "lcm",
    scheduler: "sgm_uniform",
    note: "DMD2 distillation. 4 steps, CFG 1, lcm sampler.",
  },
  {
    id: "lightning",
    pattern: /lightning/i,
    steps: 8,
    cfg: 1,
    sampler: "euler",
    scheduler: "sgm_uniform",
    note: "Lightning LoRAs come in 2/4/8-step variants; the filename usually says which. CFG 1.",
  },
  {
    id: "hyper",
    // Two shapes, because the releases use two. `Hyper-SDXL-8steps-lora` and
    // `Hyper-SD15-...` name the base right after "hyper"; `Hyper-FLUX.1-dev-
    // 8steps-lora` puts the base in between. Anchoring on the step count for
    // the second shape keeps "hyper_realistic_style" out.
    pattern: /hyper[\s._-]?sd|hyper.*?\d+[\s._-]?steps?/i,
    steps: 8,
    cfg: 1,
    sampler: "euler",
    scheduler: "sgm_uniform",
    note: "Hyper-SD. Step count is in the filename (1/2/4/8). CFG 1.",
  },
  {
    id: "turbo",
    pattern: /turbo/i,
    steps: 4,
    cfg: 1,
    sampler: "euler",
    scheduler: "sgm_uniform",
    note: "Turbo LoRA. 1-4 steps, CFG 1.",
  },
  {
    id: "tcd",
    pattern: /\btcd\b/i,
    steps: 8,
    cfg: 1.5,
    sampler: "tcd",
    scheduler: "sgm_uniform",
    note: "TCD trades a little CFG headroom for stability; 1.5 is usually safe.",
  },
  {
    id: "lcm",
    pattern: /\blcm\b/i,
    steps: 6,
    cfg: 1.5,
    sampler: "lcm",
    scheduler: "sgm_uniform",
    note: "LCM. 4-8 steps with the lcm sampler and sgm_uniform scheduler.",
  },
];

/** The distill LoRA a filename names, if any. */
export function distillLoraFor(name: string) {
  return DISTILL_LORA_PATTERNS.find((l) => l.pattern.test(name));
}

/** The MODEL_PATTERNS row a filename matches, first-match-wins as elsewhere. */
export function patternFor(name: string): ModelPattern | undefined {
  return MODEL_PATTERNS.find((p) => p.pattern.test(name));
}

export const planIterationSchema = z
  .object({
    model: z
      .string()
      .describe(
        "The model you intend to render the final image with, e.g. 'flux1-dev.safetensors'."
      ),
    seed: z
      .number()
      .int()
      .optional()
      .describe(
        "Seed to echo in both stages so the two runs can be compared deliberately. Omitted, one is chosen."
      ),
    availableCheckpoints: z
      .array(z.string())
      .optional()
      .describe("Override the installed checkpoint list instead of asking ComfyUI."),
    availableUnets: z
      .array(z.string())
      .optional()
      .describe("Override the installed diffusion-model list instead of asking ComfyUI."),
    availableLoras: z
      .array(z.string())
      .optional()
      .describe("Override the installed LoRA list instead of asking ComfyUI."),
    response_format: responseFormatField,
  })
  .strict();

export type PlanIterationInput = z.infer<typeof planIterationSchema>;

/**
 * What a same-seed re-run actually preserves.
 *
 * - `composition` — same base weights, a distill LoRA bypassed for the final
 *   render. Layout, pose and framing largely survive.
 * - `prompt-only` — different weights. The seed is not comparable; only the
 *   prompt and your framing intent carry.
 * - `none` — no draft path found, so there is nothing to carry from.
 */
export type SeedCarryOver = "composition" | "prompt-only" | "none";

export interface IterationStage {
  /** "draft" or "final". */
  stage: "draft" | "final";
  model: string;
  /** LoRA to apply, for the distill-LoRA draft path. */
  lora?: string;
  loraStrength?: number;
  steps: number;
  cfg: number;
  sampler?: string;
  scheduler?: string;
  seed: number;
  note: string;
}

export interface IterationPlan {
  /** Absent when nothing fast is installed. */
  draft?: IterationStage;
  final: IterationStage;
  seedCarryOver: SeedCarryOver;
  /** How the draft was found, or what is missing and how to get it. */
  note: string;
  /** Set when nothing fast is installed: what to download. */
  suggestedDownloads?: string[];
}

/** A seed a human can recognise in a log, rather than 0. */
function pickSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

/**
 * Build the two-stage plan.
 *
 * Model lists come from the caller when supplied and from ComfyUI otherwise,
 * so this is unit-testable without an instance and still correct with one.
 */
export async function planIteration(
  client: ComfyUIClient | undefined,
  input: PlanIterationInput
): Promise<IterationPlan> {
  let checkpoints = input.availableCheckpoints;
  let unets = input.availableUnets;
  let loras = input.availableLoras;

  if ((!checkpoints || !unets || !loras) && client) {
    const models = await client.getModels();
    checkpoints ??= models.checkpoints;
    unets ??= models.unet;
    loras ??= models.loras;
  }
  checkpoints ??= [];
  unets ??= [];
  loras ??= [];

  const seed = input.seed ?? pickSeed();
  const finalPattern = patternFor(input.model);

  const final: IterationStage = {
    stage: "final",
    model: input.model,
    steps: finalPattern?.defaultSteps ?? 20,
    cfg: finalPattern?.defaultCfg ?? 7,
    seed,
    note: finalPattern?.notes ?? "No settings pattern matched; these are generic defaults.",
  };

  // Path 1: a distill LoRA for the same base weights. Preferred, because it
  // is the only path where the draft actually previews the final image.
  const lora = loras.map((name) => ({ name, hit: distillLoraFor(name) })).find((l) => l.hit);
  if (lora?.hit) {
    return {
      draft: {
        stage: "draft",
        model: input.model,
        lora: lora.name,
        loraStrength: 1,
        steps: lora.hit.steps,
        cfg: lora.hit.cfg,
        sampler: lora.hit.sampler,
        scheduler: lora.hit.scheduler,
        seed,
        note: lora.hit.note,
      },
      final,
      seedCarryOver: "composition",
      note:
        `Draft on the same base model with '${lora.name}' applied, then re-run at the same ` +
        `seed with the LoRA removed. Same weights, so composition largely survives the jump ` +
        `- the draft is a real preview, and farming seeds on it is worth doing.\n\n` +
        `One exception: a distill LoRA wants CFG ${lora.hit.cfg}, and REGIONAL conditioning ` +
        `(ConditioningSetArea and friends) rides on CFG. If the workflow binds prompts to ` +
        `areas, the draft will not preview those regions whatever the seed - dial that in on ` +
        `the final settings.`,
    };
  }

  // Path 2: a separate distilled checkpoint. Useful for prompt wording, not
  // for seed farming, and the response has to say so.
  const draftModel = [...checkpoints, ...unets].find((name) => {
    if (name === input.model) return false;
    return patternFor(name)?.tier === "draft";
  });

  if (draftModel) {
    const draftPattern = patternFor(draftModel)!;
    return {
      draft: {
        stage: "draft",
        model: draftModel,
        steps: draftPattern.defaultSteps,
        cfg: draftPattern.defaultCfg,
        sampler: "euler",
        scheduler: "sgm_uniform",
        seed,
        note: draftPattern.notes,
      },
      final,
      seedCarryOver: "prompt-only",
      note:
        `'${draftModel}' is a separate distilled model, not the same weights as ` +
        `'${input.model}'. The same seed will give a DIFFERENT image on the final render, so ` +
        `use this stage to settle prompt wording and framing - not to farm seeds. ` +
        `Seed farming only pays off once you are on the final model, or on a distill LoRA ` +
        `over it.`,
    };
  }

  // Nothing fast installed. Name the remedy rather than shrugging.
  return {
    final,
    seedCarryOver: "none",
    note:
      `Nothing fast is installed for '${input.model}', so every iteration costs a full ` +
      `${final.steps}-step render. A distill LoRA over this same model is the cheapest fix ` +
      `and the only draft path that previews composition at the same seed. Call ` +
      `the official Comfy MCP's \`download_model\` for one of the suggestions below.`,
    suggestedDownloads: suggestedDistillLoras(finalPattern?.architecture),
  };
}

/**
 * What to fetch when nothing fast is installed.
 *
 * Named by search term rather than by URL: filenames and repo layouts move,
 * and the official Comfy MCP's download_model is what resolves them.
 */
export function suggestedDistillLoras(architecture?: string): string[] {
  switch (architecture) {
    case "flux":
      return ["Hyper-FLUX.1-dev 8-step LoRA", "FLUX.1-Turbo-Alpha LoRA"];
    case "sdxl":
    case "illustrious":
    case "noobai":
    case "pony":
    case "animagine":
      return ["SDXL Lightning 8-step LoRA", "DMD2 SDXL 4-step LoRA", "Hyper-SDXL 8-step LoRA"];
    case "sd15":
      return ["LCM-LoRA SD1.5", "Hyper-SD15 8-step LoRA"];
    case "wan":
      return ["Wan 2.x Lightning / LightX2V LoRA"];
    default:
      return [
        "A distill LoRA for this architecture - search for 'lightning', 'hyper', 'lcm' or 'dmd2' alongside the model family name",
      ];
  }
}

function renderStage(stage: IterationStage): string[] {
  const lines = [
    `### ${stage.stage === "draft" ? "1. Draft" : "2. Final"}`,
    "",
    `- Model: ${stage.model}`,
  ];
  if (stage.lora) lines.push(`- LoRA: ${stage.lora} (strength ${stage.loraStrength ?? 1})`);
  lines.push(
    `- Steps: ${stage.steps}`,
    `- CFG: ${stage.cfg}`
  );
  if (stage.sampler) lines.push(`- Sampler: ${stage.sampler}`);
  if (stage.scheduler) lines.push(`- Scheduler: ${stage.scheduler}`);
  lines.push(`- Seed: ${stage.seed}`, "", stage.note);
  return lines;
}

const CARRY_OVER_HEADLINE: Record<SeedCarryOver, string> = {
  composition: "Composition carries over at the same seed.",
  "prompt-only": "Only the prompt carries over. The same seed gives a different image.",
  none: "No draft stage - nothing carries over because there is nothing to carry from.",
};

export function renderIterationPlan(plan: IterationPlan): string {
  const lines = [
    `# Iteration plan for ${plan.final.model}`,
    "",
    `**${CARRY_OVER_HEADLINE[plan.seedCarryOver]}**`,
    "",
    plan.note,
    "",
  ];

  if (plan.draft) lines.push(...renderStage(plan.draft), "");
  lines.push(...renderStage(plan.final));

  if (plan.suggestedDownloads?.length) {
    lines.push("", "## Worth downloading", "");
    for (const item of plan.suggestedDownloads) lines.push(`- ${item}`);
    lines.push("", "Resolve any of these with the official Comfy MCP's `download_model`.");
  }

  return lines.join("\n");
}
