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

All eight done on 2026-09-01, against ComfyUI 0.33.0 / comfy-cli 1.19.0 on
127.0.0.1:8000, driving two server processes over stdio with distinct
`COMFYUI_MCP_AGENT_ID`s, plus a real browser tab and the official Comfy MCP.
Three bugs and two false documented claims came out of it; each has its own
commit.

- [x] **Ownership both ways.** A submits 2, B submits 3: A reports
      mine=2/foreign=3, B reports mine=3/foreign=2, both sum to the queue, and
      every job's `mine` is exactly inverted between the two views.
- [x] **Default cancel spares foreign jobs.** `cancel_job` from A with both
      agents' work queued: `cancelled: 2, left_alone: 2`, B's running job and
      both its pending jobs untouched.
- [x] **Foreign interrupt is gated.** A's `interrupt` on B's running job is
      refused and names `verify-agent-B` and `confirm_foreign`;
      `confirm_foreign: true` returns `interrupted: "foreign"`. B interrupting
      its own job needs no confirmation (`interrupted: "mine"`).
- [x] **Lost update, human edition.** Note node edited in a real ComfyUI tab
      with autosave still pending, so disk held the stale baseline at the
      moment of the call: `write_workflow`'s own flush pulled the tab's
      unsaved text onto disk, the diff saw it, and the write was refused.
      Without that flush the agent would have compared against the stale base,
      found no change, and destroyed the edit. `force: true` then wrote and
      the tab reloaded ("was updated on disk and reloaded (1 nodes)").
- [x] **Unbased write refuses.** Refused with "has not been read in this
      session" and names `comfyui_read_workflow`; `force: true` gets past it;
      a successful write re-bases, so the follow-up write needs no force.
      **Bug found:** `workflow_bases` was keyed by path alone on the premise
      that the db is per-instance. It is not - it defaults to
      `~/.comfyui-mcp/data.db` for every server on the machine - so two agents
      shared one row and each silently re-based the other. Fixed by keying on
      `(path, agent_id)`.
- [x] **The third writer.** The official server's
      `set_workflow_slot(stdout=False)` on a gallery template between our read
      and our write is detected and refused. **Bug found:** the refusal
      explained itself with "no changes", because `diffWorkflows` read
      top-level `nodes` only and that template keeps its whole pipeline inside
      a subgraph. Now walks `definitions.subgraphs` too.
      **Also found:** the "Last written via this server by:" line read its
      name from the caller's own base row, so it named whoever was being
      refused. Now a separate `workflow_writers` record.
- [x] **Official's jobs are visible to us.** Their submission appears in
      `comfyui_get_queue` as `mine: false` under comfy-cli's own per-run uuid,
      correlatable by promptId. **Claim corrected:** the reverse is *also*
      true now. comfy-cli 1.19.0 falls back to ComfyUI's `/history`, so their
      `job(status)`, `fetch_outputs` and `job(queue)` all resolve a prompt_id
      we submitted with no state file on disk. What they still cannot report
      is a `client_id`, which is what the ownership scoping needs.
- [x] **agentId does not disturb in-flight work.** Across a restart under a
      new id, `get_task` and `get_task_result` still resolve the job by id and
      by name. **Consequence documented:** the queue view then calls it
      foreign (`mine: false`, `clientId: agent-before-rename`) and a default
      `cancel_job` leaves it alone. The default id is `host/pid`, so this
      happens on any plain restart - safe direction, now said out loud in
      `config.ts` and CLAUDE.md.

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
