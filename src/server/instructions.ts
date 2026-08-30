/**
 * The text every client receives once, at connection time.
 *
 * Two things belong here and nowhere else.
 *
 * The first is the canonical flow. A tool description can only say what that
 * one tool does; it cannot say "read before you write" without repeating
 * itself on both tools and still not being read until one of them is already
 * being called. The handshake is the only place an agent learns the order
 * before it needs it.
 *
 * The second is the division of labour with the official Comfy MCP
 * (`Comfy-Org/comfy-mcp`). This server is a COMPANION to it: it carries only
 * what that server does worse or cannot do at all. MCP servers cannot see each
 * other, so nothing here can be detected at runtime; saying it once is what
 * stops it being rediscovered per call.
 *
 * Where the two overlap, name the FAILURE rather than a preference. "Prefer
 * ours" is a claim about taste that an agent has no reason to weigh; "theirs
 * returns download_job_not_found for a prompt_id this server submitted" is
 * checkable, and it is what actually changes the choice.
 *
 * Keep it short. It rides every handshake, and an instruction block that grows
 * into a manual is one nobody finishes reading.
 */
export const INSTRUCTIONS = `\
A companion to the official Comfy MCP (Comfy-Org/comfy-mcp), carrying what it
does not: prompting knowledge, tag vocabulary, versioned workflow-file editing
against a live browser tab, the real ComfyUI queue, and a run path that takes a
graph object rather than a file path.

Mount both. Use ITS tools for installing ComfyUI, models and custom nodes, for
server lifecycle, for node introspection (its \`nodes\` searches, inspects and
graph-walks the live catalog), and for the Comfy template gallery. None of that
exists here, deliberately.

Canonical flows:

- Call comfyui_get_status first. It reports whether ComfyUI is reachable and
  WHICH ARCHITECTURES are installed - that is what selects a prompting guide.
- Before writing a prompt, call comfyui_get_prompting_guide for the detected
  architecture. Prompting differs sharply between families - the booru-tag
  anime models want ordered tags and quality tokens where Flux wants prose -
  and a guide costs one call against a whole conversation of bad output.
  comfyui_search_tags and comfyui_related_tags resolve specific vocabulary.
- Editing a workflow file is read-then-write. comfyui_read_workflow flushes any
  open browser tab, then returns the graph and a version; comfyui_write_workflow
  uses that version to refuse a write that would overwrite an edit made in the
  meantime, and reloads the tab afterwards. Creating a new file needs no read.
  Never write workflow JSON with a generic file tool: that skips the flush and
  the version check, and silently destroys unsaved edits open in a browser.
- Long generations: comfyui_run_workflow, then comfyui_get_task. Name the run
  and both that and comfyui_get_task_result accept the name in place of the id.

Where the two servers overlap, this is why to use which:

- Running a graph you hold as an OBJECT: use comfyui_run_workflow. Theirs takes
  a file path only. It is also the only way to read a node's TEXT output, via
  collectText with node ids - a captioner, a text encoder, an LLM node.
- Tracking a run submitted HERE: use comfyui_get_task / comfyui_get_task_result.
  Their job(...) and fetch_outputs read comfy-cli's own on-disk state files,
  which exist only for runs comfy-cli itself submitted, so they cannot see
  these at all.
- What is actually running on the instance: use comfyui_get_queue. It reads
  ComfyUI's /queue and sees every job whoever submitted it; their
  job(action="queue") lists only comfy-cli's own.
- Feeding a generated image back in as input: use comfyui_upload_image with
  from_output. Their upload_file takes local paths and cannot reach ComfyUI's
  output directory, least of all on a remote instance.
- Their set_workflow_slot writes a workflow in place with NO version check, so
  it will not detect a concurrent edit and leaves an open tab stale. Prefer
  comfyui_write_workflow for anything a human might also be editing.

Sharing one ComfyUI with other agents and with a human:

- Jobs carry the identity of whoever submitted them. comfyui_get_queue marks
  each as yours or another client's; the destructive tools default to yours
  alone. comfyui_cancel_job with scope "all", and comfyui_interrupt with
  confirm_foreign, reach someone else's work - ask the user first.
`;
