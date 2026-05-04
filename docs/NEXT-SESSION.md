# Next Session — Phase F: Develop Shortlist / Editor's Notes

**Updated:** 2026-05-04
**Current branch:** `feature/editorial-review-reframe`
**Prod:** https://contact-sheet-three.vercel.app — Phases A/B/C/D/E live. Phase F is local only until merged/deployed.
**Last shipped PR:** #4 — Phase E profile-aware scoring.
**Current plan:** `docs/PHASE-F-EDITORIAL-REVIEW-REFRAME.md`
**Phase E plan/results:** `docs/PHASE-E-PROFILE-AWARE-SCORING.md`, `docs/PHASE-E-TEST-RESULTS.md`

## Current State

Phase E is shipped to production. Phase F is implemented locally on `feature/editorial-review-reframe`.

Phase F local work:

- Reframed the post-cull pass from Deep Review to **Develop Shortlist**.
- Output framing is now **Editor's Notes**.
- Added optional `DeepResult` fields: `editorialRole`, `editDirection`, `cropOrCompositionNote`.
- Reworked the deep-review prompt around shortlist development and edit direction.
- Updated DetailPanel so editorial notes lead and the second score appears lower as `EDITOR'S SCORE`.
- Updated manifest export to include optional editorial fields when present.
- Added focused e2e coverage and unit prompt/export coverage.

Phase E production work:

- Deterministic rubric scoring helpers in `lib/scoring.ts`.
- Bounded profile-aware scoring in `lib/profile-scoring.ts`.
- Cull prompt/type/API support for structured `profileAffinity`.
- DetailPanel cull breakdown: rubric score, profile delta, final score, matched/contradicted traits.
- Duplicate library-match sanity check, with seed uploads using the same hash path as culls/stars.
- Live AI eval harness: `npm run eval:ai`.
- Unit/e2e coverage for score math, profile math, and duplicate-library behavior.

Verification completed for Phase F local branch:

```bash
npm run typecheck      # passed
npm run test:unit      # 23 passed
npm run test:e2e       # 6 passed
npm run build          # passed
```

Phase E paid eval remains the latest live AI eval:

```bash
npm run eval:ai        # paid live eval passed: 8/8
```

Production smoke:

- Manual production flow ran smoothly after Phase E deploy.
- No Phase E blocker reported from the real app pass.

## Next Build Direction

Immediate next step is to review, push, and open a Vercel preview for Phase F. After preview smoke passes, merge/deploy.

Core Phase F decision:

- Cull is now the decision engine.
- Deep Review should stop reading like a second scoring pass.
- Reframe it as shortlist development: edit direction, image role, sequencing, set notes, and export metadata.

Recommended product language:

- Action label: **Develop Shortlist**
- Output framing: **Editor's Notes**

Do not start follow-up work from memory. Read `docs/PHASE-F-EDITORIAL-REVIEW-REFRAME.md` first.

## First 3 Minutes

```bash
cd "/Users/griffin.sisk/Desktop/AI Projects/contact-sheet-repo"
git branch --show-current        # should be feature/editorial-review-reframe until merged
git status --short               # should be clean
npm run typecheck
npm run test:unit
npm run test:e2e
```

## Recommended Phase F Review Scope

1. Run local manual smoke: upload → cull → develop shortlist → open detail panel → export manifest.
2. Confirm the second score feels secondary enough in DetailPanel.
3. Check Vercel preview with the same flow before merge.
4. If the prompt output feels too verbose or generic in live testing, tighten only the prompt voice; the data shape is already in place.

## Parking Lot

- Visual anchors in cull prompt: pass 3-5 favorite thumbnails alongside a batch.
- Auto-regen on correction delta: currently favorites trigger auto-regen; correction-count triggering remains a follow-up.
- Counter-signal validation set for `diverged` behavior against corrected-down lookalikes.

## Maintenance Notes

- `npm run lint` is still not a reliable gate; earlier docs note deprecated interactive `next lint` behavior.
- `eval-fixtures/cases.json`, `eval-fixtures/photos/`, and `eval-results/` are intentionally ignored local artifacts.
- The app still uses live model scoring per frame. Phase E makes profile adjustment deterministic after model output; it does not make model outputs deterministic across runs.
