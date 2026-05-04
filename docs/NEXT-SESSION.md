# Next Session — Phase E: Profile-Aware Scoring

**Updated:** 2026-05-04 (session 3)
**Current branch:** `feature/profile-aware-scoring`
**Do not restart from `main`:** this branch has uncommitted Phase E implementation work.
**Plan:** `docs/PHASE-E-PROFILE-AWARE-SCORING.md`
**Test results:** `docs/PHASE-E-TEST-RESULTS.md`
**Source brief:** `codex-feedback/profile-aware-scoring.md`
**Prod:** https://contact-sheet-three.vercel.app — Phases A/B/C/D live; Phase E is local only.

## Last session accomplishments (2026-05-04)

1. Re-verified Codex's Phase E branch on a fresh session:
   - `npm run typecheck` ✓
   - `npm run test:unit` → 21/21 ✓
   - `npm run test:e2e` → 4/4 ✓
2. Scaffolded `eval-fixtures/cases.json` (gitignored) with 8 cases covering the full coverage list:
   `wildlife-strong`, `weak-no-story`, `intentional-blur-film`, `landscape-low-story`,
   `expressive-candid-portrait`, `pretty-subject-low-story`, `profile-aligned-frame` (`libraryMatch: true`),
   `profile-divergent-frame` (shares profile prose with #7 but inverted expectations).
   Ranges are conservative starting points pending first paid run.
3. Created `eval-fixtures/photos/` directory (gitignored).

Nothing new committed; worktree state matches the file list below.

## Current session update (2026-05-04)

1. Restored ignored `eval-fixtures/cases.json` to the required `{ version: 1, cases: [...] }` shape after pasting the generated profile JSON at the top level by mistake.
2. Pointed the cases at the actual local fixture filenames in `eval-fixtures/photos/`, including uppercase `.JPG` names where present.
3. Added an e2e regression for the duplicate-library sanity check: seed favorites through the modal, cull the same image, and verify the app-side profile duplicate boost applies.
4. Fixed seed uploads to use the same `resizeImage` → `computePhotoHash` path as normal culls/stars, so exact duplicate files hash consistently.
5. Ran the paid live AI eval on the 8 local fixtures: 8/8 passed. Results captured in `docs/PHASE-E-TEST-RESULTS.md`.

## First 3 minutes

```bash
cd "/Users/griffin.sisk/Desktop/AI Projects/contact-sheet-repo"
git branch --show-current        # should be feature/profile-aware-scoring
git status --short               # expect Phase E files below
npm run typecheck
npm run test:unit
npm run test:e2e
```

`npm test` is also valid, but the split commands make failures easier to read.

## Current worktree status

Uncommitted Phase E changes are expected. Key touched files:

- `.gitignore`
- `components/ContactSheet.tsx`
- `components/DetailPanel.tsx`
- `components/SeedUploadModal.tsx`
- `docs/NEXT-SESSION.md`
- `docs/PHASE-E-PROFILE-AWARE-SCORING.md`
- `docs/PHASE-E-TEST-RESULTS.md`
- `eval-fixtures/README.md`
- `eval-fixtures/cases.example.json`
- `lib/api.ts`
- `lib/profile-scoring.ts`
- `lib/prompts.ts`
- `lib/scoring.ts`
- `lib/types.ts`
- `package.json`
- `scripts/eval-ai.ts`
- `tests/e2e/contact-sheet-smoke.spec.ts`
- `tests/unit/profile-scoring.test.ts`
- `tests/unit/scoring.test.ts`

No commit has been made yet. Dev server was stopped; port `3100` had no listener after cleanup.

## What landed in this branch

Phase E is mostly implemented locally:

1. Deterministic score helpers were added in `lib/scoring.ts`.
   - `computeOverall`
   - `ratingFromScore`
   - score clamping
   - rating-boundary helpers

2. Profile-aware bounded scoring was added in `lib/profile-scoring.ts`.
   - Recomputes rubric score from returned dimension scores when available.
   - Applies capped profile deltas.
   - Prevents bucket jumps unless the rubric score is within 3 points of a boundary.
   - Preserves the Story guardrail: Story < 30 cannot become HERO via profile fit.
   - Handles malformed/missing affinity gracefully.
   - Forces duplicate library matches to `aligned` and adds `"already in your favorites"`.

3. Cull prompt/types/API are wired.
   - `CullResult` now supports `rubricScore`, `profileDelta`, `finalScore`, and `profileAffinity`.
   - `buildCullPrompt` tells the model to keep rubric scores generic and return structured `profileAffinity`.
   - `runCull` post-processes every cull result with app-side scoring math.
   - `ContactSheet` passes taste-library hashes into `runCull` for duplicate sanity checks, but does not send hashes to the server prompt.
   - Seed uploads now reuse the same photo hash pipeline as culls/stars, covered by an e2e regression.

4. DetailPanel now shows a compact cull-only breakdown.
   - Rubric score
   - Profile delta
   - Final score
   - Matched and contradicted profile traits
   - Old restored sessions do not show a fake breakdown unless new fields exist.

5. Live AI eval harness was scaffolded.
   - `npm run eval:ai`
   - Reads `eval-fixtures/cases.json`
   - Writes reports to ignored `eval-results/`
   - Checks score/rating ranges, dimension ranges, profile affinity, profile delta, and note constraints.
   - Fixture docs/example are in `eval-fixtures/`.

## Verification already run

Last known clean checks:

```bash
npm run typecheck      # passed
npm run test:unit      # 21 passed
npm run test:e2e       # 5 passed
npm run eval:ai -- --help   # passed
env ANTHROPIC_API_KEY= npm run eval:ai  # expected no-spend stop after fixture parsing: API key not found
npm run eval:ai        # paid live eval passed: 8/8
```

The expected no-spend `eval:ai` stop proves the ignored cases file parses without spending. A separate path check verified all 8 fixture images exist locally.

## Remaining Phase E work

1. Run a manual validation cull on the wildlife/base set.
   - Capture observations in `docs/PHASE-E-TEST-RESULTS.md`.
   - Re-check the Phase D duplicate-photo problem: literal library duplicate should not say "diverges from your library".
   - Watch for profile deltas that feel too aggressive or too timid.

2. Decide whether to tune bounds before PR.
   - Current starting bounds: high aligned +2 to +6, medium aligned +1 to +3, diverged 0 to -3, outside 0.
   - Current biggest unknown is model quality of `profileAffinity`, not deterministic math.

3. After validation, run:

```bash
npm run typecheck
npm test
```

Then commit and open the Phase E PR.

## Known caveats

- `npm run eval:ai` uses `tsx`; in this sandbox it needed escalation because `tsx` creates an IPC pipe. It works outside the sandbox and with approved escalation.
- `eval-fixtures/cases.json`, `eval-fixtures/photos/`, and `eval-results/` are intentionally ignored.
- `npm run lint` is still not a reliable gate; earlier docs note it uses deprecated interactive `next lint` behavior.
- The app still uses live model scoring per frame. Phase E makes profile adjustment deterministic after model output; it does not make model outputs deterministic across runs.

## Parking lot

- Visual anchors in cull prompt: pass 3-5 favorite thumbnails alongside a batch. Stronger signal but higher token cost; defer to Phase F.
- Auto-regen on correction delta: currently favorites trigger auto-regen; correction-count triggering remains a follow-up.
- Counter-signal validation set: needed to validate `diverged` behavior against corrected-down lookalikes.

## Rewrite this file next session

Keep this file as the active handoff. Replace stale sections rather than appending a diary.
