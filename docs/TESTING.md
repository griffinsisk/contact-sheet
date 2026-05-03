# Testing

This project now has two automated test layers:

## Unit Tests

```bash
npm run test:unit
```

Uses Node's built-in test runner through `tsx`.

Current coverage:

- Export helpers: filename sanitization, XMP escaping, organization scripts, manifest override copy
- JSON parsing and truncated-response repair
- Tier resolution and free-tier local quota gates

## Mocked Browser Smoke Test

```bash
npm run test:e2e
```

Uses Playwright against a local Next.js dev server on `127.0.0.1:3100`.
`npm run dev:test` enables `NEXT_PUBLIC_E2E_MOCK_PRO=1` so the browser tests can exercise Pro-only profile surfaces without Clerk sign-in.

The current smoke test mocks Claude-facing API routes and verifies:

- Uploading photos through the real UI
- Selecting shoot intent
- Running a mocked cull
- Applying a rating correction
- Persisting the correction signal to `cs-overrides`
- Starring a frame
- Persisting the favorite to `cs-taste-library`

## Full Local Verification

```bash
npm run typecheck
npm run build
npm test
```

`npm test` runs unit tests followed by the mocked Playwright smoke test.

## Live Claude Testing

Live Claude smoke tests are intentionally not automated yet. They should stay separate from the default test suite because they require auth, paid-tier state, environment variables, real images, and API spend.

Good live checks:

- One small real cull
- One taste-profile regen
- One override-description call
- Phase E profile-aware scoring validation once implemented
