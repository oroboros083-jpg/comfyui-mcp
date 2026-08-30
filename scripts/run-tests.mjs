/**
 * Run the compiled test files.
 *
 * WHY THIS EXISTS. The obvious spelling is
 * `node --test "dist/**\/*.test.js"`, and on the Node 24 this package now
 * requires that works: the runner expands the glob itself from Node 21.
 * It is kept as a script anyway for one reason - it fails LOUDLY when there
 * is nothing to run. `node --test` on a pattern that matches no files, or on
 * a dist/ that a build emitted nothing into, is a suite that reports green
 * having tested nothing, which is the worst outcome a test command has.
 *
 * It also makes the runner independent of the engines floor. This repo shipped
 * for a long time with `engines.node >= 18` and a test command that could not
 * run on Node 18 or 20 at all - the glob was a literal path there, and the
 * suite died with "Could not find". Nobody noticed until CI existed. Doing the
 * walk here means lowering the floor again cannot silently break the suite.
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
