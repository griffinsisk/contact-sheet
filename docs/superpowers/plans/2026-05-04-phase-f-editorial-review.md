# Phase F Editorial Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the existing Deep Review feature as an editorial shortlist-development pass called Develop Shortlist / Editor's Notes.

**Architecture:** Keep the existing two-pass flow and storage model, but add optional editorial fields to `DeepResult`, update prompt/output contracts, and adjust UI priority so editorial guidance leads while second-pass score remains secondary. Preserve backwards compatibility for old saved sessions by making all new fields optional and rendering old deep results gracefully.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Playwright e2e, Node test runner for unit tests.

---

## File Map

- `lib/types.ts`: Add `EditorialRole` and optional editorial fields to `DeepResult`.
- `lib/prompts.ts`: Reframe the deep-review prompt and JSON contract around shortlist development.
- `components/CullBanner.tsx`: Rename post-cull CTA and empty-selection helper copy.
- `components/PhotoGrid.tsx`: Rename thumbnail toggle copy and aria-labels.
- `components/CullProgress.tsx`: Rename progress heading/copy for the review pass.
- `components/DetailPanel.tsx`: Lead deep results with Editor's Notes and optional editorial fields; move dimension bars lower when deep results exist.
- `lib/exports.ts` and `lib/fs-export.ts`: Preserve export behavior and include new editorial fields only when present.
- `tests/e2e/contact-sheet-smoke.spec.ts`: Update mocked deep-review route and add UI assertions for renamed flow/new fields.
- `tests/unit/exports.test.ts`: Add export coverage for optional editorial fields if export output changes.
- `docs/NEXT-SESSION.md` and `docs/PHASE-F-EDITORIAL-REVIEW-REFRAME.md`: Mark Phase F implementation status after code lands.

---

### Task 1: Add failing e2e coverage for renamed flow

**Files:**
- Modify: `tests/e2e/contact-sheet-smoke.spec.ts`

- [x] **Step 1: Add a mocked `/api/deep-review` route in `test.beforeEach`**

Add a Playwright route returning one analysis with the new optional fields:

```ts
await page.route("**/api/deep-review", async (route) => {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      text: JSON.stringify({
        analysis: [
          {
            index: 0,
            rating: "SELECT",
            score: 76,
            scores: { impact: 76, composition: 74, rawQuality: 82, craftExecution: 72, story: 70 },
            title: "Red Study",
            editorialRole: "anchor",
            editDirection: "Hold the simple graphic read; deepen contrast while keeping the red field clean.",
            cropOrCompositionNote: "Keep the centered geometry; avoid cropping tighter.",
            technical: "Clean file with enough tonal room for a controlled edit.",
            style_story: "Works as a quiet graphic anchor for the shortlist.",
            verdict: "Use this as the opening anchor if the set leans minimal."
          }
        ],
        curatorial_notes: "The shortlist reads strongest as a quiet graphic sequence.",
        recommended_sequence: [0]
      }),
      truncated: false,
    }),
  });
});
```

- [x] **Step 2: Add a test named `develop shortlist shows editor notes and secondary score`**

Use the existing upload helper, run cull, start shortlist development, open the selected photo, and assert the new language:

```ts
test("develop shortlist shows editor notes and secondary score", async ({ page }) => {
  await uploadAndCullTwoPhotos(page);

  await expect(page.getByRole("button", { name: /Develop shortlist for 1 photo/i })).toBeVisible();
  await page.getByRole("button", { name: /Develop shortlist for 1 photo/i }).click();

  await expect(page.getByText("Editor's Notes")).toBeVisible();
  await expect(page.getByText("The shortlist reads strongest as a quiet graphic sequence.")).toBeVisible();

  await page.getByRole("button", { name: /red-dot\.png, SELECT, score 76/ }).click();
  await expect(page.getByText("ANCHOR")).toBeVisible();
  await expect(page.getByText("EDIT DIRECTION")).toBeVisible();
  await expect(page.getByText("Hold the simple graphic read; deepen contrast while keeping the red field clean.")).toBeVisible();
  await expect(page.getByText("CROP / COMPOSITION")).toBeVisible();
  await expect(page.getByText("Keep the centered geometry; avoid cropping tighter.")).toBeVisible();
  await expect(page.getByText("EDITOR'S SCORE")).toBeVisible();
});
```

- [x] **Step 3: Run the focused e2e test and verify it fails**

Run:

```bash
npm run test:e2e -- --grep "develop shortlist"
```

Expected: FAIL because the UI still says Deep Review/Review and does not render the new fields.

---

### Task 2: Add failing type/prompt unit coverage

**Files:**
- Create: `tests/unit/editorial-review.test.ts`

- [x] **Step 1: Add prompt contract assertions**

Create the file with:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { buildDeepReviewPrompt } from "../../lib/prompts";

test("deep review prompt is reframed as shortlist development", () => {
  const prompt = buildDeepReviewPrompt({ preset: "mixed" }, null);

  assert.match(prompt, /Develop this shortlist/i);
  assert.match(prompt, /editorialRole/);
  assert.match(prompt, /editDirection/);
  assert.match(prompt, /cropOrCompositionNote/);
  assert.doesNotMatch(prompt, /go deeper on/i);
});
```

- [x] **Step 2: Run the unit test and verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/editorial-review.test.ts
```

Expected: FAIL because the prompt still uses old deep-review wording.

---

### Task 3: Implement types and prompt contract

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/prompts.ts`

- [x] **Step 1: Add optional editorial fields**

In `lib/types.ts`, add:

```ts
export type EditorialRole = "anchor" | "supporting" | "transition" | "detail" | "near_miss";
```

Then extend `DeepResult`:

```ts
export interface DeepResult {
  index: number;
  rating: Rating;
  score: number;
  scores: DimensionScores;
  title: string;
  editorialRole?: EditorialRole;
  editDirection?: string;
  cropOrCompositionNote?: string;
  technical: string;
  style_story: string;
  verdict: string;
}
```

- [x] **Step 2: Reframe `DEEP_BASE` and `DEEP_JSON_TAIL`**

Change language from "go deeper" to "develop this shortlist." Keep score/rating in JSON but describe them as secondary compatibility fields. Require the new optional fields.

- [x] **Step 3: Run unit test**

Run:

```bash
npm run test:unit -- tests/unit/editorial-review.test.ts
```

Expected: PASS.

---

### Task 4: Update UI labels and DetailPanel priority

**Files:**
- Modify: `components/CullBanner.tsx`
- Modify: `components/PhotoGrid.tsx`
- Modify: `components/CullProgress.tsx`
- Modify: `components/DetailPanel.tsx`

- [x] **Step 1: Rename post-cull action copy**

Use `Develop Shortlist` for CTA/progress/action labels and `Editor's Notes` for result output.

- [x] **Step 2: Render editorial fields before score dimensions**

For deep results in `DetailPanel`, render:

- `EDITOR'S NOTES`
- optional editorial role pill
- title
- edit direction
- crop/composition note
- verdict
- technical/style story sections
- secondary score/dimensions lower on the panel

- [x] **Step 3: Keep old sessions graceful**

Only render `editorialRole`, `editDirection`, and `cropOrCompositionNote` sections when present.

- [x] **Step 4: Run focused e2e**

Run:

```bash
npm run test:e2e -- --grep "develop shortlist"
```

Expected: PASS.

---

### Task 5: Preserve and lightly enrich exports

**Files:**
- Modify: `lib/exports.ts`
- Modify: `lib/fs-export.ts`
- Modify: `tests/unit/exports.test.ts` if export text changes

- [x] **Step 1: Inspect current export output**

Confirm manifest/XMP already use deep titles/descriptions.

- [x] **Step 2: Add editorial fields only if useful**

If adding to manifest, include optional lines under each deep-reviewed photo:

```txt
Editorial Role: anchor
Edit Direction: ...
Crop / Composition: ...
```

- [x] **Step 3: Add or update unit coverage**

If output changes, add assertions to `tests/unit/exports.test.ts`.

- [x] **Step 4: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

---

### Task 6: Final verification and docs

**Files:**
- Modify: `docs/NEXT-SESSION.md`
- Modify: `docs/PHASE-F-EDITORIAL-REVIEW-REFRAME.md`

- [x] **Step 1: Update docs with implementation status**

Mark Phase F as implemented locally and list verification.

- [x] **Step 2: Run full verification**

Run:

```bash
npm run typecheck
npm run test:unit
npm run test:e2e
npm run build
```

Expected: all pass.

- [x] **Step 3: Commit**

Commit message:

```bash
git commit -m "Reframe deep review as editorial shortlist development"
```

---

## Self-Review

- Spec coverage: covers approved label, secondary score, optional editorial fields, prompt, UI, compatibility, tests, and docs.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: field names match approved scope: `editorialRole`, `editDirection`, `cropOrCompositionNote`.
