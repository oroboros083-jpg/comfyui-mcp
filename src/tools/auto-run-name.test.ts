import test from "node:test";
import assert from "node:assert/strict";

import { autoRunName } from "./generate.js";

/**
 * These guard one specific hazard rather than the format for its own sake.
 *
 * `jobs.name` is UNIQUE, but `setJobName` resolves a collision by STEALING the
 * name - `UPDATE jobs SET name = NULL WHERE name = ? AND task_id != ?` - so a
 * generated name landing on one a human chose would silently strip the label
 * off their job. The defence is a namespace nobody would type, plus enough
 * entropy that two runs in the same second do not collide either.
 */

test("an auto name is in a namespace a human would not type", () => {
  assert.match(autoRunName(), /^run-\d{8}-[0-9a-f]{6}$/);
});

test("auto names do not repeat", () => {
  // 24 bits of entropy per day-stamp. This is not a birthday-bound proof; it
  // catches the real regression, which would be a name derived from the clock
  // alone - two runs submitted in the same second would then collide, and the
  // second one would steal the first one's name.
  const names = new Set(Array.from({ length: 500 }, () => autoRunName()));
  assert.equal(names.size, 500);
});

test("an auto name cannot be mistaken for a name a caller passed", () => {
  // The point of the prefix: a human naming a run 'logo_draft_2' can never be
  // shadowed, because no generated name starts anywhere but `run-`.
  for (const human of ["logo_draft_2", "hero_banner_blue", "run", "runway"]) {
    assert.notEqual(autoRunName(), human);
    assert.doesNotMatch(human, /^run-\d{8}-[0-9a-f]{6}$/);
  }
});
