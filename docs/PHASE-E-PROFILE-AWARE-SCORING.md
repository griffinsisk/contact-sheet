# Phase E — Profile-Aware Scoring

---

## Status: implementation mostly complete locally; validation pending (updated 2026-05-04)

Phase D consolidated star and correction signals into the taste-profile regen loop, producing one prose+tags injection per cull. During Phase D smoke testing, a duplicate red flower photo (seeded into the library, then included in a fresh cull) was scored 52 / MAYBE with a cull note saying "diverges from your library" — about a frame literally in the library.

The duplicate is unlikely in real usage, but it surfaced the structural weakness it exposes: the seeded profile barely influences scoring. The model reads the prose, then scores under the rubric. The rubric is concrete math; the profile is fuzzy prose. The rubric wins, and the profile ends up shaping cull-note language more than scoring.

Phase E makes the profile a structured scoring artifact instead of just prompt context.

Source brief: `codex-feedback/profile-aware-scoring.md`.

---

## Diagnosis

The current pipeline:

1. Regen produces `prose` + `aestheticTags`.
2. `tasteSection()` injects them into the cull system prompt as soft bias.
3. The model returns scores under the existing 7-axis rubric (Impact, Composition, Story, Craft, RawQ).
4. `score = weighted_avg(axes)` — no profile-aware math.
5. The cull note closes with one of three alignment phrases (aligns / diverges / outside) — model-written interpretation, not a computed fact.

What this means in practice:

- Prompt tuning oscillates between two bad states: too weak (profile changes wording but barely moves scores) and too strong (profile rescues objectively weak frames).
- "Diverges from your library" is a model interpretation of prose against a frame, not a check against the actual library. It can contradict literal library membership.
- The user can read their profile prose but cannot inspect *how* it moved any specific score.

The cleaner architecture: the model reads taste; the app applies bounded math.

---

## Architecture

Two-layer scoring per frame.

### Layer 1 — Generic rubric score (unchanged)

The model returns the existing rubric breakdown:

```ts
{ impact: 62, composition: 55, raw_quality: 68, craft: 65, story: 35 }
// rubricScore = weighted_avg = 52
```

### Layer 2 — Profile affinity (new)

The same model call also returns a structured affinity object per frame:

```ts
type ProfileAffinity = {
  alignment: "aligned" | "diverged" | "outside";
  confidence: number;            // 0.0–1.0
  matchedTraits: string[];       // tags / prose phrases the frame hits
  contradictedTraits: string[];  // tags / prose phrases it conflicts with
  suggestedDelta: {              // model's proposed adjustment, app clamps it
    impact?: number;
    composition?: number;
    story?: number;
  };
};
```

### App-side bounded math

Application code (not the model) computes the final score:

```ts
type ProfileAwareScore = {
  rubricScore: number;       // raw rubric weighted avg
  profileDelta: number;      // bounded adjustment, signed
  finalScore: number;        // clamp(rubricScore + profileDelta, 0, 100)
  profileAffinity: ProfileAffinity;
};
```

Bounds (starting calibration, subject to validation):

| Alignment | Confidence | Typical delta |
|---|---|---|
| `aligned` (high confidence) | ≥ 0.8 | +2 to +6 |
| `aligned` (medium confidence) | 0.5–0.8 | +1 to +3 |
| `diverged` | any | 0 to −3 |
| `outside` | any | 0 |

Hard rules the app enforces:

- **No bucket-jumping unless near boundary.** Profile delta cannot move a frame across a major rating bucket (CUT/MAYBE/SELECT/HERO) unless the rubric score is already within 3 points of the bucket boundary.
- **Story guardrails win.** A frame with rubric Story < 30 cannot land HERO regardless of profile alignment. Profile bias on subject/light/palette doesn't manufacture decisive moments.
- **Counter-signal symmetry.** A correction-derived `diverged` carries the same magnitude budget as alignment; the bounds table applies in both directions.

### Cull-note coherence

The cull note still has the model write a closing sentence, but the prompt now ties it to the structured affinity:

> "If `alignment === aligned`, write a closing sentence that reflects the matched traits. If `diverged`, name the contradicted traits. Never write `aligns` or `diverges` language unless the affinity object supports it."

This stops the gaslighting at the language layer too.

---

## Display

DetailPanel shows the breakdown:

```
RUBRIC SCORE   52
PROFILE DELTA  +4   (aligned · warm tones, tight crops, botanical interest)
FINAL SCORE    56
```

Inspectable, verifiable, and the user can argue with any of the three lines independently. Same hover/click affordance can list `matchedTraits` and `contradictedTraits` for the curious.

When the user adjusts a rating manually after this, they're adjusting `finalScore` — but the breakdown is preserved in the cull result and visible.

---

## Duplicate-photo sanity check (narrow)

Cross-check incoming photo hashes against `cs-taste-library` entries. For matches, force `alignment = aligned` and append `"already in your favorites"` to the matched traits. This is a sanity check, not the central solution — Phase E's main fix is the structural one above.

---

## Implementation status

| Task | Touchpoints | Size |
|---|---|---|
| Extract deterministic score helpers | `lib/scoring.ts`, `tests/unit/scoring.test.ts` | Done |
| Implement bounded-math layer | `lib/profile-scoring.ts`, `tests/unit/profile-scoring.test.ts` | Done |
| Update CULL_PROMPT to request `profileAffinity` per frame | `lib/prompts.ts` | Done |
| Extend `CullResult` and `CullResponse` types | `lib/types.ts` | Done |
| Update JSON/fallback behavior for new shape | `lib/profile-scoring.ts`, `lib/api.ts` | Done |
| Wire post-process step in `runCull` after model returns | `lib/api.ts` | Done |
| Update DetailPanel to show rubric / delta / final / matched traits | `components/DetailPanel.tsx` | Done |
| Library-membership sanity check | `components/ContactSheet.tsx`, `components/SeedUploadModal.tsx`, `lib/api.ts`, `tests/e2e/contact-sheet-smoke.spec.ts` | Done |
| Add `eval:ai` once scoring contract exists | `scripts/eval-ai.ts`, `package.json`, `eval-fixtures/` | Scaffold done; real fixtures pending |
| Validation cull on wildlife base set, compare scores against Phase D baseline | manual + `docs/PHASE-E-TEST-RESULTS.md` | Pending |

Current build status:

- Deterministic scoring helpers and unit tests are implemented.
- Profile-aware bounded math and unit tests are implemented.
- Cull prompt/types/API post-processing and DetailPanel breakdown are implemented.
- `npm run eval:ai` is implemented and opt-in. It requires local real-photo fixtures in `eval-fixtures/cases.json`; generated reports are ignored under `eval-results/`.
- First paid live eval passed with 8/8 cases on 2026-05-04; results captured in `docs/PHASE-E-TEST-RESULTS.md`.
- Last verification: `npm run typecheck` passed, `npm run test:unit` passed with 21 tests, `npm run test:e2e` passed with 5 tests, `npm run eval:ai -- --help` passed, `npm run eval:ai` passed with 8/8 live cases.

Remaining work: run a manual validation cull on the wildlife base set and capture observations in `docs/PHASE-E-TEST-RESULTS.md`.

---

## Risks

1. **Token + latency cost.** Each frame's response now carries the affinity object plus existing rubric. Cull responses get larger. Worth measuring on the largest realistic batch (~30 frames) before committing.
2. **Model under-uses the affinity object.** The model might return `outside` everywhere by default. Mitigation: examples in the prompt showing each alignment value and the kind of frame that warrants it.
3. **Calibration churn.** The +2/+6 / +1/+3 / 0/-3 bounds are guesses. First validation cull will likely surface that one band is too aggressive or too conservative. Plan to iterate.
4. **Backwards compatibility.** Cull response shape changes. Sessions saved before Phase E need to render gracefully (default `profileDelta = 0`, `finalScore = rubricScore`).
5. **Counter-signal asymmetry hard to test.** Validating that `diverged` correctly pulls similar frames down requires a test set that contains frames similar to corrected-down ones. The wildlife base set may not have this; we'd need to construct.

---

## What this delivers

The user can answer, for any specific cull score:

- What the generic rubric thought
- Which profile traits matched or conflicted
- How many points the profile added or subtracted
- Why the final bucket did or did not change

That's the promise the profile mechanism implicitly makes today and currently fails to keep. Phase E makes it inspectable.

---

## What this does *not* deliver*

- Multi-photo visual anchors in the cull prompt (the "pass 5 favorite thumbnails alongside the new batch" idea). Reasonable Phase F, not E.
- Deep Review repositioning. After Phase E, cull is the decision engine; Deep Review should become an editorial shortlist-development layer, not a second scoring pass. Captured in `docs/PHASE-F-EDITORIAL-REVIEW-REFRAME.md`.
- Per-axis weight modifiers from regen output (the original Phase E sketch I floated). The codex-feedback architecture is more fine-grained and per-frame, which is better; the per-intent weights idea is subsumed.
- Deterministic scoring across runs. The model still scores per frame; the app's bounded math is deterministic given the model's output, not absolutely deterministic across calls.

---

## Next validation steps

1. Run a manual wildlife/base-set cull and capture results in `docs/PHASE-E-TEST-RESULTS.md`.
2. Tune profile delta bounds only if validation shows consistent over- or under-application.
3. Run final `npm run typecheck` and `npm test` before PR.
