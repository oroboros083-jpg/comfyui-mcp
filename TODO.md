- [x] add model descriptions to non-text to image models — every
      `ModelReference` in the video and audio guides now carries a `note`
      saying what that file is and how it differs from its siblings, which
      the image guides mostly got for free from the architecture name.
- expland scope for the model scanner. include known easily checked exploits for all major model types, kick off the scanner by default, especially for non-hf sources. 
- [x] allow for additional model sources (like civitai/civitai.red). prefer
      hf model card — `ModelReference.civitai` holds a path, not a URL, so
      the renderer supplies the host and can name the `civitai.red` mirror
      once per section. The HF card renders first wherever a model has both.
- [ ] add support for fetching from civitai/civitaired with metadata
      preservation. NOT attempted: this one needs live network to design
      against, not just to test. The open questions are what "metadata
      preservation" writes and where (trigger words, base model and version id
      belong somewhere ComfyUI or a later session can find them, and nothing
      here has a place for that yet), and whether a download tool belongs in a
      companion server at all when `download_model` exists - the honest
      argument for it is that comfy-cli's is Hugging Face-shaped and Civitai's
      version/file model does not map onto it. `comfyui_scan_model` is the
      natural finisher for whatever this becomes: fetch, then scan before
      anything loads it.
- [x] add support for checking pickletensors for known hacks —
      `comfyui_scan_model` walks the opcodes of a `.ckpt`/`.pt`/`.bin` without
      unpickling and reports what `torch.load` would import, handling raw
      pickles, the ZIP `torch.save` writes (including ZIP64), and safetensors
      / GGUF as nothing-to-scan. See "Changing the Model Scanner" in
      CLAUDE.md before touching the opcode table or the signature lists.
- [ ] run /doctor
- [ ] run /code-review ultracode
- [x] update readme — Docker gone and From Source made the only install path,
      the launcher env vars removed, the empty "Discovery Tools" section
      filled with `comfyui_scan_model`, and three stale claims fixed: it
      offered to "install ComfyUI, launch it, find model downloads" (none of
      which it does), listed workflow validation as a feature (the official
      server's), and pointed the TOC at a "Docker Build" section. Counts
      re-checked against the code: 77 examples, 26 architectures, 26 guides.

## Verify the coexistence work against a live ComfyUI (PR #9)

Merged unverified against a real instance. The unit tests all run against
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

- [x] **GitHub Actions has never run in this repo.** Now enabled, and
      `.github/workflows/ci.yml` builds and tests on Node 24 and 26 for every
      push and PR.

- [x] **`listExamples` / `renderExamples` are orphaned.** Removed, along with
      three more orphans from the same prune that the note had missed:
      `getExampleWorkflow` in the same file, the whole `MODEL_DOWNLOADS`
      catalogue in `examples/downloads.ts`, and `getInstallGuide` /
      `getModelGuide` in `tools/install.ts`. What was left of
      `list-examples.ts` is only the fetching, so it is now
      `examples/workflow-fetch.ts`. `EXAMPLE_WORKFLOWS` stays, as noted.

- [x] **`spawnComfyUI` is unreachable.** Taken the simplification: the whole
      of `src/tools/launch.ts` is gone, and with it `COMFYUI_LAUNCH_COMMAND`
      / `_ARGS` / `_CWD`. `isLocalUrl` was the only part with a live caller,
      so it moved into `server/connection.ts` beside `nextStepWhenDown`,
      which is the one thing that asked. `src/tools/restart.ts` - a schema
      for the dropped `restart_comfyui`, with no tool behind it - went too.
      `src/` no longer imports `child_process` anywhere, which is a stronger
      security note than the one it replaces.

- [ ] **Six example workflows are unreachable.** The SVD, Cosmos, Wan 2.1 and
      Wan 2.2 entries in `examples/video.ts` publish their graph as
      `jsonUrls` with `imageUrls: []`, and both live consumers -
      `handlers/resources.ts` and `recommend.ts` - only ever try
      `imageUrls[0]`. So `comfyui://examples/wan-21` throws "No workflow
      images available" and `recommend_workflow` returns no
      `exampleWorkflow` for any of them. `fetchJsonWorkflow` in
      `examples/workflow-fetch.ts` is the function that would fetch them and
      is currently called by nothing.

      Not wired up yet because it needs one fact I could not check offline:
      whether those docs `.json` files are API format (what `/prompt` and
      `run_workflow` accept) or the UI graph. `apiFormatOf` prefers `prompt`
      over `workflow` for exactly this reason, and a UI graph handed back
      through `exampleWorkflow` - whose own doc says it is runnable - would be
      worse than the current error. Fetch one, look, then wire it.

## Scope and context efficiency

- [x] **Remove Docker support.** `Dockerfile`, `publish.yml` and the Docker
      install path in `README.md` are gone, along with every in-container code
      path: the output handler's skip-the-write branch, discovery's
      `host.docker.internal` probe, and `launchBlockedReason`'s container
      check. `DOCKER` is no longer read anywhere.
- [ ] **Context-efficient node management.** The node tools are gone in favour
      of the official Comfy MCP's `nodes`, so this is only worth revisiting if
      that proves insufficient. Start from artokun's implementation
      (github.com/artokun/comfyui-mcp): `src/tools/catalog.ts` captures
      registrations into a searchable catalog, and `buildManifest` in
      `src/tools/compact.ts` is the search over it. Read its issue-#1525
      history first - the interesting part is how the search stopped being
      misleading (underscore folding, term-based matching, a name-match tier,
      and disclosing how many results that tier suppressed).
- [ ] **Subagent opportunities.** Look for places the coordinating agent could
      delegate rather than pull a large payload into its own context. Obvious
      candidates: surveying nodes or models to answer one question, reading a
      large workflow to check one thing about it, and batches of
      `describe_image`.
