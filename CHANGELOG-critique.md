# Contact Sheet V3 — Critique Fix Log

Tracking all changes from the 2026-04-14 UX critique. Build verified clean after all changes.

---

## P0 — Accessibility

### CompareModal.tsx
- [x] Added `aria-label="Close comparison"` to close button
- [x] Added `onKeyDown` Escape handler + auto-focus to close modal on Escape

### ExportModal.tsx
- [x] Added `aria-label="Close export"` to close button
- [x] Added `onKeyDown` Escape handler + auto-focus to close modal on Escape

### DetailPanel.tsx
- [x] Added `aria-label="Close detail panel"` to close button

### CullBanner.tsx
- [x] Added `aria-label` to deep review button (includes photo count)

### ContactSheet.tsx
- [x] Added `aria-label="Dismiss error"` to error close button

### PhotoGrid.tsx
- [x] Added `aria-label` + `aria-pressed` to deep review toggle button
- [x] Added `aria-label` + `aria-pressed` to compare toggle button

### Sidebar.tsx
- [x] Converted workflow items from `<div>` to `<button>` with `aria-label` and `aria-current`
- [x] Wrapped in `<nav role="navigation" aria-label="Workflow steps">`

### EmptyState.tsx
- [x] Added `role="region"` and `aria-label` to drop zone
- [x] Added `tabIndex={0}` + Enter/Space handler to drop zone for keyboard focus
- [x] Added `role="radiogroup" aria-label="Feedback style"` to experience level picker
- [x] Added `role="radio" aria-checked` to each level button

### globals.css
- [x] Bumped `--color-outline` from #767575 to #8a8a8a for WCAG AA contrast on dark backgrounds

---

## P1 — Rating Override (AI as Collaborator)

### ContactSheet.tsx
- [x] Added `ratingOverrides` state (Record<number, Rating>), stored separately from AI ratings
- [x] Added `handleRatingOverride` callback
- [x] Added `getEffectiveRating()` helper — override > deep > cull
- [x] Toolbar hero/select counts now respect overrides
- [x] Passed `ratingOverrides` to PhotoGrid, `ratingOverride` + handler to DetailPanel

### DetailPanel.tsx
- [x] Added 4-button rating override row (HERO/SELECT/MAYBE/CUT)
- [x] Shows "YOUR RATING" label when overridden, with original AI rating shown as secondary text
- [x] Highlight matches the rating color (gold/green/gray/red)

### PhotoGrid.tsx
- [x] Accepts `ratingOverrides` prop, uses override for badge color + cut treatment
- [x] Shows small "edit" icon on thumbnails with manual overrides

---

## P1 — Design System Compliance

### PhotoGrid.tsx
- [x] Replaced `rounded-full` score circle with square `glass-loupe` badge (0px radius)

### DetailPanel.tsx
- [x] Replaced all `border-b border-outline-variant/20` section headers with `border-l-2 border-primary/40 pl-3` accent bars

### EmptyState.tsx
- [x] Left-aligned drop zone content (removed `text-center`, `items-center`, `justify-center`)
- [x] Removed all 4 HUD corner markers ("DRAG_01 // SYSTEM_IDLE", "MTF_READY", etc.)
- [x] Removed "Algorithm: V.01-BETA" decoration from experience level picker

### ContactSheet.tsx
- [x] Removed inline `borderRadius: "9999px"` from spinner (now inherits 0px from theme)

### Sidebar.tsx
- [x] Removed "V.01-BETA" version string

### ProviderSetup.tsx
- [x] Removed "V.01-BETA" from configuration label
- [x] Removed "PPA FRAMEWORK" from nav

---

## P2 — Information Architecture

### Sidebar.tsx
- [x] Removed non-functional VIEW, SORT, FILTER items (only CULL and REVIEW remain)

### ContactSheet.tsx
- [x] Removed "GENERATE REPORT" FAB (redundant with toolbar Export button)

### Header.tsx
- [x] Removed "PPA FRAMEWORK" label from nav

### EmptyState.tsx
- [x] Changed "RAW, TIFF, or JPEG High-Fidelity Formats" to "TIFF or JPEG · Up to 200 frames"

---

## P2 — Typography Consolidation (Partial)

### globals.css
- [x] Added `--panel-width: 420px` layout token

### Note
Typography token consolidation (replacing 15+ arbitrary text-[Npx] with ~6 defined sizes) deferred to a follow-up pass — requires touching every component and careful visual regression testing.
