# Scoring Algorithm Tests

Date: 2026-05-03

The current app mostly trusts the model's returned `score`, `rating`, and dimension scores. That means there is not much deterministic scoring algorithm to test yet beyond validation helpers.

The next scoring-related test work should make the math explicit in app code.

## Current Rubric Math

The prompt specifies:

```ts
overall =
  impact * 0.30 +
  composition * 0.25 +
  rawQuality * 0.15 +
  craftExecution * 0.10 +
  story * 0.20
```

Thresholds:

```ts
85-100 => HERO
70-84  => SELECT
50-69  => MAYBE
0-49   => CUT
```

## Recommended Helper

Add a future `lib/scoring.ts`:

```ts
import type { DimensionScores, Rating } from "./types";

export function computeOverall(scores: DimensionScores): number {
  return Math.round(
    scores.impact * 0.30 +
    scores.composition * 0.25 +
    scores.rawQuality * 0.15 +
    scores.craftExecution * 0.10 +
    scores.story * 0.20,
  );
}

export function ratingFromScore(score: number): Rating {
  if (score >= 85) return "HERO";
  if (score >= 70) return "SELECT";
  if (score >= 50) return "MAYBE";
  return "CUT";
}
```

## Recommended Unit Tests

Test cases:

- Weighted overall is rounded correctly.
- Boundary scores map correctly:
  - 49 => CUT
  - 50 => MAYBE
  - 69 => MAYBE
  - 70 => SELECT
  - 84 => SELECT
  - 85 => HERO
- Model-returned `score` matches recomputed score within `±1`.
- Model-returned `rating` matches `ratingFromScore(score)`.

## Phase E Profile Delta Tests

When profile-aware scoring is implemented, add tests for:

- Strong alignment clamps to max positive delta.
- Medium alignment clamps lower than high alignment.
- `outside` produces zero delta.
- Divergence produces small negative or zero delta.
- Profile delta cannot force a major bucket crossing unless the rubric score is near the boundary.
- Story guardrails still win.
- Duplicate-library sanity check forces aligned affinity without changing objective rubric score.

Keep these as unit tests. Claude should not be called.

## Separation Of Responsibilities

Use unit tests for:

- Math
- Thresholds
- Clamping
- Backwards compatibility with old saved sessions

Use AI evals for:

- Whether Claude's dimension scores are plausible
- Whether profile affinity labels are reasonable
- Whether cull notes describe the frame truthfully

Do not mix the two. Deterministic scoring tests should be fast, free, and run on every change.
