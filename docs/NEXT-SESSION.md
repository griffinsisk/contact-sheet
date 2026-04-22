# Next Session Plan — Taste Library + Override Learning

**Starting state:** `main` at `4ee276b` (docs). Production at https://contact-sheet-three.vercel.app. Phase A shipped and validated.

**Target:** finish V1 in ~2 weeks of remaining work. V1 = intent-aware rubric (✅) + taste library with lite profile + override learning + polish.

## First 5 minutes — verify state

```bash
cd "/Users/griffin.sisk/Desktop/AI Projects/contact-sheet-repo"
git log --oneline -5
npx tsc --noEmit
npm run dev
```

**Feature branches:** `feature/taste-library` for Phase B, `feature/overrides` for Phase C. Merge each when its validation gate passes.

---

## Phase A — shipped

- Vercel deploy ✅ (live, smoke-tested: checkout → webhook → tier upgrade → cull)
- Intent picker ✅ (8 presets + free-form, sessionStorage-sticky)
- 5-dim rubric ✅ (RAW_QUALITY + CRAFT_EXECUTION split, intent-conditional CRAFT, STORY/CRAFT guardrails, 12 calibration anchors)
- Validation: boba SELECT 78, bed MAYBE 52, dog MAYBE 58, NZ landscape SELECT 76. Boba @ landscape mismatch drops to 50s — intent-conditionality confirmed.

---

## Design pivot (2026-04-22)

Original Phase B spec (weightAdjustments + cutThresholdShift + primaryIntentAffinity) was wrong for cross-genre photographers. Those mechanisms assume a single coherent genre preference. Real photographers shoot across genres but have cross-genre *taste* (tonal palette, compositional habits, moment preference). **Phase B now encodes taste only; genre handling stays in Phase A (session intent).**

Also: profile was specced as a one-shot snapshot. Real value comes from **continuous growth** — users favoriting frames in-app + overrides feeding regeneration. The persistent artifact is a **taste library** (photos the user has marked as representative); the profile is *derived* from it and regenerates as the library grows.

---

## Phase B — Taste library + lite profile (~1.5 days)

Goal: a living taste library that grows from in-app favoriting, and a derived profile (prose + tags) that nudges how the model reads frames.

### B.0 — Validation gate (~30 min, before any UI work)

Write `scripts/test-style-profile.ts` — a standalone node script that takes a directory of images and runs the `STYLE_PROFILE_PROMPT` against Anthropic. Run against 4 test sets:

- **(a)** 12 of your real favorites — is the prose recognizably *you*?
- **(b)** 12 wildlife-only frames — output *meaningfully different* from (a)?
- **(c)** 8 deliberately incoherent frames across genres — does the model admit low coherence?
- **(d)** Re-run (a) — stable across runs?

If 3 of 4 pass, Phase B holds. If not, rethink.

### B.1 — Data model + storage (~0.25 day)

```ts
interface TasteEntry {
  photoHash: string;       // hash of downsized pixels, not file bytes
  addedAt: number;
  originalRating?: Rating; // what the model said when favorited (null if seeded via batch upload)
  rescued?: boolean;       // true if this was a CUT the user rescued — highest-signal
}

interface TasteLibrary {
  version: 1;
  entries: TasteEntry[];             // cap 100; eviction is FIFO unless `pinned`
  pinned?: string[];                 // photoHashes that survive eviction
  currentProfile?: {
    prose: string;                   // shown to user
    aestheticTags: string[];         // injected into prompt preamble
    generatedAt: number;
    generatedFromEntryCount: number;
  };
  lastRegenAt?: number;
}
```

Storage:
- Pro: `clerkClient.users.updateUser({ publicMetadata: { tasteLibrary } })`
- Free: `localStorage["cs-taste-library"]`
- Helper in `lib/taste-library.ts` that reads from whichever tier is active

**No weightAdjustments, no cutThresholdShift, no primaryIntentAffinity.** The only mechanical effect on scoring comes from `aestheticTags` in the preamble.

### B.2 — In-app favoriting UI (~0.25 day)

Add a ★ action to `DetailPanel` and `PhotoGrid` cards: "Add to my taste library." Available on any rating, including CUTs (rescuing a CUT is the highest-signal data — it's what the user keeps that defaults would throw away). Mark rescued CUTs with `rescued: true` on the entry.

Visual state: filled star = in library. Click to toggle.

### B.3 — Seed upload flow (~0.25 day)

Optional entry point for cold start:

- New card in the empty-state three-path picker: "UPLOAD 8–20 FAVORITES" → modal drop zone → seeds the library in one go.
- Same modal accessible from Settings (gear icon → "My taste library" → "Add favorites").

Hybrid of options (a) + (b) from the earlier design decision. Users who never engage this flow still get a profile built passively from in-app favoriting once they cross the threshold.

### B.4 — Profile generation (~0.25 day)

New route: `app/api/taste-profile/route.ts`. Input: library entries (downsized photos + hashes). Output: `{ prose, aestheticTags }`.

Resize all photos to 512px on long edge before base64 encoding (well under Vercel's 4.5MB body limit even with 20+ photos).

**Two-stage generation** to keep prose and tags aligned:
1. Call 1 — prompt asks for 100–150 word prose describing aesthetic preferences that survive across genres. Shown to user verbatim.
2. Call 2 — prompt extracts 4–8 aestheticTags *from the prose* (not from images directly). Machine-readable, injected into cull prompts.

Why two stages: if we ask for prose + tags in one call, they can drift apart. The user reads the prose; the system acts on the tags. Divergence = broken trust. Two-stage enforces alignment by derivation.

Cost: ~$0.02 per generation. Trivial.

### B.5 — Prompt preamble integration (~0.25 day)

Update `buildCullPrompt` / `buildDeepReviewPrompt` to accept an optional `profile: { prose: string; aestheticTags: string[] } | null` arg and inject at the top of the preamble:

```
PHOTOGRAPHER TASTE (apply as context, not override):
Tags: warm_tones, tight_crops, candid_over_posed
Prose: "Consistently frames with tight negative space…"

Use these as soft bias when reading IMPACT and COMPOSITION. A frame that 
matches this taste reads as intentional; one that doesn't is fine to score 
on its own merits. Session intent still governs CRAFT thresholds.
```

Order stays: profile → intent → free-form → [V1.5 slots] → rubric body → images.

Plumb through proxy routes (accept `profile` in body with Zod-ish validation).

### B.6 — Auto-regen + throttle + manual regen (~0.25 day)

- Auto-regen trigger: when `library.entries.length - (currentProfile?.generatedFromEntryCount ?? 0) >= 5`, queue regeneration.
- Throttle: skip if `Date.now() - lastRegenAt < 7 days`.
- Manual regen button in Settings — bypasses throttle (max once per 12 hours).
- Auto-regen runs server-side on next API call so user doesn't wait on it.
- First regen triggers at library count = 8 (the minimum useful size).

### Validation gate (B, end-of-phase)

1. Seed library with 12 of your favorites → generate profile → prose feels like you.
2. Re-run the 4 Phase-A test cases with profile active → bed still MAYBE, dog still MAYBE (profile shouldn't rescue weak frames).
3. Re-run with a *different* taste profile (wildlife-heavy set) → intent-appropriate frames score *higher*, non-intent frames neutral.
4. Upload 5 new frames via in-app favoriting → auto-regen fires → profile drifts toward new taste.

---

## Phase C — Override learning (~1.5 days)

### C.1 — Override persistence (~0.5 day)

```ts
interface OverrideEntry {
  photoHash: string;
  shortDescription: string;       // 10-word model-generated, cached at override time
  sessionIntent: IntentPreset;
  originalScore: number;
  originalRating: Rating;
  userRating: Rating;
  timestamp: number;
}
```

Rolling last 30. Storage alongside `tasteLibrary` (same Clerk `publicMetadata` + localStorage pattern).

Override + rescue-from-CUT are distinct actions: override = "model said X, I say Y" (updates rating only); rescue-from-CUT = override + add to taste library (the "this is how I see" affirmation).

### C.2 — Few-shot injection (~0.5 day)

In cull prompt builder, pull last 5–10 overrides (weighted toward same `sessionIntent`) and format:

```
PAST OVERRIDES FROM THIS PHOTOGRAPHER:
- Frame with [brief desc]: model SELECT 72, photographer said HERO.
- Frame with [brief desc]: model SELECT 78, photographer said CUT.
Use as calibration — this photographer's taste differs from defaults here.
```

Description generated via tiny model call at override time, cached on entry.

### C.3 — Overrides → profile regen signal (~0.5 day)

On profile regen, pull last 30 overrides into the stage-1 prose prompt as additional signal ("here's how this photographer has actually rated frames — let that sharpen the taste description"). Profile drifts toward revealed preference over time.

### Validation gate (C)

Override 10 frames across 2 shoots → re-cull a third shoot with the same intent → few-shot examples visibly shift borderline calls in the override direction (without deforming cases far from the boundary).

---

## Phase D — Demo fixtures + polish (~1 day)

### D.1 — Commit demo fixtures

- `fixtures/demo-shoot/` — 34-photo test set with sanitized names (`shot_001.jpg` … `shot_034.jpg`).
- `fixtures/demo-library.json` — seeded taste library for reproducible demos.
- `fixtures/README.md` — one paragraph on reproduction.

### D.2 — Rate-limit retry in prod

Port `lib/harness.ts::callWithRetry` into cull/deep dispatch. One throttled batch shouldn't kill a 100-photo run.

### D.3 — Learning-mode threshold bump

Learning users see too many CUTs and quit. Bump HERO threshold to 75 (from 85), SELECT to 60 (from 70), for Learning mode only.

### D.4 — Final copy pass

Intent picker, taste library onboarding, three-path picker. Consistency sweep.

---

## V1.5 carve-outs — designed for, not built

1. **Per-session tone references (moodboard match).** Preamble reserves the slot.
2. **Multiple named taste libraries** ("wedding mode" / "street mode"). Data model migrates `tasteLibrary` → `tasteLibraries: { [name]: TasteLibrary }`, active one picked at cull-start.
3. **Anonymized override telemetry.** Opt-in upload for prompt iteration.
4. **Profile prose editing.** User edits prose → hints regenerated from edited prose.
5. **Macro preset.** Tested 2026-04-22 and current behavior is correct; revisit only if real macro frames consistently under-score.

Triggers in `docs/DECISIONS.md`.

---

## Known gaps / watch items

- **Vercel Hobby 4.5MB body limit.** 15 × 512px favorites ≈ 2.25MB with base64 overhead; comfortable margin. Cull batches at 1024px can approach the limit — if a batch hits the ceiling, reduce `CULL_BATCH_SIZE`.
- **Override/favorites content-hash.** Hash downsized pixels, not file bytes (re-saves must hash the same).
- **System-prompt cache disabled on intent-aware routes.** Every cull builds a different prompt. If profile becomes standard, cache won't help anyway.
- **Stripe sandbox has two webhook destinations.** Production uses the `contact-sheet-three.vercel.app` secret; local uses the `stripe listen` forwarder secret. Don't mix.
- **Dim bars render from `cull.scores` when deep review absent.** Validation aid from 2026-04-22; low-risk, keep.
- **Survivor bias in taste library from in-app favoriting.** Users favorite what cull didn't hide; rescue-from-CUT is the corrective data flow.

---

## Commit cadence

Phase A: shipped direct to `main`. 
Phase B: `feature/taste-library`, commit per step, merge when gate passes. 
Phase C: `feature/overrides`, merge when scoring visibly adapts. 
Phase D: direct to `main`.

When updating this file next session: rewrite rather than append. Rolling plan, not a log.
