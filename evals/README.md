# Evaluations

Question/answer suites that test whether a model can actually accomplish
things with this server's tools — not whether the tools return 200.

## Suites

| File | Needs ComfyUI running? | Stability |
| --- | --- | --- |
| `library.xml` | No | Stable. Answers come from data compiled into the server. |
| `live-instance.xml` | Yes | Machine-specific. Answers depend on which models are installed. |

`library.xml` runs anywhere and is the one to use in CI. It exercises the
tools that work with ComfyUI stopped — `comfyui_list_examples`,
`comfyui_get_example_workflow`, `comfyui_get_prompting_guide`,
`comfyui_search_templates`, `comfyui_get_download_url` — which is also the
path a new user hits before they have anything installed.

`live-instance.xml`, if present, was generated against one particular
ComfyUI install. Its answers go stale the moment a model is added or removed,
so re-derive it rather than trusting a checked-in copy.

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
`library.xml` were computed against `src/tools/examples/data.ts` and
`src/resources/prompting-guide.ts`; adding an example workflow invalidates
them, so recompute rather than adjusting by hand.

## Running

The harness lives in the `mcp-builder` skill, not in this repo:

```bash
python ~/.claude/skills/scripts/evaluation.py evals/library.xml -t stdio -c node -a dist/index.js
```

Build first — the harness runs `dist/index.js`, not the TypeScript sources.

```bash
npm run build
```
