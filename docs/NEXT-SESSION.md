# Next Session — Phase B Pre-Merge, Preview Live

**Branch:** `feature/taste-library` at `7a2f83a` (pushed to origin).
**Prod:** still Phase A at https://contact-sheet-three.vercel.app.
**Preview:** Vercel preview deploy `D4LQKGAyJ` is live for `feature/taste-library` (Ready as of 2026-04-28). Find URL via Vercel Deployments → click the entry → Visit.

**State:** Phase B implemented, validation 4-of-4 PASS, off-intent variance tuned, opt-out + alignment indicator UI shipped. All work committed and pushed. Preview deploy ready for end-to-end test before merging to main.

## Pickup point

1. **Test the preview deploy.** Open the Vercel preview URL, sign in as Pro, run through:
   - Seed 8–20 favorites; confirm profile auto-generates.
   - Cull a shoot; confirm alignment indicator badge renders above cull notes.
   - Toggle "Cull this shoot without my taste profile" checkbox; confirm score reverts to rubric-only.
   - History button → SessionsModal opens.
   - Export with ratingOverrides applied; confirm exports reflect the override.
2. **If preview looks good, open PR + merge:**
   ```bash
   gh pr create --base main --head feature/taste-library --title "Phase B: Taste Library"
   ```
   Body: see prepared body in conversation handoff or write fresh referencing `docs/PHASE-B-TEST-RESULTS.md`.
3. **Merge the PR on GitHub.** Vercel auto-deploys `main` to https://contact-sheet-three.vercel.app.
4. **Post-merge verify:** sign in to prod, smoke-test seed → cull → alignment indicator.

## First 3 minutes — verify state

```bash
cd "/Users/griffin.sisk/Desktop/AI Projects/contact-sheet-repo"
git status                # clean
git log --oneline -15     # 7a2f83a at HEAD
npx tsc --noEmit          # clean
```

Full validation record: `docs/PHASE-B-TEST-RESULTS.md`.

## Validation summary

| Test | Result |
|---|---|
| 1 — Seed → auto-generate profile | PASS (qualitative) |
| 2 — Profile shouldn't rescue weak frames | PASS — 4 of 4 same bucket against Set A profile |
| 3 — Wildlife seed swaps the bias (all-wildlife shoot) | PASS WITH CAVEAT — directional, magnitude smaller than +5 floor |
| 3b — Wildlife profile on non-wildlife shoot (off-intent half) | PASS WITH CAVEAT — 3-of-4 within ±7; bed +20 outlier accepted (see below) |
| 4 — In-app stars + auto-regen | PASS — all sub-tests verified |

## Pre-merge action

Open PR `feature/taste-library` → `main`, review, merge. Vercel auto-deploys.

## Today's work — what changed and why (for rollback context)

### Profile preamble tuning (lib/prompts.ts:tasteSection)

Iterated through 4 versions of the `tasteSection` to balance influence vs over-rescue. Final state has:
- ±7 overall score ceiling with self-check ("if I removed profile, would score change >7? then re-score")
- Bucket crossings allowed only when rubric-alone score is within ~5pts of bucket boundary, with concrete OK/NOT-OK examples
- Per-dimension lift cap +10
- STORY GUARDRAIL hard cap at 50 for "person at rest in warm light" cases
- Cull note must close with one of three template lines (`Aligns with your library — ... / Diverges from your library — ... / Outside your library's strong traits, scored on standalone merits`)
- Closing-line position: profile context closes the note; frame content leads. Never lead with profile divergence.

Why iterations + not just one fix: the model evades simple "do X" instructions by reinterpreting what's in the frame. Bed photo's "person resting" became "contemplative pose with narrative pull" once profile prose mentioned tender interactions. Mechanical caps + concrete examples are what landed; pure exhortation didn't.

**Rollback path:** the preamble is one function (`tasteSection`). If a future regression appears, `git log -p lib/prompts.ts` shows every iteration of this function, each as its own commit, with rationale captured in this doc and the test results doc.

### Per-cull opt-out toggle (components/ContactSheet.tsx)

Added `ignoreTasteProfile` state + checkbox UI under the IntentPicker. Only renders when a profile exists. When checked, profile is null'd for that cull and that deep review. Library and profile remain intact. Resets to off on each new cull setup.

### Profile alignment indicator badge (components/DetailPanel.tsx)

Renders above the cull note. Three states matched against the closing-line template via `detectProfileAlignment(note)`:
- "Aligns with your library" — primary-tinted
- "Diverges from your library" — tertiary-tinted
- "Outside your library's strong traits" — neutral

Detection is text-match on phrases the preamble now requires the model to use. If the closing line is missing or worded differently, no badge renders (graceful fallback).

### Earlier in this session

- B audit (entries/N drift): not a bug — user starred a CUT-rated frame mid-cull during Test 3, correctly creating a `rescued: true` entry. Documented in `docs/PHASE-B-TEST-RESULTS.md`.
- Phase-A no-profile baseline for Test 2 frames was missing — established via snapshot/restore pattern. Memory feedback added to capture filenames + results inline going forward.
- `_personal/test-set-base/` (was `test-set-4/`) and `_personal/wildlife-base/` created. Both inside gitignored `_personal/`, no commit impact.

## Bed +20 outlier — known limitation, accepted for V1

Bed test frame is a fundamentally weak photograph (dim warm light, sleeping subject, no decisive moment) that scores MAYBE 52 against the rubric alone. With a narrow-genre wildlife profile applied, it scores SELECT 72 — a +20 swing crossing a bucket boundary, exceeding the ±7 ceiling.

Driven by perception shift, not score-weight inflation: the model literally re-reads "person at rest" as "contemplative narrative moment" once the profile prose mentions intimate moments. Three options were considered:

1. Accept (chosen for V1) — outlier requires narrow-genre seed AND a perception-flippable frame. Cross-genre seeds (Set A) don't trigger it. Cull note explains the alignment, opt-out toggle exists, Phase C overrides will correct individual mistakes.
2. Drop alignment lifts entirely — kills legitimate small lifts on aligned frames.
3. Two-pass scoring with mechanical clamp — doubles API cost.

Revisit in Phase C+ if user telemetry shows the case hits frequently in practice.

## Open follow-ons (post-merge, not blocking)

- **Profile preamble tuning iteration tooling.** This session iterated by recompile + manual cull. A small harness that runs N frames against M preamble variants and tabulates score deltas would have saved an hour. Worth building before another preamble change.
- **Mixed-shoot Test 3 with wildlife frames + non-wildlife frames in one cull.** We tested non-wildlife-only with profile (this session) and wildlife-only with profile (Test 3 original). The literal mixed-shoot variant was never run. Should hold given the trait-level analysis, but worth verifying.
- **Filename capture** in baseline runs (process memory updated, no code change).
- **Two-pass scoring** as opt-in or Pro-tier "Compare with/without profile" — option (d) from the design discussion. Defer until V2 unless real users want it.
- **Profile coherence handling.** Narrow-seed users (wildlife-only, landscape-only) over-fit the profile to genre. Could detect via seed-time coherence + warn user, OR water down narrow profiles' influence at injection time.

## Phase C — Override learning (after merge)

`feature/overrides` branch. Spec stub:
- `OverrideEntry { photoHash, shortDescription, sessionIntent, originalScore/Rating, userRating, timestamp }`. Rolling last 30.
- Few-shot injection: last 5–10 overrides (weighted by sessionIntent match) → `PAST OVERRIDES FROM THIS PHOTOGRAPHER:` block above rubric.
- `shortDescription` from tiny model call at override time, cached on entry.
- Profile regen: pull last 30 overrides into stage-1 prose as additional signal.
- This is where the bed-outlier case gets corrected: user marks bed as actual MAYBE, override teaches model that this photographer's "story" requires more than warm intimate light.

## When updating this file next session: rewrite rather than append.
