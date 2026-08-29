- add model descriptions to non-text to image models
- allow for additional model sources (like civitai/civitai.red). prefer hf model card
- add support for fetching from civitai/civitaired with metadata preservation
- add support for checking pickletensors for known hacks
- run /doctor
- [x] compare functionality with Artokun's mcp - superset on ops, nothing on prompting/tags/describe; ~190 tools, single maintainer
- [x] compare functionality with Comfy's mcp server - active, not dead. A comfy-cli wrapper with no workflow versioning; see CLAUDE.md "Coexisting With the Official Comfy MCP" 

## Verify the coexistence work against a live ComfyUI (PR #9)

Merged unverified against a real instance. The 386 unit tests all run against
stubs, and none of the cases below can be reached that way - each one needs a
running ComfyUI, and the last two need a browser tab and the official Comfy
MCP mounted alongside. Until these pass, the write refusal and the ownership
scoping are designed-and-tested but not *observed*.

Background on what each case is protecting is in CLAUDE.md - "Coexisting With
the Official Comfy MCP", "Writing a Workflow File Safely", "Sharing One
ComfyUI".

- [ ] **Ownership both ways.** Two instances with different
      `COMFYUI_MCP_AGENT_ID`, submit from each, confirm `comfyui_get_queue`
      marks `mine` correctly from both sides and the `mine`/`foreign` counts
      add up.
- [ ] **Default cancel spares foreign jobs.** With both agents' work queued,
      `comfyui_cancel_job` (no promptId) from one leaves the other's jobs
      alone and reports `left_alone`.
- [ ] **Foreign interrupt is gated.** While agent B's job runs, agent A's
      `comfyui_interrupt` refuses and names B; `confirm_foreign: true` goes
      through.
- [ ] **Lost update, human edition.** `comfyui_read_workflow`, edit the same
      file in a ComfyUI browser tab, then `comfyui_write_workflow` - confirm
      it refuses with a diff naming the tab's change, and that `force: true`
      goes through. This is the one the whole feature exists for.
- [ ] **Unbased write refuses.** `comfyui_write_workflow` to an existing file
      never read in this session refuses and names `comfyui_read_workflow`.
- [ ] **The third writer.** `comfyui_read_workflow`, then the official MCP's
      `set_workflow_slot(stdout=False)` on the same file, then our write -
      confirm we detect a writer we do not control.
- [ ] **Official's jobs are visible to us.** Submit via the official server,
      confirm it appears in `comfyui_get_queue` as `mine: false` (it will not
      appear in our job manager, which is expected - correlate by promptId).
- [ ] **agentId does not disturb in-flight work.** Confirm a job submitted
      before an agentId change is still trackable afterwards (we key on
      promptId, but this has never been exercised live).

## Repo housekeeping

- [ ] **GitHub Actions has never run in this repo.** `publish.yml` is
      registered and `state: active`, but workflow runs total zero repo-wide,
      including every push to `main`. So there is no CI on any branch and the
      GHCR image has never been published. Needs enabling in the repo/account
      Actions settings - not fixable from a session.
