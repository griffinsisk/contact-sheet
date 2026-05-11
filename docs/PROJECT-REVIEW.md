# Contact Sheet — Project Review

## Context
Portfolio project for an Anthropic SA (Creatives) role. AI photo culling tool using Claude Vision. Meant to demonstrate Claude API integration, structured outputs, creative-tool UX, and deep photographer workflow understanding.

## Current State
- **Next.js app**: Built and live at https://contact-sheet-three.vercel.app. `components/ContactSheet.tsx` drives the full workflow with focused components for grid, detail panel, export, compare, sessions, seed upload, sidebar, and profile controls.
- **AI workflow**: Cull remains the decision engine. The second pass is now **Develop Shortlist**, producing **Editor's Notes** rather than a competing score-first review.
- **Taste profiles**: Phase 1 local multi-profile support is merged: v2 localStorage collection migration, named local profiles, active-profile switching, profile-scoped favorites/profile regeneration, and correction scoping.
- **Hosted-key routes**: Free/pro server routes use the hosted Anthropic key and now have baseline shared server-side guardrails from the cleanup/security pass.

---

## What's Strong

### 1. Prompt Engineering (the best part of this project)
The prompts in `lib/prompts.ts` are genuinely excellent:
- Grounded in real photography frameworks (PPA 12 Elements, Feldman, Cartier-Bresson)
- Calibration anchors prevent score clustering — the anchored examples (flat landscape ~50, strong portrait ~82, once-in-a-lifetime ~94) are a smart technique
- "Pre-edit scoring" philosophy is a real insight — judging raw material differently than finished work is how real culling works
- Experience voice modifiers (Learning/Enthusiast/Pro) change tone without changing scoring — this is a great UX idea
- The voice is warm and specific ("artsy friend who's extremely skilled") rather than clinical

### 2. Two-Pass Architecture
The cull → Develop Shortlist pipeline is well-designed:
- Pass 1: 512px images, batches of 20, ~30-50 tokens/photo — fast and cheap
- Pass 2: 1024px, batches of 12, 200+ tokens/photo — selective and rich, focused on editorial direction
- Auto-selects HERO+SELECT for shortlist development — sensible default
- This mirrors how real photo editors work (quick pass, then finalize selects)

### 3. Zero-Dependency EXIF Parser
Reading EXIF from the ArrayBuffer BEFORE canvas resize (which strips metadata) is the right approach. No library dependency is a nice touch for a client-side tool.

### 4. Export System
XMP sidecars + organization scripts is genuinely useful for photographers. Never re-encodes photos. This shows real Lightroom workflow understanding.

### 5. JSON Truncation Repair
Pragmatic approach to handling max_tokens truncation — finds the last complete object and patches the JSON structure. Not elegant but it works.

---

## What Needs Work

### 1. Hosted-Key Route Hardening Follow-Up
Free/pro model routes spend the hosted Anthropic key. This branch added baseline shared request guards, which materially reduces the immediate exposure from oversized direct calls and repeated low-effort abuse. Remaining risk is production hardening rather than an unaddressed launch blocker.

**What remains**: Consider distributed rate limiting when traffic warrants it, add more route-level tests for guarded failure cases, and confirm platform body-size limits match the app's intended request envelope. BYOK direct-provider behavior stays unchanged.

### 2. Styling and Component Polish (Maintenance Problem)
The app has moved beyond the single-file artifact, but repeated visual patterns and dense tool surfaces still need periodic cleanup as features accumulate. Keep CSS variables and focused components aligned so the shipped UI stays maintainable.

### 3. BYOK and Hosted-Key Split Need Clear Product Framing
The app now supports both BYOK direct-provider use and hosted Free/Pro routes. That is practical, but the product story should stay clear: BYOK is local-user-key mode, while hosted-key routes are the public SaaS path with server guardrails and tier limits.

**What to do**: Keep route behavior and UI language explicit, and consider adding Claude-specific hosted features such as expanding or revisiting prompt caching where prompt stability allows.

### 4. Multi-Provider Dilutes the Story
You support Anthropic, OpenAI, and Gemini. For an Anthropic SA role, this:
- Splits development effort 3 ways
- Dilutes the Claude-specific narrative
- Misses the chance to showcase Claude-specific features (extended thinking, prompt caching, batch API, citations)

**What to consider**: Keep multi-provider as an option, but make Anthropic the clear star. Add Claude-specific features that the others can't do — e.g., use extended thinking for Develop Shortlist nuance, or expand or revisit prompt caching where prompt stability allows.

### 5. Incomplete Failure-Path UX and Recovery
The current app has user-facing error states for cull, Develop Shortlist, compare, restored-session limitations, unsupported files, and tier gates. That baseline is useful, but recovery is still thin when provider or route failures happen mid-workflow.

**What to do**: Add per-batch recovery so one failed batch does not kill the whole run, retry/backoff for provider and rate-limit failures, clearer route-guard/rate-limit messages, and tests for bad key, rate limit, and oversized batch paths.

### 6. Broaden Conventional Tests
The project now has unit and e2e coverage for scoring, exports, provider parsing, proxy payload splitting, tier gates, taste-library persistence, and the main mocked browser flow. Remaining high-value conventional tests include EXIF binary edge cases, raw-preview extraction, more API-route guard behavior, and failure-path UI states.

### 7. Model IDs May Be Stale
`types.ts` references `claude-sonnet-4-20250514`. Verify this is still the current model ID — model IDs change with releases.

---

## Priority Order for the Next Public Iteration

1. **Run Phase 1 production smoke** — verify multi-profile flows on the live Vercel app.
2. **Build Phase 2 persistence** — Clerk manifest plus private Vercel Blob sync for Pro taste profiles.
3. **Follow up on route guard hardening as needed** — add distributed rate limiting, confirm platform body limits, and broaden route handler tests.
4. **Add deterministic technical metrics** — blur, clipping, contrast, duplicate clusters, and EXIF risk flags.
5. **Improve failure-path recovery/retry UX** — add per-batch recovery, provider/rate-limit retry paths, and clearer guarded-route messages.

---

## Verification
- `npm run dev` and verify the full flow: upload photos → cull → Develop Shortlist → export
- Test with real photos (JPEG with EXIF data)
- Test error paths: bad API key, rate limiting, very large batch
- Test session persistence: analyze, refresh, restore session
- Test exports: XMP opens in Lightroom, org script runs correctly
