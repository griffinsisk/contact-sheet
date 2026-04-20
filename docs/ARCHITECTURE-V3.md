# Contact Sheet v3 — Architecture Deep-Dive

## Provider Adapter Pattern

The multi-provider system is the core technical differentiator. `lib/providers.ts` exports a single `callProvider()` function that accepts a unified message format and dispatches to the correct API.

### Unified Message Interface

```typescript
interface Message {
  system: string;        // System prompt (role varies by provider)
  images: ImagePart[];   // Array of { base64, mediaType }
  textParts: string[];   // Text interleaved with images (Photo labels + EXIF)
  maxTokens: number;     // Output token limit
}
```

### Per-Provider Formatting

**Anthropic:**
- System prompt goes in `system` field (top-level, not in messages)
- Images: `{ type: "image", source: { type: "base64", media_type, data } }`
- Requires headers: `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`
- Truncation: `stop_reason === "max_tokens"`

**OpenAI:**
- System prompt goes as `{ role: "system", content: "..." }` message
- Images: `{ type: "image_url", image_url: { url: "data:mime;base64,...", detail: "low" } }`
- `detail: "low"` used for cull pass to reduce token cost; consider `"auto"` for deep review
- Truncation: `choices[0].finish_reason === "length"`

**Gemini:**
- System prompt prepended as text in the content parts (Gemini's system instruction alternative)
- Images: `{ inlineData: { mimeType, data } }`
- API key goes as query parameter, not header
- Uses `responseMimeType: "application/json"` for structured output
- Truncation: `candidates[0].finishReason === "MAX_TOKENS"`

### JSON Parsing & Repair

`parseJSON()` handles:
1. Strip markdown fences (```json...```)
2. Standard JSON.parse
3. On failure + truncation detected: attempt `repairJSON()` which finds the last complete analysis object and closes the structure

## Data Flow

```
User uploads photos
  → Two FileReader passes per file:
      1. readAsArrayBuffer → readEXIF() → ExifData
      2. readAsDataURL → Image → canvas resize (1024px) → base64
  → Photo object: { id, base64, preview, name, dimensions, mediaType, exif }
  → Display thumbnails immediately

User clicks "CULL N PHOTOS"
  → Phase: "culling"
  → For each batch of 20:
      → downsizeForCull() → 512px base64 per photo
      → Build message: images + "[Photo N: filename | EXIF]" text parts
      → callProvider(config, CULL_PROMPT, message)
      → parseJSON → CullResult[] per photo
      → Progressive rendering: grid updates as batches complete
  → Auto-select HERO + SELECT into deepSelected set
  → Phase: "culled"
  → Auto-save session to localStorage

User toggles photos for deep review (add/remove from deepSelected)

User clicks "DEEP REVIEW N PHOTOS"
  → Phase: "reviewing"  
  → For each batch of 12 (from deepSelected indices only):
      → Use full 1024px base64
      → Build message with DEEP_REVIEW_PROMPT + EXPERIENCE_VOICE[level]
      → callProvider → DeepResult[] with full scores + written feedback
      → Progressive rendering
  → Set curatorialNotes, recommendedSequence
  → Phase: "reviewed"
  → Update session in localStorage

User clicks thumbnail → Detail panel opens (side panel, not overlay)
  → Shows DeepResult if available, falls back to CullResult
  → EXIF bar under image

User selects 2 for compare → Compare modal
  → callProvider with COMPARE_PROMPT
  → Shows pick + reasoning

User clicks Export
  → XMP sidecars: uses DeepResult if available (title, full critique), falls back to CullResult
  → Org scripts: can use either pass for folder sorting, rename uses deep titles
  → Manifest: includes all data from both passes + EXIF
```

## Component Hierarchy (Target)

```
ContactSheet (state orchestrator)
├── ProviderSetup (shown when no config saved)
├── Header
│   ├── Logo + tagline
│   ├── Stats (frame count, heroes, selects, reviewed count)
│   └── History button + Change Provider button
├── EmptyState (when no photos)
│   ├── Drop zone (drag-and-drop + file/folder pickers)
│   ├── Experience level selector
│   ├── Processing indicator (while resizing)
│   └── Previous sessions list (from localStorage)
├── Toolbar (when photos loaded)
│   ├── + Folder, + Files buttons
│   ├── Cull button / Re-cull button
│   ├── Deep Review button (with count from deepSelected)
│   ├── Export button
│   ├── Experience level toggle
│   ├── View toggle (grid/sequence)
│   ├── Sort buttons (original/score + dimension sorts when deep data exists)
│   ├── Filter buttons (ALL/HERO/SELECT/MAYBE/CUT)
│   └── Compare button (when 2 selected)
├── CullBanner (phase === "culled")
│   ├── Count of auto-selected photos
│   ├── Instructions ("toggle any photo's REVIEW badge")
│   └── Deep Review CTA button
├── ContentArea (flex row)
│   ├── GridPanel (flex: 1, scrollable)
│   │   ├── PhotoGrid
│   │   │   └── Thumbnail[] 
│   │   │       ├── Image with rating badge + score overlay
│   │   │       ├── EXIF line
│   │   │       ├── Title or cull reason
│   │   │       ├── Sub-score bars (if deep data)
│   │   │       ├── Compare checkbox
│   │   │       └── Deep review toggle (phase === "culled")
│   │   └── CuratorialNotes
│   └── DetailPanel (420px, sticky, right side)
│       ├── Close button
│       ├── Full image
│       ├── EXIF bar (settings + camera/lens)
│       ├── Rating badge + score
│       ├── Title (if deep)
│       ├── Four dimension score bars (if deep)
│       ├── Technical feedback (if deep)
│       ├── Style & Story feedback (if deep)
│       ├── Verdict (if deep)
│       ├── Cull reason (if only cull data)
│       └── Framework attribution
├── CompareModal
├── ExportModal
│   ├── XMP sidecars section
│   ├── Org script section (with rename toggle + preview)
│   └── Manifest section
└── SessionHistory modal
```

## Phase State Machine

```
"empty"      → user has no photos loaded
     ↓ (upload files)
"uploading"  → photos are in the grid, not yet analyzed
     ↓ (click Cull)
"culling"    → API calls in progress, progressive rendering
     ↓ (all batches complete)
"culled"     → cull results shown, deep review selection available
     ↓ (click Deep Review)
"reviewing"  → deep review API calls in progress
     ↓ (all batches complete)
"reviewed"   → full results shown, all features available
```

Users can also:
- Add more photos at any phase → stays in current phase but new photos are unanalyzed
- Re-cull from "culled" or "reviewed" → resets to "culling"
- Restore a session → jumps to "culled" or "reviewed" depending on saved data

## Session Storage Schema

```
localStorage keys:
  "cs-provider-config"  → { provider, apiKey, model }
  "cs-session-index"    → SessionSummary[] (last 20)
  "cs-session:{uuid}"   → SessionData:
    {
      id, date, photoCount, heroCount, selectCount, level, hasDeepReview,
      cullResults: Record<number, CullResult>,
      deepResults: Record<number, DeepResult>,
      curatorialNotes: string | null,
      recommendedSequence: number[] | null,
      photos: [{ name, width, height, thumb (160px base64), exif }]
    }
```

## Export System Details

### XMP Priority
If a photo has deep review data, the XMP gets the rich data (title as headline, full critique as description). If only cull data, it gets the star rating and cull reason as description. This means exports work at either pass.

### Org Script Rename Logic
```
Original: DSC_0042.jpg
Deep title: "The Last One Waiting"
Sanitized: the_last_one_waiting
Result: the_last_one_waiting__DSC_0042.jpg
```

For sequence folder (number prefix provides ordering, so no need for original name suffix):
```
001_the_last_one_waiting.jpg
```

Falls back to cull reason if no deep title available.

### Cross-Platform Scripts
- Unix: `#!/bin/bash`, `mkdir -p`, `cp`
- Windows: `@echo off`, `mkdir`, `copy`
- Both use double-quoted paths for filenames with spaces
