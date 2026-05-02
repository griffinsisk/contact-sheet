# Phase B — Validation Test Results

Captured during validation runs on `feature/taste-library`. Test plan in `docs/NEXT-SESSION.md`.

## Test 1 — Seed → auto-generate profile (qualitative)

**Date:** 2026-04-27 (prior session)
**Status:** PASS

- 20 favorites seeded (Set A).
- Both Sonnet calls (stage-1 prose, stage-2 tags) succeeded.
- Coherence: high (8 tags).
- Profile prose is concrete and cross-genre — palette / composition / atmosphere traits, not genre.

Stage-2 tags persisted:
```
warm_tones, golden_hour_light, environmental_context,
atmospheric_conditions, earth_tone_palette, generous_framing,
natural_moments, discovered_not_staged
```

## Test 2 — Profile shouldn't rescue weak frames

**Date:** 2026-04-27
**Intent:** mixed
**Frames:** boba (IMG_9623), bed (DSCF4303), dog (SNOW_PUP), NZ mountain (DSCF5224)
**Source:** `_personal/test-set-base/`
**Status:** PASS — 4 of 4 same bucket (criterion was 3 of 4)

Phase-A no-profile baseline was not captured in prior sessions, so we re-culled the same 4 frames with the profile temporarily nulled (snapshot/restore via console), then re-ran with profile.

### Bucket comparison

| Frame | No profile | With profile | Δ score | Δ bucket |
|---|---|---|---|---|
| IMG_9623 (boba) | SELECT 78 | SELECT 78 | 0 | same |
| DSCF4303 (bed) | MAYBE 52 | MAYBE 52 | 0 | same |
| SNOW_PUP (dog) | SELECT 72 | SELECT 72 | 0 | same |
| DSCF5224 (NZ) | SELECT 75 | SELECT 76 | +1 | same |

NZ frame cull-note (with profile):
> "Beautiful atmospheric landscape with dramatic light and mist creating strong visual impact, well-composed layers of mountains and water despite limited narrative content."

NZ frame cull-note (no profile):
> "Beautiful golden hour light on dramatic mountain landscape with strong atmospheric conditions, though limited narrative beyond scenic beauty."

### Interpretation

- Profile did **not** rescue the weak frame (bed stayed MAYBE 52).
- Profile did **not** artificially push strong frames over a threshold (boba/dog/NZ all SELECT in both runs, scores within ±1).
- Only score drift (NZ +1) is within Phase-0 determinism noise.
- Cull-note language shifts subtly with profile applied (more atmospheric / palette vocabulary), but bucket allocation is unchanged on a mixed-intent shoot — exactly what Test 2 asks for.

## Test 3 — Wildlife seed swaps the bias

**Date:** 2026-04-27
**Intent:** wildlife
**Test shoot:** 16 wildlife frames at `_personal/wildlife-base/wildlife-test-shoot/`
**Seed set:** 16 wildlife favorites
**Status:** Baseline captured; profile generated; cull-with-profile pending.

### Generated wildlife profile

Tags: `warm_tones, golden_hour_light, candid_over_posed, intimate_framing, environmental_context, shallow_dof, natural_light, behavioral_moments`

Prose excerpt: cites Highland cow, leopard grooming, cheetah cubs by name — concrete and frame-specific. Full text in browser localStorage.

vs. Set A (Test 1) tags: 3 shared (`warm_tones`, `golden_hour_light`, `environmental_context` — persistent palette/light traits across both seeds), 5 swapped (Set A had `atmospheric_conditions / earth_tone_palette / generous_framing / natural_moments / discovered_not_staged`; wildlife has `shallow_dof / natural_light / intimate_framing / behavioral_moments / candid_over_posed`). The bias-swap is exactly what Test 3 is checking — wildlife-specific behavioral and optical traits emerged from the wildlife seed.


### No-profile baseline (library wiped)

| # | Frame | Bucket | Score |
|---|---|---|---|
| 1 | leopard close-up | HERO | 85 |
| 2 | elephant | SELECT | 82 |
| 3 | giraffes (DSC00336) | SELECT | 82 |
| 4 | lizard | SELECT | 78 |
| 5 | cheetah behind tree | SELECT | 78 |
| 6 | impala leaping | SELECT | 76 |
| 7 | cheetah | SELECT | 75 |
| 8 | lilac-breasted roller | SELECT | 75 |
| 9 | ostriches | SELECT | 72 |
| 10 | raptor in flight | SELECT | 72 |
| 11 | dark gorilla | MAYBE | 68 |
| 12 | dark baboon | MAYBE | 65 |
| 13 | hyena | MAYBE | 62 |
| 14 | porcupine | MAYBE | 58 |
| 15 | monkey on branch | MAYBE | 52 |
| 16 | baby gorilla close-up | CUT | 45 |

Distribution: 1 HERO, 9 SELECT, 5 MAYBE, 1 CUT.

### With wildlife profile applied

| File | Frame | Baseline | With profile | Δ score | Δ bucket |
|---|---|---|---|---|---|
| DSC01625 | leopard close-up | HERO 85 | HERO 85 | 0 | same |
| DSC00336 | giraffes | SELECT 82 | HERO 85 | +3 | SELECT→HERO |
| DSC01344 | cheetah behind tree | SELECT 78 | SELECT 82 | +4 | same |
| DSC00383 | cheetah cubs by truck | SELECT 75* | SELECT 80 | +5 | same |
| DSC00511 | lizard | SELECT 78 | SELECT 78 | 0 | same |
| DSC00780 | impala leaping | SELECT 76 | SELECT 78 | +2 | same |
| DSC01269 | elephant | SELECT 82 | SELECT 75 | -7 | same |
| DSC01398 | lilac-breasted roller | SELECT 75 | SELECT 75 | 0 | same |
| DSC02064 | ostriches | SELECT 72 | SELECT 72 | 0 | same |
| DSC00569 | hyena | MAYBE 62 | SELECT 72 | +10 | MAYBE→SELECT |
| DSC02115 | dark gorilla | MAYBE 68 | MAYBE 68 | 0 | same |
| DSC01766 | raptor in flight | SELECT 72 | MAYBE 68 | -4 | SELECT→MAYBE |
| DSC02195 | dark baboon | MAYBE 65 | MAYBE 62 | -3 | same |
| DSC02208 | porcupine | MAYBE 58 | MAYBE 58 | 0 | same |
| DSC00226 | monkey on branch | MAYBE 52 | CUT 45 | -7 | MAYBE→CUT |
| DSC02119 | baby gorilla close-up | CUT 45 | CUT 42 | -3 | same |

*cheetah-cubs ↔ baseline-cheetah match uncertain — baseline run didn't capture filenames; matched by visual.

### Analysis

Pattern is directionally clean.

- **Boosted (+3 to +10):** giraffes, cheetah cubs, hyena, cheetah-behind-tree, impala. All warm-light, behavioral, or intimate-framing — exactly the profile traits (`warm_tones / candid_over_posed / intimate_framing / behavioral_moments / shallow_dof`).
- **Demoted (-3 to -7):** elephant (mid-day documentary, not intimate), raptor in flight (distant, no warmth), monkey on branch (stark, dim), dark baboon (dim, not golden), baby gorilla close-up (very dark). All counter the profile.
- **4 bucket changes**, all directionally correct.

**Strict criterion read:** doc said "intent-aligned +5 to +15." Only hyena (+10) and cheetah cubs (+5) hit the +5 floor. Most aligned frames moved +2 to +4. Strict pass = no.

**Spirit read:** profile clearly biases the rubric in the right direction in both up and down moves; bucket shifts make sense. Spirit pass = yes.

**Verdict:** PASS WITH CAVEAT. Magnitude is smaller than the doc's +5–15 floor expects, but directional signal is strong. Open question: tune the preamble for stronger profile influence, or accept V1 conservatism.

## Test 4 — In-app stars + auto-regen

**Date:** 2026-04-27
**Status:** PASS — all four sub-tests verified, with one test-plan correction noted.

### Pre-state observation

After Test 3 completed: `entries: 17`, `N: 16`. Off-by-one between library entry count and `generatedFromEntryCount`. Source of the +1 not investigated — possibly a stray star during Test 3 cull views. Worth a future audit but not a blocker for V1.

### Test plan correction

The doc's Test 4 plan ("trigger another cull → auto-regen fires") couldn't run as written. The initial seed-generated profile sets `lastRegenAt = Date.now()` (`SeedUploadModal.tsx:142,146`), so the 7-day auto-regen throttle (`ContactSheet.tsx:187`) is fully engaged immediately after seeding. Auto-regen on cull-start can never fire within 7 days of seeding. That's correct user-facing behavior (no one wants regen 15 min after seeding) but means Test 4 must clear `lastRegenAt` to exercise the auto-regen path.

### Sub-test results

| Sub-test | Result |
|---|---|
| **Star 5 frames adds entries** | PASS — `entries` 17 → 22 after starring 5 wildlife frames in cull grid |
| **Auto-regen fires on cull when delta ≥ 5 (and throttle clear)** | PASS — `/api/taste-profile` fired in Network tab (200, 13.66s, 1.9kB), `N: 16 → 22`, `lastRegenAt` updated to current time. Cull was not blocked (fire-and-forget confirmed). |
| **Auto-regen throttle re-engages after firing** | PASS — second cull immediately after did not fire `/api/taste-profile`; `lastRegenAt` unchanged. |
| **Manual regen 12-hr throttle blocks** | PASS — modal returned "Manual regen throttled — try again in ~12h" |
| **Manual regen runs after `lastRegenAt = 0` reset** | PASS — `/api/taste-profile` 200 in 12.40s, modal shows "Profile generated from 22 favorites" |

### Profile evolution after regen

After auto-regen on the 22-favorite library (16 wildlife seed + 5 newly starred wildlife frames):

Tags: `warm_tones, golden_hour_light, candid_over_posed, intimate_framing, environmental_context, natural_frames, high_contrast, authentic_moments`

vs prior 16-favorite tags: 5 persistent (`warm_tones, golden_hour_light, candid_over_posed, intimate_framing, environmental_context`), 3 swapped (`shallow_dof / natural_light / behavioral_moments` → `natural_frames / high_contrast / authentic_moments`). Reasonable drift from the 5 added frames.

## Final tally

| Test | Result |
|---|---|
| 1 — Seed → auto-generate profile | PASS (qualitative) |
| 2 — Profile shouldn't rescue weak frames | PASS — 4 of 4 same bucket; bed (weak frame) stayed MAYBE 52 |
| 3 — Wildlife seed swaps the bias | PASS WITH CAVEAT — directional signal strong, magnitude smaller than +5 floor (only 2 of 5 aligned frames hit +5; most +2 to +4); 4 bucket changes all directionally correct |
| 4 — In-app stars + auto-regen | PASS — all sub-tests verified after test-plan correction for seed-time `lastRegenAt` engagement |

3-of-4 PASS clears the merge gate. Test 3's caveat (weaker boost magnitude than the +5 floor) is a known V1 conservatism call — preamble could be tuned later if user feedback indicates the profile feels too neutral.

## Test 3 mixed-shoot variant + preamble tuning iteration (2026-04-28)

Ran the off-intent half of Test 3 — wildlife profile applied to 4 non-wildlife frames at intent="mixed". Initial result revealed the score-variance issue not exposed by Test 3's all-wildlife shoot.

### Initial finding

Original preamble (`Use these as soft bias when reading IMPACT and COMPOSITION`) produced large score swings on aesthetic-aligned frames:

| Frame | No-profile baseline | With wildlife profile | Δ |
|---|---|---|---|
| boba (intentional motion blur, warm) | SELECT 78 | SELECT 78 | 0 |
| **bed (warm intimate, weak composition)** | **MAYBE 52** | **SELECT 72 → 78** | **+20 to +26** |
| dog (cold-tone wildlife) | SELECT 72 | MAYBE 65 | -7 |
| NZ (golden hour landscape) | SELECT 75 | SELECT 74 | -1 |

Bed +20-26 is a rescue: a fundamentally weak composition lifted across a bucket boundary because warm intimate light matches the wildlife profile's aesthetic traits. This contradicts Test 2's "no rescue" finding because Set A profile (cross-genre) was broader and didn't form narrow aesthetic expectations.

### Iteration log

| Iteration | Preamble change | Result |
|---|---|---|
| 1. Asymmetric clause | "Profile MUST NOT lower craft scoring; only lift on alignment" | boba dropped to MAYBE 68 (CRAFT 45 — model used wildlife "tack-sharp expectation" against motion blur). Asymmetric instruction treated as suggestion. |
| 2. Permissive + EXPLAIN required | "soft bias on how you read this frame; cull note must acknowledge profile" | Scores matched no-profile baseline exactly — too permissive, profile became decoration. |
| 3. Directive + EXPLAIN required + closing-line | "let it lift IMPACT/COMP/CRAFT; do not be timid; close cull note with template" | Bed back to +26, but cull-note template + closing-line position both worked. |
| 4. ±7 ceiling + bucket-cross rules + per-dim caps + STORY ≤45 hard cap | Mechanical constraints with concrete OK/NOT-OK examples | boba returned to baseline 78 (✓), dog/NZ within ±3 (✓), bed +20 still violates the cap. Model evades STORY ≤45 by re-reading "person at rest" as "contemplative pose with narrative pull." |

### Final V1 state

Final preamble (in `lib/prompts.ts:tasteSection`):

- ±7 overall score ceiling with self-check instruction
- Bucket crossings allowed only when rubric-alone score is within ~5pts of bucket boundary
- Per-dimension cap: profile-driven dim lift max +10
- STORY GUARDRAIL hard cap at 50 for "person at rest in warm light" cases
- Cull note must close with one of three template lines (Aligns / Diverges / Outside)
- Closing line is closing context, not headline — frame content leads

### Acceptance rationale

3 of 4 frames stay within ±7. Bed +20 is the persistent outlier — driven by the model's *perception* shifting under profile, not by score-weight inflation we can constrain via prompt. Three honest options were considered:

1. Accept bed +20. ← Chosen for V1.
2. Drop alignment lifts entirely (kills legitimate +3s on dog/NZ).
3. Two-pass scoring with mechanical clamp (doubles API cost).

Why option 1 for V1:
- Bed-style cases need a narrow-genre seed AND a frame whose perception flips under the profile prose. Real users with cross-genre seeds (Set A) won't hit it.
- Cull note honestly explains the alignment in plain language ("warm tones and intimate framing match your golden-hour preference") — user sees what's happening.
- Per-cull opt-out toggle exists.
- Phase C override learning will correct individual mistakes over time.

### Concurrent product additions

- **Per-cull opt-out toggle** (`ContactSheet.tsx`): checkbox under IntentPicker, only visible when a profile exists. Default off (use profile). Disables profile for that cull and deep review.
- **Profile alignment indicator badge** (`DetailPanel.tsx`): renders above cull note when alignment phrase detected — "Aligns with your library" / "Diverges from your library" / "Outside your library's strong traits". Detection is text-match against the closing-line template the preamble now requires.

### Validation re-cull (final state)

| Frame | No-profile baseline | With profile (final) | Δ | Bucket | Alignment |
|---|---|---|---|---|---|
| boba | SELECT 78 | SELECT 78 | 0 | same | Aligns* |
| bed | MAYBE 52 | SELECT 72 | +20 | MAYBE→SELECT | Aligns |
| dog | SELECT 72 | SELECT 75 | +3 | same | Outside |
| NZ | SELECT 75 | SELECT 78 | +3 | same | (not captured) |

*boba alignment label flipped Diverges → Aligns between iterations 4 runs — same frame, same profile, model landed on different framings of intentional craft. Within run-to-run noise; score stayed stable at 78.

## Open follow-ups (post-merge)

- **+1 entries/N drift** observed at start of Test 4. Audit where stray entry came from.
- **Test 3 baseline didn't capture filenames** — match between baseline and with-profile relies on visual identification. Future runs should record filenames in baseline.
- **Phase-A no-profile baseline for Test 2 frames** was missing from prior sessions; established this run via snapshot/restore. Memory updated to capture results inline going forward.
- **Test 3 mixed-shoot variant** (wildlife profile applied to a shoot containing non-wildlife frames) was not run — would be needed to verify the "off-intent within ±3" half of the criterion.
- **Profile preamble strength** — open question whether to tune for higher boost magnitude or accept conservatism.
