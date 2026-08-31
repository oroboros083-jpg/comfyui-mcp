/**
 * Empty dist/ before a build.
 *
 * WHY THIS EXISTS. `tsc` only ever adds to its output directory; it never
 * removes an emitted file whose source is gone. Rename or delete a module and
 * dist/ keeps the old one, and `scripts/run-tests.mjs` - which walks dist/ for
 * `*.test.js` rather than reading the source tree - then runs BOTH copies.
 * Renaming `list-examples.test.ts` to `workflow-fetch.test.ts` made the suite
 * report five more passing tests than it had, from a file that no longer
 * existed. A deleted test that keeps passing is worse than a failing one.
 *
 * Written in JS rather than `rm -rf dist` in the npm script because npm often
 * runs scripts through `sh`, and Windows is a supported dev platform here -
 * the same reason run-tests.mjs does its own directory walk.
 */

import { rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
