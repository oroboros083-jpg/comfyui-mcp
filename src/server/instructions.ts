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
 * (`Comfy-Org/comfy-mcp`). Both servers are commonly mounted at once and
 * their surfaces overlap in ways an agent cannot resolve by reading either
 * one alone - most sharply on the queue, where the two tools answer the same
 * question from different sources and neither is wrong. MCP servers cannot
 * see each other, so this cannot be detected at runtime; saying it once here
 * is what stops it being rediscovered per call.
 *
 * Keep it short. It rides every handshake, and an instruction block that
 * grows into a manual is one nobody finishes reading.
 */
export const INSTRUCTIONS = `\
Tools for driving a ComfyUI instance: generation, workflow authoring, model
and node introspection, and prompting guidance per model architecture.

Canonical flows:

- Start with comfyui_get_status. It reports whether ComfyUI is reachable and
  what it can do; almost everything else needs a live connection.
- Before writing a prompt, call comfyui_get_prompting_guide for the detected
  architecture. Prompting differs sharply between families - the booru-tag
  anime models want ordered tags and quality tokens where Flux wants prose -
  and a guide costs one call against a whole conversation of bad output.
  comfyui_search_tags and comfyui_related_tags resolve specific vocabulary.
- Editing a workflow file is read-then-write: comfyui_read_workflow returns a
  version, and comfyui_write_workflow uses it to refuse a write that would
  overwrite an edit someone made in the meantime. Creating a new file needs
  no read. Never write workflow JSON with a generic file tool - that bypasses
  the tab flush and the conflict check, and silently destroys unsaved edits
  a human has open in a browser.
- Long generations: submit with comfyui_run_workflow, then track with
  comfyui_get_task rather than blocking.

Sharing one ComfyUI with other agents and with a human:

- Jobs carry the identity of whoever submitted them. comfyui_get_queue marks
  each as yours or another client's; the destructive tools default to yours
  alone. comfyui_cancel_job with scope "all", and comfyui_interrupt with
  confirm_foreign, reach someone else's work - ask the user first.
- A workflow file open in a ComfyUI browser tab is a second writer with
  unsaved state. The write path flushes the tab, checks, then reloads it.

Alongside the official Comfy MCP (Comfy-Org/comfy-mcp), if it is also mounted:

- Prefer its tools for installing ComfyUI, custom nodes and models, for
  server lifecycle, and for the Comfy template gallery and partner-API
  models. It wraps comfy-cli and stays current with them.
- Prefer these tools for prompting guidance, tag vocabulary, image
  description, workflow-file editing, and SVG/font work. It has no
  equivalents.
- On the queue the two differ and both are honest: comfyui_get_queue reads
  ComfyUI's own queue and sees every job, whoever submitted it, while its
  job(action="queue") lists what comfy-cli itself submitted. Use this one to
  find out what is actually running; use that one to track its own jobs.
- Its workflow edits (set_workflow_slot writing in place) do not participate
  in the version check here. That is detected rather than prevented: a write
  refused as "changed since your read" may be reporting its edit, not a
  human's.
`;
