/**
 * Image-to-text backends, one row each.
 *
 * Shaped like `architectures/registry.ts` for the same reason: SOTA moves,
 * and absorbing a new tagger should be an entry rather than a rewrite. A row
 * says which node types can serve it, what shape of answer it gives, and how
 * to build and read its graph.
 *
 * Two things about ComfyUI make these rows less uniform than they look:
 *
 * 1. **`nodeTypes` is a list, not a string.** JoyCaption is the reason: it has
 *    at least four competing ComfyUI wrappers with different node names, so
 *    pinning one picks a winner the user may not have installed. Candidates
 *    are resolved against the live `object_info` and the first one the
 *    instance actually offers wins - the same pattern `resolveClipType()`
 *    uses for `clipTypeHints`.
 *
 * 2. **Only an OUTPUT_NODE reaches `history[...].outputs`.** WD14Tagger is one
 *    (`{"ui": {"tags": [...]}}`), so its graph is self-terminating. Florence2
 *    and JoyCaption are not - they return a plain STRING - so their graphs end
 *    in a preview node, and `terminalNode` is what makes the difference
 *    explicit instead of a surprise at run time.
 *
 * Node names, inputs and return shapes below were read from each project's
 * source, not inferred; the comment on each row says which.
 */

import { ObjectInfo } from "../../client/comfyui.js";
import { TextOutput } from "../outputs.js";

/** What kind of answer a backend gives. */
export type DescribeKind = "tags" | "prose";

export interface BackendBuildContext {
  /** The LoadImage reference for the image being described, e.g. "refs/a.png". */
  imageRef: string;
  /** Resolved node type for this backend, from `nodeTypes`. */
  nodeType: string;
  /**
   * Resolved terminal preview node type, when the backend needs one.
   * Undefined only when `terminalNode` is absent from the row.
   */
  terminalType?: string;
  /** Free-text steer, where the backend takes one. */
  prompt?: string;
}

export interface BuiltDescribeGraph {
  workflow: Record<string, unknown>;
  /**
   * The node ids whose text to collect. Named explicitly rather than
   * discovered, which is the whole point of the node-scoped collection in
   * outputs.ts - nothing else in the graph is admitted.
   */
  textNodes: string[];
}

export interface DescribeBackend {
  id: string;
  displayName: string;
  /** Candidate ComfyUI node types, best first. */
  nodeTypes: string[];
  /**
   * Candidate terminal preview nodes, best first, for backends whose own node
   * is not an OUTPUT_NODE. Absent means the backend's node terminates itself.
   */
  terminalNode?: string[];
  kind: DescribeKind;
  /** Where to get it, named in the error when nothing is installed. */
  install: string;
  /** One line on when to reach for this one. */
  goodFor: string;
  build(context: BackendBuildContext): BuiltDescribeGraph;
  /** Turn the collected text into the strings this backend actually produced. */
  parse(collected: TextOutput[]): string[];
}

/** ComfyUI core's PreviewAny, then the common third-party equivalents. */
const TEXT_PREVIEW_NODES = ["PreviewAny", "ShowText|pysssss", "PreviewString", "DisplayText"];

/**
 * Split a comma-separated tag string into tags.
 *
 * WD14 emits one comma-joined string per image, optionally with escaped
 * parentheses for the booru convention - `ganyu_\(genshin_impact\)`. Those
 * escapes are for a prompt box, not for a reader, so they come off here.
 */
export function splitTags(text: string): string[] {
  return text
    .split(",")
    .map((tag) => tag.trim().replace(/\\([()])/g, "$1"))
    .filter(Boolean);
}

/**
 * Detection and segmentation are somebody else's job.
 *
 * Florence-2 has grounded modes, and it is tempting to reach for them because
 * the node is already here. Purpose-built models - SAM3, Grounding DINO, the
 * YOLO family - beat a captioner at boxes and masks by a wide margin, so a
 * mediocre coordinate path built on this row would be the wrong thing in the
 * codebase rather than a missing feature.
 *
 * If someone wants coordinates, that is a new row for a real detector, not a
 * `task` parameter on this one.
 */
export const DESCRIBE_BACKENDS: DescribeBackend[] = [
  {
    // Node name, inputs and the {"ui": {"tags": ...}} output read from
    // wd14tagger.py in pythongosssss/ComfyUI-WD14-Tagger. OUTPUT_NODE = True,
    // so no preview node is needed.
    id: "wd14",
    displayName: "WD14 Tagger (SmilingWolf models)",
    nodeTypes: ["WD14Tagger|pysssss"],
    kind: "tags",
    install: "https://github.com/pythongosssss/ComfyUI-WD14-Tagger",
    goodFor:
      "Danbooru tags, in the exact vocabulary the booru models were trained on. Describing a " +
      "reference image in the same words the model learned is the point - a caption in prose " +
      "has to be translated before it can be prompted with.",
    build: ({ imageRef, nodeType }) => ({
      workflow: {
        "1": { class_type: "LoadImage", inputs: { image: imageRef } },
        "2": {
          class_type: nodeType,
          inputs: {
            image: ["1", 0],
            model: "wd-v1-4-moat-tagger-v2",
            threshold: 0.35,
            character_threshold: 0.85,
            replace_underscore: false,
            trailing_comma: false,
            exclude_tags: "",
          },
        },
      },
      textNodes: ["2"],
    }),
    parse: (collected) => collected.flatMap((entry) => splitTags(entry.text)),
  },
  {
    // Node names and the ("image","mask","caption","data") return read from
    // nodes.py in kijai/ComfyUI-Florence2. Florence2Run is NOT an output
    // node, so the caption has to be walked to a preview node to appear in
    // history at all.
    id: "florence2",
    displayName: "Florence-2 (Microsoft)",
    nodeTypes: ["Florence2Run"],
    terminalNode: TEXT_PREVIEW_NODES,
    kind: "prose",
    install: "https://github.com/kijai/ComfyUI-Florence2",
    goodFor:
      "A natural-language caption. Florence-2 can also do grounded tasks - OCR, region " +
      "captioning, phrase grounding - but this backend does NOT expose them: `task` is fixed " +
      "to a caption below, and the graph reads only the caption output. Nothing here returns " +
      "coordinates.",
    build: ({ imageRef, nodeType, terminalType, prompt }) => ({
      workflow: {
        "1": { class_type: "LoadImage", inputs: { image: imageRef } },
        "2": {
          class_type: "DownloadAndLoadFlorence2Model",
          inputs: { model: "microsoft/Florence-2-base", precision: "fp16" },
        },
        "3": {
          class_type: nodeType,
          inputs: {
            image: ["1", 0],
            florence2_model: ["2", 0],
            text_input: prompt ?? "",
            task: "more_detailed_caption",
            fill_mask: true,
            keep_model_loaded: false,
            max_new_tokens: 1024,
            num_beams: 3,
            do_sample: true,
            output_mask_select: "",
            seed: 1,
          },
        },
        // caption is output index 2 of ("image","mask","caption","data").
        "4": { class_type: terminalType!, inputs: { source: ["3", 2] } },
      },
      textNodes: ["4"],
    }),
    parse: (collected) => collected.map((entry) => entry.text.trim()).filter(Boolean),
  },
  {
    // NODE_CLASS_MAPPINGS keys and the ("query","caption") return read from
    // fpgaminer/joycaption_comfyui (__init__.py and nodes.py). The other
    // forks' names are listed alongside because the author's is not the one
    // most installs have.
    id: "joycaption",
    displayName: "JoyCaption (fpgaminer)",
    nodeTypes: [
      "JJC_JoyCaption",
      "JJC_JoyCaption_Custom",
      "JoyCaption",
      "JoyCaptionPredictor",
      "OlmJoyCaption",
    ],
    terminalNode: TEXT_PREVIEW_NODES,
    kind: "prose",
    install: "https://github.com/fpgaminer/joycaption_comfyui",
    goodFor:
      "A caption written for this corpus. JoyCaption is a VLM built specifically to caption " +
      "diffusion training data, so it neither refuses nor sanitises the way a general-purpose " +
      "VLM does on the same images - which is what makes its output usable as a prompt.",
    build: ({ imageRef, nodeType, terminalType, prompt }) => ({
      workflow: {
        "1": { class_type: "LoadImage", inputs: { image: imageRef } },
        "2": {
          class_type: "JJC_DownloadAndLoadJoyCaptionModel",
          inputs: {
            model: "fancyfeast/llama-joycaption-beta-one-hf-llava",
            memory_mode: "Balanced (8-bit)",
            keep_loaded: false,
          },
        },
        "3": {
          class_type: nodeType,
          inputs: {
            model: ["2", 0],
            image: ["1", 0],
            caption_type: "Descriptive",
            caption_length: "medium-length",
            extra_option1: prompt ?? "",
            extra_option2: "",
            extra_option3: "",
            extra_option4: "",
            extra_option5: "",
            person_name: "",
            max_new_tokens: 512,
            temperature: 0.6,
            top_p: 0.9,
            top_k: 0,
          },
        },
        // caption is output index 1 of ("query","caption"); index 0 is the
        // prompt that was sent, which the caller already knows.
        "4": { class_type: terminalType!, inputs: { source: ["3", 1] } },
      },
      textNodes: ["4"],
    }),
    parse: (collected) => collected.map((entry) => entry.text.trim()).filter(Boolean),
  },
];

export function backendById(id: string): DescribeBackend | undefined {
  return DESCRIBE_BACKENDS.find((backend) => backend.id === id);
}

/** A backend row plus the node types this particular instance offers for it. */
export interface ResolvedBackend {
  backend: DescribeBackend;
  nodeType: string;
  terminalType?: string;
}

/**
 * Pick the node types a live instance actually has.
 *
 * Returns undefined when the instance has none of the candidates, or has the
 * backend but not a preview node to terminate it - the second case is a real
 * failure and used to be the harder one to diagnose, because the graph
 * submits fine and simply returns nothing.
 */
export function resolveBackend(
  backend: DescribeBackend,
  objectInfo: ObjectInfo
): ResolvedBackend | undefined {
  const nodeType = backend.nodeTypes.find((candidate) => candidate in objectInfo);
  if (!nodeType) return undefined;

  if (!backend.terminalNode) return { backend, nodeType };

  const terminalType = backend.terminalNode.find((candidate) => candidate in objectInfo);
  if (!terminalType) return undefined;

  return { backend, nodeType, terminalType };
}

/** Every backend this instance can run, in registry order. */
export function availableBackends(objectInfo: ObjectInfo): ResolvedBackend[] {
  return DESCRIBE_BACKENDS.map((backend) => resolveBackend(backend, objectInfo)).filter(
    (resolved): resolved is ResolvedBackend => resolved !== undefined
  );
}

/**
 * Which backend suits a model's prompting style.
 *
 * Derived from the guide's existing `promptingStyle` rather than from a new
 * registry field: a booru-tag model wants tags back in its own vocabulary,
 * and everything else wants prose. JoyCaption outranks Florence-2 for prose
 * because it was built for this corpus; Florence-2 outranks it when the
 * question is spatial, which the caller expresses by asking for it by id.
 */
export function preferredBackendIds(promptingStyle: string | undefined): string[] {
  if (promptingStyle === "booru_tags") return ["wd14", "joycaption", "florence2"];
  return ["joycaption", "florence2", "wd14"];
}
