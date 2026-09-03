# TODO

Open work only. Finished items live in git history, not here.

Ranked P1 (do next) to P3 (parked). The rank is about what it costs someone
if it stays undone, not about how hard it is.

Everything under P1 came out of a whole-codebase review on 2026-09-02. Each
entry says whether it was reproduced or only read; the ones marked reproduced
have the exact command that showed the behaviour.

## P1 — do next

- [ ] update readme to current state

- [ ] **`isSafetensors` never parses the JSON header, so a pickle can be
      waved through as "safe".** REPRODUCED. `isSafetensors` in
      `src/tools/scan-model.ts` checks only that the first 8 bytes are a
      plausible little-endian length and that byte 8 is `{`. Its own docstring
      says otherwise - "Checking that the JSON parses is what separates it
      from a file that merely starts with eight plausible bytes" - and there
      is no `JSON.parse` anywhere in the file (`grep -n "JSON.parse"
      src/tools/scan-model.ts` returns only that comment).

      `scanModel` tests safetensors FIRST, so a match returns
      `verdict: "safe"` with zero findings and the pickle walker never runs.
      Built a 46-byte `fake.ckpt` = 8-byte length + `{ not json at all >>> `
      + `c posix\nsystem\n R.` and scanned it: `format: safetensors`,
      `verdict: safe`, `findings: 0`, summary "no code path to execute".
      That is the one file this tool exists to catch.

      Fix is to parse the header slice and require an object; on a parse
      failure fall through to the ZIP/pickle branches rather than returning.
      Note `HEAD_BYTES` is 4096, so a header longer than that needs a second
      read before it can be parsed. See "Changing the Model Scanner" in
      CLAUDE.md.

- [ ] **An unreadable existing workflow is written over as if it were a new
      file.** REPRODUCED. In `write_workflow`
      (`src/server/tools/generation.ts`), `readWorkflowFile` returns `null`
      for ANY non-ok HTTP status - a 500, a 503, a 401 from ComfyUI's
      userdata API are all indistinguishable from 404 - and the surrounding
      `try/catch` also sets `existing = null` when the body fails to parse.
      `exists: false` then reaches `decideWrite`, which answers
      `{allowed: true, reason: "new_file"}`: `node -e "console.log(
      require('./dist/tools/workflow-version.js').decideWrite({exists:false,
      base:'abc',theirs:null}))"`.

      So a transient ComfyUI hiccup during step 2 turns the whole three-way
      check off and the human's file is overwritten silently. The inline
      comment on that catch claims the opposite - "treated as absent below,
      which routes to the unbased refusal rather than to a silent overwrite"
      - so the intent is already recorded, just not implemented.

      Wants three states, not two: found / absent / could-not-tell, with
      could-not-tell refusing like `no_base` does. `readWorkflowFile` has to
      distinguish 404 from every other failure for that to be possible.

- [ ] **`diffWorkflows` reports "no changes" when a node's type is swapped.**
      REPRODUCED. `src/tools/workflow-files.ts` skips the whole comparison
      with `if (c.type !== g.type) continue;`. A node id present on both
      sides with a different type is therefore in neither `onlyInTheirs` nor
      `onlyInYours`, and its widget and link changes are never examined:

          diffWorkflows({nodes:[{id:1,type:'KSampler',widgets_values:[42,'x']}]},
                        {nodes:[{id:1,type:'KSamplerAdvanced',widgets_values:[999,'y']}]})
          -> { any: false, summary: 'no changes' }

      The refusal itself is safe - it goes on the content hash - but the diff
      is what the reader uses to decide whether to force past it, and here it
      actively argues there is nothing to lose. Report a type change as its
      own diff kind.

- [ ] **`comfyui_interrupt`'s foreign-job gate does not fire when the running
      job has no `client_id`.** Read, not reproduced (needs a live instance
      with a job submitted outside this server). `interrupt` in
      `src/tools/queue.ts` maps `running === undefined || owner === undefined`
      to `"unknown"`, and only `"foreign"` is gated on `confirm_foreign`.
      Those are two different situations: nothing running (harmless) and
      someone else's render submitted by a client that sent no id (a bare
      `curl` against `/prompt`, or any tool that omits it). The second is
      exactly what the gate exists for and it goes straight through.

      Split them: no running job stays ungated, a running job with an
      unattributable owner should gate like a foreign one.

- [ ] **`comfyui_render_svg` takes unbounded `width`/`height`.** REPRODUCED.
      `renderSvgSchema` in `src/tools/svg.ts` declares
      `z.number().optional().default(768)` with no `.int()`, `.min()` or
      `.max()`. `renderSvgSchema.parse({svg:'<svg/>', width:100000,
      height:100000})` is accepted, as is `{width:-5, height:0.5}`. Those go
      to `sharp(...).resize(w, h)`, so 100000x100000 asks for 10^10 pixels
      and takes the MCP server process with it; the negative and fractional
      cases throw from inside sharp and surface as "check the SVG markup is
      well-formed", which is not the problem.

      Every other numeric argument in this codebase is bounded (see
      `paginationFields`, `imageQualitySchema`). Bound these the same way.

- [ ] **Resource error hints name URIs that do not exist.**
      `src/handlers/resources.ts` tells the caller to "Read `comfyui://guides`
      for the list" and ends with "Resource URIs are comfyui://capabilities,
      comfyui://models/<type> and comfyui://guides/<architecture>". Neither
      `comfyui://guides` nor `comfyui://guides/<architecture>` is routed -
      the only guides route is `comfyui://guides/prompting/<modelType>`, so
      both hints land on "Resource not found".

      This is the failure `server/tool-references.test.ts` was written to
      stop, one layer over: that guard only checks `comfyui_` tool names, and
      resource URIs are just as much strings the compiler cannot see. Worth
      extending the guard to `comfyui://` literals in the same pass.

## P2 — worth doing, no one is blocked

- [ ] **`outputMode: "auto"` weighs the wrong bytes.** `collectOutputImages`
      in `src/tools/outputs.ts` decides inlining with
      `imageBuffer.length <= sizeThreshold`, where `imageBuffer` is the RAW
      download, but what actually travels inline is `processed.data` - the
      converted image, jpeg/85 by default. A 4MB PNG that becomes a 200KB
      jpeg is withheld from a 1MB threshold it comfortably clears. Measure
      the thing being sent; `process()` is already memoised, so the
      conversion is not paid twice.

- [ ] **`comfyui_list_topics` promises counts it does not return.** Its
      description says "List every topic that has notes, with a count for
      each", but the handler returns `db.getTopics()`, which is
      `SELECT DISTINCT topic ... ORDER BY topic` mapped to bare names. Either
      add the `COUNT(*)` or stop advertising it. (It is also unpaginated,
      against the "never return an unbounded collection" rule in CLAUDE.md,
      though topics are few enough that the count is the real defect.)

- [ ] **`extract_workflow` caps local files at 50MB and remote ones not at
      all.** `src/server/tools/library.ts` stats and refuses a local `.png`
      over `MAX_LOCAL_IMAGE_BYTES`, then on the URL branch does
      `await safeFetch(source)` followed by `arrayBuffer()` with no size
      check and no content-type check. The tool description states the local
      limit as if it were the tool's limit. Apply the same ceiling to the
      response, streaming or via `content-length`.

- [ ] **FTS5 syntax errors reach the caller raw.** `searchNotesPage` in
      `src/db/index.ts` passes the user's `query` straight into
      `notes_fts MATCH ?`. A query containing a bare `"`, `*`, `-` or `NEAR`
      makes SQLite throw, and `defineTool` reports it as
      `comfyui_search_notes failed: <sqlite message>` with no hint - the one
      case in the codebase where a failure names no remedy. Either quote the
      query as a phrase or catch and rethrow a `ToolError` naming the
      syntax. Read, not reproduced.

- [ ] **`getTagIndex` has no in-flight deduplication.** `src/tools/tags.ts`
      checks `INDEX_CACHE` and, on a miss, fetches and parses up to 120k tag
      rows plus 400k co-occurrence pairs. Two concurrent callers both miss
      and both do all of it. `ComfyUIClient.getObjectInfo` already solves
      exactly this with `objectInfoInFlight` + `objectInfoEpoch`; reuse that
      shape rather than inventing a second one.

- [ ] **`relatedTags` rebuilds a 120k-entry Map on every call.**
      `const byName = new Map(index.tags.map(t => [t.tag, t]))` at the top of
      `relatedTags` in `src/tools/tags.ts` is per-call and derivable once.
      `searchTags` has the smaller version of the same problem: it calls
      `normalise(record.tag)` across the whole table per query. Both belong
      on `TagIndex`, built where the index is.

- [ ] **`cancel_job` with `scope: "mine"` sends one HTTP POST per job.**
      `src/tools/queue.ts` does `for (const job of mine) await
      client.cancelQueue(job.promptId)`. ComfyUI's `/queue` takes
      `{delete: [...]}` as a list and `cancelQueue` already builds that
      array - it just only ever puts one id in it. Widen it to accept
      several and the bulk cancel becomes one request.

- [ ] **A late `analyzeUserOutputs` can write stale preferences onto a fresh
      connection.** `initializeComfyUI` in `src/server/connection.ts` fires
      the analysis unawaited and its `.then` assigns
      `ctx.capabilities.userPreferences` at whatever time it resolves. A
      reconnect in between replaces `ctx.capabilities`, and the old
      instance's preferences land on the new one; the `if (ctx.capabilities)`
      guard only catches the null case. `ComfyUIClient.objectInfoEpoch` is
      the pattern that already exists here for exactly this race. Two rapid
      reconnects also start two full output-tree walks with no dedup.

- [ ] **`JobManager.updateJob` silently drops `progressStats`.** Its
      signature is `Partial<Omit<Job, ...>>`, which includes
      `progressStats`, but the body forwards only status, statusMessage,
      result, error and name to `db.updateJob` - which does support the
      field. No caller passes it today (progress goes through
      `updateProgress` -> `db.updateJobProgress`), so this is latent: the
      first caller that does will lose the write with no error. Either
      forward it or take it out of the type.

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

## P2 — model scanner scope (pre-existing)

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
