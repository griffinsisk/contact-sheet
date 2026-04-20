# Contact Sheet — Determinism v1 Build Plan

---

## Status: Phase 0 complete — Phase 2 descoped (2026-04-20)

Phase 0's variance harness ran against the current `CULL_PROMPT` on 34 photos × 5 runs × 2 resolutions = 340 API calls to Claude Sonnet 4. The results invalidated the plan's core assumption that scoring variance was a meaningful UX problem.

### What the harness found

At 1024px (production resolution):

| Metric | Value |
|---|---|
| Impact stdev | 0.25 |
| Composition stdev | 0.29 |
| Technical stdev | 0.31 |
| Story stdev | 0.41 |
| Overall stdev | 0.10 |
| Rating stability | 100% |
| Boundary crossings | 0 |
| Noise floor (CUT-tier) | ~0 overall stdev |

The single most-variant photo had an overall stdev of **2.0** — four runs scored 78, one run scored 83, all same rating tier. Photos ranked 4th and 5th on the most-variant list scored *identically* across all five runs. At `temperature: 0`, Claude Sonnet 4 is operating near its inherent determinism ceiling on this prompt.

### Why this changes the plan

The plan's Phase 0 gate:
> If all dimensions show <5 point standard deviation and rating stability is >90%, determinism is not the biggest problem to solve. Reconsider priorities before proceeding.

All dimensions came in <0.5 stdev and rating stability was 100%. The safeguard fired correctly — rubric decomposition would have been solving a problem that doesn't exist.

### Revised scope

**Descoped:** Phase 2 (rubric decomposition). Content preserved below as historical reference.

**In scope:** Phase 1 (override log infrastructure). Unchanged from original plan. Two reasons to keep:
1. Cheap scaffolding (1–2 days) that's useful regardless of future direction.
2. It captures the signal needed to validate whether calibration is a real user pain point — specifically, photos where users override Claude's rating. Without that data, any future "teach Claude my taste" feature would be speculative.

**New parallel track:** Shipping readiness audit. Redirecting the ~4 days that would have gone to Phase 2 toward the work that gets real photographers using the tool — at which point the override log will produce the signal needed to decide whether calibration work is warranted.

### Portfolio narrative

The pivot itself is the story: measured the assumed problem, found it didn't exist, redirected to shipping, instrumented for the next iteration. Complete engineering arc — hypothesis, validation, change of direction, forward-looking instrumentation.

### Phase 0 gate decisions (answered in writing, per plan requirement)

1. **Which dimension(s) to decompose in Phase 2?** None. Decomposition is descoped.
2. **Judgment-bound or information-bound?** Neither in any meaningful way. 1024→1536 variance delta is <0.1 stdev on all dimensions. The problem isn't real at either resolution.
3. **Is determinism the most valuable problem to solve right now?** No. Rating stability 100%, boundary crossings 0. Other initiatives have higher leverage.

Raw harness report and full per-photo data: `~/Downloads/cs-harness-2026-04-20T15-34-42.json` (not committed; contains personal photo references).

---

## Ground rules

- **No phase starts until the previous phase's gate is passed.** Gates are explicit; no "while you're at it" scope additions.
- **One decision at a time.** If a question arises that isn't answered in this doc, stop and surface it — don't guess.
- **The harness is the arbiter.** When a decision is contested, re-run the harness and let the numbers decide.
- **Wall-clock budget per phase.** Miss the budget by 50%, stop and ask why.
- **Anthropic only.** Multi-provider adapters stay in place but are not in scope for testing or tuning in v1.
- **Production resolution is locked at 1024px.** Do not propose changes to this.

## Decisions locked (do not re-litigate)

The following have been decided and are not open questions during execution:

- **No feature flag / rollback toggle in v1.** Rollback is git revert + redeploy. Dual-mode scoring creates permanent maintenance overhead not worth the insurance.
- **No raw point values in UI, even behind a toggle.** Breakdown copy is descriptive only ("horizon reads as tilted"), never numeric (`-3`). Showing the math when the math is the problem (false precision) poisons the feature. Can be revisited in v1.1 if users ask.
- **Storage rotation at 5000 entries, oldest-first.** Silent data loss at localStorage's 5MB cap is worse than a documented limit with rotation.
- **First-run export tooltip is allowed.** Not scope creep — it's minimum viable protection for the feature being built.
- **Variance target in Phase 2 is relative** (noise floor of CUT-tier photos from Phase 0), not absolute. Pulled-from-air thresholds are gate theater.

---

## Phase 0 — Variance Harness

**Budget:** 1 day.
**Goal:** Establish baseline measurement infrastructure and capture variance numbers for the existing cull prompt.

### Scope

Build a dev-only harness that measures score variance across runs for the current `CULL_PROMPT` against Claude Sonnet 4.

**Test matrix:**
- 30 photos, composed as: ~10 clear HERO-tier, ~10 borderline SELECT/MAYBE, ~10 clear CUT-tier. Borderline cases are where determinism matters most — small score shifts cross rating boundaries.
- 5 runs per photo per resolution
- 2 resolutions: **1024px** (production) and **1536px** (diagnostic — tests whether variance is information-bound or judgment-bound)
- **Batching: individual, not batched.** Run each photo as its own API call. Production uses `CULL_BATCH_SIZE` batching; the harness isolates model judgment from batch effects. If batched variance turns out to be worse than individual, that's a separate discovery for a future track.
- Total: 300 API calls, budget accordingly

### Implementation

- Extend the existing `runResolutionTest` pattern in `lib/api.ts` into a full harness module at `lib/harness.ts`.
- Input: array of `Photo` objects + `ProviderConfig`.
- Output: JSON triggered as a browser download via a Blob URL (the app is client-side — there is no disk). File named `cs-harness-{timestamp}.json`.
- Surface via a dev-only button in DetailPanel or a hidden route — does not need polished UX.

### Output schema

```json
{
  "version": 1,
  "ranAt": "ISO timestamp",
  "model": "claude-sonnet-4-20250514",
  "prompt": "cull-v-current",
  "photos": [
    {
      "photoId": "string",
      "filename": "string",
      "runs": [
        {
          "resolution": 1024,
          "runIndex": 0,
          "scores": { "impact": 72, "composition": 78, "technical": 74, "story": 65 },
          "overall": 73,
          "rating": "SELECT"
        }
      ]
    }
  ]
}
```

### Reporting

Produce a summary report (markdown or HTML) with:

- **Per-dimension variance** (standard deviation of scores across the 5 runs, averaged across 30 photos) at each resolution.
- **Resolution delta:** for each dimension, how much does variance drop going from 1024 → 1536?
- **Rating stability:** what % of photos got the same rating tier (HERO/SELECT/MAYBE/CUT) across all 5 runs, at each resolution?
- **Rating-boundary crossings (required):** count of photos whose rating tier was not unanimous across the 5 runs. This is more actionable than raw stdev — a photo oscillating between SELECT and MAYBE is a UX bug, while same-tier variance is cosmetic. Report this at both resolutions.
- **Top 5 most variant photos** at 1024px — thumbnail + score distributions. These are diagnostic cases.
- **Overall score variance** (the composite).
- **Noise floor reference:** record the variance observed on clear CUT-tier photos specifically. This becomes the target floor for Phase 2's gate (a decomposed dimension should approach this, not a round number).

### Phase 0 Gate

Human review of the report. Decisions to make before Phase 1:

1. **Which dimension(s) to decompose in Phase 2.** Highest variance, or highest variance that's also decomposable (IMPACT is likely noisy but resists decomposition).
2. **Is the problem judgment-bound or information-bound?** If 1536px significantly reduces variance, consider a separate track for resolution increase. If not, rubric decomposition is the correct path.
3. **Is determinism the most valuable problem to solve right now?** Review the numbers — the rating-boundary crossings and per-dimension variance — and decide. If the problem is small enough that other initiatives have higher leverage, reconsider before committing to Phases 1 and 2. No hard threshold — reviewer judgment.

**Do not proceed to Phase 1 until these three questions are answered in writing.**

---

## Phase 1 — Override Log Infrastructure

**Budget:** 1–2 days.
**Goal:** Scaffold the observation/override log so Phase 2 can write into it from day one. Build the pipe, not the consumer.

### Scope

Build localStorage-backed logging infrastructure that will later power personalization. Log lives entirely client-side. No server. No telemetry. No consent flow.

### Pre-Phase 1 check

Before starting, verify that the rating-override handler in `ContactSheet.tsx` is actually shipped and functional (CHANGELOG-critique flagged this as P1 — confirm it's complete, not just planned). Phase 1's integration point #5 depends on it. If the handler isn't in place, either ship it first or drop the override-write integration from Phase 1 scope and note it as a Phase 1.5 task.

### What to build

1. **Schema module** at `lib/observation-log.ts`:

```typescript
interface ObservationLogEntry {
  version: 1;
  entryId: string;          // uuid
  timestamp: string;         // ISO
  profileId: string;         // defaults to "default" — reserved for future profile switching
  photoId: string;
  photoName: string;
  sessionId: string;
  pass: "cull" | "deep";
  observations: Record<string, string | null>;  // enum values per dimension, null if not yet decomposed
  aiScores: { impact: number; composition: number; technical: number; story: number };
  aiRating: Rating;
  userRating: Rating | null;  // null if user didn't override
  userObservationOverrides: Record<string, string> | null;  // null if no corrections
}

interface ObservationLog {
  version: 1;
  entries: ObservationLogEntry[];
}
```

2. **Read/write functions:**
   - `appendObservation(entry: Omit<ObservationLogEntry, "entryId" | "timestamp">)` — adds entry. Implements oldest-first rotation: if log exceeds **5000 entries**, drop the oldest entries on write. This is a safety net against localStorage's ~5MB cap silently dropping data (at ~500 bytes/entry, 5000 entries ≈ 2.5MB, comfortably within budget).
   - `loadObservationLog(): ObservationLog` — returns full log
   - `clearObservationLog()` — user-initiated wipe
   - `getLogSize(): { entries: number; approxBytes: number }` — for UI display
   - Storage key: `cs-observation-log`

3. **Migration stub:**
   - `migrateLog(raw: unknown): ObservationLog` — handles missing/malformed logs, returns empty valid log on failure. Version field drives future migrations.

4. **Export UI:**
   - New button in settings / provider config area: "Export calibration data"
   - Downloads the log as timestamped JSON file
   - Copy: "Your calibration data stays on your device. Export a backup to preserve it across browser resets. Storage holds up to 5000 entries; oldest are dropped first."
   - **First-run tooltip** on the export button: the first time the log crosses 50 entries, surface a one-time tooltip that reads something like "Calibration data accumulates here. Export to back it up." Fires once, dismissable, state tracked in a separate `cs-export-tooltip-seen` key. This is the minimum viable protection for the feature; users who don't know export exists will otherwise silently lose data.

5. **Integration points (wiring only, no logic yet):**
   - In `runCull` (lib/api.ts): after each batch, call `appendObservation` with pass: "cull", observations: {} (empty for now, will populate in Phase 2).
   - In `runDeepReview`: same, pass: "deep".
   - In ContactSheet.tsx rating override handler: when a user sets a rating override, update the most recent log entry for that photo with `userRating`.

### Constraints

- Do not build personalization logic. Do not read the log anywhere except the export button.
- Do not build profile switching UI. `profileId` is a reserved field only.
- Do not build auto-backup prompts. Just the export button.
- Do not add ML vocabulary anywhere. The user-facing term is "calibration data." The internal term is "observation log." No "training," no "model."

### Phase 1 Gate

Human verification:

1. Upload photos, run cull, verify log entries are created with correct schema.
2. Override a rating, verify log entry updates.
3. Click export, verify JSON file downloads with correct structure.
4. Clear the log, verify state resets cleanly.
5. Manually corrupt the log in localStorage (invalid JSON, wrong version), verify `loadObservationLog` returns empty valid log without crashing.

**Do not proceed to Phase 2 until all five checks pass.**

---

## Phase 2 — Decompose One Dimension

> **DESCOPED (2026-04-20)** — Phase 0 results showed variance is already at the model's inherent determinism ceiling. Decomposing would solve a non-problem. Content below is preserved as historical reference for the design pattern (enum observations + deterministic formula + Anthropic tool-use) — useful if a future calibration pass needs structured-output infrastructure.

**Budget:** 3–4 days.
**Goal:** Replace holistic scoring for the dimension selected in Phase 0 with enum observations + deterministic formula, in both cull and deep review passes.

### Scope

The dimension to decompose is determined by Phase 0 results. The structure below applies regardless of which dimension is chosen.

### What to build

1. **Rubric module** at `lib/rubrics.ts`:
   - Enum definitions for each observation field in the target dimension.
   - Use intentionality modifiers where applicable (e.g., `tilted_intentional` vs `tilted_accidental`) so the rubric does not penalize deliberate choices.
   - Point tables mapping enum values to contributions.
   - `scoreDimension(observations): number` — deterministic formula returning 0-100.
   - Each weight documented with a one-line rationale comment.

2. **Prompt updates** in `lib/prompts.ts`:
   - Modify `CULL_PROMPT` to request observations for the target dimension instead of a score. Keep the other three dimensions as holistic scores.
   - Modify `DEEP_REVIEW_PROMPT` identically. Both passes must ship together.
   - Update the JSON response schema in the prompt.
   - Remove calibration anchors for the decomposed dimension (rubric replaces them). Keep anchors for the other dimensions.

3. **Structured output via Anthropic tool-use** in `lib/providers.ts`:
   - This is a **parallel code path**, not a parameter addition. Tool-use responses do not come back as parseable text — content arrives in `content[].input` as an already-structured object, and `parseJSON` is bypassed entirely for tool-use responses.
   - Add a new `callAnthropicWithTool(apiKey, model, msg, toolSchema)` function (or extend `callAnthropic` with a distinct branch). Response handling must check for `tool_use` content blocks and extract `input` directly.
   - Define the tool schema matching the decomposed dimension's observation structure.
   - OpenAI and Gemini paths are not modified in this phase. Out of scope.
   - Keep `repairJSON` as a truncation fallback for non-tool-use paths. Tool-use schemas catch malformed structure; `repairJSON` catches cut-off responses on the legacy path.

4. **Type updates** in `lib/types.ts`:
   - Add `DimensionObservations` interface for the decomposed dimension.
   - Extend `CullResult` and `DeepResult` with optional `observations?: DimensionObservations`.

5. **Orchestration updates** in `lib/api.ts`:
   - After parsing the LLM response, call `scoreDimension(observations)` and inject the result into `scores[dimension]`.
   - Recompute overall score (composition is now code-derived but weight formula unchanged).
   - Write `observations` into the log entry from Phase 1.

6. **UI disclosure** in `components/DetailPanel.tsx`:
   - Collapsible "Show reasoning" section under the score bars.
   - Always available, never auto-expanded.
   - Copy style: soft and descriptive, not numeric deltas. Example: "Leading lines noted. Horizon reads as tilted. Edges clean." Not: "Leading lines: +15 / Horizon: -3 / Edges: 0."
   - Do not reveal raw point values in the UI, even in the expanded view. The breakdown is the observations, not the math.

### Constraints

- Decompose only the dimension chosen in Phase 0. Do not touch the other three.
- Do not build an override correction UI for observations. (Deferred to v1.1.)
- Do not surface confidence values in copy variants. (Deferred to v1.1.)
- Do not modify OpenAI or Gemini adapters.

### Phase 2 Gate

Re-run the Phase 0 harness on the new prompt, at 1024px only. Additionally, run the same 30 photos through both cull and deep review to measure cross-pass consistency.

1. **Variance on the decomposed dimension approaches the noise floor** recorded in Phase 0 (the variance observed on clear CUT-tier photos, which represents inherent model noise). Exact target: within 1.5× the noise floor. A 60% drop from baseline is a rough check, not a target — absolute thresholds on variance are meaningless without a floor reference.
2. **Variance on the other three dimensions should be unchanged (within noise)**. If they shift meaningfully, the prompt changes affected more than intended — investigate before shipping.
3. **Rating stability** (% of photos with consistent tier across 5 runs) should improve on the decomposed dimension. Rating-boundary crossings on the decomposed dimension should drop to near zero.
4. **Cross-pass consistency (critical)**: on the same photo, the decomposed-dimension score from cull and deep review should agree within 5 points. This is the whole reason scope was expanded to both passes — if cull says 74 and deep review says 81 for composition on the same photo, the user sees that as a bug. Without this check, you could ship two individually-stable passes that are mutually inconsistent, which is the exact failure mode this plan was designed to prevent.
5. **The "magic photo" case**: upload the candid-moment-tilted-horizon test photo. It should not be scored in the 40s. If it is, the intentionality modifiers aren't working as intended — the rubric is punishing the decisive moment and needs redesign.
6. **Observation logging verified**: observations are written to the log for every photo, including photos where the user did not override anything. Silent-agreement cases are load-bearing signal for future personalization.

**Do not ship until all six checks pass.**

---

## Deferred to v1.1 or later

These are real and good. They are not in v1:

- Decomposing additional dimensions
- Personalization consumer (reading from the log to adjust user-specific weights)
- Profile page UI ("you've rated X photos, your patterns show Y")
- Profile switching UI (wedding work vs. personal work)
- Auto-backup prompts for the log
- Confidence-aware copy variants
- Override correction UI (edit observations, recompute score)
- Pairwise/tournament mode for MAYBEs
- Cross-provider adapter updates for structured outputs
- Separate diagnostic track if Phase 0 shows resolution is the real variance driver
- `{app` directory cleanup in repo root (do today, unrelated to this plan)

---

## Notes on scope discipline

If a new concern arises during any phase:

- If it is "this phase's approach is structurally broken" — stop and surface it.
- If it is "here is a nice addition" — write it down in the v1.1 list and keep building.
- If it is "I thought of a better approach entirely" — finish the current phase first, then evaluate. Sunk cost is not a reason to finish a wrong phase, but context-switching mid-gate is how plans die.
