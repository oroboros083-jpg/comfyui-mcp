# Evaluations

Question/answer suites that test whether a model can actually accomplish
things with this server's tools — not whether the tools return 200.

## Suites

| File | Needs ComfyUI running? | Stability |
| --- | --- | --- |
| `library.xml` | No | Stable. Answers come from data compiled into the server. |
| `live-instance.xml` | Yes | Machine-specific. Answers depend on which models are installed. |

`library.xml` runs anywhere and is the one to use in CI. It exercises the
tools that work with ComfyUI stopped — `comfyui_get_prompting_guide`,
`comfyui_search_tags` and `comfyui_related_tags` — which is also the path a
new user hits before they have anything installed. Both tag tools answer from
the curated built-in vocabulary when ComfyUI is down, which is what makes them
usable here.

`live-instance.xml` was generated against one particular ComfyUI install
(2026-08-21: 6 checkpoints, 19 LoRAs, 13 diffusion models, 1945 node types).
Its answers go stale the moment a model is added or removed, so a failure
there is not automatically a regression - check the install first. Questions
are phrased by role ("the low-noise pass", "the segmentation model") rather
than by filename, so most survive a version bump of the same model.

Every live answer was verified twice when the suite was written: derived from
ComfyUI's API, then answered again through the MCP tools themselves, to
confirm the questions were reachable with the tools an agent actually had.
That second half no longer holds — the model-listing and node-introspection
tools it leaned on have since moved to the official Comfy MCP. See the
`live-instance.xml` entry in `TODO.md` before trusting a run of it.

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

For the live suite, start ComfyUI first — through the official Comfy MCP's
`launch_comfyui`, or by launching it yourself. This server deliberately does
not manage the ComfyUI process:

```bash
python ~/.claude/skills/scripts/evaluation.py evals/live-instance.xml -t stdio -c node -a dist/index.js
```

Build first — the harness runs `dist/index.js`, not the TypeScript sources.

```bash
npm run build
```
