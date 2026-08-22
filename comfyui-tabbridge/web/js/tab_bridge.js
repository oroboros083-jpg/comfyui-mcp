// Report which workflows are open, and act on flush / reload pushes.
//
// Served at /extensions/ComfyUI-TabBridge/js/tab_bridge.js, so reaching
// ComfyUI's own scripts takes THREE "../" -- one more than the two-dot form
// in most examples, which assume the file sits directly in web/. Get it
// wrong and the import fails silently inside ComfyUI's extension loader:
// no console error, and nothing here ever runs.
import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const FLUSH = "tabbridge.flush";
const RELOAD = "tabbridge.reload";

// Heartbeat. The server drops a client's report after ~25s, so this has to
// be comfortably under that or a live tab looks closed.
const HEARTBEAT_MS = 8000;
// Coalesce bursts of store changes into one report.
const DEBOUNCE_MS = 400;

let timer = null;

function workflowStore() {
    return app.extensionManager?.workflow ?? null;
}

function snapshot() {
    const store = workflowStore();
    if (!store) return [];
    const activePath = store.activeWorkflow?.path;
    return (store.openWorkflows || []).map((w) => ({
        path: w.path,
        filename: w.filename,
        modified: !!w.isModified,
        active: w.path === activePath,
    }));
}

async function report() {
    try {
        await api.fetchApi("/tabs/report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                // api.clientId ties a report to this browser, so several
                // windows do not overwrite each other's state.
                client_id: api.clientId || api.initialClientId || "unknown",
                workflows: snapshot(),
            }),
        });
    } catch (e) {
        // Server down or restarting. The cache goes stale on its own; there
        // is nothing useful to do here and nothing worth logging every 8s.
    }
}

function reportSoon() {
    clearTimeout(timer);
    timer = setTimeout(report, DEBOUNCE_MS);
}

function toast(severity, summary, detail, life = 6000) {
    try {
        app.extensionManager?.toast?.add({ severity, summary, detail, life });
    } catch (e) {
        console.log(`[TabBridge] ${summary}: ${detail}`);
    }
}

function findOpen(path) {
    const store = workflowStore();
    return (store?.openWorkflows || []).find((w) => w.path === path) || null;
}

// Re-reading from disk is the ONLY thing that actually refreshes a tab.
// Reopening the workflow does not: ComfyUI restores it from cached session
// state, so a tab can keep showing an old graph indefinitely -- measured at
// 10 nodes against a file holding 28.
async function reloadFromDisk(wf) {
    const res = await api.fetchApi(
        `/userdata/${encodeURIComponent(wf.path)}?t=${Date.now()}`,
        { cache: "no-store" });
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const fresh = await res.json();
    await app.loadGraphData(fresh, true, false, wf);
    return fresh.nodes?.length ?? 0;
}

app.registerExtension({
    name: "TabBridge",
    setup() {
        const store = workflowStore();

        // Report on any change to the workflow store -- opening, closing,
        // switching tabs, or a graph becoming dirty.
        try {
            store?.$subscribe?.(() => reportSoon());
        } catch (e) {
            console.warn("[TabBridge] could not subscribe to workflow store", e);
        }
        setInterval(report, HEARTBEAT_MS);
        report();

        // Save now, so a writer about to overwrite this file can diff the
        // human's edits instead of destroying them.
        api.addEventListener(FLUSH, async (event) => {
            const path = event?.detail?.path;
            const open = path && findOpen(path);
            if (!open || !open.isModified) return;
            const name = open.filename || path.split("/").pop();
            try {
                await store.saveWorkflow(open);
                toast("info", "Saved your changes",
                      `"${name}" had unsaved edits; they were saved so they can be ` +
                      `taken into account.`);
            } catch (err) {
                toast("warn", "Could not save your changes",
                      `"${name}" has unsaved edits that could not be written ` +
                      `(${err.message}).`, 10000);
            }
            reportSoon();
        });

        // Re-read after someone rewrote the file.
        api.addEventListener(RELOAD, async (event) => {
            const path = event?.detail?.path;
            const saveFirst = event?.detail?.save_first !== false;
            const open = path && findOpen(path);
            if (!open) return;
            const name = open.filename || path.split("/").pop();

            // If it is dirty, save before replacing the canvas: once the
            // work is on disk it is recoverable, so reloading costs nothing.
            // If it CANNOT be saved, leave the tab alone -- reloading would
            // destroy the only copy.
            if (open.isModified && saveFirst) {
                try {
                    await store.saveWorkflow(open);
                } catch (err) {
                    toast("warn", "Workflow changed on disk",
                          `"${name}" was rewritten, but your unsaved changes could ` +
                          `not be saved first (${err.message}), so the tab was left ` +
                          `alone rather than discarding them.`, 12000);
                    return;
                }
            }
            try {
                const n = await reloadFromDisk(open);
                toast("success", "Workflow reloaded",
                      `"${name}" was updated on disk and reloaded (${n} nodes).`);
            } catch (err) {
                toast("warn", "Workflow changed on disk",
                      `"${name}" changed but could not be reloaded (${err.message}). ` +
                      `Reopen it to pick up the new version.`, 10000);
            }
            reportSoon();
        });
    },
});
