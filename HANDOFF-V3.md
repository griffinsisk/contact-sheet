# Contact Sheet v3 — Project Handoff

## What This Is

Contact Sheet is an AI-powered photo culling and analysis tool for photographers. Upload hundreds of photos straight from your camera, get them sorted into keepers and cuts in seconds, then go deep on your best frames with full editorial critique.

This is a **portfolio project** targeting a Solutions Architect, Applied AI (Creatives) role at Anthropic. It should demonstrate: multi-provider Vision API integration, structured outputs, polished creative-tool UX, and a real photographer's workflow understanding.

## Current State

Two artifacts exist:

1. **`contact-sheet-artifact.jsx`** — A working single-file React artifact that runs inside Claude's artifact environment. Fully functional prototype with the complete two-pass architecture. Use this as the interactive reference spec.

2. **`/app`, `/lib`, `/components`** — A partially scaffolded Next.js project. The entire lib layer is complete (types, providers, prompts, EXIF, resize, storage, exports, constants, API orchestration). The ProviderSetup component is done. **What's missing: the main `ContactSheet.tsx` component and a few remaining UI components.**

## Architecture — Two-Pass Cull/Deep Review

This is the core design decision. Photographers dump hundreds of photos and want fast triage, not a 10-minute wait for detailed essays on every frame.

### Pass 1 — Cull (fast, cheap, high volume)
- Images downsized to **512px** (half the tokens vs full size)
- Batches of **20 photos** per API call
- Each photo gets: score (0-100), rating tier (HERO/SELECT/MAYBE/CUT), one-line reason
- Output tokens per photo: ~30-50 (minimal)
- This is the "sort my SD card" mode

### Pass 2 — Deep Review (rich, selective)
- Only runs on **user-selected photos** (auto-selects HERO + SELECT after cull, user can toggle any photo in/out)
- Full **1024px** images
- Batches of **12 photos** per API call  
- Each photo gets: four-dimension scores (Impact/Composition/Technical/Style & Story), evocative title, written technical critique, style & story critique, verdict
- Also produces: curatorial notes for the set, recommended narrative sequence
- Output tokens per photo: ~200+ (rich)

### Why This Matters
- 200 photos culled in ~90 seconds, maybe $0.10 in API cost
- Deep review on 20 selects adds another ~30 seconds, ~$0.05
- Total: under $0.20 for a full session vs $1-2 if every photo got the full treatment
- Users can skip deep review entirely if they just need the sort

## Multi-Provider BYOK

Users bring their own API key. No server-side key, no billing infrastructure needed.

### Supported Providers

| Provider | Models | Auth | Image Format |
|----------|--------|------|-------------|
| **Anthropic** | Claude Sonnet 4 | `x-api-key` header + `anthropic-version` header + `anthropic-dangerous-direct-browser-access` header | `{ type: "image", source: { type: "base64", media_type, data } }` |
| **OpenAI** | GPT-4o, GPT-4o Mini | `Authorization: Bearer` header | `{ type: "image_url", image_url: { url: "data:mime;base64,..." } }` |
| **Google Gemini** | Gemini 2.5 Flash, Gemini 2.5 Pro | API key as query param | `{ inlineData: { mimeType, data } }` |

### Provider Adapter Pattern

`lib/providers.ts` has a unified `callProvider()` function that takes a provider name, API key, model, and a message object, then formats the request correctly for each provider. The prompts are model-agnostic — only the request/response shape changes.

All API calls go **directly from the browser to the provider** — no server proxy needed. Keys live in localStorage, never touch any server.

### Onboarding Flow

`components/ProviderSetup.tsx` is a clean setup screen:
1. Pick provider (3 cards: Anthropic, OpenAI, Google)
2. Pick model (if provider has multiple)
3. Enter API key (with show/hide toggle, format validation)
4. Direct link to each provider's API key page
5. Security note: "stored locally, sent directly to provider, never to our servers"

## EXIF Extraction

`lib/exif.ts` is a zero-dependency JPEG EXIF parser that reads camera settings at upload time.

### What It Extracts
- ISO, aperture (f-stop), shutter speed, focal length
- Camera make & model, lens model
- Focal length in 35mm equivalent, flash status

### Where EXIF Shows Up
1. **Thumbnails** — compact line: `ISO 800 · 35mm · f/1.8 · 1/125s`
2. **Detail panel** — full bar with camera + lens info
3. **API calls** — passed as text alongside each image: `[Photo 3: DSC_0042.jpg | ISO 800, 35mm, f/1.8, 1/125s, Fuji X-T5]`
4. **Manifest export** — settings and camera info per photo

### Why It's Sent to the API
Claude can factor shooting conditions into its technical assessment: "at f/1.4 some softness is expected" or "at 1/30s handheld, this level of sharpness is impressive." Makes the pre-edit scoring smarter.

### Implementation Note
EXIF must be read from the original file bytes (ArrayBuffer) BEFORE canvas resizing, because canvas.toDataURL strips all metadata. The `resizeImage()` function does two FileReader passes: ArrayBuffer for EXIF, then DataURL for the Image element.

## Pre-Edit Scoring Philosophy

**Critical design decision:** This tool evaluates photos BEFORE post-processing. It's a culling tool, not a final-print critique.

### What This Means for the Prompts
- **Technical scoring evaluates raw material**: Is focus nailed? Is there dynamic range to work with? Is the exposure recoverable? NOT "are the colors graded well"
- **Don't penalize unedited look**: Flat contrast, muted colors, slight underexposure are fine — that's what Lightroom is for
- **Positive framing for raw files**: "Plenty of tonal range to work with" not "colors feel muddy"
- **Camera settings matter**: A slightly dark exposure with preserved highlights is BETTER raw material than a blown-out bright frame

### Scoring Framework
Based on PPA 12 Elements, Feldman's critical method, Cartier-Bresson's decisive moment:

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| Impact | 30% | Gut reaction — did it stop you? |
| Composition | 30% | Eye flow, geometry, negative space |
| Technical | 20% | Focus, dynamic range, light quality (raw potential) |
| Style & Story | 20% | Decisive moment, narrative, authenticity |

### Rating Tiers
| Rating | Score | Stars (XMP) | Meaning |
|--------|-------|-------------|---------|
| HERO | 85-100 | 5★ | Portfolio / gallery wall |
| SELECT | 70-84 | 4★ | Publishable, worth developing |
| MAYBE | 50-69 | 2★ | Something there, not fully realized |
| CUT | 0-49 | 1★ | Move on |

### Experience Levels (Voice Modifiers)
Same scoring across all levels — only written feedback adapts:
- **Learning**: Explains every concept in context, connects to actionable advice
- **Enthusiast**: Conversational, names techniques without over-explaining
- **Pro**: Full technical shorthand, no hand-holding

## Export System

### Design Principle: Never Touch Originals

All exports generate metadata or scripts that work alongside the photographer's original files. No re-encoding, no quality loss.

### XMP Sidecars
- One `.xmp` file per analyzed photo
- Star ratings mapped from tier (HERO=5★, SELECT=4★, MAYBE=2★, CUT=1★)
- Color labels (Winner, Second, Approved, Rejected)
- Title (from deep review), description (full critique), keywords
- Lightroom/Bridge/Capture One read these automatically

### Organization Scripts
- `.sh` (Mac/Linux) or `.bat` (Windows)
- Creates `organized/by_rating/` folders (01_heroes, 02_selects, etc.)
- Creates `organized/sequence/` folder with numbered files
- Uses `cp` only — never moves or deletes
- **Rename option**: copies with AI-generated title names, original filename preserved as suffix for traceability (`the_last_one_waiting__DSC_0042.jpg`)

### Analysis Manifest
- Plain text report with all scores, EXIF data, and feedback
- Usable as standalone reference

## File Structure

```
contact-sheet/
├── app/
│   ├── layout.tsx              # Root layout, metadata, font imports
│   ├── page.tsx                # Client component wrapper (dynamic import, ssr: false)
│   └── globals.css             # Design system — CSS variables, fonts, animations
├── components/
│   ├── ContactSheet.tsx        # ⚠️ NEEDS TO BE BUILT — main app component
│   │                           # Port from contact-sheet-artifact.jsx
│   │                           # Should import from lib/ modules instead of inline
│   └── ProviderSetup.tsx       # BYOK onboarding — provider selection, key input
├── lib/
│   ├── types.ts                # All TypeScript interfaces, provider info config
│   ├── providers.ts            # Multi-provider adapter (Anthropic, OpenAI, Gemini)
│   ├── api.ts                  # Cull, deep review, compare orchestration
│   ├── prompts.ts              # All system prompts + experience voice modifiers
│   ├── exif.ts                 # EXIF parser + formatters
│   ├── resize.ts               # Image resize (1024px), downsize for cull (512px), thumbnails
│   ├── storage.ts              # localStorage: provider config + session persistence
│   ├── exports.ts              # XMP sidecar, org script, manifest generators
│   └── constants.ts            # Rating config, score dimensions, batch sizes
├── contact-sheet-artifact.jsx  # Working prototype — use as reference spec
├── package.json
├── tsconfig.json
└── next.config.js
```

## What Needs to Be Built

### 1. `components/ContactSheet.tsx` (the big one)

Port the main component from `contact-sheet-artifact.jsx`. It contains:

- **State management**: photos, cullResults, deepResults, deepSelected set, phase tracking, UI state
- **Phase machine**: empty → uploading → culling → culled → reviewing → reviewed
- **File handling**: drag-and-drop (including folder recursion via webkitGetAsEntry), file picker, folder picker
- **Toolbar**: all the action buttons, view/sort/filter toggles, experience level selector
- **Photo grid**: thumbnails with rating badges, scores, EXIF lines, compare checkboxes, deep review toggles
- **Detail panel**: persistent right-side panel (420px) with full analysis, EXIF bar, score bars
- **Cull banner**: appears after cull with count of auto-selected photos, CTA to deep review
- **Compare modal**: side-by-side with API comparison call
- **Export modal**: XMP, org scripts (with rename toggle + preview), manifest
- **Session history modal**: list of previous sessions, restore/delete
- **Empty state**: drop zone, experience selector, previous sessions list

Key difference from the artifact: instead of inline API calls and utility functions, import everything from `lib/`:
```tsx
import { runCull, runDeepReview, runCompare } from "@/lib/api";
import { resizeImage, makeThumb } from "@/lib/resize";
import { loadProviderConfig, saveProviderConfig, loadSessionIndex, saveSession, loadSession, deleteSession } from "@/lib/storage";
import { generateXMP, generateOrgScript, generateManifest, downloadFile, sanitizeFilename } from "@/lib/exports";
import { formatExifLine, formatExifCamera } from "@/lib/exif";
import { RATING_CONFIG, SCORE_DIMENSIONS } from "@/lib/constants";
```

Also needs to integrate `ProviderSetup` — show it when no provider config is saved, with a "Change provider" option in the header/settings.

### 2. Consider Extracting Sub-Components

The artifact has everything in one file. For the Next.js version, consider splitting:
- `components/Thumbnail.tsx`
- `components/DetailPanel.tsx`
- `components/CompareModal.tsx`
- `components/ExportModal.tsx`
- `components/SessionHistory.tsx`
- `components/CuratorialNotes.tsx`
- `components/Toolbar.tsx`

This is optional — a single large `ContactSheet.tsx` works fine, but decomposition makes it easier to iterate on individual pieces.

### 3. README.md

```markdown
# Contact Sheet — AI Photo Editor

Upload your photos. Get an expert edit.

## Quick Start

npm install
npm run dev

## Setup

No server-side API key needed. On first visit, pick your AI provider 
(Anthropic, OpenAI, or Google) and enter your API key. It's stored 
in your browser — never sent to our servers.

## Deploy

vercel --prod
```

## Design System

### Fonts
- **Display**: Instrument Serif (headings, titles, curatorial notes)
- **Mono**: DM Mono (labels, scores, metadata, EXIF, buttons)
- **Body**: DM Sans (descriptions, feedback text)

### Color System
Defined as CSS variables in `globals.css`. The rating colors (gold/green/gray/red) are the primary accent system. Dark background (#0a0a0a) with very subtle borders (rgba white at 0.06).

### Key UI Patterns
- Sticky header with blur backdrop
- Persistent side detail panel (not overlay) — 420px right column
- Monospace uppercase labels at 9-10px for section headers
- Thumbnail grid with 1:1 aspect ratio, object-fit cover
- Score bars with dimension colors
- Rating badges with colored borders
- Focus-visible ring (gold) for keyboard nav

## Deployment

### Vercel (recommended)
```bash
npm install
vercel --prod
```

No environment variables needed — all API keys come from the user's browser.

### Key Vercel Settings
- Framework: Next.js (auto-detected)
- Build command: `next build`
- Output directory: `.next`
- No serverless functions needed — everything runs client-side

## Session Persistence

Sessions are stored in localStorage with this schema:
- `cs-provider-config` → `{ provider, apiKey, model }`
- `cs-session-index` → array of session summaries (last 20)
- `cs-session:{uuid}` → full session data including cull results, deep results, curatorial notes, sequence, mini thumbnails (160px), EXIF data

Restored sessions show scores and thumbnails but can't re-analyze or compare without re-uploading originals (base64 data is too large to persist).

## Testing Priorities

1. **Cull accuracy**: Upload 20+ diverse photos, verify scores span the full range and don't cluster
2. **EXIF extraction**: Test with photos from different cameras — DSLR, mirrorless, phone
3. **Multi-provider parity**: Same photos through Anthropic, OpenAI, Gemini — scores should be roughly comparable
4. **Large batches**: 50+ photos — verify batching works, progress shows, no timeouts
5. **Deep review quality**: Verify Learning mode explains concepts, Pro mode uses shorthand
6. **Export integrity**: XMP files should load in Lightroom, org scripts should run without errors
7. **Session restore**: Analyze, close browser, reopen — scores and thumbnails should persist
