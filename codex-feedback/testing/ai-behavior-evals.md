# AI Behavior And Scoring Evals

Date: 2026-05-03

AI behavior needs a separate evaluation track from normal unit tests. Unit tests should not call Claude. Live AI evals should run only when intentionally requested because they cost money and depend on model/API availability.

## Goal

Answer this question:

> Given fixed images, fixed prompt/context, and fixed expected behavior ranges, does Claude still produce acceptable cull scores, ratings, dimension scores, and notes?

This is different from manual URL testing. Manual testing answers whether the deployed product works for a user. AI evals answer whether the model/scoring behavior is still within expected bounds.

## Proposed Command

Add a future script:

```bash
npm run eval:ai
```

The command should:

1. Load a small fixture set.
2. Call the real local server route or `runCull` path with real Claude.
3. Save raw outputs to `eval-results/YYYY-MM-DDTHH-mm-ss.json`.
4. Compare results against expected ranges.
5. Print a pass/fail summary.

Do not include this in `npm test`.

## Required Inputs

For local live evals:

- `ANTHROPIC_API_KEY` in `.env.local`
- Small stable fixture set
- Expected rating/score ranges per fixture
- Expected note constraints
- Optional taste profile fixture
- Optional session intent fixture

For production live smoke:

- Latest Vercel URL
- Test account or BYOK path
- Small test photo set

## Fixture Expectation Shape

Recommended starting shape:

```ts
type AiEvalCase = {
  id: string;
  file: string;
  intent: {
    preset: "documentary" | "street" | "film" | "wildlife" | "landscape" | "portrait" | "events" | "mixed";
    freeForm?: string;
  };
  profile?: {
    prose: string;
    aestheticTags: string[];
  };
  expected: {
    allowedRatings: Array<"HERO" | "SELECT" | "MAYBE" | "CUT">;
    scoreRange: [number, number];
    dimensionRanges?: {
      impact?: [number, number];
      composition?: [number, number];
      rawQuality?: [number, number];
      craftExecution?: [number, number];
      story?: [number, number];
    };
    mustMention?: string[];
    mustNotMention?: string[];
  };
};
```

Example:

```ts
{
  id: "red-flower-profile-duplicate",
  file: "DSCF6128.JPG",
  intent: { preset: "mixed" },
  profile: {
    prose: "You favor warm light, close subject studies, and botanical detail...",
    aestheticTags: ["warm_tones", "close_subject", "botanical_detail"]
  },
  expected: {
    allowedRatings: ["MAYBE", "SELECT"],
    scoreRange: [48, 62],
    dimensionRanges: {
      story: [25, 45]
    },
    mustMention: ["flower"],
    mustNotMention: ["diverges from your library"]
  }
}
```

## Good Assertions

Prefer ranges and semantic constraints over exact scores:

- Rating is in an allowed bucket.
- Score is inside a range.
- Dimension scores are plausible.
- CRAFT does not punish intentional style under matching intent.
- RAW_QUALITY stays objective.
- STORY remains low when there is no decisive moment.
- Cull note names the actual subject/problem.
- Profile alignment language is coherent.
- Weak frames are not rescued across buckets.
- Strong frames are not undercut by irrelevant profile divergence.

## Bad Assertions

Avoid:

- Exact score equality.
- Exact prose equality.
- Overly narrow score bands.
- Treating one model run as statistical truth.
- Running live evals by default in CI without budget controls.

## Suggested Initial Eval Set

Use 8–12 images, not a huge shoot:

- One strong wildlife frame
- One weak technically-fine frame with no story
- One intentional blur / film-style frame
- One landscape with strong light but low story
- One portrait/candid with expression
- One pretty-subject study, e.g. flower/pet/food
- One profile-aligned frame
- One profile-divergent frame

Keep the set stable. Update expected ranges only when there is an intentional rubric or prompt change.

## Phase E Tie-In

When profile-aware scoring lands, add eval assertions for:

- `rubricScore`
- `profileDelta`
- `finalScore`
- `profileAffinity.alignment`
- `matchedTraits`
- `contradictedTraits`

The app should compute `profileDelta` deterministically from the model's structured affinity output. AI evals should test whether the affinity object is reasonable; unit tests should test whether the app clamps/applies it correctly.
