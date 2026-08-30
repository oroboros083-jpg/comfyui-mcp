/**
 * Running workflows and retrieving their output, plus the workflow-file tools
 * that coordinate with the human's open ComfyUI tabs.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { defineTool } from "../register.js";
import { ensureConnected } from "../connection.js";
import {
  dataResult,
  textResult,
  errorResult,
  formattedResult,
  ToolResult,
} from "../../utils/response.js";
import { runWorkflowSchema, getImageSchema, getImage, autoRunName } from "../../tools/generate.js";
import { uploadImageSchema, uploadImage } from "../../tools/upload.js";
import {
  describeImageSchema,
  describeImage,
  chooseBackends,
  resolveImageReference,
  renderDescription,
} from "../../tools/describe.js";
import { runWorkflowAsync } from "../../tools/generate-async.js";
import { workflowVersion, decideWrite } from "../../tools/workflow-version.js";
import { recordWorkflowBase, getWorkflowBase } from "../../db/index.js";
import { WorkflowConflictError } from "../../utils/errors.js";
import {
  listOpenWorkflowsSchema,
  readWorkflowSchema,
  writeWorkflowSchema,
  getTabState,
  flushWorkflow,
  reloadWorkflow,
  readWorkflowFile,
  writeWorkflowFile,
  diffWorkflows,
  WriteNotPermittedError,
  BRIDGE_MISSING_HINT,
  ComfyUITarget,
} from "../../tools/workflow-files.js";
import { ServerContext } from "../../context.js";

/** MCP content blocks, which for generation results interleave text and images. */
type MixedContent = Array<{
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}>;

/** Build the content array for a finished generation. */
export function imagesToContent(
  lead: string,
  images: Array<{ data?: string; mimeType?: string; path?: string }>
): ToolResult {
  const content: MixedContent = [{ type: "text", text: lead }];

  for (const img of images) {
    if (img.data) {
      content.push({
        type: "image",
        data: img.data,
        mimeType: img.mimeType || "image/jpeg",
      });
    } else if (img.path) {
      content.push({ type: "text", text: `Saved: ${img.path}` });
    }
  }

  return { content } as unknown as ToolResult;
}

/**
 * Which ComfyUI the workflow-file tools should talk to, with the credential.
 * Built here rather than passed as a bare url so an authenticated instance
 * cannot silently 401 its way into "TabBridge is not installed".
 */
function workflowTarget(c: ServerContext): ComfyUITarget {
  return { baseUrl: c.discoveredUrl!, apiKey: c.config.comfyui.apiKey };
}

export function registerGenerationTools(
  server: McpServer,
  ctx: () => ServerContext
): void {
  defineTool(server, {
    name: "run_workflow",
    description:
      "Run a ComfyUI workflow given as a JSON OBJECT (API format). Async by default: returns a task ID " +
      "immediately, then use comfyui_get_task for progress and comfyui_get_task_result for output. Set " +
      "sync:true to block until it finishes.\n\n" +
      "Pass 'name' with something descriptive ('sunset_portrait_v2'): both of those tools accept it in " +
      "place of the task id, so it is how you retrieve this run later without keeping the id.\n\n" +
      "Use this rather than the official Comfy MCP's `run_workflow` when the graph is in hand rather " +
      "than in a file - theirs takes a path only. It also takes 'collectText' with node ids, which is " +
      "the only way to read a node's TEXT output (a captioner, a text encoder); their `fetch_outputs` " +
      "returns files. Runs submitted here are NOT visible to their `job(...)` or `fetch_outputs`, " +
      "which read comfy-cli's own state files - track them with comfyui_get_task.\n\n" +
      "Start from comfyui_recommend_workflow (which matches a model to a graph shape) or from a saved " +
      "snippet via comfyui_get_user_snippet, rather than assembling a workflow by hand.",
    schema: runWorkflowSchema,
    requiresConnection: true,
    annotations: {
      title: "Run Workflow",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (input) => {
      const { client, ws } = await ensureConnected();
      const c = ctx();

      // One path for both modes: a sync run is the async run plus a wait.
      // Sync used to be a separate implementation, which is how the two
      // drifted, and this handler then had to retroactively fabricate the
      // job record that the async path creates up front.
      const { task, completion } = await runWorkflowAsync(
        c.server,
        c.jobManager,
        client,
        ws,
        { ...input, name: input.name ?? autoRunName() },
        c.config.outputDir,
        c.config.outputSizeThreshold
      );

      if (!input.sync) {
        return dataResult({
          ...task,
          hint: "Started in the background. Use comfyui_get_task for progress, comfyui_get_task_result when complete.",
        });
      }

      await completion;

      const job = c.jobManager.getJob(task.taskId);
      if (!job || job.status === "failed") {
        return errorResult(
          `Workflow failed: ${job?.error ?? "no result was recorded"}`,
          "Write it with comfyui_write_workflow and validate that path with the official Comfy MCP's validate_workflow."
        );
      }
      if (job.status === "cancelled") {
        return errorResult(`Workflow was cancelled (prompt_id: ${task.promptId}).`);
      }
      if (!job.result) {
        return errorResult(
          `Workflow finished but recorded no result (prompt_id: ${task.promptId}).`,
          "comfyui_get_history has what ComfyUI itself recorded for this prompt."
        );
      }

      return imagesToContent(
        `Workflow completed (prompt_id: ${task.promptId}).`,
        job.result.images
      );
    },
  });

  defineTool(server, {
    name: "describe_image",
    description:
      "Run an image through an installed tagger or captioner and return what it says is in it. Use " +
      "this on a reference image BEFORE writing a prompt from it: it answers in the vocabulary the " +
      "diffusion model was trained on, which your own description of the image is not. A booru model " +
      "does not know 'glancing over her shoulder'; it knows 'looking_back'.\n\n" +
      "Pass 'promptingStyle' from comfyui_get_prompting_guide and the right kind of backend is " +
      "chosen - a tagger for booru_tags models, a captioner otherwise. Pass 'backends' to choose " +
      "explicitly, or to run a tagger AND a captioner in one call ('backends': ['wd14','florence2']); " +
      "each answer stays labelled by backend.\n\n" +
      "Backends: 'wd14' (Danbooru tags), 'florence2' (prose caption, plus OCR and grounded/region " +
      "tasks via 'prompt'), 'joycaption' (prose written specifically for diffusion training data). " +
      "Each needs its custom node installed; the captioners also need a text preview node such as " +
      "ComfyUI's built-in PreviewAny to return their caption at all.\n\n" +
      "Returns: { reference, descriptions: [{ backend, kind, nodeType, values }], hint }. Errors " +
      "naming the repos to install when no backend is present.",
    schema: describeImageSchema,
    requiresConnection: true,
    annotations: {
      title: "Describe Image (Tagger/Captioner)",
      readOnlyHint: false,
      // Uploads the image into input/ and runs a graph; it writes, but it
      // replaces nothing.
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (input) => {
      const c = ctx();
      const { client, ws } = await ensureConnected();

      const objectInfo = c.objectInfo ?? (await client.getObjectInfo());
      const chosen = chooseBackends(objectInfo, input);
      const reference = await resolveImageReference(client, input);

      // The one execution path. Each backend graph goes through
      // runWorkflowAsync like everything else, awaited rather than tracked,
      // and `collectText` names only the nodes this module built.
      const run = async (workflow: Record<string, unknown>) => {
        const { task, completion } = await runWorkflowAsync(
          c.server,
          c.jobManager,
          client,
          ws,
          {
            workflow,
            outputMode: "file",
            sync: true,
            name: `describe ${reference}`,
          } as Parameters<typeof runWorkflowAsync>[4],
          c.config.outputDir,
          c.config.outputSizeThreshold
        );
        await completion;

        const job = c.jobManager.getJob(task.taskId);
        if (!job?.result?.success) {
          throw new Error(job?.error ?? "the backend graph recorded no result");
        }
        return job.result.outputs;
      };

      const result = await describeImage(reference, chosen, run, input.prompt);
      return formattedResult(
        input.response_format,
        result,
        () => renderDescription(result),
        "Request one backend at a time with 'backends'."
      );
    },
  });

  defineTool(server, {
    name: "get_image",
    description:
      "Retrieve an image from ComfyUI's output directory as an image content block, BY FILENAME. Use " +
      "when you know the filename; comfyui_get_task_result returns images for a task without one.\n\n" +
      "Being keyed by filename rather than by prompt id is the point: this can show you an image a " +
      "HUMAN just made in the browser, which the official Comfy MCP's `fetch_outputs` cannot - that " +
      "is keyed by a comfy-cli prompt id, and a browser generation has none.",
    schema: getImageSchema,
    requiresConnection: true,
    annotations: {
      title: "Get Generated Image",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) => {
      const { client } = await ensureConnected();
      const result = await getImage(client, input);

      if (!result.success) {
        return errorResult(
          `Could not fetch image: ${result.error}`,
          "Check the filename and subfolder. comfyui_get_history lists recent output filenames."
        );
      }

      return {
        content: [
          {
            type: "image",
            data: result.data,
            mimeType: result.mimeType || "image/png",
          },
        ],
      } as unknown as ToolResult;
    },
  });

  defineTool(server, {
    name: "upload_image",
    description:
      "Put an image into ComfyUI's input directory so a LoadImage node can read it, and return the " +
      "reference to use. Every img2img, inpainting, ControlNet and image-to-video workflow needs this " +
      "first: LoadImage reads only from that directory, so neither a file on disk nor a previous " +
      "generation is reachable until it is uploaded.\n\n" +
      "Give 'path' for a local file, or 'from_output' to feed a generated image back in (upscaling, " +
      "refinement, animating a still). Exactly one of the two.\n\n" +
      "'from_output' is the mode the official Comfy MCP has no equivalent for: its `upload_file` " +
      "takes paths on THIS machine, so an output that lives in ComfyUI's own directory - or on a " +
      "remote ComfyUI - is out of its reach. That copy happens server-side here, so the bytes never " +
      "travel through this conversation or the local disk. Use `upload_file` for a plain local file " +
      "if you prefer; use this for the refine loop.\n\n" +
      "Returns: { filename, subfolder, type, reference, width, height, format, sizeBytes }. Use " +
      "'reference' verbatim - with overwrite false, ComfyUI stores a colliding name as 'photo (1).png' " +
      "and the workflow must name the file that actually exists. 'width'/'height' are the uploaded " +
      "image's own, for sizing the latent or a resize node.\n\n" +
      "Errors if the path is unreadable, the file is not a raster image, or it exceeds 64MB. SVG " +
      "markup goes through comfyui_render_svg instead.",
    schema: uploadImageSchema,
    requiresConnection: true,
    annotations: {
      title: "Upload Input Image",
      readOnlyHint: false,
      // Writes a new file into input/. Only overwrite:true can replace one,
      // and that is the caller asking for it explicitly.
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (input) => {
      const { client } = await ensureConnected();
      return dataResult(await uploadImage(client, input));
    },
  });

  // === Workflow files ===

  defineTool(server, {
    name: "list_open_workflows",
    description:
      "List the workflows currently open in the user's ComfyUI browser tabs, and which have UNSAVED " +
      "changes. Call before rewriting a workflow file: a tab holding it keeps showing the old graph " +
      "and, with autosave on, writes its stale copy back over yours. Requires the ComfyUI-TabBridge " +
      "custom node.",
    schema: listOpenWorkflowsSchema,
    requiresConnection: true,
    annotations: {
      title: "List Open Workflow Tabs",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async () => {
      const state = await getTabState(workflowTarget(ctx()));
      if (!state) return dataResult({ available: false, hint: BRIDGE_MISSING_HINT });
      return dataResult(state);
    },
  });

  defineTool(server, {
    name: "read_workflow",
    description:
      "Read a workflow file as JSON. FLUSHES any open ComfyUI tab first, so what you get includes the " +
      "human's unsaved edits rather than the last thing that happened to reach disk. Reads through " +
      "ComfyUI, so never a cached copy. Returns { found, path, version, workflow, flushed }, or " +
      "{ found: false, path } when the file does not exist.\n\n" +
      "`version` identifies exactly this content. comfyui_write_workflow needs it to tell your own " +
      "changes apart from someone else's, and remembers it for you - so read a workflow once before " +
      "editing it, and that write and its follow-ups are protected.",
    schema: readWorkflowSchema,
    requiresConnection: true,
    annotations: {
      title: "Read Workflow File",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) => {
      const c = ctx();
      const base = workflowTarget(c);

      // Flush FIRST, unconditionally. The version recorded below becomes the
      // base that comfyui_write_workflow compares against, and a base that
      // omits the human's unsaved tab edits is a base that will later call
      // their work "no change" and let a write walk over it. On a clean tab
      // this returns immediately; only a dirty one costs the wait.
      const flushed = await flushWorkflow(base, input.path, 4);

      const wf = await readWorkflowFile(
        base,
        input.path,
        c.config.workflowWriteDirs ?? []
      );
      if (wf === null) return dataResult({ found: false, path: input.path });

      // Recording the version here is what lets comfyui_write_workflow refuse
      // a write over someone else's edit without the caller having to carry a
      // token by hand. The write re-bases on success, so a read is needed once
      // per file, not once per write.
      const version = workflowVersion(wf);
      recordWorkflowBase(input.path, version, c.config.agentId);

      return textResult(
        JSON.stringify({ found: true, path: input.path, version, flushed, workflow: wf }),
        "This workflow is very large; read it in ComfyUI directly."
      );
    },
  });

  defineTool(server, {
    name: "write_workflow",
    description:
      "Write a workflow file SAFELY: flushes any open tab so unsaved human edits reach disk, checks the " +
      "file has not changed since you read it, writes, then tells the tab to re-read it. Every step is " +
      "automatic and cannot be skipped. ALWAYS use this instead of writing workflow JSON with a file " +
      "tool - and note the official Comfy MCP's `set_workflow_slot(stdout=false)` writes in place with " +
      "no version check at all, so it cannot detect a concurrent edit.\n\n" +
      "REFUSES rather than overwriting when the file changed after your comfyui_read_workflow (a human " +
      "or another agent got there first), and when an existing file has not been read at all. Both " +
      "refusals name what to do; force: true is the only way past either. Creating a new file needs no " +
      "read.\n\n" +
      "Returns the new `version`, so a follow-up write to the same path needs no fresh read.\n\n" +
      "Writes go through ComfyUI's user directory by default; other locations must be granted in " +
      "workflowWriteDirs in the MCP config file, which is edited by hand and has no tool.",
    schema: writeWorkflowSchema,
    requiresConnection: true,
    annotations: {
      title: "Write Workflow File",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (input) => {
      const c = ctx();
      const base = workflowTarget(c);
      const granted = c.config.workflowWriteDirs ?? [];

      // 1. Flush, so unsaved hand edits land on disk and show up in the
      //    diff below instead of being destroyed by this write.
      // Always. See read_workflow: the human can edit between our read and
      // this write, so the flush at read time does not cover this window.
      const flushed = await flushWorkflow(base, input.path, 4);

      // 2. Read back what is on disk NOW (post-flush, so a tab's unsaved
      //    edits are part of it) and decide whether this write is safe.
      let diff = null;
      let existing: unknown = null;
      try {
        existing = await readWorkflowFile(base, input.path, granted);
        if (existing) diff = diffWorkflows(existing, input.workflow);
      } catch {
        // Unreadable: treated as absent below, which routes to the unbased
        // refusal rather than to a silent overwrite.
      }

      const theirs = existing === null ? null : workflowVersion(existing);
      const recorded = getWorkflowBase(input.path);
      const expected = input.expected_version ?? recorded?.version ?? null;
      const verdict = decideWrite({
        exists: existing !== null,
        base: expected,
        theirs,
        force: input.force,
      });

      if (!verdict.allowed) {
        throw new WorkflowConflictError(
          verdict.reason === "changed"
            ? `"${input.path}" changed since you read it, so this write was refused ` +
              `rather than overwriting that change.` +
              (diff?.any ? `\n\nWhat changed on disk:\n${diff.summary}` : "") +
              (recorded?.agentId ? `\n\nLast written via this server by: ${recorded.agentId}` : "")
            : `"${input.path}" already exists and has not been read in this session, ` +
              `so there is no known state to compare against and this write was refused.`,
          verdict.reason === "changed"
            ? "Call comfyui_read_workflow to get the current graph and its version, fold " +
              "their change into yours, then write again. Pass force: true only if you " +
              "have decided their change should not survive."
            : "Call comfyui_read_workflow on this path first - it returns the version this " +
              "write needs. Pass force: true only to overwrite it unread."
        );
      }

      // 3. Write.
      let written: string;
      try {
        written = await writeWorkflowFile(base, input.path, input.workflow, granted);
      } catch (err) {
        const permission = err instanceof WriteNotPermittedError;
        return errorResult(
          err instanceof Error ? err.message : String(err),
          permission
            ? "Add the directory to workflowWriteDirs in the MCP config file. There is no tool for this on purpose - it is the human's decision."
            : undefined
        );
      }

      // 4. Reload, so the tab is not left on the old graph.
      // Always. ComfyUI restores a workflow from cached session state rather
      // than re-reading the file, so a tab left unreloaded sits on the old
      // graph and can autosave it back over what was just written.
      const reloaded = await reloadWorkflow(base, input.path, true);

      // 5. Re-base. The file this agent now knows about is the one it just
      //    wrote, so the next write compares against that rather than against
      //    the pre-write state - which would be stale and refuse its own
      //    follow-up edit.
      const newVersion = workflowVersion(input.workflow);
      recordWorkflowBase(input.path, newVersion, c.config.agentId);

      // `human_edits_detected` reports a diff that SURVIVED the safety check,
      // which now means one of two things: the write was forced over a
      // conflict, or the diff is simply this write's own intended change. It
      // is no longer evidence that someone's edits were destroyed - the
      // refusal above is what handles that - so it no longer claims they were.
      return dataResult({
        written: true,
        path: written,
        version: newVersion,
        flushed,
        reloaded,
        write_reason: verdict.reason,
        human_edits_detected: diff?.any ?? false,
        ...(diff?.any
          ? {
              their_changes: diff.summary,
              ...(verdict.reason === "forced"
                ? {
                    action_required:
                      "You forced this write over a change someone else had made, and it is now gone. Read the diff, work out what they were doing, and fold it back in.",
                  }
                : {}),
            }
          : {}),
      });
    },
  });
}
