"""ComfyUI-TabBridge -- report and steer open workflow tabs.

Adds no nodes. It exists so that things outside the browser (an MCP server,
a workflow generator, a script) can find out which workflows a human
currently has open, make a tab save before overwriting its file, and make it
re-read afterwards.
"""

from . import tab_bridge

# No nodes; ComfyUI still expects these to exist.
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

# Served at /extensions/ComfyUI-TabBridge/... -- note the JS lives in web/js/,
# so its import of ComfyUI's app.js needs THREE "../", not the two in most
# examples. Getting it wrong fails silently in ComfyUI's extension loader.
WEB_DIRECTORY = "./web"

if not tab_bridge.register():
    print("[TabBridge] server unavailable; tab reporting disabled")

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
