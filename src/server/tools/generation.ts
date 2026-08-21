/**
 * Running workflows and retrieving their output, plus the workflow-file tools
 * that coordinate with the human's open ComfyUI tabs.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { defineTool } from "../register.js";
import { ensureConnected } from "../connection.js";
import { dataResult, textResult, errorResult, ToolResult } from "../../utils/response.js";
import { runWorkflowSchema, getImageSchema, getImage } from "../../tools/generate.js";
import { runWorkflowAsync } from "../../tools/generate-async.js";
import {
  listOpenWorkflowsSchema,
  flushWorkflowSchema,
  reloadWorkflowSchema,
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

export function registerGenerationTools(
  server: McpServer,
  ctx: () => ServerContext
): void {
  defineTool(server, {
    name: "run_workflow",
    description:
      "Run a ComfyUI workflow in API-format JSON. Async by default: returns a task ID immediately, then " +
      "use comfyui_get_task for progress and comfyui_get_task_result for output. Set sync:true to block " +
      "until it finishes.\n\n" +
      "Pass 'name' with something descriptive ('sunset_portrait_v2') so the result can be found later " +
      "with comfyui_get_generation_by_name.\n\n" +
      "Start from comfyui_get_example_workflow or comfyui_get_template rather than assembling a workflow " +
      "by hand, and run comfyui_validate_workflow first if you did assemble one.",
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
        input,
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
          "Run comfyui_validate_workflow on this workflow to find structural problems."
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
    name: "get_image",
    description:
      "Retrieve a generated image from ComfyUI's output directory as an image content block. Use when " +
      "you know the filename; comfyui_get_task_result returns images for a task without needing one.",
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
      const state = await getTabState(ctx().discoveredUrl!);
      if (!state) return dataResult({ available: false, hint: BRIDGE_MISSING_HINT });
      return dataResult(state);
    },
  });

  defineTool(server, {
    name: "flush_workflow",
    description:
      "Ask any open tab to SAVE a workflow now, and wait for it to settle. Use before overwriting a " +
      "workflow so the human's unsaved edits reach disk, where they can be read and taken into account " +
      "instead of being destroyed by your write. comfyui_write_workflow does this for you.",
    schema: flushWorkflowSchema,
    requiresConnection: true,
    annotations: {
      title: "Flush Workflow Tab",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) => {
      const result = await flushWorkflow(
        ctx().discoveredUrl!,
        input.path,
        input.wait_seconds ?? 4
      );
      return dataResult({
        ...result,
        hint: result.requested ? undefined : BRIDGE_MISSING_HINT,
      });
    },
  });

  defineTool(server, {
    name: "reload_workflow",
    description:
      "Tell open tabs to re-read a workflow from disk after it was rewritten. Necessary because ComfyUI " +
      "restores a workflow from cached session state rather than re-reading the file, so a tab can sit " +
      "on a stale graph indefinitely and autosave it back. comfyui_write_workflow does this for you.",
    schema: reloadWorkflowSchema,
    requiresConnection: true,
    annotations: {
      title: "Reload Workflow Tab",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (input) => {
      const ok = await reloadWorkflow(
        ctx().discoveredUrl!,
        input.path,
        input.save_first !== false
      );
      return dataResult({ requested: ok, hint: ok ? undefined : BRIDGE_MISSING_HINT });
    },
  });

  defineTool(server, {
    name: "read_workflow",
    description:
      "Read a workflow file as JSON. Reads through ComfyUI so it always sees the current file rather " +
      "than a cached copy. Returns { found: false, path } when the file does not exist.",
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
      const wf = await readWorkflowFile(
        c.discoveredUrl!,
        input.path,
        c.config.workflowWriteDirs ?? []
      );
      if (wf === null) return dataResult({ found: false, path: input.path });
      return textResult(
        JSON.stringify(wf),
        "This workflow is very large; read it in ComfyUI directly."
      );
    },
  });

  defineTool(server, {
    name: "write_workflow",
    description:
      "Write a workflow file SAFELY: flushes any open tab so unsaved human edits reach disk, diffs the " +
      "existing file against what you are about to write, writes, then tells the tab to reload. ALWAYS " +
      "use this instead of writing workflow JSON with a file tool.\n\n" +
      "If the returned diff is non-empty the human had edited that workflow - read it and fold their " +
      "intent into what you generate, rather than regenerating it away.\n\n" +
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
      const base = c.discoveredUrl!;
      const granted = c.config.workflowWriteDirs ?? [];

      // 1. Flush, so unsaved hand edits land on disk and show up in the
      //    diff below instead of being destroyed by this write.
      let flushed = null;
      if (!input.skip_flush) flushed = await flushWorkflow(base, input.path, 4);

      // 2. Diff what is there against what we are about to write.
      let diff = null;
      try {
        const existing = await readWorkflowFile(base, input.path, granted);
        if (existing) diff = diffWorkflows(existing, input.workflow);
      } catch {
        // Unreadable or absent: nothing to compare, carry on and write.
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
      let reloaded = false;
      if (!input.skip_reload) reloaded = await reloadWorkflow(base, input.path, true);

      return dataResult({
        written: true,
        path: written,
        flushed,
        reloaded,
        human_edits_detected: diff?.any ?? false,
        ...(diff?.any
          ? {
              their_changes: diff.summary,
              action_required:
                "The human had edited this workflow. Those edits were just overwritten. Read the diff, work out what they were doing, and fold it into the generator so it survives the next regeneration.",
            }
          : {}),
      });
    },
  });
}
