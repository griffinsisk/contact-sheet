# Testing Handoff

Date: 2026-05-03

This folder explains the testing strategy for Contact Sheet so another AI agent can quickly understand what exists, what each test layer proves, and what still needs to be added.

## Current Test Layers

| Layer | Command | Purpose | Cost |
|---|---|---|---|
| Unit tests | `npm run test:unit` | Deterministic helper behavior | Free |
| Mocked browser smoke | `npm run test:e2e` | Real UI/data-flow plumbing with mocked AI routes | Free |
| Combined local suite | `npm test` | Unit + mocked browser smoke | Free |
| Typecheck | `npm run typecheck` | TypeScript correctness | Free |
| Production build | `npm run build` | Next.js build sanity | Free |

## What Exists In The Repo

- `docs/TESTING.md` — local project testing docs
- `playwright.config.ts` — Playwright setup
- `tests/unit/exports.test.ts` — export/XMP/manifest behavior
- `tests/unit/providers.test.ts` — JSON parse and truncation repair
- `tests/unit/tier.test.ts` — tier resolution and free quota gates
- `tests/e2e/contact-sheet-smoke.spec.ts` — mocked UI flow for upload → cull → correction → revert/Undo → star persistence → profile regen plumbing

## What The Existing Tests Prove

The current automated tests prove the local app plumbing works around mocked AI output:

- Photos can be uploaded through the real UI.
- Shoot intent can be selected.
- A cull result can be rendered.
- A rating correction can be applied.
- The first correction toast shows educational copy.
- Subsequent correction toasts stay short.
- Undo removes the latest correction signal.
- Reverting back to the AI rating removes the override signal.
- Correction state persists to `cs-overrides`.
- Star/favorite state persists to `cs-taste-library`.
- The View Profile modal renders favorites and pending corrections.
- Manual regen includes `corrections[]` in the `/api/taste-profile` request.
- Pending correction state clears after regen succeeds.
- Export helpers respect human overrides.
- JSON repair handles common truncated AI responses.
- Free/pro/BYOK tier gates behave locally.

## What They Do Not Prove

The existing tests do **not** prove:

- Claude's live judgment quality
- Taste profile generation quality
- Actual scoring accuracy on real photos
- Clerk auth behavior in production
- Stripe subscription state
- Latest Vercel deploy health
- Full manual UX feel
- Lightroom compatibility of generated XMP in a real catalog

Those need separate AI evals and manual production smoke tests.

## Recommended Agent Workflow

Before editing app code:

```bash
npm run typecheck
npm test
```

After UI/data-flow changes:

```bash
npm run test:e2e
```

After prompt/scoring/profile changes:

```bash
npm run eval:ai
```

`eval:ai` does not exist yet. See `ai-behavior-evals.md` for the recommended design.

Before deploy/demo:

```bash
npm run build
```

Then manually smoke-test the deployed Vercel URL.

## Local Test Notes

The Playwright test starts a local Next server on port `3100` using:

```bash
npm run dev:test
```

`dev:test` enables `NEXT_PUBLIC_E2E_MOCK_PRO=1` so Playwright can cover Pro-only taste-profile surfaces without Clerk sign-in. This is a local test affordance only.

The e2e test mocks `/api/cull` and `/api/override-describe`, so it does not require `ANTHROPIC_API_KEY`, Clerk sign-in, Pro state, or network access to Claude.

In constrained sandboxes, `tsx` and Playwright may need permission to create local IPC/server sockets. If `npm test` fails with `EPERM` on a pipe or port, rerun the command with appropriate sandbox approval.
