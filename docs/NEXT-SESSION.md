# Next Session — Phase C: Override Learning

**Branch:** `main` is current (Phase A + Phase B both live).
**Prod:** https://contact-sheet-three.vercel.app — Phase B deployed via PR #1 merge on 2026-05-02.

## First 3 minutes — verify state

```bash
cd "/Users/griffin.sisk/Desktop/AI Projects/contact-sheet-repo"
git checkout main && git pull
git status                  # clean
npx tsc --noEmit            # clean
```

Smoke-test prod once if not already done: sign in as Pro → seed 8+ favorites → cull a shoot → confirm cull notes show alignment indicator + closing line.

## Phase C — Override learning (start here)

Branch: `feature/overrides`. Spec stub (lifted from prior NEXT-SESSION):

- `OverrideEntry { photoHash, shortDescription, sessionIntent, originalScore/Rating, userRating, timestamp }`. Rolling last 30.
- Few-shot injection: last 5–10 overrides (weighted by sessionIntent match) → `PAST OVERRIDES FROM THIS PHOTOGRAPHER:` block above rubric.
- `shortDescription` from tiny model call at override time, cached on entry.
- Profile regen: pull last 30 overrides into stage-1 prose as additional signal.
- Bed-outlier case (Phase B Test 3 limitation) gets corrected here: user marks bed as actual MAYBE, override teaches the model that this photographer's "story" requires more than warm intimate light.

Decisions still open before coding:
- Storage: localStorage (consistent with anonymous Pro free tier) vs Clerk `publicMetadata` (persists across devices). Phase B chose localStorage — keep parity unless there's a reason to split.
- Where the "override" UI lives: thumb on cull cards, or DetailPanel only?
- Whether overrides also feed the few-shot block during *deep review*, not just cull.

## Open follow-ons (post-Phase B, not blocking C)

- Profile preamble tuning iteration tooling — small harness for N frames × M preamble variants
- Mixed-shoot Test 3 — wildlife + non-wildlife in one cull (untested combo)
- Filename capture in baseline runs (process memory updated, no code change)
- Two-pass scoring as opt-in or "Compare with/without profile" — defer to V2
- Profile coherence handling — narrow seeds (wildlife-only) over-fit to genre
- Bed +20 outlier — revisit if telemetry shows it hits frequently (Phase C should subsume)

## When updating this file next session: rewrite rather than append.
