import test from "node:test";
import assert from "node:assert/strict";

import { parseJSON } from "../../lib/providers";

test("parseJSON accepts fenced JSON", () => {
  const parsed = parseJSON('```json\n{"cull":[{"index":0,"score":72,"rating":"SELECT","reason":"Works"}]}\n```', false);

  assert.equal(parsed.cull[0].rating, "SELECT");
});

test("parseJSON repairs a truncated cull response at the last complete item", () => {
  const parsed = parseJSON(
    '{"cull":[{"index":0,"score":72,"rating":"SELECT","reason":"Works"}',
    true,
  );

  assert.equal(parsed._truncated, true);
  assert.equal(parsed.cull[0].score, 72);
});

test("parseJSON throws useful context for invalid non-truncated JSON", () => {
  assert.throws(
    () => parseJSON("not-json", false),
    /Invalid JSON response: not-json/,
  );
});
