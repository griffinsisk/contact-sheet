# Next Session Plan — Style Profile + Overrides

**Starting state:** `main` on the standalone repo `griffinsisk/contact-sheet` at `5e6cd9e` (specific cull-note reasons). Production deployed at https://contact-sheet-three.vercel.app with Vercel auto-deploy on push. Phase A shipped and validated.

**Target:** finish V1 in ~2 weeks of remaining work. V1 = intent-aware rubric (✅ done) + persistent style profile + override learning + polish pass.

## First 5 minutes — verify state

```bash
cd "/Users/griffin.sisk/Desktop/AI Projects/contact-sheet-repo"
git log --oneline -5            # confirm 5e6cd9e is HEAD
npx tsc --noEmit                # must return clean
npm run dev                     # boot — usually :3001 or :3004
```

Visit the dev URL. Ready banner now has the 8-preset intent picker + optional free-form textarea. Cull returns 5-dim scores. DetailPanel renders dim bars from cull scores when deep review hasn't run.

**Phase B goes on a `feature/style-profile` branch, merged back to `main` when Phase B validates.** Phase C+D can land on `main` directly if small.

---

## Phase A — shipped

- A.1 Vercel deploy ✅ (live, smoke-tested end-to-end: checkout → webhook → tier upgrade → cull)
- A.2 Intent picker ✅
- A.3 Prompt refactor ✅ (5-dim rubric, intent-conditional CRAFT, STORY/CRAFT guardrails, 12 calibration anchors)
- Validation: all 4 flagged cases land correctly (boba SELECT, bed MAYBE 52, dog MAYBE 58, NZ SELECT). Boba @ landscape mismatch drops to 50s — intent-conditionality confirmed.

---

## Phase B — Style profile (~1.5 days)

Goal: generate a persistent per-user style profile from 8–20 favorites; inject as prompt preamble.

### B.1 — Favorites upload UI (~0.5 day)

New onboarding flow. Entry point = a new card in the empty-state three-path picker (or a Settings action for returning users). Drop zone accepts 8–20 images. Min 8, recommended 15, max 20.

### B.2 — Profile generation (~0.5 day)

New route: `app/api/style-profile/route.ts`. Accepts base64 images, calls Claude with a dedicated `STYLE_PROFILE_PROMPT`, returns `{ prose: string, hints: StyleProfileHints }`.

Shape (see `docs/RUBRIC.md` for full spec):
```ts
type StyleProfileHints = {
  aestheticTags: string[];          // e.g. ["intentional_blur", "warm_tones", "tight_crops", "candid_over_posed"]
  weightAdjustments?: Partial<{     // bounded, ±5
    impact: number;
    composition: number;
    rawQuality: number;
    craftExecution: number;
    story: number;
  }>;
  cutThresholdShift?: number;       // ±10
  primaryIntentAffinity?: IntentPreset;
};
```

Prose = shown to user. Hints = injected into prompt preamble.

Resize favorites aggressively for generation (512px on long edge is plenty for style inference). Cull pipeline uses 1024px; don't reuse it — Vercel Hobby tier has a 4.5MB request body limit and 15–20 high-res images would blow it.

### B.3 — Storage (~0.25 day)

- **Pro:** Clerk `publicMetadata.styleProfile = { prose, hints, generatedAt }`. Updated via a new server route using `clerkClient.users.updateUser`.
- **Free:** `localStorage["cs-style-profile"] = { prose, hints, generatedAt }` + `localStorage["cs-profile-generated"] = "1"` (the one-per-browser gate).
- Helper in `lib/style-profile.ts` that returns the current profile regardless of tier.

Free tier: **one generation per browser, ever.** Regeneration requires Pro or BYOK.

### B.4 — Display + regenerate (~0.25 day)

Settings panel shows current prose profile + "Regenerate" button (gated per above). Shows tags as chips. No prose editing UI in V1.

### Prompt preamble integration

Update `buildCullPrompt` / `buildDeepReviewPrompt` in `lib/prompts.ts` to accept an optional `profile` arg and prepend its prose + a weightAdjustments-applied weights table. Order (locked):

```
1. Persistent profile prose + hints  (B)
2. Session intent preset + conditional CRAFT rules  (A, done)
3. Session free-form text  (A, done)
4. [V1.5 slot: session tone references — unused in V1]
5. [C.1 slot: set-level inferred style read — Phase C]
6. Cull rubric body + calibration anchors  (A, done)
7. Batch images + per-image EXIF/filename context  (A, done)
```

### Validation gate (B)

Generate a profile from 12 of the 34 test photos. Re-run the same 4 cases + 3 new ones with the profile active. Profile must visibly shift scoring toward the photographer's taste without dominating the intent signal (weight adjustments capped at ±5).

---

## Phase C — Set-level inference + override learning (~2 days)

### C.1 — Set-level style read (~0.5 day)

Before batch 1 of a cull, fire one extra small API call with the first 8–12 downsized images asking Claude for a one-sentence "apparent style" read. Cache in session state. Prepend to each batch's prompt *after* persistent profile, *before* rubric body.

Only fires when the session has ≥10 photos (otherwise not enough signal). Costs ~$0.01 per cull. Skippable if latency is sensitive.

### C.2 — Override persistence (~0.5 day)

New module `lib/overrides.ts`. Rolling last 30 entries, keyed by photo content hash of *downsized pixels* (not file bytes — re-saves of the same photo must hash the same).

```ts
type OverrideEntry = {
  photoHash: string;
  shortDescription: string;       // 10-word model-generated, cached at override time
  sessionIntent: IntentPreset;
  originalScore: number;
  originalRating: Rating;
  userRating: Rating;
  timestamp: number;
};
```

Storage: Clerk `publicMetadata.overrides` (Pro) or `localStorage["cs-overrides"]` (free). `ratingOverrides` state in `ContactSheet.tsx` writes to the persistent log on every override.

### C.3 — Few-shot injection (~0.5 day)

In the cull prompt builder, pull the last 5–10 overrides (weighted toward same intent) and format as:

```
PAST OVERRIDES FROM THIS PHOTOGRAPHER (how they actually rate frames):
- Frame with [brief description]: model rated SELECT 72, photographer said HERO.
- Frame with [brief description]: model rated SELECT 78, photographer said CUT.
Use these as calibration — this photographer's taste differs from defaults here.
```

The 10-word description is generated by a tiny model call at override time and cached on the entry (avoids keeping photo bytes).

### C.4 — Overrides → profile regen signal (~0.5 day)

When the user regenerates their style profile, pull last 30 overrides into `STYLE_PROFILE_PROMPT` as additional signal ("here's how they've actually been rating things — update the profile accordingly"). Profile drifts toward taste over time.

---

## Phase D — Demo fixtures + polish (~1 day)

### D.1 — Commit demo fixtures

- `fixtures/demo-shoot/` — the 34-photo test set with sanitized filenames (`shot_001.jpg` … `shot_034.jpg`).
- `fixtures/demo-profile.json` — the generated profile for that set, once Phase B works.
- `fixtures/README.md` — one paragraph on how to reproduce.

Make sure these aren't accidentally gitignored.

### D.2 — Rate-limit retry in prod cull/deep

Port from `lib/harness.ts::callWithRetry`. One throttled batch shouldn't kill a 100-photo run.

### D.3 — Learning-mode threshold bump

Learning users see too many CUTs and quit. Bump HERO threshold to 75 (from 85), SELECT to 60 (from 70), etc. for Learning mode only. Touch `lib/prompts.ts` + the RATING mapping in `lib/api.ts` (if scoring is post-processed there).

### D.4 — Final copy pass

Three-path picker copy, intent picker copy, style-profile onboarding copy. Consistency sweep.

---

## V1.5 carve-outs — designed for, not built

1. **Per-session tone references (moodboard match).** Preamble already reserves the slot.
2. **Multiple named profiles per user** ("wedding mode" / "street mode"). Storage migrates `styleProfile` → `styleProfiles: { [name]: StyleProfile }`.
3. **Anonymized override telemetry.** Opt-in upload for prompt iteration.
4. **Profile prose editing.** User edits prose; system re-derives hints.
5. **Macro preset.** Only add if real macro shots consistently under-score under `mixed` (tested briefly on 2026-04-22 — hydrangea garden shot was scored correctly as MAYBE; need 3–5 true macro frames to decide).

Each has a trigger in `docs/DECISIONS.md` for when to revisit.

---

## Known gaps / watch items

- **Vercel Hobby tier 4.5MB request body limit.** Cull batch of 20 photos at 1024px is ~2–6MB. Style profile with 15–20 images must resize to 512px. If a cull batch hits the ceiling, reduce `CULL_BATCH_SIZE`.
- **Override content-hash.** Hash downsized pixels, not file bytes.
- **System-prompt cache disabled on cull/deep proxy routes** (the prompt varies with intent). If Phase C's set-level preamble becomes a constant-per-cull, revisit whether the first-batch system prompt can be cached within a single cull run.
- **Stripe sandbox has two webhook destinations** — a localhost forwarder (for `stripe listen`) and the production Vercel destination. Each has its own `whsec_...`. The Vercel env's `STRIPE_WEBHOOK_SECRET` must match the production destination, not the localhost one.
- **Dim bars render from cull.scores when deep review absent.** Added 2026-04-22 for rubric validation; low-risk, keep it.

---

## Commit cadence

Phase A: shipped direct to `main` (small commits).
Phase B: feature branch `feature/style-profile`, commit per step, merge when B validation gate passes.
Phase C: feature branch `feature/overrides`, merge when scoring visibly adapts across a re-run of the test set.
Phase D: direct to `main`.

When updating this file next session: rewrite rather than append. Rolling plan, not a log. History lives in git + `DECISIONS.md`.
