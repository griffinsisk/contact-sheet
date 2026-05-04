import test from "node:test";
import assert from "node:assert/strict";

import {
  canCrossRatingBoundary,
  clampScore,
  computeOverall,
  crossedRatingBoundaries,
  isNearRatingBoundary,
  ratingFromScore,
} from "../../lib/scoring";

test("computeOverall applies the cull rubric weights and rounds", () => {
  assert.equal(computeOverall({
    impact: 62,
    composition: 55,
    rawQuality: 68,
    craftExecution: 65,
    story: 35,
  }), 56);

  assert.equal(computeOverall({
    impact: 96,
    composition: 94,
    rawQuality: 90,
    craftExecution: 92,
    story: 95,
  }), 94);
});

test("ratingFromScore matches prompt thresholds", () => {
  assert.equal(ratingFromScore(0), "CUT");
  assert.equal(ratingFromScore(49), "CUT");
  assert.equal(ratingFromScore(50), "MAYBE");
  assert.equal(ratingFromScore(69), "MAYBE");
  assert.equal(ratingFromScore(70), "SELECT");
  assert.equal(ratingFromScore(84), "SELECT");
  assert.equal(ratingFromScore(85), "HERO");
  assert.equal(ratingFromScore(100), "HERO");
});

test("clampScore rounds finite values and clamps invalid extremes", () => {
  assert.equal(clampScore(72.49), 72);
  assert.equal(clampScore(72.5), 73);
  assert.equal(clampScore(-10), 0);
  assert.equal(clampScore(110), 100);
  assert.equal(clampScore(Number.NaN), 0);
});

test("rating-boundary helpers detect major bucket crossings", () => {
  assert.deepEqual(crossedRatingBoundaries(68, 72), [70]);
  assert.deepEqual(crossedRatingBoundaries(48, 86), [50, 70, 85]);
  assert.deepEqual(crossedRatingBoundaries(72, 74), []);

  assert.equal(isNearRatingBoundary(67), true);
  assert.equal(isNearRatingBoundary(66), false);
  assert.equal(canCrossRatingBoundary(67, 71), true);
  assert.equal(canCrossRatingBoundary(62, 71), false);
  assert.equal(canCrossRatingBoundary(72, 48), false);
});
