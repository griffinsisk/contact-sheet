# Next Session — Open Phase B PR → main

**Branch:** `feature/taste-library` (local; 4 commits ahead of origin, needs push). Run `git log --oneline -6` to see HEAD.
**Prod:** still Phase A at https://contact-sheet-three.vercel.app.
**Validation status:** Phase B preview tested 2026-05-02, working end-to-end. Profile generates from seed, alignment indicator renders, opt-out works, History/SessionsModal opens, ratingOverrides honored in exports. 4-of-4 PASS still holds.

## Pickup point

1. **Push branch** (4 commits ahead of origin):
   ```bash
   cd "/Users/griffin.sisk/Desktop/AI Projects/contact-sheet-repo"
   git push origin feature/taste-library
   ```

2. **(Optional) Quick re-test on Vercel preview** — the new build will deploy automatically. Two changes to verify:
   - Seed 8+ favorites on a fresh profile state → click START CULL immediately. Button should be disabled with "Updating your taste profile…" pill visible. Becomes enabled once regen finishes.
   - Open DetailPanel for any culled frame with an alignment badge → cull note body and "Aligns with your library — …" closing line are on separate paragraphs (closing line italic + muted).

3. **Open PR**:
   ```bash
   gh pr create --base main --head feature/taste-library --title "Phase B: Taste Library"
   ```
   Body should reference `docs/PHASE-B-TEST-RESULTS.md`. Suggested body:

   ```markdown
   ## Summary

   Adds taste-library learning: anonymous Pro users can favorite frames into a personal library, which auto-generates a taste profile (prose + aesthetic tags) used as a soft bias during cull and deep review.

   - Profile injected at cull time when present; per-cull opt-out toggle for off-style shoots.
   - Alignment indicator badge on cull notes (aligns / diverges / outside) with text-match detection on a required closing-line template.
   - History/SessionsModal for browsing prior culls; re-import preserves ratingOverrides in exports.

   Validation: 4-of-4 PASS on `docs/PHASE-B-TEST-RESULTS.md`. One known limitation (bed +20 outlier with narrow-genre wildlife seed) accepted for V1; documented in test results.

   ## Test plan
   - [ ] Sign in as Pro, seed 8+ favorites, confirm profile auto-generates
   - [ ] Cull a shoot → alignment badge + split closing line render correctly
   - [ ] Toggle opt-out → score reverts to rubric-only
   - [ ] History → SessionsModal opens
   - [ ] Export with ratingOverrides applied
   ```

4. **Merge PR on GitHub.** Vercel auto-deploys main → smoke-test prod (sign in, seed, cull, alignment).

## Recent commits (since pickup baseline)

- (HEAD) docs(next-session): correct branch state, drop self-referential SHAs
- `304b0e1` docs(next-session): scaffold for PR-opening session
- `1d3d608` feat(taste-library): split cull note body from profile alignment line
- `72517a3` feat(taste-library): regen status indicator + disable cull during regen
- `27da71d` docs(next-session): pickup point for Phase B preview test → PR → merge
- `7a2f83a` docs(phase-b): test results capture + NEXT-SESSION refresh
- `966dc16` feat(taste-library): wire profile into cull/deep-review + opt-out + alignment indicator + restored guards
- `480a779` feat(history+exports+restored): SessionsModal, re-import copy, ratingOverrides honored
- `862362f` feat(taste-library): preamble tuning for off-intent variance

## First 3 minutes — verify state

```bash
cd "/Users/griffin.sisk/Desktop/AI Projects/contact-sheet-repo"
git status                # clean, 4 commits ahead of origin
git log --oneline -6      # confirm last 6 commits match section below
npx tsc --noEmit          # clean
```

## What changed this session (race fix + cull note split)

### Race condition on first cull after seeding (`components/ContactSheet.tsx`)

Auto-regen runs fire-and-forget after favoriting. ~15–30s LLM call. If user clicks START CULL during that window, the cull fires with stale or absent profile. Confirmed via DevTools: profile in localStorage, but first cull's request had stale state.

Fix: added `regenStatus: 'idle' | 'generating'` state, set on regen kickoff, cleared in `.finally()`. Disabled START CULL with tooltip + grayed style while generating. Inline "Updating your taste profile…" pill above the cull setup divider for visibility.

### Cull note alignment line as separate paragraph (`components/DetailPanel.tsx`)

The required closing line ("Aligns with your library — …") was rendering as a run-on continuation of the frame analysis, blurring the distinction between content-of-frame and profile-context.

Added `splitProfileLine(note)` helper: locates the alignment phrase (case-insensitive), backs up to the start of that sentence (last `". "`, `"! "`, or `"? "`), returns `{body, closing}`. Renders closing as separate paragraph with `mt-3 italic text-on-surface-variant`. Graceful fallback if no alignment phrase detected.

## Open follow-ons (post-merge, not blocking)

- **Profile preamble tuning iteration tooling** — small harness for N frames × M preamble variants
- **Mixed-shoot Test 3** — wildlife + non-wildlife in one cull (untested combo)
- **Filename capture in baseline runs** (process memory updated, no code change)
- **Two-pass scoring** as opt-in or "Compare with/without profile" — defer to V2
- **Profile coherence handling** — narrow seeds (wildlife-only) over-fit to genre
- **Bed +20 outlier** — revisit in Phase C+ if telemetry shows it hits frequently

## Phase C — Override learning (after merge)

`feature/overrides` branch. Spec stub:
- `OverrideEntry { photoHash, shortDescription, sessionIntent, originalScore/Rating, userRating, timestamp }`. Rolling last 30.
- Few-shot injection: last 5–10 overrides (weighted by sessionIntent match) → `PAST OVERRIDES FROM THIS PHOTOGRAPHER:` block above rubric.
- `shortDescription` from tiny model call at override time, cached on entry.
- Profile regen: pull last 30 overrides into stage-1 prose as additional signal.
- Bed-outlier case gets corrected here: user marks bed as actual MAYBE, override teaches model that this photographer's "story" requires more than warm intimate light.

## When updating this file next session: rewrite rather than append.
