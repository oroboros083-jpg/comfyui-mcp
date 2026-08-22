"""Let tools outside the browser see and steer ComfyUI's open workflow tabs.

The problem
-----------
Anything that writes a workflow file -- an agent, a script -- is writing
underneath a browser that may have that workflow open. Three things follow,
and all three have bitten in practice:

  - The tab keeps showing the OLD graph. ComfyUI restores a workflow from
    cached session state rather than re-reading disk, so simply reopening it
    does not help. Measured: a tab showed 10 nodes while the file held 28.
  - With `Comfy.Workflow.AutoSave` on, that stale tab eventually writes
    itself back, silently reverting the file minutes later.
  - Unsaved hand edits in the tab are destroyed by the write, and because
    they never reached disk there is nothing to diff and nothing to recover.

None of it is visible from outside the browser, because the server has no
idea what any tab is doing.

What this does
--------------
The frontend reports which workflows are open and which are dirty; this
caches that, and offers two pushes back: flush (save now) and reload
(re-read from disk). That is enough for a writer to do the safe thing:

    flush  ->  read + diff  ->  write  ->  reload

Deliberately generic: no knowledge of any particular node pack, so an MCP
server or a plain script can use it for any workflow.
"""

import time
from typing import Dict

# A browser that closes stops reporting, and its last report would otherwise
# claim those workflows are open forever. Anything older than this is
# treated as gone.
STALE_AFTER_SECONDS = 25.0

# Event names pushed to the frontend.
FLUSH_EVENT = "tabbridge.flush"
RELOAD_EVENT = "tabbridge.reload"


class TabState:
    """Last-known state per browser client, with staleness."""

    def __init__(self) -> None:
        self._clients: Dict[str, dict] = {}

    def report(self, client_id: str, workflows: list) -> None:
        self._clients[str(client_id)] = {
            "workflows": workflows or [],
            "at": time.time(),
        }

    def _live(self) -> Dict[str, dict]:
        now = time.time()
        # Prune, not just filter. A browser that closed never reports again,
        # so filtering alone left its entry in _clients for the lifetime of
        # the ComfyUI process.
        for client_id in [c for c, e in self._clients.items()
                          if now - e["at"] > STALE_AFTER_SECONDS]:
            del self._clients[client_id]
        return dict(self._clients)

    def snapshot(self) -> dict:
        """Everything currently open, merged across clients.

        `modified` is ORed across clients on purpose: if any tab anywhere
        has unsaved changes for a workflow, a writer needs to know, and the
        safe assumption when clients disagree is the cautious one.
        """
        live = self._live()
        merged: Dict[str, dict] = {}
        for client_id, entry in live.items():
            age = time.time() - entry["at"]
            for w in entry["workflows"]:
                path = w.get("path")
                if not path:
                    continue
                cur = merged.setdefault(path, {
                    "path": path,
                    "filename": w.get("filename"),
                    "modified": False,
                    "active_in_any_client": False,
                    "clients": [],
                })
                cur["modified"] = cur["modified"] or bool(w.get("modified"))
                cur["active_in_any_client"] = (
                    cur["active_in_any_client"] or bool(w.get("active")))
                cur["clients"].append({"client_id": client_id,
                                       "seconds_since_report": round(age, 1)})
        return {
            "clients": len(live),
            "open_workflows": sorted(merged.values(), key=lambda x: x["path"]),
            "stale_after_seconds": STALE_AFTER_SECONDS,
        }

    def is_open(self, path: str) -> dict:
        """One shape, whether or not the workflow is open.

        This used to return the merged entry - which carries no "open" key -
        when a tab held the workflow, and {"path", "open": False} when none
        did. A caller writing the obvious `if data["open"]` got a KeyError in
        Python, or undefined and therefore falsy in JS: the inverted answer
        for the one decision this route exists to inform, namely whether to
        flush before overwriting.
        """
        for w in self.snapshot()["open_workflows"]:
            if w["path"] == path:
                return {**w, "open": True}
        return {
            "path": path,
            "open": False,
            "filename": None,
            "modified": False,
            "active_in_any_client": False,
            "clients": [],
        }


STATE = TabState()


def register() -> bool:
    """Attach routes. False if ComfyUI's server isn't importable."""
    try:
        from aiohttp import web
        from server import PromptServer
    except Exception:
        return False
    try:
        routes = PromptServer.instance.routes
    except Exception:
        return False

    @routes.post("/tabs/report")
    async def _report(request):
        """Frontend heartbeat. Called on change and on a timer."""
        try:
            payload = await request.json()
        except Exception:
            return web.json_response({"ok": False}, status=400)
        STATE.report(payload.get("client_id") or "unknown",
                     payload.get("workflows") or [])
        return web.json_response({"ok": True})

    @routes.get("/tabs/state")
    async def _state(request):
        """What is open right now, and what has unsaved changes."""
        return web.json_response(STATE.snapshot())

    @routes.get("/tabs/is_open")
    async def _is_open(request):
        path = request.query.get("path", "")
        return web.json_response(STATE.is_open(path))

    @routes.post("/tabs/flush")
    async def _flush(request):
        """Ask tabs to SAVE a workflow, before something overwrites it.

        Fire-and-forget: there is no way to have the server await a browser.
        Callers should watch the file's mtime to know it landed.
        """
        try:
            payload = await request.json()
        except Exception:
            return web.json_response({"ok": False}, status=400)
        path = payload.get("path")
        if not path:
            return web.json_response({"ok": False, "reason": "no path"}, status=400)
        PromptServer.instance.send_sync(FLUSH_EVENT, {"path": path})
        # A boolean, as the name says. This used to be the whole is_open
        # dict, so `if response["was_open"]` was true even when nothing
        # held the workflow.
        state = STATE.is_open(path)
        return web.json_response({"ok": True, "path": path,
                                  "was_open": state["open"],
                                  "was_modified": state["modified"]})

    @routes.post("/tabs/reload")
    async def _reload(request):
        """Ask tabs to RE-READ a workflow from disk after it was rewritten."""
        try:
            payload = await request.json()
        except Exception:
            return web.json_response({"ok": False}, status=400)
        path = payload.get("path")
        if not path:
            return web.json_response({"ok": False, "reason": "no path"}, status=400)
        PromptServer.instance.send_sync(
            RELOAD_EVENT, {"path": path,
                           "save_first": bool(payload.get("save_first", True))})
        return web.json_response({"ok": True, "path": path})

    return True
