# ComfyUI-TabBridge

Lets things outside the browser see and steer ComfyUI's open workflow tabs.
Adds **no nodes** — it exists so an MCP server, a workflow generator, or a
plain script can write a workflow file without fighting the human who has it
open.

## Install

The source of truth is this directory, inside the comfyui-mcp repo, because
the safe-write contract below is split between this node and that server —
versioning one without the other leaves half a protocol under review.

ComfyUI only needs to *find* it under `custom_nodes`, and a link satisfies
that: Python's import machinery sees an ordinary directory. So link rather
than copy, and edits here reach ComfyUI on its next restart.

From the repo root:

```bash
npm run link:tabbridge
```

It asks a running ComfyUI where it lives — `/system_stats` reports the argv it
was started with, so the answer is exact — and creates a junction on Windows
(no admin, no developer mode) or a symlink elsewhere. Re-running it is safe.
It will not delete anything: if a real directory is already at that path it
says so and stops. `--check` reports without changing anything, and
`--base-dir <path>` or `COMFYUI_BASE_DIR` override the detection.

Detection matters because `--base-directory` is where custom nodes load from,
which is **not** necessarily where the models live — those can be pointed
somewhere else entirely.

Then restart ComfyUI and confirm:

```bash
curl localhost:8000/tabs/state
```

If you would rather do it by hand: `New-Item -ItemType Junction -Path
<custom_nodes>\ComfyUI-TabBridge -Target <repo>\comfyui-tabbridge` on Windows,
`ln -s` elsewhere. Copying instead of linking also works, and is what you want
if ComfyUI runs on a different machine from the MCP server — it just means the
two can drift.

Expect Python to write `__pycache__` into this directory once ComfyUI imports
it. That is ignored by git.

## The problem

Writing a workflow file happens underneath a browser that may have that
workflow open. Three things follow, all observed in practice:

- **The tab keeps showing the old graph.** ComfyUI restores a workflow from
  cached session state rather than re-reading disk, so reopening it doesn't
  help. Measured: a tab showing 10 nodes while the file held 28.
- **With `Comfy.Workflow.AutoSave` on, the stale tab writes itself back**,
  silently reverting your file minutes later — long enough after the fact
  that it doesn't look related.
- **Unsaved hand edits are destroyed** by the write, and since they never
  reached disk there's nothing to diff and nothing to recover.

None of it is visible from outside the browser, because the server has no
idea what any tab is doing.

## The safe write

```
flush  →  read + diff  →  write  →  reload
```

Flush makes the tab save, so the human's edits are on disk and can be read
and taken into account instead of destroyed. Reload stops the tab sitting on
a stale graph and autosaving it back.

## HTTP API

| Route | Purpose |
|---|---|
| `GET /tabs/state` | everything open, what's dirty, which is active |
| `GET /tabs/is_open?path=…` | one workflow |
| `POST /tabs/flush` `{path}` | ask tabs to save it now |
| `POST /tabs/reload` `{path, save_first=true}` | ask tabs to re-read from disk |
| `POST /tabs/report` | used by the frontend; not for callers |

`state` merges across browser clients. `modified` is OR'd on purpose — if
any tab anywhere has unsaved changes, a writer needs to know, and the safe
assumption when clients disagree is the cautious one.

Reports older than 25s are dropped, so a closed browser stops claiming its
workflows are open.

Flush and reload are **fire-and-forget** — there's no way to make the server
await a browser. After a flush, watch the file's mtime to know it landed; a
tab with nothing to save never writes, so a timeout is the normal quiet case
rather than a failure.

## Paths

Use the path ComfyUI knows the workflow by, relative to the user directory:

```
workflows/Claude Shared Workflows/garment_pipeline.json
```

Not the absolute disk path.
