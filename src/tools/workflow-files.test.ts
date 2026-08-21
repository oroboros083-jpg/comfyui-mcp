import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse, basename } from "node:path";

import { resolveGrantedPath, WriteNotPermittedError } from "./workflow-files.js";

/** The filesystem root on this platform: "C:\\" on Windows, "/" elsewhere. */
const ROOT = parse(process.cwd()).root;

test("a target directly on the filesystem root keeps its own name", async () => {
  // dirname() returns a root WITH its trailing separator, so the old
  // `realParent + sep + abs.slice(parent.length + 1)` rebuild ate the first
  // character: "C:\pipeline.json" resolved to "C:\\ipeline.json". That still
  // passed the containment check, so the write went to a file the caller never
  // named and the mangled path was reported back as if it were correct.
  const target = join(ROOT, "pipeline.json");

  const resolved = await resolveGrantedPath(target, [ROOT]);

  assert.equal(basename(resolved), "pipeline.json");
  assert.equal(resolved, join(realpathSync(ROOT), "pipeline.json"));
});

test("an ordinary nested target still resolves", async () => {
  const dir = mkdtempSync(join(tmpdir(), "comfyui-paths-test-"));
  try {
    const target = join(dir, "pipeline.json");
    const resolved = await resolveGrantedPath(target, [dir]);

    assert.equal(basename(resolved), "pipeline.json");
    assert.equal(resolved, join(realpathSync(dir), "pipeline.json"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a sibling directory sharing a name prefix is not authorised", async () => {
  const parent = mkdtempSync(join(tmpdir(), "comfyui-paths-test-"));
  try {
    const granted = join(parent, "Shared");
    const sneaky = join(parent, "SharedSecrets", "pipeline.json");

    await assert.rejects(
      () => resolveGrantedPath(sneaky, [granted]),
      (err: unknown) => err instanceof WriteNotPermittedError
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("only .json is written, whatever the grant says", async () => {
  await assert.rejects(
    () => resolveGrantedPath(join(ROOT, "notes.txt"), [ROOT]),
    (err: unknown) =>
      err instanceof WriteNotPermittedError && /only write \.json/.test(err.message)
  );
});
