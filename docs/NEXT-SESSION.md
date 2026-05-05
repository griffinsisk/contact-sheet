# Next Session — Production Smoke / Phase 2 Taste Profile Persistence

**Updated:** 2026-05-05
**Current branch:** `main`
**Latest merge:** PR #6, `d940f8f` — Add local multi-profile taste profiles
**Production:** https://contact-sheet-three.vercel.app — returned HTTP 200 after merge
**Phase 1 plan:** `docs/superpowers/plans/2026-05-05-local-multi-profile-taste-profiles.md`
**Spec:** `docs/superpowers/specs/2026-05-05-persistent-multi-profile-design.md`

Phase 1 local-only multi-profile taste profiles is merged to `main`. It ships named local profiles, v2 localStorage collection migration, active-profile switching at cull time, per-profile favorites/profile regen, and `profileIdAtCull` correction scoping.

Clerk manifest, private Vercel Blob storage, private image resolution, and cross-device sync are deliberately deferred to Phase 2.

## Current State

- PR #5 / Phase F is merged to `main` as `2f1bbb8`.
- PR #6 / Phase 1 local multi-profile profiles is merged to `main` as `d940f8f`.
- Storage now uses `cs-taste-libraries`; the old `cs-taste-library` key migrates into a v2 collection on first read.
- Free users remain on one local library. Pro and BYOK paths can manage up to 3 named local profiles.
- Profile generation and profile-modal correction display are scoped to the active profile.
- New corrections store `profileIdAtCull`.
- The new-profile modal focus bug found on Vercel preview was fixed in `3874304`; the upload/drop area now stays hidden until the new profile is actually created, preventing seed images from routing to the old active profile.

## Verification

```bash
npm run typecheck      # passed
npm run test:unit      # 34 passed
npm run test:e2e       # 10 passed
npm run build          # passed
npm test               # passed: unit + e2e
```

## Next Steps

1. Run production smoke on https://contact-sheet-three.vercel.app:
   - Create a new named profile and confirm typing does not lose focus.
   - Seed the new profile and confirm View Profile shows favorites under that profile, not `My Profile`.
   - Switch between profiles in the modal and at cull time.
   - Cull once with each active profile and confirm the selected profile influences the request/profile context.
   - Star and correct a frame, then confirm View Profile only shows signals for the active profile.
2. If production smoke passes, tag Phase 1 as shipped in handoff notes.
3. Start Phase 2 design/build for persistence:
   - Clerk `tasteProfileManifest`
   - private Vercel Blob `taste/{clerkUserId}/collection.json`
   - private image upload/resolve/delete routes
   - Pro sync and local-to-server migration
   - conflict handling with `updatedAt`

## Parking Lot

- Auto-regen based on correction-count deltas, not only favorite-count deltas.
- Visual anchors in cull prompt: pass 3-5 favorite thumbnails alongside a batch.
- Counter-signal validation set for `diverged` behavior against corrected-down lookalikes.
- Optional UX polish for profile creation: explicit cancel button for the create form.

---

# Previous Session Context — Phase F: Develop Shortlist / Editor's Notes

**Updated:** 2026-05-04
**Current branch:** merged to `main`
**Prod:** https://contact-sheet-three.vercel.app — Phases A/B/C/D/E live. Check production for Phase F deploy status before relying on prod behavior.
**PR:** https://github.com/griffinsisk/contact-sheet/pull/5 — merged 2026-05-05 UTC.
**Vercel preview:** https://contact-sheet-git-feature-editoria-10da4d-griffinsisks-projects.vercel.app
**Last shipped PR:** #4 — Phase E profile-aware scoring.
**Current plan:** `docs/PHASE-F-EDITORIAL-REVIEW-REFRAME.md`
**Phase E plan/results:** `docs/PHASE-E-PROFILE-AWARE-SCORING.md`, `docs/PHASE-E-TEST-RESULTS.md`

## Current State

Phase E is shipped to production. Phase F is implemented on `feature/editorial-review-reframe`, pushed to GitHub, and open as PR #5.

Phase F PR state:

- PR #5 is open against `main`: https://github.com/griffinsisk/contact-sheet/pull/5
- Latest functional commit: `36c4b12` (`Include promoted selects in shortlist development`)
- Functional checks passed on `36c4b12`; docs-only handoff commits may restart PR checks.
- Recheck the current PR head with `gh pr checks 5` at session start.
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

Follow-up fixes already pushed to PR #5:

- Fixed Vercel `Proxy 413: request failed` during Develop Shortlist by splitting proxy payloads and downsizing proxied images before API submission.
- Fixed editorial score precedence so app-side cull scores remain canonical where expected.
- Added a pending-regeneration cue for newly starred favorites in the profile modal. Favorites behave like corrections: they feed the next regenerated taste profile, not the currently active profile immediately.
- Fixed Develop Shortlist selection sync so any photo currently rated `HERO` or `SELECT` is included, including photos manually promoted from `MAYBE` or `CUT` after cull.

Phase E production work:

- Deterministic rubric scoring helpers in `lib/scoring.ts`.
- Bounded profile-aware scoring in `lib/profile-scoring.ts`.
- Cull prompt/type/API support for structured `profileAffinity`.
- DetailPanel cull breakdown: rubric score, profile delta, final score, matched/contradicted traits.
- Duplicate library-match sanity check, with seed uploads using the same hash path as culls/stars.
- Live AI eval harness: `npm run eval:ai`.
- Unit/e2e coverage for score math, profile math, and duplicate-library behavior.

Verification completed on latest functional PR changes:

```bash
npm run typecheck      # passed
npm run test:unit      # 29 passed
npm run test:e2e       # 7 passed
npm run build          # passed
```

Vercel:

```bash
gh pr checks 5         # latest functional commit passed Vercel, Vercel Preview Comments, and CodeRabbit; recheck current PR head
```

Phase E paid eval remains the latest live AI eval:

```bash
npm run eval:ai        # paid live eval passed: 8/8
```

Production smoke:

- Manual production flow ran smoothly after Phase E deploy.
- No Phase E blocker reported from the real app pass.

## Next Build Direction

Immediate next step is preview smoke on PR #5 with the latest functional changes. After preview smoke passes, merge PR #5 to `main` and confirm the production deploy.

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
6. Promote a `MAYBE` photo to `SELECT` and confirm the CTA count increases and Develop Shortlist sends/includes it.
7. Confirm Develop Shortlist no longer shows `Proxy 413: request failed` on the same kind of batch that previously failed.
8. Star a new favorite, open View Profile, and confirm the pending-regeneration cue appears until the profile is regenerated.

## Parking Lot

- Visual anchors in cull prompt: pass 3-5 favorite thumbnails alongside a batch.
- Auto-regen on correction delta: currently favorites trigger auto-regen; correction-count triggering remains a follow-up.
- Counter-signal validation set for `diverged` behavior against corrected-down lookalikes.

## Maintenance Notes

- `npm run lint` is still not a reliable gate; earlier docs note deprecated interactive `next lint` behavior.
- `eval-fixtures/cases.json`, `eval-fixtures/photos/`, and `eval-results/` are intentionally ignored local artifacts.
- The app still uses live model scoring per frame. Phase E makes profile adjustment deterministic after model output; it does not make model outputs deterministic across runs.
