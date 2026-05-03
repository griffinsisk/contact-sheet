# Phase D — Consolidation Plan: One Learning Loop

---

## Status: implemented on `feature/consolidation` (PR #3 open as of 2026-05-03)

Phase C merged to main as PR #2 on 2026-05-02, shipping the override-learning system that injected past corrections as few-shot text examples into the cull system prompt. Working through the UX with Griffin surfaced a deeper architectural problem: three parallel mechanisms influencing cull scoring, two partially redundant.

Phase D retires the per-correction prompt-injection pipeline and consolidates all user-feedback signals into the existing taste-library regen loop. PR #3 (`feature/consolidation`) implements the plan plus the transparency surfaces it generated.

### What landed beyond the original plan

The teardown was as scoped, but the resulting transparency gap forced parity work the original plan understated:

- **Corrections feeding profile** section in View Profile (thumbnails + per-row delete + relative timestamps)
- **"pending — regen to apply"** indicator on corrections newer than the last profile regen, and matching pill in the section header
- **Throttle bypass** in `handleManualRegen` when pending corrections exist (12h gate still applies otherwise)
- **"Corrected" pill** replaces the 12px gray pencil on photo cards — primary-tinted, label-bearing, glance-readable
- **Star toast** on every taste-library add (parity with override toast); first fire per browser includes educational copy; subsequent fires short
- **Favorites grid** in View Profile — every entry shown as a thumbnail with hover-delete; resolves the "can't remove a seed image" gap
- `TASTE_LIBRARY_ENTRY_ADDED_EVENT` separate from `TASTE_LIBRARY_CHANGED_EVENT` so the toast only fires on adds, not removes

---

## Problem

Today, three mechanisms can adjust how the cull AI scores a photo:

| Mechanism | Input | Pipeline | Injected as |
|---|---|---|---|
| **Seed profile** (Phase B) | 8–20 favorites uploaded by user | Profile regen → prose + tags | `tasteSection()` in cull system prompt |
| **Star** (taste library add) | User stars a HERO from a cull session | Adds to taste library, can trigger regen | Same prose + tags |
| **Correction** (Phase C) | User changes an AI rating | `recordOverride()` → `selectFewShot()` | `overridesSection()` — separate few-shot block in cull system prompt |

**Issues:**
1. Star and correction are both "user feedback on a single frame" but feed different downstream pipelines.
2. The correction pipeline is text-pattern matching ("when a frame closely parallels one of these…") which is fuzzy, unpredictable, and explicable only with several paragraphs of disclosure.
3. False matches: a low-quality frame can superficially parallel a correction (same subject) and get boosted unfairly.
4. Misses: a strong frame that doesn't lexically match any stored description sees zero benefit.
5. Statistical thinness: a typical user produces 5–20 corrections per session — too few to generalize from per-photo.
6. Two adjacent mechanisms means two adjacent prose blocks the AI has to reconcile in-prompt; coherence suffers.

**Root cause:** corrections were designed as their own learning loop instead of as another input stream into the existing taste-profile loop, which already has the right shape (corpus → regen → prose + tags → injection).

---

## Proposed architecture

One corpus. One regen. One injection. Two user-facing gestures stay (star, rating-change) — they just stop running on parallel tracks.

```
                                    ┌─────────────────────┐
   star ──────────────► library ───►│                     │
                                    │   profile regen     │
   rating change ─► correction ────►│  (LLM extracts      │──► prose + tags
                                    │   patterns from     │           │
                                    │   accumulated       │           ▼
                                    │   signals)          │   tasteSection()
                                    └─────────────────────┘   in cull prompt
```

### Signal weighting

A unified corpus needs to carry direction and magnitude per signal:

| Signal | Polarity | Weight | Notes |
|---|---|---|---|
| Star | positive | 1.0 | Strongest "more like this" signal |
| Correction up — CUT→HERO or CUT→SELECT | positive | 0.8 | Strong but reactive, not proactive |
| Correction up — CUT→MAYBE, MAYBE→SELECT | positive | 0.5 | Soft "don't throw away" |
| Correction up — SELECT→HERO | positive | 0.6 | Refining a near-miss |
| Correction down — HERO→SELECT, SELECT→MAYBE | negative | 0.5 | "Slightly over-rated" |
| Correction down — HERO→CUT, SELECT→CUT | negative | 0.8 | "Strongly over-rated" |

Weights are recommendations for the regen prompt, not multipliers on a score. The regen LLM receives the corpus with polarities and magnitudes labeled and decides how to express the pattern in prose.

### Corpus shape

```ts
interface UserSignal {
  photoHash: string;
  shortDescription: string;
  sessionIntent: IntentPreset;
  source: "star" | "correction";
  polarity: "positive" | "negative";
  weight: number;          // 0.5 / 0.6 / 0.8 / 1.0
  originalRating?: Rating; // corrections only
  userRating?: Rating;     // corrections only (== HERO for stars)
  timestamp: number;
}
```

The taste library already stores stars as `TasteEntry`; the override store holds corrections. Phase D unifies them under `UserSignal`, keyed by `photoHash` so duplicate signals on the same frame coalesce (most recent wins).

### Regen prompt changes

The current taste-profile regen prompt reads positive examples (the taste library entries) and writes a prose paragraph + tag list describing the photographer's eye. Phase D extends it to:

1. Read both positive and negative signals
2. Express counter-signals in prose explicitly (e.g., "deprioritizes static portraits with cluttered backgrounds")
3. Group by intent when patterns are intent-specific (e.g., "in wildlife shoots, favors calm static framing; in street, favors decisive moments")
4. Drop tags that haven't been reinforced in N regens (decay)

Prose still leads; tags remain the secondary structured signal.

### Injection

`tasteSection()` stays as-is on the read side. `overridesSection()` is **deleted**. The cull prompt becomes:

```
${CULL_BASE}
${tasteSection(profile)}${intentSection(intent)}
${RUBRIC_BODY}

${CULL_JSON_TAIL}
```

One context block describing the photographer; one describing the shoot intent; the rubric. No second photographer block.

---

## What stays user-facing

- **Star button** on cull frames — unchanged gesture
- **Rating change** in cull view — unchanged gesture; still updates `ratingOverrides` for export and visible state
- **First-correction toast** — kept, but copy shifts from "future culls in similar shoots will weight toward your rating" to "saved to your taste profile — it'll regen with your latest signals soon"
- **View Profile** modal — already exists for taste library; gains a small "informed by N favorites + M corrections" line so users see both inputs feeding the profile

## What gets dismantled

- `OverridesModal.tsx` — delete (functionality folded into View Profile or dropped entirely)
- Header `tune` icon + count badge — delete
- `overridesSection()` in `lib/prompts.ts` — delete
- `selectFewShot()` — delete (no longer needed; corpus → regen, no per-cull selection)
- `OverrideHint` type and the `overrides` plumbing in `runCull()` and `/api/cull` — delete
- `/api/override-describe` — kept (still useful for generating descriptions for the unified corpus)

## What stays in storage but changes purpose

- `cs-overrides` localStorage entries — migrated into the unified corpus and consumed by regen, not by per-cull injection
- `cs-taste-library` localStorage entries — unchanged; stars continue to populate it
- New: `cs-user-signals` (or a merged extension of taste library) holding the unified corpus

---

## Migration

1. Add `UserSignal` type and a unified store layer (`lib/user-signals.ts`)
2. On first load, migrate existing `cs-overrides` entries into the corpus with appropriate weights/polarities, then delete the old key
3. Existing `cs-taste-library` entries get tagged as `source: "star"` virtually at read time (no rewrite needed; the union view handles it)

No regen is forced on migration — the next user-triggered regen picks up the merged corpus.

---

## Regen triggers

Currently regen is manual (12-hour throttle, button in seed modal). Phase D considers automatic regen on a threshold:

- After every Nth signal (N = 5? 10?), schedule a debounced regen
- Or: on cull-start, if signals-since-last-regen ≥ N, run regen first

Decision deferred to implementation — depends on regen latency and whether users want their newest corrections to fire before the next cull or only after an explicit refresh.

---

## What this fixes

- **One mechanism to explain** — the user has one mental model: "the AI learns my eye through a profile that updates when I star or correct." No more reasoning about per-frame parallel matching.
- **Pattern extraction across signals** — regen distills noise out of individual corrections; statistically thin individual signals become a coherent narrative when aggregated.
- **Honest counter-signals** — downgrades currently have no mechanism; in the unified design they shape prose directly.
- **Inspectable** — the user reads their profile (already a feature) and sees the actual narrative the AI sees. No fuzzy "closely parallels" black box.
- **Cheaper per-cull** — one prompt block instead of two; no `selectFewShot` runtime.

## What this does *not* fix

- Profile regen is itself an LLM call, so the "learning" is still text-based soft bias. Phase D is more rigorous than Phase C but isn't a deterministic scoring change.
- Cold start is unchanged: a fresh user with no stars/corrections still leans on session intent + the rubric.
- Cross-photographer learning is out of scope; everything stays per-browser.

---

## Estimated scope

| Task | Size |
|---|---|
| `UserSignal` type + corpus storage layer | S |
| Migration from `cs-overrides` to corpus | S |
| Regen prompt extension (negative signals + intent grouping + tag decay) | M |
| Wire correction capture to corpus (replace `addOverride` call) | S |
| Delete `OverridesModal`, header icon, `overridesSection`, `selectFewShot`, prompt overrides plumbing | S |
| Update View Profile modal to show "N favorites + M corrections" | S |
| Toast copy update | XS |
| Validation pass: cull on validated wildlife set with merged corpus, compare against pre-Phase-D scores | M |

Total: ~1–2 days of implementation + a validation cull comparing pre/post merged behavior.

---

## What survives from `feature/overrides`

A meaningful chunk of the Phase C work is reusable infrastructure. Phase D is mostly **deletion + rewiring**, not rebuilding. The pieces that stay:

| Survives | Reason |
|---|---|
| `lib/photo-hash.ts` | Shared hash helper used by both stars and corrections; needed for unified corpus keying |
| `app/api/override-describe/route.ts` | Pro-gated Haiku describe endpoint; still generates the 12–20 word descriptions feeding the unified corpus |
| Capture flow in `handleRatingOverride` | The hash → describe → store pattern stays; it just calls a different store-add function |
| Cross-hook event sync pattern (`*_CHANGED_EVENT` window CustomEvent) | Already proven on taste library and overrides; applied to unified corpus the same way |
| First-correction toast UI + Undo affordance | Gesture stays; copy shifts ("saved to your taste profile") |
| Revert-to-AI cleanup logic | Still needed — when a user changes a rating back to the AI's call, the corresponding signal in the corpus must be removed |

## What gets torn down

| Removed | Replaced by |
|---|---|
| `components/OverridesModal.tsx` | A small "informed by N favorites + M corrections" line in View Profile |
| Header `tune` icon + count badge | nothing — the corpus is implicit; user manages it through the existing taste profile flow |
| Cull-start count pill ("N corrections will inform this cull") | nothing — irrelevant once injection is unified |
| `overridesSection()` in `lib/prompts.ts` | nothing — `tasteSection()` carries everything |
| `selectFewShot()` in `lib/overrides.ts` | nothing — corpus → regen, no per-cull selection |
| `OverrideHint` type and overrides plumbing in `runCull()` and `/api/cull` route | nothing — single prompt block driven by profile alone |

---

## Open questions (resolved during implementation)

1. ~~Should corrections still be visible to the user as a separate list?~~ **Yes** — the smoke test surfaced this gap immediately. The Corrections section inside View Profile is the audit surface. (Originally proposed implicit-only; reversed.)
2. ~~Tag decay~~ — deferred. Regen rewrites tags from full corpus each time, so stale tags drop naturally; explicit decay logic isn't load-bearing yet.
3. ~~Auto-regen threshold or manual only?~~ — manual for corrections (with pending-aware throttle bypass); auto on favorites delta unchanged. Decision: pending corrections bypass throttle, no auto-trigger on corrections specifically. Revisit if regen friction proves real.

## Open questions (still outstanding)

1. **Profile mechanism strength.** Test surfaced that the profile is felt mostly in cull-note language, not in scoring. The duplicate-photo edge case (a library member labeled "diverges from your library") exposes that profile influence is fuzzy prose, not deterministic math. Captured in `codex-feedback/profile-aware-scoring.md`; addressed in Phase E.
2. **Cross-photographer learning** — out of scope, no plans to pursue.

---

## Recommended path: merge first, refactor on follow-up branch

Per the survives/torn-down breakdown above, none of the merged Phase C work is wasted. The infrastructure (hash helper, describe endpoint, capture flow, toast, event sync) all carry forward. What gets deleted is the parallel injection pipeline and its UI surface — both isolated to clearly-bounded files.

Concrete sequence:

1. Merge `feature/overrides` → `main` as Phase C ships the visible UX wins (Corrections panel, header badge, Undo toast, redesigned rows).
2. Branch `feature/consolidation` from `main`.
3. Implement Phase D as a refactor: delete the parallel pipeline, add the unified corpus, extend the regen prompt for negative signals, migrate existing localStorage entries.
4. Validation cull on the wildlife base set: compare scores under unified-corpus profile vs. the just-merged Phase C behavior. Confirm the new design is at least as effective as the per-frame parallel matching it replaces.
5. Open PR for Phase D.

Rebuilding from main (the alternative) would mean re-doing photo-hash extraction, the describe endpoint, the capture flow, and the toast — all already validated work. No reason to throw it out.
