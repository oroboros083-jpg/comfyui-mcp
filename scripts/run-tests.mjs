#!/usr/bin/env node
/**
 * Run the compiled test files.
 *
 * WHY THIS EXISTS. `npm test` used to be
 * `node --test "dist/**\/*.test.js"`, which relies on the test runner
 * expanding the glob itself - a feature added in Node 21. On Node 18 and 20 the
 * quoted pattern is taken as a literal path and the run dies with
 * "Could not find '.../dist/**\/*.test.js'". package.json declares
 * `engines.node >= 18`, so the suite could not run on two of the three
 * versions it claims to support, and nobody noticed because this repo had no
 * CI until now.
 *
 * Unquoting it and letting the shell expand instead is not a fix: `**` needs
 * bash with globstar, npm runs scripts through `sh` on many systems, and it
 * fails differently again on Windows - which is a supported dev platform here
 * (see the TabBridge junction handling).
 *
 * So the globbing happens here, in portable JS, and the files are passed
 * explicitly.
 *
 * NEVER pass a bare directory to `node --test`. It would treat every .js file
 * under dist/ as a test, including `dist/index.js` - which is an MCP server
 * that starts and waits on stdio forever. That is why this walks for
 * `*.test.js` rather than handing over `dist/`.
 */

import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

function testFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) testFiles(path, found);
    else if (entry.name.endsWith(".test.js")) found.push(path);
  }
  return found;
}

let files;
try {
  files = testFiles("dist");
} catch {
  console.error("No dist/ directory - run `npm run build` first.");
  process.exit(1);
}

if (files.length === 0) {
  // Exiting 0 here would let a broken build report a green suite.
  console.error("No *.test.js files under dist/ - did the build emit anything?");
  process.exit(1);
}

const child = spawn(process.execPath, ["--test", ...files], { stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
