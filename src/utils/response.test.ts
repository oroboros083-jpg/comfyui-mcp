import { test } from "node:test";
import assert from "node:assert/strict";

import {
  paginate,
  jsonText,
  capText,
  ResponseFormat,
  envelopeFor,
} from "./response.js";
import { CHARACTER_LIMIT } from "../constants.js";

test("paginate reports totals independent of page size", () => {
  const items = Array.from({ length: 100 }, (_, i) => i);
  const page = paginate(items, 25, 0);

  assert.equal(page.total, 100);
  assert.equal(page.count, 25);
  assert.equal(page.offset, 0);
  assert.deepEqual(page.items[0], 0);
  assert.equal(page.has_more, true);
  assert.equal(page.next_offset, 25);
});

test("paginate walks to the end and then stops advertising more", () => {
  const items = Array.from({ length: 30 }, (_, i) => i);

  const mid = paginate(items, 25, 0);
  assert.equal(mid.has_more, true);
  assert.equal(mid.next_offset, 25);

  const last = paginate(items, 25, mid.next_offset!);
  assert.equal(last.count, 5);
  assert.equal(last.has_more, false);
  assert.equal(last.next_offset, undefined, "no next_offset on the final page");
});

test("paginate handles an offset past the end without throwing", () => {
  const page = paginate([1, 2, 3], 25, 999);
  assert.equal(page.count, 0);
  assert.deepEqual(page.items, []);
  assert.equal(page.has_more, false);
});

test("paginate on an empty set reports zero rather than a phantom page", () => {
  const page = paginate([], 25, 0);
  assert.equal(page.total, 0);
  assert.equal(page.count, 0);
  assert.equal(page.has_more, false);
});

test("jsonText emits compact JSON", () => {
  const text = jsonText({ a: 1, b: [1, 2] });
  assert.equal(text, '{"a":1,"b":[1,2]}');
  assert.ok(!text.includes("\n"), "compact output carries no newlines");
});

test("jsonText round-trips through JSON.parse", () => {
  const value = { nested: { list: [1, "two", null], flag: true } };
  assert.deepEqual(JSON.parse(jsonText(value)), value);
});

test("capText leaves an under-limit response untouched", () => {
  const text = "short response";
  assert.equal(capText(text, "narrow it"), text);
});

test("capText truncates and says how to narrow the request", () => {
  const text = "x".repeat(CHARACTER_LIMIT + 5000);
  const capped = capText(text, "Use 'limit' and 'offset'.");

  assert.ok(capped.length <= CHARACTER_LIMIT, "capped output respects the limit");
  assert.ok(capped.includes("TRUNCATED"), "truncation is announced, not silent");
  assert.ok(capped.includes("Use 'limit' and 'offset'."), "the narrowing hint survives");
});

test("ResponseFormat exposes the two documented formats", () => {
  assert.equal(ResponseFormat.MARKDOWN, "markdown");
  assert.equal(ResponseFormat.JSON, "json");
});

test("envelopeFor reports the same boundaries paginate does", () => {
  // Same contract, for data the source already paged. The two must agree or
  // a caller cannot page a SQL-backed listing the way it pages an in-memory
  // one.
  for (const [total, limit] of [[0, 10], [1, 10], [10, 10], [11, 10], [95, 25]]) {
    for (let offset = 0; offset <= total; offset += limit) {
      const items = Array.from({ length: total }, (_, i) => i);
      const sliced = paginate(items, limit, offset);
      const { items: _drop, ...expected } = sliced;

      assert.deepEqual(
        envelopeFor(total, sliced.count, offset),
        expected,
        `total ${total}, limit ${limit}, offset ${offset}`
      );
    }
  }
});

test("envelopeFor omits next_offset on the final page", () => {
  const last = envelopeFor(30, 5, 25);

  assert.equal(last.has_more, false);
  assert.equal("next_offset" in last, false);
});

test("envelopeFor names the next offset when more remain", () => {
  const page = envelopeFor(100, 25, 25);

  assert.equal(page.has_more, true);
  assert.equal(page.next_offset, 50);
});
