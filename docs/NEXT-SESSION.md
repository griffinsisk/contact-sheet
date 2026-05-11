# Next Session — Production Smoke / Phase 2 Persistence

**Updated:** 2026-05-09
**Current branch:** `feature/shipping-cleanup-route-hardening`
**Production:** https://contact-sheet-three.vercel.app — returned HTTP 200 after Phase 1 merge
**Current cleanup spec:** `docs/superpowers/specs/2026-05-09-shipping-cleanup-route-hardening-design.md`
**Current cleanup plan:** `docs/superpowers/plans/2026-05-09-shipping-cleanup-route-hardening.md`
**Phase 2 persistence spec:** `docs/superpowers/specs/2026-05-05-persistent-multi-profile-design.md`

The Next.js app is built and live. Phase F Develop Shortlist / Editor's Notes is merged, and Phase 1 local multi-profile taste profiles is merged on `main`. The current branch implements shipping cleanup plus shared-key route hardening before the next product phase.

Clerk manifest, private Vercel Blob storage, private image resolution, and cross-device sync are deliberately deferred to Phase 2.

## Current State

- Phase F reframed the second pass from Deep Review to **Develop Shortlist** with **Editor's Notes**.
- Phase 1 local multi-profile shipped named local profiles, v2 localStorage collection migration, active-profile switching at cull time, per-profile favorites/profile regeneration, and `profileIdAtCull` correction scoping.
- Free/pro hosted-key model routes now have shared request guardrails for `/api/cull`, `/api/deep-review`, `/api/compare`, `/api/taste-profile`, and `/api/override-describe`.
- Manual production smoke for the Phase 1 multi-profile flow is still pending.

## Recent Verification

Phase 1 merge verification:

```bash
npm run typecheck      # passed
npm run test:unit      # 34 passed
npm run test:e2e       # 10 passed
npm run build          # passed
npm test               # passed: unit + e2e
```

Shipping cleanup / route-hardening verification on `feature/shipping-cleanup-route-hardening`:

```bash
npm run typecheck      # passed
npm run test:unit      # 50 passed
npm run build          # passed with required local build env:
                       # STRIPE_SECRET_KEY=sk_test_dummy
                       # NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<valid test-format key>
npm run test:e2e       # 10 passed
stale-doc rg scan      # no matches
```

## Next Steps

1. Run production smoke on https://contact-sheet-three.vercel.app:
   - Create a new named profile and confirm typing does not lose focus.
   - Seed the new profile and confirm View Profile shows favorites under that profile, not `My Profile`.
   - Switch between profiles in the modal and at cull time.
   - Cull once with each active profile and confirm the selected profile influences the request/profile context.
   - Star and correct a frame, then confirm View Profile only shows signals for the active profile.
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
- `eval-fixtures/cases.json`, `eval-fixtures/photos/`, and `eval-results/` are intentionally ignored local artifacts.
- The app still uses live model scoring per frame. Profile adjustment is deterministic after model output; it does not make model outputs deterministic across runs.
