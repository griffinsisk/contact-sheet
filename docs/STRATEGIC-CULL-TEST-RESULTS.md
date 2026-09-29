# Strategic Cull — Test Results

Branch: `feature/strategic-cull` · Date: 2026-06-10

## What shipped

1. **Burst / near-duplicate clustering** (`lib/clusters.ts`, client-side, zero API cost)
   - dHash (64-bit difference hash) computed during the existing image decode in `resizeImage` — no extra decode pass.
   - EXIF `DateTimeOriginal` + `SubSecTimeOriginal` now parsed (`lib/exif.ts`) → `capturedAtMs`.
   - Clustering rule: frames chained in capture order when gap ≤ 2.5s AND hamming ≤ 16 (burst), or hamming ≤ 6 regardless of time (near-dupe). Degenerate hashes (uniform frames — blank sky, lens cap) never cluster.
2. **Best-of-burst UX** (`ContactSheet.tsx`, `PhotoGrid.tsx`, `CullBanner.tsx`)
   - After cull, each cluster collapses behind its best frame (effective rating rank, then score; user overrides win).
   - Lead frame gets a stacked-paper visual + "BEST OF N" expand/collapse chip; alternates show an ALT marker when visible.
   - Auto-shortlist selects HERO/SELECT **burst leads only** — 10 near-identical keepers no longer put 10 frames on the shortlist.
   - Bursts collapse only in the unfiltered view; rating filters and Top-N show flat lists so counts stay honest.
   - Cull banner reports "N bursts grouped".
3. **Top-N delivery view** (toolbar)
   - "TOP" chip + count input: shows the best N frames, one per burst, ranked by effective rating then score. Mirrors how photographers actually cull ("deliver 30").
4. **AI agreement chip** (toolbar)
   - `kept / scored` AI ratings as a percentage — the live health metric for the taste loop. `overrideCount` now persisted per session (`SessionData.overrideCount`) for future trend analysis.
5. **Prompt-cache fix** (`/api/cull`, `/api/deep-review`)
   - Both routes had `cacheSystem: false` based on a misreading of Anthropic cache semantics (cache entries are keyed by exact prefix content; per-intent prompts can't contaminate each other). Now `true`: within one cull/develop run every batch sends an identical system prompt, so batches 2..N read the cache (~90% input-token discount on the ~2.5k-token system prompt per batch).
   - Prompt **text is unchanged** — no calibration risk; the cached-block code path was already exercised in production by `/api/compare`.

## Validation

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run test:unit` | **67 pass** (53 existing + 14 new: clusters, EXIF timestamp) |
| `npm run test:e2e` | **11/11 pass** |
| `npm run build` | pass |
| `npm run eval:ai` | not run — prompt text byte-identical, no rubric change |

## Notable finding during testing

First e2e run failed 6 tests: the suite's 1×1 uniform-color fixtures (red dot, blue dot) produced identical all-zero dHashes and falsely clustered, hiding the second photo. This is a real product bug class (blank frames would false-stack), fixed by refusing to cluster degenerate hashes — covered by a dedicated unit test. After the fix, all 11 e2e tests pass unmodified.

## Known limits / follow-ups

- Restored sessions have no `dhash` (thumbnails only) → no clustering, consistent with their existing "can't re-analyze" limitation.
- Burst thresholds (2.5s / 16 / 6 bits) are exported constants — tune against a real burst-heavy shoot in production smoke.
- Export does not yet annotate burst alternates in the manifest/XMP.
- Agreement % is per-session display only; cross-session trend (does the taste profile reduce corrections over time?) is the next measurement step.
