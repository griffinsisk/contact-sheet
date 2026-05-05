# Contact Sheet: Engineering, Product, and Applied AI Learnings

## 1. Measure Before You Build

The Phase 0 harness is the single most important engineering decision in the project.

Before writing any feature code, we built a variance harness — 34 photos x 5 runs x 2 resolutions = 340 API calls (~$2.40) — to test whether AI scoring was inconsistent enough to justify a 3-4 day rubric decomposition system using Anthropic tool-use structured outputs.

Result: Overall stdev 0.10, rating stability 100%, zero boundary crossings at temperature 0. The problem didn't exist.

What we avoided: A speculative 3-4 day engineering investment solving a non-problem. We redirected that time to shipping the pricing model and Stripe integration.

Lesson: When working with AI, your intuitions about model behavior are unreliable. Cheap empirical measurement beats expensive speculative architecture every time. The harness cost $2.40 and saved a week. We kept the harness as permanent infrastructure so any future prompt change can be re-validated.

---

## 2. Intent-Conditional Scoring: The Rubric Pivot

The problem: The original rubric scored photos against absolute photography standards. An intentional motion-blur portrait scored 45/CUT. A technically clean but pointless bed shot scored 68/MAYBE. The AI was grading convention, not craft.

The diagnosis: The single TECHNICAL dimension conflated two things that move in opposite directions under artistic intent:
- RAW_QUALITY (objective) — is the data there? Blown highlights, unrecoverable noise, missing exposure data. You can't style your way out of missing data.
- CRAFT_EXECUTION (intent-conditional) — did the photographer land what they were attempting? Motion blur is failure for wildlife, but success for film/intentional-imperfection.

The fix: Split TECHNICAL into two dimensions, added a session intent picker (8 presets + free-form), and rewrote the CUT rule to require either broken fundamentals or nothing to develop.

Lesson: AI scoring systems that judge creative work need a concept of intent. Without it, the model defaults to conventional standards and penalizes anything unconventional. The intent signal doesn't need to be complex — a single dropdown selection dramatically changed output quality. This is a general principle for applied AI: the model needs to know what "good" means in context, not just in the abstract.

---

## 3. Personalization Architecture: Three Wrong Approaches Before the Right One

This is the richest learning arc in the project. We went through four distinct architectures for "teach the AI my eye":

Approach 1 — Weight adjustments + cut threshold shifts (never built). The original Phase B spec assumed photographers have consistent cross-genre preferences expressible as numeric weight offsets. Reality: a photographer who shoots weddings and street has genuinely different standards for each. Numeric weight math can't represent "I value intimacy in street but grandeur in landscapes."

Approach 2 — Prose profile as soft prompt bias (Phase B, shipped). Generate a prose profile + aesthetic tags from 8-20 uploaded favorites. Inject as prompt preamble. Worked for changing cull-note language but barely moved scores. The rubric is concrete math; prose is fuzzy. The rubric wins.

Approach 3 — Few-shot correction injection (Phase C, shipped then retired). Capture rating overrides, generate one-line descriptions via a small model call, inject the last 5-10 as few-shot examples in the cull prompt. Problems: text-pattern matching was fuzzy and unpredictable; false matches boosted wrong frames; 5-20 corrections per session is too few to generalize from; two parallel prose blocks in the prompt degraded coherence.

Approach 4 — Bounded deterministic math (Phase D+E, final architecture). Consolidate all signals (stars + corrections) into one regen loop. The model reads taste and returns a structured affinity object per frame. The app (not the model) applies bounded post-processing math: capped deltas, guardrails preventing low-story frames from reaching HERO, library-match detection forcing aligned affinity for literal favorites.

Lesson: The key insight was separating what the model is good at (reading visual similarity, identifying trait alignment) from what it's bad at (consistent numeric scoring influenced by prose). Let the model perceive; let deterministic code decide. Phase E's architecture has the model return `{ alignment, confidence, matchedTraits, suggestedDelta }` and the app clamps, bounds, and applies it with inspectable math. The user can see exactly how their profile moved a specific score — rubric score, profile delta, final score — instead of trusting a black box.

---

## 4. Architectural Consolidation Over Feature Addition

Phase D is a subtraction story. Phase C shipped override learning as a parallel pipeline alongside the existing taste profile. Within one session of real usage, the architectural problem was obvious: three mechanisms influencing scoring (seed profile, stars, corrections) on two separate tracks with different injection strategies.

The fix: Retire the per-correction prompt-injection pipeline entirely. Feed corrections into the same regen loop as stars. One corpus, one regen, one injection point.

What we deleted: `overridesSection`, `selectFewShot`, `OverrideHint`, `OverridesModal`, the header tune icon. Net result was +2267/-362 lines — we added transparency surfaces (corrections visible in View Profile, delete per row, pending-regen indicators) while removing architectural complexity.

Lesson: The fastest path to a better product was deleting a feature we'd just shipped. Consolidation into one well-understood loop beat maintaining two partially-redundant pipelines. The code you delete is often more valuable than the code you write. This is especially true in AI systems where multiple prompt-injection strategies can interact in unpredictable ways.

---

## 5. The Deep Review Reframe: Features Change Roles as Architecture Matures

Phase F was pure product thinking, not engineering. After Phase E made the cull pass stronger (profile-aware, bounded, inspectable), the existing Deep Review feature — which ran a second scored pass — became redundant and potentially confusing. Two scores that could disagree for opaque reasons undermines trust.

The reframe: Deep Review became "Develop Shortlist" — editorial guidance (image role, edit direction, crop notes, sequencing) rather than re-scoring. The second score remains in the data model but is visually de-emphasized as "Editor's Score."

Lesson: As your system gets smarter, existing features may need to change roles, not just get better. The right response to "the first pass is now good enough" isn't "make the second pass even better" — it's "what does the second pass need to be now?" This is a product instinct, not an engineering one.

---

## 6. Validation Gates: Test the Hypothesis, Not Just the Code

Every phase had a validation gate with specific pass criteria before merge:

- Phase 0: "If all dimensions show <5 point stdev and rating stability >90%, determinism is not the problem." Passed, killed the project.
- Phase B: 4-step gate: (1) cross-genre profile is concrete, (2) profile doesn't rescue weak frames (4/4 same bucket), (3) wildlife seed swaps the bias (directionally-correct changes), (4) auto-regen mechanics work.
- Phase E: 8-case live AI eval harness with allowed rating ranges, score bounds, and profile delta assertions.

These aren't unit tests — they're hypothesis tests. They answer "does this feature actually do what we claimed it would do?" not "does the code run without errors?"

Lesson: AI features need eval harnesses that test behavior, not just correctness. The eval harness (`npm run eval:ai`) runs 8 real photos through the actual model with assertions on ratings, score ranges, profile deltas, and affinity alignment. It's the only test that can catch prompt regressions.

---

## 7. Proxy and Payload Engineering for Vision APIs

The Proxy 413 bug (Phase F) taught a practical lesson: Vercel's serverless proxy has body size limits that you hit before Anthropic's API limits when sending multiple base64 images. The fix was splitting payloads and downsizing proxied images before API submission.

Similarly, the taste profile generation had to handle proxy payload limits by trimming entries when the estimated body exceeds the soft limit.

Lesson: Vision API applications have a hidden infrastructure layer between your code and the model. Base64 images are large. Serverless platforms have request size limits. You need payload estimation, splitting, and downsizing as first-class concerns, not afterthoughts.

---

## 8. Product Decisions as Engineering Constraints

Several product decisions shaped the engineering in non-obvious ways:

- Free tier is anonymous — no Clerk account, localStorage-only. This means tier resolution (BYOK > Pro > Free) must work without auth, and all client-side state (taste library, overrides, free usage counter) must degrade gracefully when there's no server backing.
- BYOK stays client-side — the user's API key never touches our server. This forces a dispatch split in `lib/providers.ts` where BYOK calls go direct from the browser while Free/Pro calls go through `/api` proxy routes.
- Prompt caching is server-only — system prompts are stable across server-side calls (same key, same session shape), so Anthropic's 5-minute cache TTL hits reliably. BYOK calls vary too much for the write premium to pay off.

Lesson: Product decisions about trust, pricing, and user experience create hard engineering constraints. "The user's key never touches our server" isn't a security checkbox — it's an architecture fork that runs through the entire codebase.

---

## 9. Session Handoffs and Rolling Documentation

The project maintained a living `NEXT-SESSION.md` doc that was rewritten (not appended to) at the end of each session. It captures:
- Current state (what's shipped, what's on branch, what's pushed)
- First-3-minutes verification commands
- Next build direction with enough context to start cold
- Parking lot items

Combined with `DECISIONS.md` (decision log with evidence) and per-phase plan docs, this creates a paper trail where every non-obvious choice is traceable.

Lesson: On a solo project with sessions spanning days, your documentation is your team. The handoff doc isn't bureaucracy — it's the difference between a 3-minute cold start and a 30-minute "where was I?" archaeology session.

---

## Summary of Key Principles

1. Measure before building — $2.40 of API calls saved a week of speculative engineering
2. AI needs intent context — scoring creative work requires knowing what "good" means for this specific attempt
3. Let the model perceive, let code decide — structured affinity + deterministic bounded math beats prose-driven scoring
4. Delete features that no longer fit — consolidation beats maintaining parallel pipelines
5. Features change roles — as your system matures, existing features may need reframing, not improvement
6. Test hypotheses, not just code — AI features need behavioral eval harnesses, not just unit tests
7. Vision APIs need payload engineering — base64 images hit infrastructure limits before API limits
8. Product decisions are engineering constraints — trust, pricing, and UX choices fork your architecture
9. Documentation is your team — rolling handoffs and decision logs make solo development sustainable
