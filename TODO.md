# TODO

Open work only. Finished items live in git history, not here.

Ranked P1 (do next) to P3 (parked). The rank is about what it costs someone
if it stays undone, not about how hard it is.

## P1 — a user hits this today

- [ ] **Two example workflows are still unreachable.** Was ten; pruning the
      catalogue from 77 to 24 (the official gallery already ships templates
      for everything dropped) took the other eight with it. Counted
      2026-09-02 against the pruned set.

      **`Nvidia Cosmos` publishes JSON only.** It carries `jsonUrls` with
      `imageUrls: []`, and both live consumers only ever try `imageUrls[0]`
      (`handlers/resources.ts:210`, `recommend.ts:641`), so
      `comfyui://examples/nvidia-cosmos` throws "No workflow images
      available" (`handlers/resources.ts:202`) and `recommend_workflow`
      returns no `exampleWorkflow` for it. `fetchJsonWorkflow`
      (`examples/workflow-fetch.ts:208`) would fetch it and is called by
      nothing.

      Still blocked on one fact: whether that docs `.json` is API format
      (what `/prompt` and `run_workflow` accept) or the UI graph.
      `apiFormatOf` prefers `prompt` over `workflow` for exactly this reason,
      and a UI graph handed back through `exampleWorkflow` - whose own doc
      says it is runnable - would be worse than the current error. Fetch it,
      look, then wire it. One file to check now, not six.

      **`Mochi Video` carries its workflow in WebP.** The entry says so in a
      trailing comment. `extractWorkflowFromPng` checks the 8-byte PNG
      signature and walks `tEXt`/`iTXt` chunks only
      (`workflow-fetch.ts:42-103`), so it returns null. ComfyUI embeds the
      same JSON in WebP EXIF, so this is a real parser, not a wiring change -
      and it is now wanted for exactly one entry. Weigh that against dropping
      Mochi too.

- [ ] **Run `/code-review ultracode` over the repo.** User-triggered and
      billed; Claude cannot launch it. Ranked P1 because PR #9's live pass
      turned up three real bugs, and nothing has swept the tree since.

## P2 — worth doing, no one is blocked

- [ ] **Expand the model scanner's scope.** Today `comfyui_scan_model` walks
      pickle opcodes only. Wanted: known cheaply-checkable exploits for the
      other major model formats, and scanning by default rather than on
      request - especially for anything not from Hugging Face.

      Two things to settle before writing code, neither checked yet: what a
      "known exploit" even looks like for safetensors and GGUF (both are data
      formats with no import mechanism, so the answer may be "header
      sanity and size bounds", not signatures), and where a default scan
      hooks in when this server does not download models - the official
      `download_model` does. That second question may make this depend on the
      Civitai item below rather than the other way round.

      See "Changing the Model Scanner" in CLAUDE.md before touching the
      opcode table or the signature lists.

## P3 — parked on an open question or on someone else's move

- [ ] **Fetch from Civitai / civitai.red with metadata preservation.** Not
      attempted: needs live network to design against, not merely to test.
      Two open questions. First, what "metadata preservation" writes and
      where - trigger words, base model, and version id belong somewhere
      ComfyUI or a later session can find them, and nothing here has a place
      for that yet. Second, whether a download tool belongs in a companion
      server at all when `download_model` exists; the honest argument for it
      is that comfy-cli's is Hugging Face-shaped and Civitai's version/file
      model does not map onto it. `comfyui_scan_model` is the natural
      finisher for whatever this becomes: fetch, then scan before anything
      loads it.

      `ModelReference.civitai` already holds a path rather than a URL, so the
      renderer supplies the host - that half is done.

- [ ] **Context-efficient node management.** Parked by design: the node tools
      are gone in favour of the official Comfy MCP's `nodes`, so this is only
      worth revisiting if that proves insufficient. Nothing has shown it is.

      Start from artokun's implementation (github.com/artokun/comfyui-mcp):
      `src/tools/catalog.ts` captures registrations into a searchable
      catalog, and `buildManifest` in `src/tools/compact.ts` is the search
      over it. Read its issue-#1525 history first - the interesting part is
      how the search stopped being misleading (underscore folding, term-based
      matching, a name-match tier, and disclosing how many results that tier
      suppressed).

- [ ] **Subagent opportunities.** Exploratory, no known pain. Look for places
      the coordinating agent could delegate rather than pull a large payload
      into its own context. Obvious candidates: surveying nodes or models to
      answer one question, reading a large workflow to check one thing about
      it, and batches of `describe_image`.
