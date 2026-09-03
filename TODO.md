# TODO

Open work only. Finished items live in git history, not here.

Ranked P1 (do next) to P3 (parked). The rank is about what it costs someone
if it stays undone, not about how hard it is.

The entries below came out of a whole-codebase review on 2026-09-02. The 15 findings
reported from that review were applied on 2026-09-03; these are the ones that were
documented alongside them but deliberately left, each with the question to settle first.

## P2 — worth doing, no one is blocked

- [ ] **`sanitizeSvg` is a regex over XML, and entity encoding walks past
      it.** `src/tools/svg.ts` blanks `href` values matching
      `^\s*(?:https?|file|ftp):`, but the check runs before XML entity
      decoding, so `href="&#102;ile:///etc/passwd"` is not matched and
      decodes to `file:` for the renderer. Unquoted attribute values are not
      matched either (the pattern requires quotes), and `<!DOCTYPE ... <!ENTITY
      ... SYSTEM "file://...">>` is not touched at all. Read, not
      reproduced - whether any of it is exploitable depends on what libvips
      links against here, which is worth establishing first, since the answer
      decides whether this is a real hole or defence in depth.

- [ ] **A torch ZIP with no `data.pkl` is declared safe outright.**
      `scanModel` returns `verdict: "safe"` for any ZIP where no member is
      named `data.pkl` or `*/data.pkl`. TorchScript archives carry
      `constants.pkl` and executable `code/*.py`, and `.pkl` is itself an
      accepted extension, so a ZIP holding `evil.pkl` scans clean. At minimum
      scan every `*.pkl` member and report `code/` members rather than
      answering "nothing here unpickles".

- [ ] **The scanner's second signature pass does not cover `builtins`.**
      `danglingDangerousConstants` deliberately checks only whole-module
      DANGEROUS signatures, which excludes every entry carrying `names` -
      `builtins`, `sys`, `torch`, `pty`, `asyncio`, `timeit`. CLAUDE.md calls
      the double match load-bearing ("Do not drop either half"), but the half
      that survives a broken `STACK_GLOBAL` pairing does not see
      `builtins`/`eval`, which is the commonest primitive of the lot.
      Matching exact constants against the *names* of those signatures too
      (`eval`, `exec`, `system`) is cheap and unlikely to collide with tensor
      names - though that assumption should be measured against a few real
      checkpoints before it ships, since a false positive here is worse than
      a miss.

- [ ] **`requestRestart` reads its own 15-second timeout as success.**
      `src/client/comfyui.ts` aborts the reboot POST via `AbortController`
      after 15s, and the surrounding `catch` returns `{endpoint: path}` on
      any thrown error - the comment explains the intended case (the server
      exits mid-request) but an `AbortError` from a ComfyUI that is merely
      wedged is indistinguishable. Check `err.name === "AbortError"` and
      report the timeout as a timeout.

- [ ] **`builtinIndex` files every tag under "general" and stuffs the real
      category into `aliases`.** In `src/tools/tags.ts` the fallback index
      builds `{tag, category: "general", count: 0, aliases: [category]}`. So
      with ComfyUI-Autocomplete-Plus absent, `comfyui_search_tags({category:
      "meta"})` can never match anything, and searching a category word
      instead matches every tag in it as an alias hit. The builtin source is
      the documented fallback, not an edge case - it should carry the real
      category.

- [ ] **`jsonText`'s replacer does nothing.** `src/utils/response.ts` passes
      `(_k, v) => (v === undefined ? undefined : v)` to `JSON.stringify`,
      which is what stringify already does for undefined. Drop the argument.

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
