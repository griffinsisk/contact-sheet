# Contact Sheet v3 — Conversation Context & Decision Log

This captures the key decisions and pivots made across the full design conversation. Read this to understand WHY things are the way they are.

---

## The Portfolio Angle

Griffin is targeting a Solutions Architect, Applied AI (Creatives) role at Anthropic. The project needs to demonstrate deep platform understanding, creative-tool UX thinking, and real workflow awareness. The artifact-first approach proved the concept; the Next.js version is the deployable product.

---

## UX Iteration History

### v1 → v2: Layout & Navigation
- **Detail panel moved from overlay to persistent side panel** (420px right column). The overlay pattern blocked the grid — photographers need to see scores while reading feedback. The side-by-side layout mirrors Lightroom's library module.
- **Empty state now shows session history.** Returning users couldn't access previous sessions from the landing page — they had to upload photos first to see the History button. Now the last 5 sessions show directly below the drop zone.
- **Keyboard navigation added.** Arrow keys navigate the grid, Enter/Space to select, Escape to close panels. Focus-visible ring for keyboard users. All interactive elements have tabIndex, role, aria-label.
- **Restored session clarity.** A banner explains what's available ("Scores and feedback preserved. Re-upload originals to re-analyze or compare."). Compare mode shows a clear message instead of silently failing.

### v2 → v3: Two-Pass Architecture
The biggest pivot. The original design gave every photo a full editorial critique — 4 dimension scores, written title, technical paragraph, style paragraph, verdict. This was:
- **Too slow** for large batches (200+ photos = 17 API calls at 12 per batch)
- **Too expensive** (every photo gets ~200 output tokens)
- **Wrong for the workflow** (nobody reads 200 detailed critiques — they want the pile sorted)

**The two-pass cull/deep review model** emerged from Griffin's insight: "They just want to dump a shit ton of photos... and the organization to help them out, with some understanding of why the prioritization took place."

### File Renaming
Griffin asked about renaming photos in the org script. Camera filenames (DSC_0042.jpg) are meaningless. The AI-generated titles become actual filenames with the original preserved as suffix: `the_last_one_waiting__DSC_0042.jpg`. Toggle in export modal with live preview.

### Pre-Edit Scoring
Griffin's key question: "How do we handle scoring... it's more judging composition and the potential of the image, not necessarily how it's color-graded or how it looks pre-editing."

This reframed the entire Technical Excellence dimension. The prompt now explicitly says "you're evaluating BEFORE post-processing" and instructs the model to score recoverable exposure, dynamic range, focus accuracy — things that can't be fixed in post — while ignoring flat contrast, muted colors, and lack of grading.

---

## The Cost & Access Problem

### Why Not Subscription OAuth?
Griffin asked: "When I use Claude plugin in VSCode I don't need an API key, I just auth to Claude." Research confirmed: Anthropic blocked third-party OAuth in early 2026. Claude Code's OAuth is exclusive to Anthropic's own products. No third-party app can use "Sign in with Claude" for API access.

### Why BYOK?
Griffin's concern: "It's annoying for users because they already pay for ChatGPT or Claude and now they have to pay additional credits." This is the fundamental tension in the AI app ecosystem. The options discussed:

1. **BYOK** — user enters API key. Clean for developers, friction for photographers.
2. **Freemium with Stripe** — free tier (your key, rate-limited), paid tier for unlimited.
3. **You absorb cost** — $5/month subscription, you proxy API calls.

Decision: **Start with BYOK**, add monetization later. BYOK is the fastest path to a deployed product. The onboarding flow minimizes friction: provider cards, direct links to key pages, format validation, security messaging.

### Multi-Provider Strategy
Supporting Anthropic + OpenAI + Gemini broadens the audience. Many photographers already have an OpenAI account. Gemini has a generous free tier. The provider adapter (`lib/providers.ts`) makes this a clean abstraction — same prompts, different request formatting.

---

## Scoring Framework Research

From the original sessions, still relevant:

1. **PPA 12 Elements** — industry gold standard, already uses 0-100 scale. PPA's four core dimensions (Impact, Technical, Composition, Style) became our four-dimension model.
2. **Feldman's Method** (Description → Analysis → Interpretation → Judgment) — judgment comes last, after descriptive work. The prompt follows this progression.
3. **Cartier-Bresson's Decisive Moment** — "simultaneous recognition of an event's significance and the precise organization of forms." Grounds the Style & Story dimension.

Weights: Impact 30%, Composition 30%, Technical 20%, Style & Story 20%. Impact and Composition drive curation decisions; Technical and Style serve them.

---

## Voice Design

Three iterations reached the current "warm expert friend" voice:
1. v1 "Generic expert" → vague, flattering
2. v2 "Formal PPA juror" → rigorous but cold
3. v3 "Warm expert friend" → same framework, but speaks like someone who actually shoots

**Why this matters:** Artists already have bias against AI. The tool earns trust by using vocabulary photographers recognize (PPA), being specific about what it sees in each frame (not abstractions), and being honest without being clinical.

---

## Export Design — The Quality Loss Question

Griffin's critical question: "Would exporting organized folders result in quality loss?" Yes — in-memory images are resized. This killed the ZIP-of-images approach. Solution: never touch originals. Generate XMP sidecars (metadata), organization scripts (copy commands), and manifests (text reports). This respects the photographer's existing workflow — they don't re-import from a different source.

---

## Token Budget & Batch Sizing

### Cull Pass
- 512px images → ~500-800 input tokens per image
- 20 images per batch → ~10,000-16,000 input tokens
- ~30-50 output tokens per photo × 20 = ~600-1000 output tokens
- max_tokens: 4096 (generous ceiling)

### Deep Review
- 1024px images → ~1000-1600 input tokens per image
- 12 images per batch → ~12,000-19,000 input tokens
- ~200+ output tokens per photo × 12 = ~2400+ output tokens
- max_tokens: 16384 (needed for full feedback across 12 photos)

### Compare
- 2 images at 1024px → ~2000-3200 input tokens
- max_tokens: 1000

### The 4096 Truncation Bug
The original artifact used max_tokens: 4096 for ALL calls. With 12 photos getting full deep review feedback, this wasn't enough — the response got cut off mid-JSON. Fixed by bumping to 16384 for deep review and adding JSON repair for truncated responses.

---

## Technical Decisions

### Why Client-Side API Calls (No Server Proxy)
For BYOK, there's no reason to route through a server. The user's key goes directly to the provider from their browser. This means:
- No server infrastructure needed
- No key handling liability  
- Vercel deployment is pure static + client JS
- Provider CORS policies are the constraint (Anthropic requires `anthropic-dangerous-direct-browser-access` header)

### Why localStorage (Not a Database)
Sessions are per-device, which is fine for this use case. No user accounts means no server-side storage needed. Mini thumbnails (160px, ~15-30KB) are stored for display; original base64 is too large. Trade-off accepted: restored sessions can view scores but need re-upload for re-analysis.

### Why a Minimal EXIF Parser (Not a Library)
Running in the browser without npm in the artifact environment. The parser reads only the tags we need (ISO, aperture, shutter, focal length, make, model, lens) from the JPEG APP1/TIFF IFD structure. For the Next.js version, a library like `exifr` could replace it, but the custom parser is lightweight and dependency-free.
