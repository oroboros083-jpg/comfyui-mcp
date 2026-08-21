import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readStartupLogTail, LaunchTarget, isLocalUrl } from "./launch.js";

function target(cwd: string): LaunchTarget {
  return { kind: "script", label: "test", command: "python", args: [], cwd, useShell: false };
}

/** A source-install layout: the log lives at <cwd>/user/comfyui.log. */
function installWithLog(contents: string): string {
  const root = mkdtempSync(join(tmpdir(), "comfyui-launch-test-"));
  mkdirSync(join(root, "user"), { recursive: true });
  writeFileSync(join(root, "user", "comfyui.log"), contents, "utf-8");
  return root;
}

test("readStartupLogTail surfaces the error that explains a failed start", () => {
  // Verbatim shape of a real failure: ComfyUI's prestartup script dies on a
  // model path that no longer exists, so the server never binds a port and
  // the launch just times out with nothing to show for it.
  const root = installWithLog(
    [
      "** ComfyUI startup time: 2026-08-21 09:08:12",
      "** Platform: Windows",
      "[PRE] ComfyUI-Manager",
      "Traceback (most recent call last):",
      '  File "main.py", line 184, in <module>',
      "FileNotFoundError: [WinError 3] The system cannot find the path specified: 'D:\\\\ComfyUI\\\\models\\\\custom_nodes'",
    ].join("\n")
  );

  try {
    const tail = readStartupLogTail(target(root));

    assert.ok(tail, "the log was found");
    assert.match(tail.lines.join("\n"), /FileNotFoundError/);
    assert.match(tail.lines.join("\n"), /custom_nodes/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readStartupLogTail prefers error lines over the plain tail", () => {
  const noise = Array.from({ length: 200 }, (_, i) => `loading node ${i}`);
  const root = installWithLog(
    [...noise.slice(0, 100), "ERROR: port 8188 already in use", ...noise.slice(100)].join("\n")
  );

  try {
    const tail = readStartupLogTail(target(root));

    // The error is 100 lines from the end, so a naive tail would miss it.
    assert.ok(tail);
    assert.match(tail.lines.join("\n"), /port 8188 already in use/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readStartupLogTail falls back to the tail when nothing looks like an error", () => {
  const root = installWithLog(
    Array.from({ length: 50 }, (_, i) => `startup step ${i}`).join("\n")
  );

  try {
    const tail = readStartupLogTail(target(root));

    assert.ok(tail);
    assert.equal(tail.lines[tail.lines.length - 1], "startup step 49");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readStartupLogTail bounds what it returns", () => {
  // A long session's log can be megabytes. Handing all of it to the model
  // would cost more than the failure it explains.
  const root = installWithLog(
    Array.from({ length: 5000 }, (_, i) => `error line ${i}`).join("\n")
  );

  try {
    const tail = readStartupLogTail(target(root));

    assert.ok(tail);
    assert.ok(tail.lines.length <= 30, `got ${tail.lines.length} lines`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readStartupLogTail reports nothing rather than guessing when no log exists", () => {
  const root = mkdtempSync(join(tmpdir(), "comfyui-launch-test-"));
  try {
    // The desktop-app locations are also searched, and this machine may have
    // one; what must not happen is a crash or a fabricated result.
    const tail = readStartupLogTail(target(root));
    if (tail) assert.ok(tail.lines.length > 0, "a found log is non-empty");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("isLocalUrl distinguishes this machine from a remote ComfyUI", () => {
  assert.equal(isLocalUrl("http://127.0.0.1:8188"), true);
  assert.equal(isLocalUrl("http://localhost:8000"), true);
  assert.equal(isLocalUrl("http://[::1]:8188"), true);
  assert.equal(isLocalUrl("http://192.168.1.50:8188"), false);
  assert.equal(isLocalUrl("not a url"), false);
});
