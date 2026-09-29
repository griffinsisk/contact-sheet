# Contact Sheet v3 — Project Handoff

## What This Is

Contact Sheet is an AI-powered photo culling and analysis tool for photographers. Upload hundreds of photos straight from your camera, get them sorted into keepers and cuts in seconds, then go deep on your best frames with full editorial critique.

This is a **portfolio project** targeting a Solutions Architect, Applied AI (Creatives) role at Anthropic. It should demonstrate: deep Claude Vision integration, structured outputs, polished creative-tool UX, and a real photographer's workflow understanding.

## Current State

The Next.js app is built and live in production at https://contact-sheet-three.vercel.app. The current component tree includes `components/ContactSheet.tsx`, focused UI components for the grid/detail/modals/sidebar, and server routes for hosted-key free/pro model calls.

Phase F reframed the second pass from Deep Review to **Develop Shortlist** with **Editor's Notes** output. Phase 1 local multi-profile taste profiles is merged on `main`: local v2 taste-library collections, named profiles, active-profile switching at cull time, per-profile favorites/profile regeneration, and profile-scoped corrections.

The cleanup/security pass added shared request guardrails for hosted-key routes. The latest closeout fix also made cull completion resilient to omitted model indices and changed folder export to create one contained delivery package with photo + `.xmp` pairs.

**Anthropic-only migration (2026-06-01, PR #7 merged to `main`):** The OpenAI and Gemini provider paths were removed — the app now targets Claude exclusively. The Sonnet model ID was updated from the deprecated `claude-sonnet-4-20250514` to `claude-sonnet-4-6` across the hosted routes, scripts, and the BYOK catalog. The model is selected via `process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6"`; the **Vercel env var `ANTHROPIC_MODEL` overrides the code default** and is set to `claude-sonnet-4-6` across Production/Preview/Development. Live `npm run eval:ai` over the fixture set passed 8/8 on Sonnet 4.6 after recalibrating the (gitignored) eval bands.

The next product phase is persistent Pro taste profiles: Clerk manifest, private Vercel Blob collection storage, private image upload/resolve/delete routes, and local-to-server migration. This is documented in `docs/superpowers/specs/2026-05-05-persistent-multi-profile-design.md`.

## Architecture — Two-Pass Cull/Develop Shortlist

This is the core design decision. Photographers dump hundreds of photos and want fast triage, not a 10-minute wait for detailed essays on every frame.

### Pass 1 — Cull (fast, cheap, high volume)
- Images downsized to **512px** (half the tokens vs full size)
- Batches of **20 photos** per API call
- Each photo gets: score (0-100), rating tier (HERO/SELECT/MAYBE/CUT), one-line reason
- Output tokens per photo: ~30-50 (minimal)
- This is the "sort my SD card" mode

### Pass 2 — Develop Shortlist (rich, selective)
- Only runs on **user-selected photos** (auto-selects HERO + SELECT after cull, user can toggle any photo in/out)
- Full **1024px** images
- Batches of **12 photos** per API call  
- Each photo gets: editorial role, edit direction, crop/composition guidance, written critique, verdict, and a secondary editor's score
- Also produces: Editor's Notes for the set and recommended narrative sequence
- Output tokens per photo: ~200+ (rich)

### Why This Matters
- 200 photos culled in ~90 seconds, maybe $0.10 in API cost
- Develop Shortlist on 20 selects adds another ~30 seconds, ~$0.05
- Total: under $0.20 for a full session vs $1-2 if every photo got the full treatment
- Users can skip Develop Shortlist entirely if they just need the sort

## BYOK (Bring Your Own Key)

Users can bring their own Anthropic API key. This mode needs no server-side key or billing infrastructure.

The shipped app also has hosted-key Free/Pro routes for users who do not bring their own key. Those routes are guarded by the shared cleanup/security pass; BYOK remains the direct-provider path.

### Provider

The app is **Anthropic-only** as of 2026-06-01 (OpenAI and Gemini were removed — see Current State).

| Provider | Model | Auth | Image Format |
|----------|-------|------|-------------|
| **Anthropic** | Claude Sonnet 4.6 (`claude-sonnet-4-6`) | `x-api-key` header + `anthropic-version` header + `anthropic-dangerous-direct-browser-access` header (browser/BYOK only) | `{ type: "image", source: { type: "base64", media_type, data } }` |

The override-description helper route uses `claude-haiku-4-5-20251001`.

### Provider Adapter

`lib/providers.ts` exposes a `callProvider()` function (provider, API key, model, message object) that builds the Anthropic Messages request. The `Provider` type is now the single member `"anthropic"`; the `switch` is kept as a seam for adding Claude-specific behavior (batch API, extended thinking) later. The `cacheSystem` flag wraps the system prompt in an ephemeral prompt-cache block on the server-side path.

BYOK API calls go **directly from the browser to the provider** — no server proxy needed. Keys live in localStorage, never touch any server.

### Onboarding Flow

`components/ProviderSetup.tsx` is a clean setup screen (Anthropic-only — the picker renders a single card):
1. Enter API key (with show/hide toggle, `sk-ant-` format validation)
2. Direct link to the Anthropic Console API-keys page
3. Security note: "stored locally, sent directly to provider, never to our servers"

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
- Title and editorial metadata from Develop Shortlist, description/critique, keywords
- Keywords include `ContactSheet`, the final rating, `Score:<score>`, and `HumanOverride` when the user corrected the AI rating
- Lightroom/Bridge/Capture One read these automatically

### Folder Export Package
- Primary export creates `contact-sheet-export-YYYY-MM-DD-HHMMSS/` inside the chosen destination
- Files are copied into `by_rating/01_heroes`, `02_selects`, `03_maybes`, and `04_cuts`
- Each copied original has its matching `.xmp` sidecar next to it, so catalog apps can import the pair together
- If a sequence exists, `sequence/` contains numbered photo copies with matching sidecars
- The separate `XMP SIDECARS ONLY` download remains for manual sidecar placement next to originals

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
│   ├── globals.css             # Design system — CSS variables, fonts, animations
│   └── api/                    # Hosted-key model routes and billing/webhook routes
├── components/
│   ├── ContactSheet.tsx        # Main workflow shell and state machine
│   ├── Header.tsx              # Top-level app controls
│   ├── Sidebar.tsx             # Tier/profile/sidebar controls
│   ├── PhotoGrid.tsx           # Thumbnail grid, overlays, selection controls
│   ├── DetailPanel.tsx         # Persistent analysis/editor notes panel
│   ├── CullBanner.tsx          # Post-cull CTA and summary
│   ├── CompareModal.tsx        # Side-by-side comparison
│   ├── ExportModal.tsx         # XMP, org scripts, manifest export
│   ├── SessionsModal.tsx       # Session history and restore
│   ├── SeedUploadModal.tsx     # Taste-profile seed uploads
│   ├── EmptyState.tsx          # Drop zone and first-run state
│   └── ProviderSetup.tsx       # BYOK onboarding — provider selection, key input
├── lib/
│   ├── types.ts                # TypeScript interfaces and provider info config
│   ├── providers.ts            # Anthropic Messages adapter (callProvider) + JSON repair
│   ├── api.ts                  # Cull, develop shortlist, compare orchestration
│   ├── prompts.ts              # System prompts + experience voice modifiers
│   ├── exif.ts                 # EXIF parser + formatters
│   ├── resize.ts               # Image resize, downsize for cull, thumbnails
│   ├── storage.ts              # localStorage: provider config + session persistence
│   ├── taste-library.ts        # Local multi-profile taste profile state
│   ├── request-guards.ts       # Shared hosted-key route guard helpers
│   ├── exports.ts              # XMP sidecar, org script, manifest generators
│   └── constants.ts            # Rating config, score dimensions, batch sizes
├── package.json
├── tsconfig.json
└── next.config.ts
```

## What Needs to Be Built Next

### 1. Production Smoke for Phase 1

- Create a new named profile and confirm typing does not lose focus.
- Seed the new profile and confirm View Profile shows favorites under that profile, not `My Profile`.
- Switch between profiles in the modal and at cull time.
- Cull once with each active profile and confirm the selected profile influences request/profile context.
- Star and correct a frame, then confirm View Profile only shows signals for the active profile.
- Export a small culled set and confirm the contained `contact-sheet-export-*` folder has photo + `.xmp` pairs under `by_rating/`.

### 2. Persistent Multi-Profile Taste Profiles

Build the Phase 2 persistence layer from `docs/superpowers/specs/2026-05-05-persistent-multi-profile-design.md`:

- Clerk `tasteProfileManifest`.
- Private Vercel Blob collection JSON at `taste/{clerkUserId}/collection.json`.
- Private image upload, resolve, and delete routes.
- Pro sync and local-to-server migration.
- Conflict handling with `updatedAt`.

### 3. Deterministic/Measured Photo Analysis

Add browser-side measured facts such as blur score, clipping, contrast, perceptual hashes, duplicate clusters, and EXIF risk flags before feeding those facts into cull prompts.

## Local Development

```bash
npm install
npm run dev
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

BYOK works with user-supplied browser keys. Hosted Free/Pro model routes require the production environment variables used by the deployed app.

### Key Vercel Settings
- Framework: Next.js (auto-detected)
- Build command: `next build`
- Output directory: `.next`
- Serverless API routes handle hosted-key cull, develop shortlist, compare, taste-profile, and override-description calls
- **`ANTHROPIC_MODEL`** env var (Production/Preview/Development) selects the model and overrides the code default — currently `claude-sonnet-4-6`. Changing the model in code alone is inert in prod unless this var is updated or removed. Env-var changes only take effect on a redeploy.

## Session Persistence

Sessions are stored in localStorage with this schema:
- `cs-provider-config` → `{ provider, apiKey, model }`
- `cs-session-index` → array of session summaries (last 20)
- `cs-session:{uuid}` → full session data including cull results, Develop Shortlist results, curatorial notes, sequence, mini thumbnails (160px), EXIF data
- `cs-taste-libraries` → v2 local multi-profile taste library collection

Restored sessions show scores and thumbnails but can't re-analyze or compare without re-uploading originals (base64 data is too large to persist).

## Testing Priorities

1. **Cull accuracy**: Upload 20+ diverse photos, verify scores span the full range and don't cluster
2. **EXIF extraction**: Test with photos from different cameras — DSLR, mirrorless, phone
3. **Cull calibration on Sonnet 4.6**: `npm run eval:ai` over the fixture set should pass; watch boundary cases when changing model or prompts (eval bands are calibrated to 4.6's score distribution)
4. **Large batches**: 50+ photos — verify batching works, progress shows, no timeouts
5. **Develop Shortlist quality**: Verify Editor's Notes, role, edit direction, sequencing, and Pro/Learning voice
6. **Export integrity**: XMP files should load in Lightroom, org scripts should run without errors
7. **Session restore**: Analyze, close browser, reopen — scores and thumbnails should persist
