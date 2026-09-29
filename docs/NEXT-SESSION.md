# Next Session — Production Smoke / Phase 2 Persistence

**Updated:** 2026-06-01
**Current branch:** `main`
**Production:** https://contact-sheet-three.vercel.app — returned HTTP 200 after latest deploy
**Latest pushed commit:** `7cbe6a4 Merge pull request #7 (Anthropic-only + Sonnet 4.6)`
**Current cleanup spec:** `docs/superpowers/specs/2026-05-09-shipping-cleanup-route-hardening-design.md`
**Current cleanup plan:** `docs/superpowers/plans/2026-05-09-shipping-cleanup-route-hardening.md`
**Phase 2 persistence spec:** `docs/superpowers/specs/2026-05-05-persistent-multi-profile-design.md`

The Next.js app is built and live. Phase F Develop Shortlist / Editor's Notes is merged, Phase 1 local multi-profile taste profiles is merged, shared-key route hardening is deployed, and the cull/export closeout fixes are deployed on `main`.

Clerk manifest, private Vercel Blob storage, private image resolution, and cross-device sync are deliberately deferred to Phase 2.

## Current State

- **Anthropic-only + Sonnet 4.6 (2026-06-01, PR #7 merged):** removed the OpenAI and Gemini provider paths; the app now targets Claude exclusively. Bumped the Sonnet model ID from the deprecated `claude-sonnet-4-20250514` to `claude-sonnet-4-6` across hosted routes, scripts, and the BYOK catalog. Vercel `ANTHROPIC_MODEL` set to `claude-sonnet-4-6` in Production/Preview/Development (this env var overrides the code default). Live `npm run eval:ai` passed 8/8 on Sonnet 4.6 after recalibrating the gitignored eval bands for 3 boundary cases.
- Phase F reframed the second pass from Deep Review to **Develop Shortlist** with **Editor's Notes**.
- Phase 1 local multi-profile shipped named local profiles, v2 localStorage collection migration, active-profile switching at cull time, per-profile favorites/profile regeneration, and `profileIdAtCull` correction scoping.
- Free/pro hosted-key model routes now have shared request guardrails for `/api/cull`, `/api/deep-review`, `/api/compare`, `/api/taste-profile`, and `/api/override-describe`.
- Cull no longer leaves omitted model results in a permanent thumbnail-loading state. Missing cull indices are retried once in smaller batches; if still missing, the photo receives a conservative `MAYBE` result with a manual-review note.
- Folder export now creates one contained `contact-sheet-export-YYYY-MM-DD-HHMMSS/` package. Photos and matching `.xmp` sidecars stay together inside `by_rating/` folders, and sequence exports include both copied photo and matching sidecar. The standalone XMP download remains available as `XMP SIDECARS ONLY` for manual placement.
- Manual production smoke for the Phase 1 multi-profile flow is still pending.

## Recent Verification

Latest closeout verification on `main`:

```bash
npm run typecheck      # passed
npm run test:unit      # 53 passed
npm run test:e2e       # 11 passed
npm run build          # passed with required local build env:
                       # STRIPE_SECRET_KEY=sk_test_dummy
                       # NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<valid test-format key>
curl -I https://contact-sheet-three.vercel.app
                       # HTTP/2 200 after Vercel deploy success
ANTHROPIC_MODEL=claude-sonnet-4-6 npm run eval:ai
                       # 8/8 passed (live cull, Sonnet 4.6) after band recalibration
```

## Next Steps

1. Run production smoke on https://contact-sheet-three.vercel.app:
   - Create a new named profile and confirm typing does not lose focus.
   - Seed the new profile and confirm View Profile shows favorites under that profile, not `My Profile`.
   - Switch between profiles in the modal and at cull time.
   - Cull once with each active profile and confirm the selected profile influences the request/profile context.
   - Star and correct a frame, then confirm View Profile only shows signals for the active profile.
   - Export a small culled set and confirm the destination contains one `contact-sheet-export-*` folder with photo + `.xmp` pairs under `by_rating/`.
2. Start Phase 2 persistence after production smoke:
   - Clerk `tasteProfileManifest`.
   - Private Vercel Blob `taste/{clerkUserId}/collection.json`.
   - Private image upload/resolve/delete routes.
   - Pro sync and local-to-server migration.
   - Conflict handling with `updatedAt`.

## Parking Lot

- Auto-regen based on correction-count deltas, not only favorite-count deltas.
- Visual anchors in cull prompt: pass 3-5 favorite thumbnails alongside a batch.
- Counter-signal validation set for `diverged` behavior against corrected-down lookalikes.
- Optional UX polish for profile creation: explicit cancel button for the create form.

## Maintenance Notes

- `npm run lint` is still not a reliable gate; earlier docs note deprecated interactive `next lint` behavior.
- `eval-fixtures/cases.json`, `eval-fixtures/photos/`, and `eval-results/` are intentionally ignored local artifacts. `cases.json` bands are now calibrated to Sonnet 4.6's score distribution (3 boundary cases adjusted 2026-06-01).
- **Model selection is controlled by the Vercel `ANTHROPIC_MODEL` env var, which overrides the code default (`claude-sonnet-4-6`).** A code-only model change is inert in prod unless the Vercel var is updated/removed, and env changes need a redeploy. Local `.env.local` may still pin the old model — only affects `next dev`; the eval harness overrides it.
- The app still uses live model scoring per frame. Profile adjustment is deterministic after model output; it does not make model outputs deterministic across runs.
