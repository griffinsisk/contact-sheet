# Contact Sheet — Decision Log

Non-obvious engineering and product decisions made during development. Captures *why* we chose what we chose so the reasoning is traceable without re-deriving it from commits.

Each entry: decision, context, evidence (if measured), tradeoff accepted, related commits.

---

## 2026-04-20 — Rubric decomposition: NOT pursued

**Decision.** Do not build the rubric decomposition system originally scoped as Phase 2 of `BUILD-PLAN-determinism-v1.md`.

**Original hypothesis.** AI cull scores vary run-to-run enough that users see rating tiers flip on borderline photos. Fix: decompose composition into enum observations (e.g. `horizon: level | tilted_intentional | tilted_accidental`) with a deterministic scoring formula via Anthropic tool-use structured output. Estimated 3–4 days.

**How we tested it before committing.** Built `lib/harness.ts` — a dev-only measurement instrument that runs the current `CULL_PROMPT` on N photos × M runs × 2 resolutions and reports per-dimension standard deviation, rating stability, rating-boundary crossings, and a CUT-tier noise floor. Ran 34 photos × 5 runs × 2 resolutions = 340 Claude Sonnet 4 API calls. Cost ~$2.40.

**What we found (1024px, production resolution):**

| Metric | Value |
|---|---|
| Impact stdev | 0.25 |
| Composition stdev | 0.29 |
| Technical stdev | 0.31 |
| Story stdev | 0.41 |
| Overall stdev | 0.10 |
| Rating stability | 100% |
| Boundary crossings | 0 |
| Most variant single photo | stdev 2.0 (4 runs at 78, 1 at 83, same tier) |

At `temperature: 0`, Claude Sonnet 4 is running near its inherent determinism ceiling on this prompt. The plan's own Phase 0 gate said: "if all dimensions show <5 point stdev and rating stability >90%, determinism is not the biggest problem to solve." Every dimension came in <0.5 stdev and stability was 100%.

**Decision rationale.** Decomposition would solve a problem that doesn't exist. Redirected the 3–4 days to shipping work and pricing-model infrastructure.

**Kept as infrastructure.** The harness is permanent — it's the tool that prevented the bad commitment, and it's available to re-validate future prompt changes.

**Evidence.** `~/Downloads/cs-harness-2026-04-20T15-34-42.json` (full run data, not committed — contains personal photo references). Summary preserved in `BUILD-PLAN-determinism-v1.md`.

**Related commits.** `8662d30`, `be518ce` (harness + fixes), `03b8515`, `160a4ea` (plan pivot documented).

---

## 2026-04-20 — Style calibration / override-log personalization: deferred

**Decision.** Do not build user-specific taste calibration ("teach Claude my eye") in v1.

**Alternative we considered.** After the harness invalidated decomposition, the natural pivot was personalization: capture override events (user disagrees with Claude's rating) and fit a per-user weighting model to recover individual taste.

**Why deferred.** Building calibration without users is the same error category as building decomposition without the variance problem being real — speculative answer to an unvalidated question. We have zero user-override data. Any calibration logic would encode assumptions about what kinds of disagreement exist.

**What we kept.** The Phase 1 override-log *infrastructure* remains planned (~1–2 days of localStorage scaffolding). The log captures the signal we'd need to validate calibration *later* without committing to the downstream consumer. Log infra is useful regardless of direction; a calibration model is speculative.

**Trigger to revisit.** Once photographers are using the tool and override data accumulates, look at override patterns. If users consistently disagree on specific dimensions, calibration is worth building. If overrides are rare, it's not.

**Related commit.** `160a4ea` (deferral documented in plan).

---

## 2026-04-20 — Pricing model: three tiers, BYOK > Pro > Free

**Decision.** Ship with three user modes in v1:

| Tier | Cost to user | Account | API path | Quota |
|---|---|---|---|---|
| **Free** | $0 | None | Our server proxy (shared Anthropic key) | 10 photos / session |
| **Pro** | $5 / mo | Clerk | Our server proxy (shared key) | Unlimited |
| **BYOK** | Their own API bill | None | Client-side direct (user's key) | None |

**Tier precedence.** BYOK beats Pro beats Free. A Pro subscriber who pastes a key uses BYOK for that session — they've explicitly opted out of our billing.

**Free-tier enforcement is soft.** localStorage counter, clearable. The point of "free" is conversion, not fraud prevention. If someone really wants 20 free photos they'll clear localStorage. If abuse becomes real we add IP or account-level limits. (`lib/tier.ts`)

**Why BYOK stays client-side (keeps `anthropic-dangerous-direct-browser-access` header).** The only way to make BYOK server-side is to handle the user's key in-flight on our server, even briefly. That's a real trust concession; a photographer technical enough to have an API key understands the client-side tradeoff, but putting their key on our infra requires a stronger promise we'd rather not make. Migrate to server-side BYOK in v1.1 if users request it.

**Related commits.** `24eff8b` (server routes), `154ee40` (dispatch split), `0566ff7` (tier module).

---

## 2026-04-20 — Auth: Clerk. Billing: Stripe.

**Decision.** Clerk for user auth, Stripe for subscription billing.

**Why Clerk:** drop-in components (`<SignInButton>`, `<UserButton>`, `<SignedIn/Out>`), hosted sign-in/up modal, free tier covers expected volume, user metadata field lets us store tier + usage without a separate database for v1. Stayed on v6 rather than v7 — v7 deprecated the `<SignedIn>` / `<SignedOut>` primitives in favor of a new `<Show>` API, and v6's pattern fits naturally into the existing header. No pressure to upgrade.

**Why Stripe:** Customer Portal hosts the billing UI (no custom subscription forms to build). Test mode lets us build the whole flow before accepting real cards. Webhooks will update Clerk user metadata via `/api/stripe/webhook` when that lands.

**Alternatives considered:** NextAuth (more config, worse DX), Supabase Auth (more infra), Lemon Squeezy (less mature). Stack chosen for fastest time-to-production on a solo portfolio timeline.

**Related commit.** `0a2fd6c` (Clerk scaffold — middleware + ClerkProvider + header buttons, no route protection yet).

---

## 2026-04-20 — Anthropic-only for v1; multi-provider code stays

**Decision.** Keep the OpenAI and Gemini adapter code in `lib/providers.ts` but plan to hide their UI cards in `components/ProviderSetup.tsx` (pending task). Server-side proxy is Anthropic-only. Harness is Anthropic-only.

**Why not rip the code:** `callProvider` dispatches cleanly; rewriting it as Anthropic-specific would be wasted churn. The portfolio narrative centers on Claude, but the dead adapter code isn't costing us anything.

**Why hide UI:** The portfolio story is sharper when Anthropic is the clear star. A user seeing a three-way provider picker dilutes that.

---

## 2026-04-20 — Prompt caching on server-side Anthropic calls

**Decision.** Enable Anthropic prompt caching on `/api/cull`, `/api/deep-review`, `/api/compare` via `cacheSystem: true` on the `Message` interface. Do not enable on BYOK direct calls.

**Why server-only:** System prompts are stable across server-side calls within a session, so the 5-minute cache TTL hits reliably (~100% hit rate after the first call). BYOK calls vary more (different users, different keys, different sessions) and the first-call write premium (~25% extra cost on cached tokens) might not be recouped.

**Implementation.** In `lib/providers.ts::callAnthropic`, wraps the system prompt in `[{type: "text", text: ..., cache_control: {type: "ephemeral"}}]` when `cacheSystem: true`. Server routes pass the flag; client BYOK doesn't.

**Related commit.** `24eff8b`.

---

## 2026-04-22 — Scoring rubric pivot: intent-aware grading over conventional craft

**Decision.** Rework the cull + deep-review rubrics from "score against absolute photography standards" to "score against the photographer's intent and attempt." Five coordinated changes:

1. **Shoot-level intent picker** at cull-start with 8 presets + optional free-form text.
2. **Split TECHNICAL** into RAW_QUALITY (objective: recoverable data, exposure, dynamic range) and CRAFT_EXECUTION (intent-conditional: did the photographer land what they were attempting).
3. **Persistent style profile** generated from 8–20 uploaded favorites; stored in Clerk `publicMetadata` (Pro) or localStorage (free); injected as prompt preamble.
4. **Override learning:** rolling last-30 user overrides persisted + fed back as few-shot examples and as input to profile regeneration.
5. **Set-level style inference:** first batch of each cull writes a one-sentence "apparent style" read that layers on top of persistent profile.

**Problem that drove this.** Running the current rubric on a 34-photo mixed set produced defensible-looking scores (100% rating stability per Phase 0 harness) but *wrong* rating calls on stylistic frames: an intentional motion-blur portrait scored 45 CUT; a blurry dog scored 79 SELECT; an accidental bed shot scored 68 MAYBE; a tight-crop landscape scored 68 MAYBE. The pattern: anything unconventional got punished as technical failure; anything technically clean survived regardless of intent or content quality.

**Diagnosis.** The current TECHNICAL dimension (20%) conflates "is the data there" with "did you execute to convention" and moves those in opposite directions under stylistic intent. The rubric has no concept of intent. Adding weights alone doesn't fix it — it moves the failure from one axis to another.

**New weight structure:**

| Dimension | Weight | Notes |
|---|---|---|
| IMPACT | 30% | Style-agnostic; unchanged |
| COMPOSITION | 25% | Down 5 — less critical for documentary/street/events |
| RAW_QUALITY | 15% | Objective; cannot be styled away (blown highlights stay blown) |
| CRAFT_EXECUTION | 10% | Intent-conditional; low weight deliberate |
| STORY | 20% | Unchanged |

**New CUT rule.** CUT requires *either* broken fundamentals *or* nothing to develop. Technically-fine-but-pointless is MAYBE at most, not CUT. Fixes the "accidental shot rated too high" case without over-harsh thresholds.

**Intent picker presets (V1):**
- Documentary / candid
- Street
- Film / intentional imperfection
- Sharp wildlife / sports / action
- Fine-art landscape
- Portrait / people
- Events (weddings, parties, performances)
- Mixed — judge each photo individually

**"Mixed" behavior.** Disables intent-conditional CRAFT for that cull. Each photo scored on its own apparent intent inferred from the frame.

**Persistent vs per-session:** V1 is persistent-only. Per-session tone references (moodboard match, V1.5 carve-out) layer on top of persistent profile. Intent picker + optional free-form covers ~80% of per-session signal for V1.

**Conflict resolution in prompt:** when session intent contradicts persistent profile, session intent wins for that cull. The profile is background; intent is foreground.

**Free-tier policy.** All tiers get intent picker + rubric split. Persistent profile generation capped at one per browser (localStorage tracked) using our Anthropic key — single most expensive action for a free user (~15 vision inputs in one call). Rationale: the profile is the strongest demo moment; gating it to Pro would make free feel crippled. Onboarding favorites do NOT count against the 10-photo cull quota.

**Storage model.** One profile per user for V1. Re-generatable from settings. Edit-prose UI punted to post-V1.

**Demo fixtures.** The 34-photo test set committed to `fixtures/demo-shoot/` alongside the generated profile artifact — reproducibility for the interview matters more than any photo-privacy concern on a personal portfolio.

**Scope cost.** Shifts v1 ship date from "end of next week" (~2 eng-days) to ~2.5 weeks (6 eng-days). Accepted because the portfolio demo fails if a working photographer feels unseen by the rubric.

**Evidence.** Four user-flagged miscalls (boba 45, bed 68, dog 79, NZ landscape 68) reproducing consistent failure modes under the current prompt. Documented in conversation log 2026-04-21.

---

## 2026-04-20 — Session logistics: Claude Desktop worktree → main branch

**Decision.** Continue determinism work in this session rather than Claude Desktop. Removed the Claude Desktop worktree at `.claude/worktrees/distracted-montalcini-f71a87`, un-nested the project from `contact-sheet-v3/handoff-v3/*` to `contact-sheet-v3/*`, gitignored test photos and the Anthropic API key file.

**Why:** One canonical app location avoids the "where is the current version" confusion. Flattening made `BUILD-PLAN`, `docs/`, and source all reachable from one path.

**Related commit.** `4845887` (flatten + pivot doc), `0a1797d` (gitignore test photos).

---

## Deferred to v1.1 (with reason)

Decisions to *not* ship something in v1, with revisit triggers:

| Item | Reason deferred | Revisit when |
|---|---|---|
| Rubric decomposition | Harness proved no problem to solve | Model changes introduce real variance |
| Style calibration / RAG | No user data yet | Override log has 100+ events |
| Override correction UI (edit enum observations) | Depends on decomposition, which is descoped | Decomposition comes back |
| Pairwise/tournament mode for MAYBEs | Novel but out of shipping path | Users ask for tie-breaking help |
| OpenAI / Gemini structured outputs | Anthropic-only for v1 | Multi-provider strategy changes |
| Automated test suite | Portfolio signal, not blocking | Before second engineer joins |
| Typography token consolidation | Cosmetic, not blocking | Design-system pass |
| Auto-backup prompts on override log | Avoid scope creep | Log exceeds 1000 entries for real users |
| Rate-limit retry in production cull/deep | Exists in harness, needs porting | Real users hit 429s |
| Session restore: full-res base64 for HERO/SELECT | Bigger UX fix | Photographers report it |
| Experience-level scoring thresholds | Currently voice-only | Learning users report CUT fatigue |
| Per-session tone references (moodboard) | Intent picker + free-form covers 80% of signal | Users request "match this specific look" for a shoot |
| Multiple named profiles per user (wedding mode / street mode) | One profile suffices for V1 | User explicitly asks to switch modes |
| Anonymized override telemetry | No real users yet | Override log has >100 cross-user events |
| IG / Pinterest / portfolio URL ingestion | "Upload favorites" is the better product posture | Never — favorites wins on trust + signal quality |
| Server-side BYOK | Client-side keeps key trust simple | Pro user requests it |

Each was deferred for a specific reason captured when the decision was made (not enough signal, scope discipline, or simply out of the v1 critical path).

---

## How to add an entry

When making a decision that a future reader wouldn't re-derive from the code alone:

1. Add a dated `## YYYY-MM-DD — One-line summary` heading.
2. State the decision plainly.
3. Show the context or alternatives considered.
4. If it was measurement-driven, link to the evidence.
5. Name the tradeoff you accepted.
6. Link related commits.

Keep entries scannable. If you find yourself writing more than ~20 lines, the decision probably has sub-decisions worth breaking out separately.
