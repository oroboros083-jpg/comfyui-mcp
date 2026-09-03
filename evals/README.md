# Evaluations

Question/answer suites that test whether a model can actually accomplish
things with this server's tools — not whether the tools return 200.

## Suites

| File | Needs ComfyUI running? | Stability |
| --- | --- | --- |
| `library.xml` | No | Stable. Answers come from data compiled into the server. |

`library.xml` runs anywhere and is the one to use in CI. It exercises the
tools that work with ComfyUI stopped — `comfyui_get_prompting_guide`,
`comfyui_search_tags` and `comfyui_related_tags` — which is also the path a
new user hits before they have anything installed. Both tag tools answer from
the curated built-in vocabulary when ComfyUI is down, which is what makes them
usable here.

### There is no live suite, and rebuilding one is not a small job

<!-- tool-references:allow-removed
     Naming the four removed tools is the whole point of this section - it is
     why the suite was deleted. Same allowance the README's migration table
     gets, and for the same reason. -->

`live-instance.xml` used to sit beside it: ten questions asked of one
particular install (2026-08-21, 6 checkpoints, 19 LoRAs, 1945 node types). It
was deleted rather than repaired, because every one of its questions asked for
an exact model filename and no tool this server still registers returns one.
It was built on `comfyui_list_models`, `comfyui_get_capabilities`,
`comfyui_get_node_info` and `comfyui_list_nodes`, all four of which moved to
the official Comfy MCP's `search_models` and `nodes`. A run of it measured
that server, not this one.

So a replacement is not a matter of refreshing the answers against a current
install. It has to be built on what this server actually does with a live
ComfyUI — prompting guides selected by detected architecture, tag search
against ComfyUI-Autocomplete-Plus, versioned workflow-file editing against an
open browser tab, the queue's `client_id` scoping. Those are the surfaces
worth measuring, and none of them is a model listing.

<!-- /tool-references:allow-removed -->

## Writing a question

Each question must be:

- **Independent** — no ordering between questions.
- **Read-only** — never requires running a workflow or writing a file.
- **Complex** — several tool calls, not one lookup. Chain a filter into a
  detail call, or make the model count across a listing.
- **Realistic** — something a person would actually want to know.
- **Verifiable** — one answer, comparable as a string.
- **Stable** — the answer does not change on its own.

Derive every answer before writing it down. The counting questions in
`library.xml` were computed against `src/resources/prompting-guide.ts`;
adding a prompting guide invalidates them, so recompute rather than adjusting
by hand.

## Running

The harness lives in the `mcp-builder` skill, not in this repo:

```bash
python ~/.claude/skills/scripts/evaluation.py evals/library.xml -t stdio -c node -a dist/index.js
```

Build first — the harness runs `dist/index.js`, not the TypeScript sources.

```bash
npm run build
```
