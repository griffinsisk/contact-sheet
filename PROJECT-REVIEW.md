# Contact Sheet — Project Review

## Context
Portfolio project for an Anthropic SA (Creatives) role. AI photo culling tool using Claude Vision. Meant to demonstrate Claude API integration, structured outputs, creative-tool UX, and deep photographer workflow understanding.

## Current State
- **lib/ layer**: Fully built — providers, prompts, API orchestration, EXIF parser, exports, storage, image pipeline, types. Solid code.
- **ProviderSetup.tsx**: Done — clean onboarding flow.
- **ContactSheet.tsx**: Does not exist. This is the entire UI of the app. The working prototype lives in `contact-sheet-artifact.jsx` (1617 lines, single-file), but none of it has been ported to the Next.js app.
- **Net result**: The app literally cannot render anything beyond the provider setup screen.

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
The cull → deep review pipeline is well-designed:
- Pass 1: 512px images, batches of 20, ~30-50 tokens/photo — fast and cheap
- Pass 2: 1024px, batches of 12, 200+ tokens/photo — selective and rich
- Auto-selects HERO+SELECT for deep review — sensible default
- This mirrors how real photo editors work (quick pass, then finalize selects)

### 3. Zero-Dependency EXIF Parser
Reading EXIF from the ArrayBuffer BEFORE canvas resize (which strips metadata) is the right approach. No library dependency is a nice touch for a client-side tool.

### 4. Export System
XMP sidecars + organization scripts is genuinely useful for photographers. Never re-encodes photos. This shows real Lightroom workflow understanding.

### 5. JSON Truncation Repair
Pragmatic approach to handling max_tokens truncation — finds the last complete object and patches the JSON structure. Not elegant but it works.

---

## What Needs Work

### 1. The App Doesn't Exist Yet (Critical)
`ContactSheet.tsx` is the entire app — photo grid, detail panel, toolbar, modals, drag-and-drop, phase management. It's referenced in `page.tsx` but doesn't exist. The lib layer is done but there's no UI to drive it. This is the only blocker between "collection of modules" and "working app."

**What to do**: Port the artifact's ~750 lines of UI code into proper React components. Don't try to port it as one monolith — break it into:
- `ContactSheet.tsx` — state machine + layout shell
- `PhotoGrid.tsx` — thumbnail grid with rating overlays
- `DetailPanel.tsx` — right-side analysis panel
- `Toolbar.tsx` — action bar (cull, review, export, filters)
- `CompareModal.tsx` — head-to-head comparison
- `ExportModal.tsx` — XMP/script/manifest export
- `EmptyState.tsx` — drop zone + session history
- `CullBanner.tsx` — post-cull CTA for deep review

### 2. All Inline Styles (Maintenance Problem)
Every component uses inline `style={{...}}` objects. The artifact does too, which made sense for a single-file prototype, but for a Next.js app this is painful to maintain and makes responsive design much harder. The `globals.css` has CSS variables defined but barely used.

**What to do**: Given this is a portfolio piece, Tailwind isn't strictly necessary — but at minimum, extract repeated style patterns into CSS modules or a shared style constants file. The rating colors, typography scales, and spacing are repeated dozens of times.

### 3. Client-Side API Keys Are a UX Risk
The BYOK model sends API keys directly from the browser using `anthropic-dangerous-direct-browser-access: true`. This works but:
- The header name itself ("dangerous") isn't great for a portfolio piece
- CORS issues are a real possibility depending on provider
- For an Anthropic SA role, you'd ideally demonstrate the proper server-side pattern

**What to do**: Add a Next.js API route (`/api/analyze`, `/api/compare`) that proxies requests. The key still comes from the client (BYOK), but the actual API call happens server-side. This removes the CORS issue and the "dangerous" header. It also lets you add prompt caching headers, which would be a great Anthropic-specific feature to demo.

### 4. Multi-Provider Dilutes the Story
You support Anthropic, OpenAI, and Gemini. For an Anthropic SA role, this:
- Splits development effort 3 ways
- Dilutes the Claude-specific narrative
- Misses the chance to showcase Claude-specific features (extended thinking, prompt caching, batch API, citations)

**What to consider**: Keep multi-provider as an option, but make Anthropic the clear star. Add Claude-specific features that the others can't do — e.g., use extended thinking for the deep review pass to get more nuanced analysis, or use prompt caching so the system prompt doesn't re-bill on every batch.

### 5. No Error Handling UX
The lib layer throws errors but there's no error boundary, retry logic, or user-facing error states. When an API call fails (rate limit, bad key, network error), the user will see... nothing, or a console error.

**What to do**: Add error states per batch (so one failed batch doesn't kill the whole run), retry with backoff for rate limits, and clear user-facing error messages.

### 6. No Tests
Zero test files. For a portfolio project targeting an engineering-adjacent role, at least having tests for the non-trivial logic would show rigor:
- EXIF parser (binary edge cases)
- JSON repair logic
- Score calculation (weighted composite)
- Export generation (XMP validity, script correctness)

### 7. Model IDs May Be Stale
`types.ts` references `claude-sonnet-4-20250514`. Verify this is still the current model ID — model IDs change with releases.

---

## Priority Order for Getting to "Demo-Ready"

1. **Build ContactSheet.tsx** — without this, nothing else matters
2. **Add server-side API route** — removes "dangerous" header, enables prompt caching
3. **Add prompt caching** — Claude-specific feature, great demo talking point
4. **Error handling UX** — the app needs to not break when things go wrong
5. **Extract styles** — at least the repeated patterns
6. **Tests for core logic** — EXIF parser, JSON repair, exports

---

## Verification
- `npm run dev` and verify the full flow: upload photos → cull → deep review → export
- Test with real photos (JPEG with EXIF data)
- Test error paths: bad API key, rate limiting, very large batch
- Test session persistence: analyze, refresh, restore session
- Test exports: XMP opens in Lightroom, org script runs correctly
