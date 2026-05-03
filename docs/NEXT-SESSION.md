# Next Session — Phase E: Profile-Aware Scoring

**Branch to start:** `feature/profile-aware-scoring` (off `main`)
**Plan:** `docs/PHASE-E-PROFILE-AWARE-SCORING.md` — full spec, source brief at `codex-feedback/profile-aware-scoring.md`
**Prod:** https://contact-sheet-three.vercel.app — Phases A/B/C/D all live (PR #3 merged 2026-05-03)

## First 3 minutes — verify state

```bash
cd "/Users/griffin.sisk/Desktop/AI Projects/contact-sheet-repo"
git checkout main && git pull
git status                     # clean
npm run typecheck              # clean
npm test                       # 11 unit + 4 e2e green
```

Then branch:

```bash
git checkout -b feature/profile-aware-scoring
```

## What landed (recap)

Phase D consolidated star + correction signals into one regen loop. The cull prompt now has one photographer-context block (`tasteSection`) instead of two. Transparency layer surfaces corrections in View Profile with pending state, "Corrected" pill on photo grid, star toast parity, library entries grid with hover-delete.

Test infrastructure exists and is the new default before any change:
- `npm run typecheck` — TS correctness
- `npm run test:unit` — 11 cases (exports, providers, tier)
- `npm run test:e2e` — 4 specs (correction persistence, revert cleanup, toast first/subsequent/Undo, profile modal + regen request body)
- `npm test` — both
- `npm run dev:test` — dev server with `NEXT_PUBLIC_E2E_MOCK_PRO=1` for manual testing of Pro surfaces without Clerk

## Phase E goal

Profile becomes a **structured scoring lever** instead of fuzzy prose context. Today, the profile influences cull-note language more than scoring numbers — Phase D testing surfaced this when a duplicate seeded photo was scored 52 with a "diverges from your library" note about a frame literally in the library. The architecture in `docs/PHASE-E-PROFILE-AWARE-SCORING.md` fixes both problems: model returns rubric breakdown + structured `ProfileAffinity` per frame; app applies bounded math (capped deltas with story guardrails); user sees `rubricScore / profileDelta / finalScore` line items.

## Recommended starting order

The plan has eight tasks; load-bearing path is roughly:

1. **Build `eval:ai` first** (~half day). Per `codex-feedback/testing/ai-behavior-evals.md`. Small fixture set (8–12 images), range assertions, json results to `eval-results/`. Becomes the validation harness for the rest of Phase E and replaces manual cull-effectiveness checking forever.
2. **Add scoring helpers** (`lib/scoring.ts` per `codex-feedback/testing/scoring-algorithm-tests.md`). Extract `computeOverall`, `ratingFromScore` from prompt math into testable helpers. Unit tests for boundary cases.
3. **Update `CULL_PROMPT`** to request `profileAffinity` per frame alongside the existing rubric breakdown.
4. **Extend `CullResult` and `CullResponse` types**, update JSON parse/repair.
5. **Implement bounded-math layer** (`lib/profile-scoring.ts`). Clamp deltas per the calibration table (+2/+6 aligned high, +1/+3 medium, 0/−3 diverged). Story guardrails. Library-membership sanity check.
6. **Wire post-process step** in `runCull` after the model returns.
7. **Update `DetailPanel`** to show rubric score / profile delta / final score / matched + contradicted traits.
8. **Validation cull** on the wildlife base set, capture to `docs/PHASE-E-TEST-RESULTS.md`. Compare scores against the duplicate-photo case from Phase D testing.

Estimated total: ~2–3 days of implementation + a deliberate validation pass.

## Key risks (from the plan)

- **Token + latency cost.** Affinity object per frame on top of rubric. Worth measuring on a 30-frame batch before committing.
- **Model under-uses affinity.** Mitigation: examples in the prompt for each `alignment` value.
- **Calibration churn.** +2/+6, +1/+3, 0/−3 bounds are guesses. First validation cull will surface what to tune.
- **Backwards compatibility.** Cull response shape changes. Sessions saved before Phase E need to render gracefully (default `profileDelta = 0`, `finalScore = rubricScore`).

## Open follow-ons (parking lot)

- **Visual anchors in cull prompt** (Phase F candidate). Pass 3–5 representative library thumbnails alongside the new batch. Stronger signal than prose-only profile, expensive in tokens. Defer until Phase E ships.
- **Auto-regen on correction delta.** Currently only favorites delta triggers auto-regen. Add `correctionsSinceLastRegen >= N` if friction observed.
- **Counter-signal validation set.** A test set containing frames similar to corrected-down ones would let us validate that `diverged` actually pulls scores down. Wildlife base set probably doesn't have this; would need to construct.

## When updating this file next session: rewrite rather than append.
