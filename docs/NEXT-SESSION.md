# Next Session — Phase F: Develop Shortlist / Editor's Notes

**Updated:** 2026-05-04
**Current branch:** `main`
**Prod:** https://contact-sheet-three.vercel.app — Phases A/B/C/D/E live.
**Last shipped PR:** #4 — Phase E profile-aware scoring.
**Next plan:** `docs/PHASE-F-EDITORIAL-REVIEW-REFRAME.md`
**Phase E plan/results:** `docs/PHASE-E-PROFILE-AWARE-SCORING.md`, `docs/PHASE-E-TEST-RESULTS.md`

## Current State

Phase E is shipped to production.

What landed:

- Deterministic rubric scoring helpers in `lib/scoring.ts`.
- Bounded profile-aware scoring in `lib/profile-scoring.ts`.
- Cull prompt/type/API support for structured `profileAffinity`.
- DetailPanel cull breakdown: rubric score, profile delta, final score, matched/contradicted traits.
- Duplicate library-match sanity check, with seed uploads using the same hash path as culls/stars.
- Live AI eval harness: `npm run eval:ai`.
- Unit/e2e coverage for score math, profile math, and duplicate-library behavior.

Verification completed:

```bash
npm run typecheck      # passed
npm run test:unit      # 21 passed
npm run test:e2e       # 5 passed
npm run build          # passed
npm run eval:ai        # paid live eval passed: 8/8
```

Production smoke:

- Manual production flow ran smoothly after Phase E deploy.
- No Phase E blocker reported from the real app pass.

## Next Build Direction

The next candidate is Phase F: reframe the current Deep Review feature.

Core decision:

- Cull is now the decision engine.
- Deep Review should stop reading like a second scoring pass.
- Reframe it as shortlist development: edit direction, image role, sequencing, set notes, and export metadata.

Recommended product language:

- Action label: **Develop Shortlist**
- Output framing: **Editor's Notes**

Do not start implementation from memory. Read `docs/PHASE-F-EDITORIAL-REVIEW-REFRAME.md` first.

## First 3 Minutes

```bash
cd "/Users/griffin.sisk/Desktop/AI Projects/contact-sheet-repo"
git branch --show-current        # should be main
git status --short               # should be clean
git pull --ff-only
npm run typecheck
npm run test:unit
npm run test:e2e
```

## Recommended Phase F Scope

Start with a focused UX/product pass, not a broad architecture rewrite.

1. Rename the user-facing flow.
   - `Deep Review` → `Develop Shortlist` or `Editor's Notes`.
   - Grid toggle copy should stop implying a second judgment pass.
   - Progress and export copy should follow the same language.

2. Adjust the prompt.
   - Emphasize edit direction, crop/composition advice, image role, set cohesion, and sequence rationale.
   - De-emphasize second-pass scoring.

3. Update DetailPanel.
   - Lead with editorial role, edit direction, title, verdict, and set context.
   - Keep score/rating fields compatible but visually secondary.

4. Preserve exports.
   - Titles/descriptions from this pass remain useful for manifest/XMP.
   - If new structured fields are added, update export only where it adds real workflow value.

5. Add targeted tests.
   - Mocked e2e should cover the renamed CTA/toggle/progress.
   - If output shape changes, add unit coverage for backwards-compatible rendering/export behavior.

## Open Product Questions

Resolve these before implementation:

- Should the primary label be `Develop Shortlist` or `Editor's Notes`?
- Should second-pass score/rating remain visible, hidden, or moved lower in DetailPanel?
- Which new structured field is worth adding first: `editorialRole`, `editDirection`, or `sequenceRationale`?
- Should Phase F be UI/prompt-only, or should it include data model changes?

## Parking Lot

- Visual anchors in cull prompt: pass 3-5 favorite thumbnails alongside a batch.
- Auto-regen on correction delta: currently favorites trigger auto-regen; correction-count triggering remains a follow-up.
- Counter-signal validation set for `diverged` behavior against corrected-down lookalikes.

## Maintenance Notes

- `npm run lint` is still not a reliable gate; earlier docs note deprecated interactive `next lint` behavior.
- `eval-fixtures/cases.json`, `eval-fixtures/photos/`, and `eval-results/` are intentionally ignored local artifacts.
- The app still uses live model scoring per frame. Phase E makes profile adjustment deterministic after model output; it does not make model outputs deterministic across runs.
