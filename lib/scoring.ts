import type { DimensionScores, Rating } from "./types";

export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

export const RATING_THRESHOLDS: Record<Exclude<Rating, "CUT">, number> = {
  MAYBE: 50,
  SELECT: 70,
  HERO: 85,
};

export const SCORE_WEIGHTS: Record<keyof DimensionScores, number> = {
  impact: 0.30,
  composition: 0.25,
  rawQuality: 0.15,
  craftExecution: 0.10,
  story: 0.20,
};

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return SCORE_MIN;
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(score)));
}

export function computeOverall(scores: DimensionScores): number {
  return clampScore(
    scores.impact * SCORE_WEIGHTS.impact
    + scores.composition * SCORE_WEIGHTS.composition
    + scores.rawQuality * SCORE_WEIGHTS.rawQuality
    + scores.craftExecution * SCORE_WEIGHTS.craftExecution
    + scores.story * SCORE_WEIGHTS.story,
  );
}

export function ratingFromScore(score: number): Rating {
  const clamped = clampScore(score);
  if (clamped >= RATING_THRESHOLDS.HERO) return "HERO";
  if (clamped >= RATING_THRESHOLDS.SELECT) return "SELECT";
  if (clamped >= RATING_THRESHOLDS.MAYBE) return "MAYBE";
  return "CUT";
}

export function ratingRank(rating: Rating): number {
  switch (rating) {
    case "CUT": return 0;
    case "MAYBE": return 1;
    case "SELECT": return 2;
    case "HERO": return 3;
  }
}

export function ratingChanged(fromScore: number, toScore: number): boolean {
  return ratingFromScore(fromScore) !== ratingFromScore(toScore);
}

export function crossedRatingBoundaries(fromScore: number, toScore: number): number[] {
  const low = Math.min(clampScore(fromScore), clampScore(toScore));
  const high = Math.max(clampScore(fromScore), clampScore(toScore));
  return Object.values(RATING_THRESHOLDS).filter((threshold) => low < threshold && high >= threshold);
}

export function isNearRatingBoundary(score: number, window = 3): boolean {
  const clamped = clampScore(score);
  return Object.values(RATING_THRESHOLDS).some((threshold) => Math.abs(clamped - threshold) <= window);
}

export function canCrossRatingBoundary(fromScore: number, toScore: number, window = 3): boolean {
  const crossed = crossedRatingBoundaries(fromScore, toScore);
  if (crossed.length === 0) return true;
  const clampedFrom = clampScore(fromScore);
  return crossed.every((threshold) => Math.abs(clampedFrom - threshold) <= window);
}
