import test from "node:test";
import assert from "node:assert/strict";

import { applyProfileScoring } from "../../lib/profile-scoring";
import type { CullResult } from "../../lib/types";

const base: CullResult = {
  index: 0,
  score: 72,
  rating: "SELECT",
  scores: {
    impact: 70,
    composition: 78,
    rawQuality: 82,
    craftExecution: 75,
    story: 65,
  },
  reason: "Works",
};

test("applyProfileScoring recomputes score and rating from rubric dimensions without a profile", () => {
  const scored = applyProfileScoring({ ...base, score: 99, rating: "HERO" }, { hasProfile: false });

  assert.equal(scored.rubricScore, 73);
  assert.equal(scored.profileDelta, 0);
  assert.equal(scored.score, 73);
  assert.equal(scored.finalScore, 73);
  assert.equal(scored.rating, "SELECT");
});

test("aligned affinity applies a capped positive delta near bucket boundaries", () => {
  const scored = applyProfileScoring({
    ...base,
    scores: {
      impact: 65,
      composition: 70,
      rawQuality: 80,
      craftExecution: 70,
      story: 55,
    },
    profileAffinity: {
      alignment: "aligned",
      confidence: 0.92,
      matchedTraits: ["warm color", "tight crop"],
      contradictedTraits: [],
      suggestedDelta: { impact: 10, composition: 10, story: 10 },
    },
  }, { hasProfile: true });

  assert.equal(scored.rubricScore, 67);
  assert.equal(scored.profileDelta, 6);
  assert.equal(scored.score, 73);
  assert.equal(scored.rating, "SELECT");
});

test("profile delta cannot jump buckets when the rubric score is not near the boundary", () => {
  const scored = applyProfileScoring({
    ...base,
    scores: {
      impact: 62,
      composition: 62,
      rawQuality: 80,
      craftExecution: 70,
      story: 54,
    },
    profileAffinity: {
      alignment: "aligned",
      confidence: 0.95,
      matchedTraits: ["favorite palette"],
      contradictedTraits: [],
      suggestedDelta: { impact: 10, composition: 10, story: 10 },
    },
  }, { hasProfile: true });

  assert.equal(scored.rubricScore, 64);
  assert.equal(scored.profileDelta, 5);
  assert.equal(scored.score, 69);
  assert.equal(scored.rating, "MAYBE");
});

test("diverged affinity applies only a small negative delta", () => {
  const scored = applyProfileScoring({
    ...base,
    profileAffinity: {
      alignment: "diverged",
      confidence: 0.9,
      matchedTraits: [],
      contradictedTraits: ["soft motion against sharp wildlife preference"],
      suggestedDelta: { impact: -10, composition: -10, story: -10 },
    },
  }, { hasProfile: true });

  assert.equal(scored.rubricScore, 73);
  assert.equal(scored.profileDelta, -3);
  assert.equal(scored.score, 70);
  assert.equal(scored.rating, "SELECT");
});

test("story guardrail prevents profile alignment from making low-story frames HERO", () => {
  const scored = applyProfileScoring({
    ...base,
    scores: {
      impact: 96,
      composition: 96,
      rawQuality: 96,
      craftExecution: 96,
      story: 25,
    },
    profileAffinity: {
      alignment: "aligned",
      confidence: 0.95,
      matchedTraits: ["palette"],
      contradictedTraits: [],
      suggestedDelta: { impact: 10, composition: 10, story: 10 },
    },
  }, { hasProfile: true });

  assert.equal(scored.rubricScore, 82);
  assert.equal(scored.score, 84);
  assert.equal(scored.rating, "SELECT");
});

test("library membership forces aligned affinity and appends an explicit trait", () => {
  const scored = applyProfileScoring({
    ...base,
    profileAffinity: {
      alignment: "diverged",
      confidence: 0.6,
      matchedTraits: ["botanical subject"],
      contradictedTraits: ["claimed mismatch"],
      suggestedDelta: {},
    },
  }, { hasProfile: true, libraryMatch: true });

  assert.equal(scored.profileAffinity?.alignment, "aligned");
  assert.deepEqual(scored.profileAffinity?.contradictedTraits, []);
  assert.ok(scored.profileAffinity?.matchedTraits.includes("already in your favorites"));
  assert.equal(scored.profileDelta, 2);
});
