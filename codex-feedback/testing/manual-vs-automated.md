# Manual URL Testing Vs Automated Tests

Date: 2026-05-03

Manual Vercel testing, mocked browser tests, and AI evals overlap but answer different questions.

## Mocked Browser Tests

Command:

```bash
npm run test:e2e
```

Answers:

> Does the app UI and local state plumbing work when the AI returns valid data?

Good for:

- Upload flow
- Intent selection
- Cull result rendering
- Rating overrides
- Star/favorite persistence
- Toasts and badges
- LocalStorage updates
- Regression checks after UI/data-flow changes

Not good for:

- Claude scoring quality
- Real API failures
- Clerk/Stripe production state
- Latest Vercel deploy health

## AI Behavior Evals

Future command:

```bash
npm run eval:ai
```

Answers:

> Does Claude still score and describe fixed fixture images within expected ranges?

Good for:

- Prompt changes
- Rubric changes
- Profile influence changes
- Regression checks around known model failure cases

Not good for:

- Full deployed product health
- Auth/billing
- Manual UX feel

## Manual Vercel Smoke Test

Answers:

> Does the deployed product work for a real user?

Good for:

- Latest Vercel deployment
- Browser behavior
- Clerk sign-in
- Stripe/Pro state
- Server env vars
- Real API routes
- Real Claude responses
- UI feel
- End-to-end confidence before demos

Not good for:

- Repeatable regression coverage
- Cheap iteration
- Debugging prompt changes at scale

## Recommended Workflow

Before most code changes:

```bash
npm run typecheck
npm test
```

After prompt/scoring/profile changes:

```bash
npm run eval:ai
```

Before shipping/demoing:

1. `npm run build`
2. Deploy
3. Manually smoke-test the Vercel URL

The AI eval can reduce manual checking, but it should not replace a final manual smoke test.
