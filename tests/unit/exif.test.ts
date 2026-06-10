import test from "node:test";
import assert from "node:assert/strict";

import { parseExifTimestamp } from "../../lib/exif";

test("parseExifTimestamp parses the EXIF colon-date format", () => {
  const ms = parseExifTimestamp("2026:06:01 14:22:33");
  assert.equal(ms, new Date(2026, 5, 1, 14, 22, 33).getTime());
});

test("parseExifTimestamp adds subseconds", () => {
  const base = new Date(2026, 5, 1, 14, 22, 33).getTime();
  assert.equal(parseExifTimestamp("2026:06:01 14:22:33", "5"), base + 500);
  assert.equal(parseExifTimestamp("2026:06:01 14:22:33", "57"), base + 570);
  assert.equal(parseExifTimestamp("2026:06:01 14:22:33", "057"), base + 57);
});

test("parseExifTimestamp rejects malformed or missing input", () => {
  assert.equal(parseExifTimestamp(undefined), undefined);
  assert.equal(parseExifTimestamp(""), undefined);
  assert.equal(parseExifTimestamp("not a date"), undefined);
  assert.equal(parseExifTimestamp("2026-06-01 14:22:33"), undefined);
});

test("parseExifTimestamp ignores unparseable subseconds", () => {
  const base = new Date(2026, 5, 1, 14, 22, 33).getTime();
  assert.equal(parseExifTimestamp("2026:06:01 14:22:33", "xx"), base);
});
