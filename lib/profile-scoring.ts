import type { CullResult, DimensionScores, ProfileAffinity } from "./types";
import {
  canCrossRatingBoundary,
  clampScore,
  computeOverall,
  crossedRatingBoundaries,
  ratingFromScore,
} from "./scoring";

interface ApplyProfileScoringOptions {
  hasProfile: boolean;
  libraryMatch?: boolean;
}

const DIMENSION_KEYS: (keyof DimensionScores)[] = [
  "impact",
  "composition",
  "rawQuality",
  "craftExecution",
  "story",
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasCompleteScores(scores: CullResult["scores"]): scores is DimensionScores {
  return !!scores && DIMENSION_KEYS.every((key) => isFiniteNumber(scores[key]));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, 6);
}

function sanitizeSuggestedDelta(raw: unknown): ProfileAffinity["suggestedDelta"] {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return {
    ...(isFiniteNumber(r.impact) ? { impact: clamp(r.impact, -10, 10) } : {}),
    ...(isFiniteNumber(r.composition) ? { composition: clamp(r.composition, -10, 10) } : {}),
    ...(isFiniteNumber(r.story) ? { story: clamp(r.story, -10, 10) } : {}),
  };
}

export function normalizeProfileAffinity(
  raw: unknown,
  options: { libraryMatch?: boolean } = {},
): ProfileAffinity | null {
  if (!raw || typeof raw !== "object") {
    if (!options.libraryMatch) return null;
    return {
      alignment: "aligned",
      confidence: 1,
      matchedTraits: ["already in your favorites"],
      contradictedTraits: [],
      suggestedDelta: {},
    };
  }

  const r = raw as Record<string, unknown>;
  const alignment = r.alignment === "aligned" || r.alignment === "diverged" || r.alignment === "outside"
    ? r.alignment
    : "outside";
  const confidence = isFiniteNumber(r.confidence) ? clamp(r.confidence, 0, 1) : 0;
  const matchedTraits = sanitizeStringArray(r.matchedTraits);
  const contradictedTraits = sanitizeStringArray(r.contradictedTraits);

  const affinity: ProfileAffinity = {
    alignment,
    confidence,
    matchedTraits,
    contradictedTraits,
    suggestedDelta: sanitizeSuggestedDelta(r.suggestedDelta),
  };

  if (!options.libraryMatch) return affinity;

  return {
    ...affinity,
    alignment: "aligned",
    confidence: Math.max(affinity.confidence, 1),
    matchedTraits: Array.from(new Set([...affinity.matchedTraits, "already in your favorites"])),
    contradictedTraits: [],
  };
}

function weightedSuggestedDelta(delta: ProfileAffinity["suggestedDelta"]): number {
  return Math.round(
    (delta.impact ?? 0) * 0.30
    + (delta.composition ?? 0) * 0.25
    + (delta.story ?? 0) * 0.20,
  );
}

function boundedProfileDelta(affinity: ProfileAffinity): number {
  if (affinity.alignment === "outside") return 0;

  const raw = weightedSuggestedDelta(affinity.suggestedDelta);

  if (affinity.alignment === "aligned") {
    if (affinity.confidence >= 0.8) return clamp(raw > 0 ? raw : 2, 2, 6);
    if (affinity.confidence >= 0.5) return clamp(raw > 0 ? raw : 1, 1, 3);
    return clamp(raw > 0 ? raw : 0, 0, 1);
  }

  const fallback = affinity.contradictedTraits.length > 0 ? 1 : 0;
  return -clamp(Math.abs(raw) || fallback, 0, 3);
}

function constrainToOriginalBucket(rubricScore: number, candidateScore: number): number {
  const boundaries = crossedRatingBoundaries(rubricScore, candidateScore);
  if (boundaries.length === 0) return candidateScore;

  if (candidateScore > rubricScore) {
    return Math.min(candidateScore, Math.min(...boundaries) - 1);
  }
  return Math.max(candidateScore, Math.max(...boundaries));
}

function applyGuardrails(
  rubricScore: number,
  candidateDelta: number,
  scores: DimensionScores | undefined,
): { finalScore: number; profileDelta: number } {
  let finalScore = clampScore(rubricScore + candidateDelta);

  if (!canCrossRatingBoundary(rubricScore, finalScore, 3)) {
    finalScore = constrainToOriginalBucket(rubricScore, finalScore);
  }

  if (scores && scores.story < 30 && ratingFromScore(finalScore) === "HERO") {
    finalScore = 84;
  }

  finalScore = clampScore(finalScore);
  return {
    finalScore,
    profileDelta: finalScore - rubricScore,
  };
}

export function applyProfileScoring(
  result: CullResult,
  options: ApplyProfileScoringOptions,
): CullResult {
  const scores = hasCompleteScores(result.scores) ? result.scores : undefined;
  const rubricScore = scores
    ? computeOverall(scores)
    : clampScore(result.rubricScore ?? result.score);

  const affinity = options.hasProfile || options.libraryMatch
    ? normalizeProfileAffinity(result.profileAffinity, { libraryMatch: options.libraryMatch })
    : null;
  const candidateDelta = affinity ? boundedProfileDelta(affinity) : 0;
  const { finalScore, profileDelta } = applyGuardrails(rubricScore, candidateDelta, scores);

  const next: CullResult = {
    ...result,
    score: finalScore,
    rating: ratingFromScore(finalScore),
    rubricScore,
    profileDelta,
    finalScore,
  };
  if (affinity) next.profileAffinity = affinity;
  else delete next.profileAffinity;
  return next;
}
