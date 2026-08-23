/**
 * Reading an image into something a model can act on.
 *
 * The gap this closes: an agent handed a reference image can describe what it
 * thinks it sees, but it cannot say what the *diffusion model* would call it.
 * A booru model does not know "she is glancing over her shoulder"; it knows
 * `looking_back`. Running the image through the same class of classifier that
 * labelled the training data turns an image into prompt-ready vocabulary
 * instead of a paraphrase.
 *
 * Backends live in `describe/backends.ts` so a new SOTA tagger is a row. This
 * module is the orchestration: pick backends, build each graph, run it, and
 * pull back text from the node ids it built - never from the graph at large.
 */

import { z } from "zod";

import { ComfyUIClient, ObjectInfo } from "../client/comfyui.js";
import { ToolError } from "../utils/errors.js";
import { responseFormatField } from "../utils/response.js";
import { collectTextOutputs, TextOutput } from "./outputs.js";
import { uploadImage } from "./upload.js";
import {
  DESCRIBE_BACKENDS,
  DescribeKind,
  ResolvedBackend,
  availableBackends,
  backendById,
  preferredBackendIds,
  resolveBackend,
} from "./describe/backends.js";

export const describeImageSchema = z
  .object({
    path: z
      .string()
      .optional()
      .describe(
        "Absolute path to an image on this machine. Exactly one of 'path', 'from_output' or " +
          "'reference' is required."
      ),
    from_output: z
      .object({
        filename: z.string(),
        subfolder: z.string().optional().default(""),
        type: z.enum(["output", "input", "temp"]).optional().default("output"),
      })
      .strict()
      .optional()
      .describe("An image ComfyUI already has - typically a previous generation."),
    reference: z
      .string()
      .optional()
      .describe(
        "An image already in ComfyUI's input directory, as comfyui_upload_image reported it " +
          "(e.g. 'refs/photo.png'). Use this to describe the same image twice without " +
          "re-uploading."
      ),
    backends: z
      .array(z.string())
      .optional()
      .describe(
        "Backend ids to run, e.g. ['wd14'] for tags, ['wd14','florence2'] for tags AND prose in " +
          "one call. Each result stays labelled by backend. Omitted, one is chosen from " +
          "'promptingStyle' - or from what is installed."
      ),
    promptingStyle: z
      .enum(["booru_tags", "natural_language", "keywords", "hybrid"])
      .optional()
      .describe(
        "The prompting style of the model you intend to generate with, as reported by " +
          "comfyui_get_prompting_guide. 'booru_tags' picks a tagger so the description comes " +
          "back in the vocabulary that model was trained on; anything else picks a captioner."
      ),
    prompt: z
      .string()
      .optional()
      .describe(
        "A steer for the backends that take one - a question for Florence-2, an extra " +
          "instruction for JoyCaption. Ignored by WD14, which has no text input."
      ),
    response_format: responseFormatField,
  })
  .strict();

export type DescribeImageInput = z.infer<typeof describeImageSchema>;

export interface BackendDescription {
  backend: string;
  displayName: string;
  kind: DescribeKind;
  /** The node type that actually ran, from the backend's candidate list. */
  nodeType: string;
  /** Tags for a tagger, one or more sentences for a captioner. */
  values: string[];
  error?: string;
}

export interface DescribeImageResult {
  /** The LoadImage reference the description was taken from. */
  reference: string;
  descriptions: BackendDescription[];
  /** What to do with the answer. */
  hint: string;
}

/**
 * Nothing installed is a `ToolError` naming the repos, not an empty result.
 *
 * A tool that answers "no backends" with a success and an empty array reads
 * as "this image has nothing in it", which is the wrong lesson entirely.
 */
export class NoDescribeBackendError extends ToolError {
  constructor(requested?: string[]) {
    const rows = DESCRIBE_BACKENDS.map((b) => `- ${b.displayName}: ${b.install}`).join("\n");
    super(
      requested?.length
        ? `None of the requested backends (${requested.join(", ")}) are installed in this ComfyUI.`
        : "No image tagger or captioner is installed in this ComfyUI.",
      `Install one of these custom nodes and call comfyui_restart_comfyui:\n${rows}\n\n` +
        "Florence-2 and JoyCaption also need a text preview node to return their caption - " +
        "ComfyUI's built-in PreviewAny is enough. Check what is present with " +
        "comfyui_list_nodes({ search: 'tagger' })."
    );
  }
}

/**
 * Choose which backends to run.
 *
 * Explicit ids win, and an id naming an uninstalled backend is an error
 * rather than a silent substitution - a caller that asked for tags and
 * received prose has been misled about what it is holding.
 */
export function chooseBackends(
  objectInfo: ObjectInfo,
  input: Pick<DescribeImageInput, "backends" | "promptingStyle">
): ResolvedBackend[] {
  if (input.backends?.length) {
    const chosen: ResolvedBackend[] = [];
    for (const id of input.backends) {
      const backend = backendById(id);
      if (!backend) {
        throw new ToolError(
          `Unknown describe backend '${id}'.`,
          `Known backends: ${DESCRIBE_BACKENDS.map((b) => b.id).join(", ")}.`
        );
      }
      const resolved = resolveBackend(backend, objectInfo);
      if (resolved) chosen.push(resolved);
    }
    if (!chosen.length) throw new NoDescribeBackendError(input.backends);
    return chosen;
  }

  const installed = availableBackends(objectInfo);
  if (!installed.length) throw new NoDescribeBackendError();

  // Preference order, first hit wins. Falling through to whatever is
  // installed matters more than getting the ideal one: a prose caption is
  // still worth far more than an error.
  for (const id of preferredBackendIds(input.promptingStyle)) {
    const hit = installed.find((resolved) => resolved.backend.id === id);
    if (hit) return [hit];
  }
  return [installed[0]!];
}

/** Resolve the three input shapes down to one LoadImage reference. */
export async function resolveImageReference(
  client: ComfyUIClient,
  input: DescribeImageInput
): Promise<string> {
  const given = [input.path, input.from_output, input.reference].filter(Boolean);
  if (given.length !== 1) {
    throw new ToolError(
      given.length === 0
        ? "No image given: pass one of 'path', 'from_output' or 'reference'."
        : "Pass exactly one of 'path', 'from_output' or 'reference'.",
      "'path' for a file on disk, 'from_output' for an image ComfyUI made, 'reference' for one " +
        "comfyui_upload_image already put in the input directory."
    );
  }

  if (input.reference) return input.reference;

  // Both remaining shapes are what upload_image already handles, so it does
  // the work rather than this module growing a second copy of it.
  const uploaded = await uploadImage(client, {
    path: input.path,
    from_output: input.from_output,
    subfolder: "",
    overwrite: false,
  } as Parameters<typeof uploadImage>[1]);

  return uploaded.reference;
}

/** How one backend's graph is submitted and waited on. */
export type DescribeRunner = (
  workflow: Record<string, unknown>
) => Promise<Record<string, unknown>>;

/**
 * Run each chosen backend and label its answer.
 *
 * `run` is injected rather than reaching for the websocket here: the
 * execution path lives in generate-async.ts and this module should not grow
 * a second one, which is the drift CLAUDE.md warns about.
 */
export async function describeImage(
  reference: string,
  chosen: ResolvedBackend[],
  run: DescribeRunner,
  prompt?: string
): Promise<DescribeImageResult> {
  const descriptions: BackendDescription[] = [];

  for (const { backend, nodeType, terminalType } of chosen) {
    const built = backend.build({ imageRef: reference, nodeType, terminalType, prompt });

    try {
      const outputs = await run(built.workflow);
      // The node ids this module built, and nothing else in the graph.
      const collected: TextOutput[] = collectTextOutputs(outputs, {
        fromNodes: built.textNodes,
      });
      descriptions.push({
        backend: backend.id,
        displayName: backend.displayName,
        kind: backend.kind,
        nodeType,
        values: backend.parse(collected),
      });
    } catch (error) {
      // One backend failing must not lose the others' answers - the
      // tag-and-prose pairing is the common case and half of it is useful.
      descriptions.push({
        backend: backend.id,
        displayName: backend.displayName,
        kind: backend.kind,
        nodeType,
        values: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { reference, descriptions, hint: hintFor(descriptions) };
}

/** What to do with the answer, which depends on what came back. */
function hintFor(descriptions: BackendDescription[]): string {
  const gotTags = descriptions.some((d) => d.kind === "tags" && d.values.length);
  const gotProse = descriptions.some((d) => d.kind === "prose" && d.values.length);

  if (gotTags) {
    // Closing the loop: what is in the image, then what to write.
    return (
      "These are Danbooru tags, usable in a prompt as-is on a booru model. " +
      "comfyui_search_tags confirms any one of them and reports how well represented it is; " +
      "comfyui_related_tags extends the set with what commonly co-occurs." +
      (gotProse ? " The prose caption is the same image described for a natural-language model." : "")
    );
  }
  if (gotProse) {
    return (
      "A natural-language caption, suited to a model that prompts in prose. For a booru model, " +
      "run the same image through the 'wd14' backend instead - its tags go straight into a " +
      "prompt, where a caption has to be translated first."
    );
  }
  return (
    "No backend returned any text. Check the backend node is present with comfyui_list_nodes, " +
    "and that a text preview node (PreviewAny) exists for the captioner backends."
  );
}

export function renderDescription(result: DescribeImageResult): string {
  const lines = [`# Description of ${result.reference}`, ""];

  for (const description of result.descriptions) {
    lines.push(`## ${description.displayName} (${description.kind})`, "");
    if (description.error) {
      lines.push(`Failed: ${description.error}`, "");
      continue;
    }
    if (!description.values.length) {
      lines.push("Returned no text.", "");
      continue;
    }
    lines.push(
      description.kind === "tags"
        ? description.values.join(", ")
        : description.values.join("\n\n"),
      ""
    );
  }

  lines.push(result.hint);
  return lines.join("\n");
}
