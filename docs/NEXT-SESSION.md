# Next Session — Phase F: Develop Shortlist / Editor's Notes

**Updated:** 2026-05-04
**Current branch:** `feature/editorial-review-reframe`
**Prod:** https://contact-sheet-three.vercel.app — Phases A/B/C/D/E live. Phase F is not merged/deployed yet.
**Current PR:** https://github.com/griffinsisk/contact-sheet/pull/5
**Vercel preview:** https://contact-sheet-git-feature-editoria-10da4d-griffinsisks-projects.vercel.app
**Last shipped PR:** #4 — Phase E profile-aware scoring.
**Current plan:** `docs/PHASE-F-EDITORIAL-REVIEW-REFRAME.md`
**Phase E plan/results:** `docs/PHASE-E-PROFILE-AWARE-SCORING.md`, `docs/PHASE-E-TEST-RESULTS.md`

## Current State

Phase E is shipped to production. Phase F is implemented on `feature/editorial-review-reframe`, pushed to GitHub, and open as PR #5.

Phase F PR state:

- PR #5 is open against `main`: https://github.com/griffinsisk/contact-sheet/pull/5
- Vercel preview check passed.
- Preview URL: https://contact-sheet-git-feature-editoria-10da4d-griffinsisks-projects.vercel.app
- Direct `curl -I` returned HTTP 401 because Vercel preview protection/SSO is enabled. Open the preview while logged into the Vercel account/team.
- GitHub reports merge state `CLEAN` at the time of this handoff.

Phase F work in the PR:

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

Verification completed before PR #5:

```bash
npm run typecheck      # passed
npm run test:unit      # 23 passed
npm run test:e2e       # 6 passed
npm run build          # passed
```

Vercel:

```bash
gh pr checks 5         # Vercel passed, Vercel Preview Comments passed
```

Phase E paid eval remains the latest live AI eval:

```bash
npm run eval:ai        # paid live eval passed: 8/8
```

Production smoke:

- Manual production flow ran smoothly after Phase E deploy.
- No Phase E blocker reported from the real app pass.

## Next Build Direction

Immediate next step is preview smoke on PR #5. After preview smoke passes, merge PR #5 to `main` and confirm the production deploy.

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
gh pr view 5 --json url,mergeStateStatus,statusCheckRollup
gh pr checks 5
npm run typecheck
npm run test:unit
npm run test:e2e
```

## Recommended Phase F Review Scope

1. Open the Vercel preview while logged into Vercel/team SSO.
2. Run manual smoke on preview: upload → cull → develop shortlist → open detail panel → export manifest.
3. Confirm the second score feels secondary enough in DetailPanel.
4. If preview smoke passes, merge PR #5 and watch the production Vercel deploy.
5. Smoke production at https://contact-sheet-three.vercel.app after deploy.

Preview-specific things to inspect:

1. Post-cull CTA says `DEVELOP SHORTLIST`.
2. Grid toggle says `DEVELOP`.
3. Set-level result heading says `Editor's Notes`.
4. DetailPanel shows editorial role, edit direction, crop/composition, verdict, then `EDITOR'S SCORE` lower down.
5. Manifest export includes `EDITOR'S NOTES`, `Editorial Role`, `Edit Direction`, and `Crop / Composition` when the model returns them.

## Parking Lot

- Visual anchors in cull prompt: pass 3-5 favorite thumbnails alongside a batch.
- Auto-regen on correction delta: currently favorites trigger auto-regen; correction-count triggering remains a follow-up.
- Counter-signal validation set for `diverged` behavior against corrected-down lookalikes.

## Maintenance Notes

- `npm run lint` is still not a reliable gate; earlier docs note deprecated interactive `next lint` behavior.
- `eval-fixtures/cases.json`, `eval-fixtures/photos/`, and `eval-results/` are intentionally ignored local artifacts.
- The app still uses live model scoring per frame. Phase E makes profile adjustment deterministic after model output; it does not make model outputs deterministic across runs.
