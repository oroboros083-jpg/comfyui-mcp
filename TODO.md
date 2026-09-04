# TODO

Open work only. Finished items live in git history, not here.

Ranked P1 (do next) to P3 (parked). The rank is about what it costs someone
if it stays undone, not about how hard it is.

## P1 — do next

Nothing. 

## P2 — from the tool-surface audit

Both of these were found by auditing the 38 registered tools against the
conventions in CLAUDE.md. The audit's own findings were applied; these two are
what it could not close, because each turns on a decision rather than on
effort.

- [ ] **`comfyui_save_user_snippet` has no lost-update protection.**
      `db.saveTemplate` UPDATEs in place when the `id` already exists, so a
      second save replaces the workflow, name, description and settings of the
      first with nothing kept. This is now annotated `destructiveHint: true`
      and said plainly in the description, the `id` parameter and the README -
      so it no longer claims to be safe - but the gap itself is open.

      The question is whether snippets deserve the treatment
      `comfyui_write_workflow` gets. That machinery is real: a base recorded
      per `(path, agent_id)`, `expected_version`, and a refusal on `changed`.
      Against it: a snippet has one writer, no browser tab holding an unsaved
      copy, and no third-party writer - which is most of why the workflow-file
      version check exists at all. The cheap middle is to refuse an existing
      `id` unless `overwrite: true` is passed, which costs one field and
      catches the accident without the bookkeeping. See "Writing a Workflow
      File Safely" in CLAUDE.md before picking.

- [ ] **`openWorldHint` is used inconsistently because no rule was ever
      stated.** Of the tools gated behind a live ComfyUI, all declare it
      `true` except `comfyui_render_svg` and `comfyui_get_user_preferences`,
      which declare `false` - and `render_svg` uploads a PNG into ComfyUI's
      input folder, so it is doing what its neighbours do.

      Not fixed here, because flipping those two assumes the majority reading
      is the right one and it may not be. The MCP spec's example contrasts web
      search (open) with a memory tool (closed), and a ComfyUI on localhost is
      arguably a closed, known domain - under which reading it is the ~20
      tools saying `true` that are wrong, not the two saying `false`. The
      tools that unambiguously leave this machine are `comfyui_download_font`
      (Google Fonts) and `comfyui_extract_workflow` given a URL.

      Decide the rule first - the plain one is "true iff the call can reach
      beyond this machine" - write it next to `ToolAnnotations` in
      `server/register.ts`, then sweep. A guard test can hold the line
      afterwards; `tool-conventions.test.ts` is where it would go.

## P2 — model scanner scope

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

- [ ] **Fetch from Civitai / civitai.red with metadata preservation.** Still
      parked, but the two open questions are now answered by reading the
      source rather than guessed at. Read against comfy-cli `3fddc3e`,
      comfy-mcp `ded5a32` and ComfyUI `0eb098b` on 2026-09-03.

      **Correction to what this entry used to say.** It claimed comfy-cli's
      downloader "is Hugging Face-shaped and Civitai's version/file model
      does not map onto it". That is backwards. The Civitai path is the rich
      one and the Hugging Face path is the stub:

      - *Civitai* (`comfy_cli/command/models/models.py`): calls
        `/api/v1/models/{id}` or `/api/v1/model-versions/{id}`, maps
        `model["type"]` through a five-entry `model_path_map`
        (lora/hypernetwork/checkpoint/textualinversion/controlnet) and files
        the download at `models/<type>/<baseModel>/` on its own.
      - *Hugging Face*: no API call at all. The filename is the last URL
        segment, and `model_id` is the last two - used only in a progress
        `print`. With no `relative_path` it prompts for the folder AND the
        base model; an agentic caller gets the empty default for both, so
        `os.path.join("models", "", "")` lands the file in the bare `models/`
        root. comfy-mcp only forwards `--relative-path` when truthy, so an
        MCP caller who omits it gets exactly that.

      So **always pass `relative_path` for a Hugging Face URL**, and for any
      Civitai type outside those five (VAE, upscaler, motion module), where
      the unmapped branch is an interactive prompt nobody is there to answer.

      **Nothing on the download path preserves anything.**
      `request_civitai_model_version_api` holds the whole API response -
      `trainedWords`, `description`, `images[].meta` with steps, cfgScale,
      sampler, seed and prompts - and returns four scalars:
      `model_name, download_url, model_type, basemodel`. The rest is dropped
      at the point of parse. `baseModel` survives only because it names a
      directory. No sidecar is written on any path; the only writes in that
      module are comfy-cli's own `download_state` job bookkeeping.

      **Where it should go, answered: ComfyUI's own assets DB.** `app/assets/`
      in ComfyUI base is a SQLite-backed asset store, and
      `services/metadata_extract.py` already extracts, per file,
      `base_model`, `trained_words` (trigger words - from kohya's
      `ss_tag_frequency`, deduped and capped at 100, or a direct
      `trained_words` field), `air` (the CivitAI identifier), `source_url`,
      `repo_id`/`revision`/`resolve_url` for Hugging Face, and
      `has_preview_images`. It persists them to `AssetReference.user_metadata`,
      and `PATCH /api/assets/{id}` takes a `user_metadata` body - so there is
      a real, writable destination and this server does not need to invent a
      sidecar format.

      Three caveats before building on it:

      - It is gated behind `--enable-assets`, off by default (a separate
        `--enable-asset-hashing` gates blake3). A tool depending on it must
        degrade when the routes 404 rather than fail.
      - It reads the **safetensors header**, not the download source. So it
        works for a file whose author embedded the fields and is empty for
        one who did not, whatever it was downloaded from. This is why the
        gap is not closed by it: the Civitai API knows things the file does
        not carry.
      - **Steps, CFG, sampler and seed are absent from every layer.** They
        exist only in Civitai's `images[].meta`, and nothing - comfy-cli,
        comfy-mcp, or ComfyUI - reads or stores them. That half of
        "metadata preservation" has no home yet, and inventing one is the
        actual open decision.

      ComfyUI also serves `__metadata__` for a single file on demand
      (`/view_metadata/{folder}`, no persistence), which is the cheap read if
      only one model's trigger words are wanted.

      Unchanged: `comfyui_scan_model` is the natural finisher - fetch, then
      scan before anything loads it - and `ModelReference.civitai` already
      holds a path rather than a URL, so the renderer supplies the host.

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
