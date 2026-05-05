import test from "node:test";
import assert from "node:assert/strict";

import { buildDeepReviewPrompt } from "../../lib/prompts";

test("deep review prompt is reframed as shortlist development", () => {
  const prompt = buildDeepReviewPrompt({ preset: "mixed" }, null);

  assert.match(prompt, /Develop this shortlist/i);
  assert.match(prompt, /editorialRole/);
  assert.match(prompt, /editDirection/);
  assert.match(prompt, /cropOrCompositionNote/);
  assert.doesNotMatch(prompt, /go deeper on/i);
});
