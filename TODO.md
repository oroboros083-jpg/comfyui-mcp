# TODO

Open work only. Finished items live in git history, not here.

Ranked P1 (do next) to P3 (parked). The rank is about what it costs someone
if it stays undone, not about how hard it is.

The whole-codebase review of 2026-09-02 is closed and nothing from it is
left. Its 15 findings were applied on 2026-09-03, and the eleven entries it
documented here rather than fixing - six P1, five P2 - were applied the same
day. They are in git history, not below. What remains are four older items,
each parked on a question rather than on effort.

A question that has been answered gets a "Decided" section rather than a
deletion, so it is not re-opened from scratch a year later by someone who
does not know it was already priced.

## P1 — do next

Nothing. The two entries that were here are done: the README was brought back
to the current tool surface, and the bun question was scoped and answered
below.

## Decided — bun cutover: no

Measured on this repo (Bun 1.3.11, Node 24.20.0, 105 TS files, 436 tests), so
that a later revisit argues with numbers rather than with impressions.

**Bun cannot run this server.** `better-sqlite3@13.0.3` crashes it:

    panic(main thread): NAPI FATAL ERROR: Error::New napi_get_last_error_info

Reproduced with npm-installed and with bun-installed dependencies, so it is
not a stale-ABI artifact. `sharp@0.35.4` is fine. 13 of 36 test files panic —
exactly the ones that transitively import `src/db/index.ts`.

**Where the time actually goes.** `npm test` is 6.1s end to end:

| Step | Node | Bun |
|---|---|---|
| `npm ci` / `bun install`, warm cache | 2.5s | 0.42s |
| `tsc` (typecheck + emit) | 4.0s | — does not typecheck |
| `tsc --noEmit` (typecheck alone) | 3.96s | 3.96s, unavoidable |
| transpile | (inside tsc) | `bun build` 0.07s |
| run the suite | 2.1s from `dist/` | 0.41s on TS, for the 344 tests it can run |

Bun's `node:test` support is not the problem: those 344 pass with no build
step at all. The problem is that **tsc is 4s of the 6.1s and Bun cannot remove
it**, because it transpiles without checking types. The ceiling on the whole
exercise is about 1.6s per cycle.

What that 1.6s costs: a native-module crash to work around (a second SQLite
driver behind an adapter, or a Bun-only runtime), and — for the runtime
cutover — a breaking change to every user's MCP client config, all of which
say `command: node`. Not a trade worth making on a suite that finishes in six
seconds.

**Revisit if** better-sqlite3 stops crashing (`bun -e 'require("better-sqlite3")'`
is the whole test), or if the suite grows enough that tsc is worth attacking —
in which case the answer is incremental tsc, not Bun.

**One finding worth keeping, which is not about Bun.** The blocker is a single
dependency imported in a single file: `src/db/index.ts` holds the only
`better-sqlite3` import in `src/`. Node 24 — already the `engines` floor —
ships `node:sqlite`, verified working unflagged on v24.20.0. Dropping
better-sqlite3 for it would remove the last node-gyp dependency and the
prebuilt-per-ABI problem. It would **not** unlock Bun, which has no
`node:sqlite` (only `bun:sqlite`), so it stands or falls on its own merits.
Unranked and unstarted: `node:sqlite` is still flagged experimental, and the
migration touches every persistence path in the server.

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
