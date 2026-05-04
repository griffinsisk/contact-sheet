# Phase E — Test Results

Captured on `feature/profile-aware-scoring`.

## 2026-05-04 — Live AI Eval

Command:

```bash
npm run eval:ai
```

Model: `claude-sonnet-4-20250514`

Report: `eval-results/2026-05-04T14-22-16.json` (ignored local artifact)

Summary: **PASS — 8/8 cases passed, 0 failed, 0 errored.**

| Case | Rating | Final | Rubric | Delta | Affinity | Story |
|---|---:|---:|---:|---:|---|---:|
| `wildlife-strong` | SELECT | 83 | 81 | +2 | aligned | 75 |
| `weak-no-story` | CUT | 48 | 48 | 0 | none | 25 |
| `intentional-blur-film` | SELECT | 79 | 76 | +3 | aligned | 75 |
| `landscape-low-story` | MAYBE | 51 | 51 | 0 | none | 25 |
| `expressive-candid-portrait` | SELECT | 78 | 78 | 0 | none | 78 |
| `pretty-subject-low-story` | MAYBE | 61 | 60 | +1 | aligned | 38 |
| `profile-aligned-frame` | SELECT | 81 | 79 | +2 | aligned | 68 |
| `profile-divergent-frame` | MAYBE | 66 | 68 | -2 | diverged | 58 |

Observations:

- Profile deltas were modest and inside the intended bounds.
- The `pretty-subject-low-story` guardrail behaved correctly: taste fit added only +1 and the frame stayed MAYBE.
- The duplicate/library-match path behaved correctly in local e2e before this eval: a seeded favorite duplicate received the app-side profile boost.
- The divergent profile case showed counter-signal behavior with a -2 delta.
- No range calibration was needed after this first run.

## 2026-05-04 — Manual Production Smoke

Production URL: https://contact-sheet-three.vercel.app

Status: **PASS — manual production flow ran smoothly.**

Notes:

- Real app smoke completed after the Phase E production deploy.
- No Phase E blocker reported from the cull/detail-panel flow.
- The remaining concern is product positioning of the old Deep Review feature, now captured as Phase F in `docs/PHASE-F-EDITORIAL-REVIEW-REFRAME.md`.
