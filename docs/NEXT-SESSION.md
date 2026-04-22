# Next Session Plan — Intent-Aware Scoring

**Starting state:** `main` at `ffeab8d` (onboarding three-path picker + polish committed; Stripe wired; local Stripe webhook flow verified end-to-end with test card).

**Target:** V1 shippable in ~2.5 weeks. V1 = intent-aware rubric + persistent style profile + override learning + Vercel deploy.

## First 5 minutes — verify state

```bash
cd "/Users/griffin.sisk/Desktop/AI Projects/contact-sheet/contact-sheet-v3"
git log --oneline -5             # confirm ffeab8d is HEAD
npx tsc --noEmit                 # must return clean
npm run dev                      # boot — usually :3001 or :3004
```

Visit URL. Header should show UPGRADE TO PRO button (or "You're Pro" if previously tested), SIGN IN (if signed out), three-path empty state with hero tagline.

**Phase A work can commit straight to `main` (short-lived). Phase B+ goes on a `feature/intent-aware-scoring` branch.**

---

## Phase A — Deploy + core rubric fix (~1 day)

Goal: get a URL live + stop the current prompt from mis-rating stylistic frames.

### A.1 — Vercel deploy (~2 hrs)

- `gh repo create contact-sheet --private --source=. --push`
- Import to Vercel; set env vars from `.env.local` (Anthropic, Clerk, Stripe — except `STRIPE_WEBHOOK_SECRET`).
- Stripe dashboard → register webhook endpoint `https://<vercel-domain>/api/stripe/webhook` → copy generated `whsec_` into Vercel env.
- Clerk dashboard → update application URLs to Vercel domain.
- Smoke test: sign in, Stripe checkout (test card 4242), webhook fires, tier updates.

### A.2 — Intent picker (~0.5 day)

New component: `components/IntentPicker.tsx`. Appears at cull-start (either as a banner above the cull button when photos are loaded, or as a required step between "photos loaded" and "cull starts" — TBD during build; lean banner).

**8 presets:**
- Documentary / candid
- Street
- Film / intentional imperfection
- Sharp wildlife / sports / action
- Fine-art landscape
- Portrait / people
- Events (weddings, parties, performances)
- Mixed — judge each photo individually

Single-select. Optional free-form text field ("anything else we should know about this shoot?"). Sticky per browser tab via `sessionStorage`. Re-promptable via a link in the cull banner.

Wire: `startCull` in `ContactSheet.tsx` reads the current intent + free-form and passes through to `runCull` → prompt builder.

### A.3 — Prompt refactor (~0.5 day)

Rewrite `CULL_PROMPT` and `DEEP_REVIEW_PROMPT` in `lib/prompts.ts`:

- Split TECHNICAL → RAW_QUALITY (15%) + CRAFT_EXECUTION (10%).
- Drop COMPOSITION 30% → 25%.
- Keep IMPACT 30%, STORY 20%.
- Rewrite CUT rule: CUT requires *broken fundamentals* OR *nothing to develop*. Technically-fine-but-pointless = MAYBE, not CUT.
- Add `INTENT:` section that receives `session_intent` + `session_free_form` and modifies how CRAFT is graded.
- Update calibration anchors for the new dimensions.

"Mixed" intent: prompt is told to infer per-photo intent from the frame itself instead of applying session intent to CRAFT.

**Validation at end of Phase A:** re-run the 34-photo test set with each of the four flagged failure cases (boba, bed, dog, NZ landscape). Boba should move from CUT to SELECT. Bed should move from MAYBE to CUT. Dog should *stay* at MAYBE/SELECT but the scores should now *justify* that given intent. NZ landscape should move up.

If those four cases don't land, iterate on the prompt before moving to Phase B.

---

## Phase B — Style profile (~1.5 days)

Goal: generate a persistent per-user style profile from 8–20 favorites; inject as prompt preamble.

### B.1 — Favorites upload UI (~0.5 day)

New onboarding flow, entry point = new card in the empty-state three-path picker OR a settings action. Drop zone accepts 8–20 images. Min 8, recommended 15, max 20.

### B.2 — Profile generation (~0.5 day)

New route: `app/api/style-profile/route.ts`. Accepts base64 images, calls Claude with a dedicated `STYLE_PROFILE_PROMPT`, returns `{ prose: string, hints: StyleProfileHints }`.

`StyleProfileHints` shape:
```ts
type StyleProfileHints = {
  aestheticTags: string[];          // e.g. ["intentional_blur", "warm_tones", "tight_crops", "candid_over_posed"]
  weightAdjustments?: Partial<{     // bounded, e.g. ±5
    impact: number;
    composition: number;
    rawQuality: number;
    craftExecution: number;
    story: number;
  }>;
  cutThresholdShift?: number;       // ±10, nudges CUT boundary
  primaryIntentAffinity?: IntentPreset;  // which intent preset matches this style best
};
```

Prose = shown to user. Hints = injected into prompt.

### B.3 — Storage (~0.25 day)

- **Pro:** Clerk `publicMetadata.styleProfile = { prose, hints, generatedAt }`. Updated via a new server route that uses `clerkClient.users.updateUser`.
- **Free:** `localStorage["cs-style-profile"] = { prose, hints, generatedAt }` + `localStorage["cs-profile-generated"] = "1"` (the one-per-browser gate).
- Helper in `lib/style-profile.ts` that returns the current profile regardless of tier.

Free tier: **one generation per browser, ever.** If user wants to regenerate, they need Pro or BYOK.

### B.4 — Display + regenerate (~0.25 day)

Settings panel shows current prose profile + "Regenerate" button (Pro only for free users who've already used their one). Shows tags as chips. No editing UI in V1.

### Prompt preamble order (locked)

```
[persistent_profile.prose]
[persistent_profile.hints → weight adjustments applied]
[session_intent from picker]
[session_free_form if provided]
[V1.5 slot: session_tone_refs — unused in V1]
---
[cull prompt body]
[batch images]
```

---

## Phase C — Set-level inference + override learning (~2 days)

Goal: the tool gets smarter with use.

### C.1 — Set-level style read (~0.5 day)

Before batch 1 of a cull, fire one extra small API call with the first 8–12 downsized images asking Claude to write a one-sentence "apparent style" read ("This set reads as warm-tone film-emulation candid at golden hour, with tight crops favored over negative space"). Cache in session state. Prepend to each batch's prompt *after* persistent profile.

Only fires when session has ≥10 photos (otherwise not enough signal). Costs ~$0.01 per cull. Skippable if latency is sensitive.

### C.2 — Override persistence (~0.5 day)

New module `lib/overrides.ts`. Rolling last 30 entries, keyed by photo content hash (not filename — filenames change).

```ts
type OverrideEntry = {
  photoHash: string;
  sessionIntent: IntentPreset;
  originalScore: number;
  originalRating: Rating;
  userRating: Rating;
  timestamp: number;
};
```

Storage: Clerk `publicMetadata.overrides` (Pro) or `localStorage["cs-overrides"]` (free). `ratingOverrides` state in `ContactSheet.tsx` writes to the persistent log on every override.

### C.3 — Few-shot injection (~0.5 day)

In cull prompt builder, pull the last 5–10 overrides (weighted toward same intent) and format as:

```
PAST OVERRIDES FROM THIS PHOTOGRAPHER (how they actually rate frames):
- Frame with [brief description]: model rated SELECT 72, photographer said HERO.
- Frame with [brief description]: model rated SELECT 78, photographer said CUT.
...
Use these as calibration — this photographer's taste differs from defaults here.
```

Storing a "brief description" per override either requires keeping the original photo bytes (expensive) or a short model-written description at override time. Lean: generate a 10-word description at override time with a tiny model call; cache on the override entry.

### C.4 — Overrides → profile regen signal (~0.5 day)

When user regenerates their style profile, pull last 30 overrides into the `STYLE_PROFILE_PROMPT` as additional signal ("here's how they've actually been rating things — update the profile accordingly"). Profile naturally drifts toward taste over time.

---

## Phase D — Demo fixtures + polish (~1 day)

### D.1 — Commit demo fixtures

- `fixtures/demo-shoot/` — the 34-photo test set with sanitized filenames (`shot_001.jpg` … `shot_034.jpg`).
- `fixtures/demo-profile.json` — the generated profile for that set, once Phase B works.
- `fixtures/README.md` — one paragraph on how to reproduce.

### D.2 — Rate-limit retry in prod cull/deep

Port from `lib/harness.ts::callWithRetry`. One throttled batch shouldn't kill a 100-photo run.

### D.3 — Learning-mode threshold bump

Learning users see too many CUTs and quit. Bump HERO threshold to 75 (from 85) etc. for Learning mode only. Touch `lib/prompts.ts` + RATING mapping in `lib/api.ts`.

### D.4 — Final copy pass

Three-path picker copy, style-profile onboarding copy, intent picker copy. Consistency sweep.

---

## V1.5 carve-outs — designed for, not built

These are deliberately scoped OUT of V1 but the data model / prompt structure accommodates them:

1. **Per-session tone references (moodboard match).** User drops 3–5 reference images at cull-start; generates a temporary tone note layered between session intent and prompt body. The prompt preamble already reserves a slot for this.
2. **Multiple named profiles per user** ("wedding mode" / "street mode"). Storage migrates `styleProfile` → `styleProfiles: { [name]: StyleProfile }`, adds picker in settings.
3. **Anonymized override telemetry.** Opt-in upload of overrides for prompt iteration.
4. **Profile prose editing.** User edits the prose; system re-derives hints from edited prose.

Each has a trigger in `docs/DECISIONS.md` for when to revisit.

---

## Known gaps to flag if they become blockers

- Vercel Hobby tier 4.5MB request body limit. Batch of 20 photos at 1024px ≈ 2–6MB. May need to reduce `CULL_BATCH_SIZE` for the proxy path if a batch hits the ceiling.
- Style profile generation with 15–20 high-res images in one request may exceed the same 4.5MB limit. Lean: resize aggressively for profile generation (512px on long edge is plenty for style inference) rather than reusing the cull 1024px pipeline.
- Override content-hash: photo hash should be computed from downsized pixels, not file bytes, so re-saves of the same photo still hash to the same value.

---

## Commit cadence

Phase A: commit per feature (A.1, A.2, A.3 separate commits) directly to main.
Phase B–D: feature branch `feature/intent-aware-scoring`, commit per step, merge when Phase D.1 fixtures validate.

When updating this file next session: rewrite rather than append. Rolling plan, not a log. History lives in git + `DECISIONS.md`.
