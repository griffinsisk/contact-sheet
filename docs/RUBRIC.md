# Scoring Rubric — V1 Spec

The rubric determines how every photo gets scored and rated. This is the source of truth for what the prompts implement. If the prompt diverges from this doc, fix one or the other — don't let them drift.

## Core principle

**Grade the attempt, not the convention.** The previous rubric scored against absolute photography standards and mistook stylistic choices for technical failure. The V1 rubric accepts an **intent signal** and grades conditionally against it.

## Dimensions

Five dimensions, each 0–100:

| Dimension | Weight | What it measures | Intent-conditional? |
|---|---|---|---|
| **IMPACT** | 30% | Emotional resonance before analysis. Does the frame stop you? | No |
| **COMPOSITION** | 25% | Eye flow, geometry, negative space, figure-ground, framing intentionality | Partially — thresholds flex with intent |
| **RAW_QUALITY** | 15% | Is the data there? Exposure in range, recoverable shadows/highlights, noise manageable, dynamic range intact, color information preserved | **No — always objective** |
| **CRAFT_EXECUTION** | 10% | Did the photographer land what they were attempting? Focus where intended, stable where intended, framing cleanly delivered | **Yes — heavily intent-conditional** |
| **STORY** | 20% | Decisive moment, narrative pull, authenticity, meaning beyond the surface | No |

**Overall** = (impact × 0.30) + (composition × 0.25) + (raw_quality × 0.15) + (craft × 0.10) + (story × 0.20), rounded to integer.

### Why TECHNICAL split into RAW_QUALITY and CRAFT_EXECUTION

The old TECHNICAL dimension conflated two things that move in opposite directions under intent:

- **RAW_QUALITY is objective.** Blown highlights with zero recovery are a failure regardless of style. Noise beyond recovery is a failure. Exposure data not present is a failure. You cannot style your way out of missing data.
- **CRAFT_EXECUTION is intent-conditional.** Motion blur is *craft failure* if you were going for sharp wildlife. Motion blur is *craft success* if you were going for film/intentional-imperfection aesthetic.

Splitting lets us grade RAW_QUALITY strictly and CRAFT_EXECUTION against intent. The boba frame: RAW_QUALITY = 80+ (colors intact, exposure fine, composition preserved), CRAFT_EXECUTION against "Film / intentional imperfection" = 80+ (they landed the blur they were going for). Under the old rubric, the single TECHNICAL dimension tanked and collapsed the overall score.

## Rating thresholds

| Score range | Rating | Meaning |
|---|---|---|
| 85–100 | HERO | Portfolio-worthy |
| 70–84 | SELECT | Strong, worth developing |
| 50–69 | MAYBE | Something there but not fully realized |
| 0–49 | CUT | Broken fundamentals OR nothing to develop |

**CUT rule (V1 change):** a score in the 0–49 band requires **either** (a) broken fundamentals — unrecoverable exposure, out-of-focus subject where focus was clearly the goal, severe camera shake where stability was the goal, **or** (b) nothing to develop — no moment, no subject of interest, no compositional idea, no story.

A technically-fine-but-pointless frame (the "accidental shot" case) should score 40–55 and land in CUT or low MAYBE. **It should never score in the 60s** just because exposure was correct. The old rubric allowed this because STORY was only 20% weight — fix is in the prompt's CUT rule, not a weight change.

## Intent system

### Session intent presets (V1)

One of 8 values, selected at cull-start:

1. `documentary` — Documentary / candid
2. `street` — Street
3. `film` — Film / intentional imperfection
4. `wildlife` — Sharp wildlife / sports / action
5. `landscape` — Fine-art landscape
6. `portrait` — Portrait / people
7. `events` — Events (weddings, parties, performances)
8. `mixed` — Mixed; judge each photo individually

Plus optional free-form text the photographer can add ("any other direction for this set?").

### How intent modifies the rubric

The prompt receives the intent and applies these rules:

**For `film` (intentional imperfection):**
- Motion blur, grain, lo-fi lens artifacts are **craft success if consistent with aesthetic**, not failures.
- Sharp, over-lit, clinical frames score *lower* on craft because they miss the aesthetic target.
- COMPOSITION thresholds stay standard — composition matters regardless of style.

**For `wildlife` / `sports` / `action`:**
- Sharp subject is craft success; blur is craft failure.
- Subject isolation via DOF is weighted positively in COMPOSITION.
- Strict focus standards on the eye/subject's face.

**For `landscape`:**
- Lens sharpness corner-to-corner matters more than central focus.
- Dynamic range / recoverable shadows weighted more in RAW_QUALITY.
- COMPOSITION is weighted up in practice because classical composition is genre-expected.

**For `documentary` / `street` / `events`:**
- Moment capture > technical perfection. STORY effectively gets more implicit weight.
- Slight softness acceptable if the moment justifies it.
- Classical composition less strictly graded.

**For `portrait`:**
- Focus on subject's eye is strict craft.
- Expression and gesture drive IMPACT and STORY.
- Light quality matters in RAW_QUALITY and IMPACT.

**For `mixed`:**
- CRAFT is NOT intent-conditional. Each photo is judged on its own apparent intent inferred from the frame itself.
- Used when the photographer dumps a shoe-box of mixed work.

### Free-form text

Appended verbatim to the prompt after the preset instruction. Examples:
- "Couple asked for a 90s disposable vibe."
- "First-time using the Leica — going for raw and honest over technical."
- "Testing a new 85mm wide open."

No parsing; the model reads it directly.

## Persistent style profile

### What it is

A per-user artifact generated from 8–20 uploaded favorites. Two parts:

- **Prose** (~150 words): human-readable description of the photographer's style, shown in the UI.
- **Hints**: structured fields injected into the prompt.

```ts
type StyleProfileHints = {
  aestheticTags: string[];                  // e.g. ["intentional_blur", "warm_tones", "tight_crops"]
  weightAdjustments?: Partial<{             // bounded ±5
    impact: number;
    composition: number;
    rawQuality: number;
    craftExecution: number;
    story: number;
  }>;
  cutThresholdShift?: number;               // ±10
  primaryIntentAffinity?: IntentPreset;
};
```

### How it modifies the rubric

- **`weightAdjustments`** are *added* to base weights. A photographer whose favorites all show deep STORY gets `story: +5`. Bounded to ±5 so the rubric can't deform beyond recognition.
- **`cutThresholdShift`** moves the CUT boundary. A photographer who favors unconventional work gets `cutThresholdShift: -3` so frames score higher against their own aesthetic.
- **`aestheticTags`** go into the prompt as context: "This photographer favors intentional blur, warm tones, tight crops. Weigh accordingly."
- **`primaryIntentAffinity`** is a default fallback if the user skips the intent picker — fall back to their baseline style.

### Conflict resolution

When session intent contradicts the persistent profile's `primaryIntentAffinity`, **session intent wins for that cull.** The photographer has explicitly said "I'm doing something different today." Profile is context; session intent is command.

Example: profile says `primaryIntentAffinity: documentary` but user picks `landscape` for this shoot — the landscape rubric rules apply, but the profile's aesthetic tags ("warm_tones", "candid_over_posed") still inform interpretation.

## Prompt preamble order

The final cull prompt is assembled in this order, top-to-bottom:

```
1. Persistent profile prose (if present)
2. Persistent profile hints applied as weight adjustments
3. Session intent preset + conditional CRAFT rules for that intent
4. Session free-form text (if provided)
5. [V1.5 slot: session tone references — unused in V1]
6. Set-level inferred style read (if batch 1, else reused from cache)
7. Cull rubric body (dimensions, weights, rating thresholds, CUT rules)
8. Calibration anchors (updated for new 5-dimension model)
9. Batch images + per-image EXIF/filename context
```

## Override learning

Rolling last-30 overrides persist between sessions. Each entry:

```ts
type OverrideEntry = {
  photoHash: string;                // content hash of downsized pixels
  shortDescription: string;         // 10-word model-generated desc, cached
  sessionIntent: IntentPreset;
  originalScore: number;
  originalRating: Rating;
  userRating: Rating;
  timestamp: number;
};
```

### How overrides affect scoring

1. **Few-shot injection in future culls.** The last 5–10 relevant overrides (preferring same intent) are added to the prompt as calibration examples. Bounded so they don't dominate.
2. **Profile regeneration input.** When the user regenerates their style profile, all 30 overrides are included as "how this photographer actually rates things." Profile drifts toward taste over time.

## Calibration anchors

These go in the prompt for consistency. Updated from V0 for the 5-dimension model.

| Scenario | IMP | COMP | RAW | CRAFT | STORY | Overall | Rating |
|---|---|---|---|---|---|---|---|
| Technically sound but emotionally flat landscape | 30 | 70 | 85 | 80 | 25 | 54 | MAYBE |
| Accidental shot, technically fine, no subject interest | 15 | 45 | 75 | 65 | 10 | 34 | CUT |
| Intentional-blur candid portrait, film aesthetic (intent=film) | 82 | 72 | 80 | 78 | 78 | 78 | SELECT |
| Same frame, intent=wildlife (mismatch) | 50 | 60 | 80 | 20 | 50 | 51 | MAYBE |
| Well-composed portrait, great light, genuine expression | 82 | 85 | 80 | 85 | 78 | 82 | SELECT |
| Once-in-a-lifetime perfect moment | 96 | 94 | 90 | 92 | 95 | 94 | HERO |
| Tight-crop landscape, beautiful light (intent=landscape) | 78 | 62 | 88 | 82 | 55 | 72 | SELECT |
| Sharp wildlife, subject eye in focus, clean separation | 80 | 78 | 85 | 92 | 65 | 78 | SELECT |

Note the 3rd and 4th rows: same frame, different intent → different CRAFT score → different rating. This is the headline behavior change in V1.

## Change log

| Date | Change |
|---|---|
| 2026-04-22 | Initial V1 spec. Split TECHNICAL → RAW_QUALITY + CRAFT_EXECUTION. Added intent system, style profile, override learning. |

When the rubric changes, update this doc, the prompts in `lib/prompts.ts`, and the calibration anchors in one commit. Do not let them drift.
