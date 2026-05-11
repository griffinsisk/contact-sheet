# Shipping Cleanup and Shared-Key Route Hardening

## Summary

This pass prepares Contact Sheet for the next public-facing iteration by doing two things:

1. Clean up stale project documentation so the repo accurately reflects the shipped app.
2. Add minimum viable server guardrails around shared-key API routes before building more persistence features on top.

This is intentionally not the Phase 2 persistence build. Clerk manifests, private Vercel Blob storage, image sync, and cross-device taste profiles remain the next product phase after this cleanup/security pass.

## Goals

- Make `docs/HANDOFF-V3.md`, `docs/PROJECT-REVIEW.md`, and `docs/NEXT-SESSION.md` agree on the current state: the Next.js app exists, Phase F is merged, Phase 1 local multi-profile taste profiles are merged, and production is live.
- Preserve the existing user-facing behavior of cull, develop shortlist, taste profile generation, and override description flows.
- Add centralized request guardrails for server routes that use the hosted Anthropic key.
- Prevent obviously abusive or accidental large requests from reaching the model provider.
- Add focused tests for the guard logic.

## Non-Goals

- No Clerk-gated route redesign in this pass.
- No persistent server-side taste profile sync in this pass.
- No Vercel Blob integration in this pass.
- No pricing, Stripe, or entitlement model changes beyond using existing tier helpers where needed.
- No broad UI redesign.

## Current Risk

Free and Pro server routes rely on the app's hosted Anthropic key. The client-side localStorage free quota is useful UX, but it is not a security boundary. A direct caller can bypass local client checks and send oversized or repeated requests to API routes.

This pass adds best-effort server protection. In-memory rate limits are not perfect on serverless infrastructure because instances are ephemeral and distributed, but they are still materially better than no guardrails and can be replaced later by Redis, Vercel KV, or another shared store.

## Route Scope

Inspect all `app/api/*` routes and classify them into:

- **Shared-key model routes**: routes that can spend the hosted Anthropic key.
- **Webhook/billing routes**: routes that already have their own verification path.
- **Read-only or non-model routes**: routes that do not need the same payload controls.

The implementation should focus hardening on every shared-key model route found during inspection. The route set must include cull, develop shortlist/deep review, taste profile generation, and override description when those routes use the hosted provider path.

## Guardrail Design

Create a small server-side guard module at `lib/request-guards.ts`, with pure helpers that can be unit tested without Next.js request objects.

The guard layer should support:

- **Body byte limit**: reject requests whose raw JSON body exceeds a configured maximum before parsing deeper.
- **Image count limit**: reject cull/profile requests with too many images or entries.
- **Estimated image payload limit**: use existing proxy payload estimation helpers where appropriate so large base64 bodies are blocked before provider submission.
- **IP-based rate limit**: best-effort in-memory token bucket or fixed-window limiter keyed by IP plus route group.
- **Safe error shape**: return clear HTTP statuses and concise messages without leaking provider keys, stack traces, or internal route details.

Route-specific limits should be conservative and match existing app behavior:

- Cull should allow normal app batches but reject very large direct calls.
- Develop Shortlist should preserve the existing payload-splitting/downsize behavior.
- Taste profile generation should allow the current favorite count cap.
- Override description should stay low volume.

## Client Behavior

The client should not need major changes. Existing flows should continue to call the same routes. If a server guard rejects a request, the existing error path should surface a useful message rather than failing silently.

If existing client error handling is insufficient for the new error shape, make the smallest route/client adjustment needed to display the message already thrown by the API layer.

## Documentation Cleanup

Update stale docs in place:

- `docs/HANDOFF-V3.md`: rewrite the "Current State" and "What Needs to Be Built" sections so they reflect the built component tree and current shipped phases.
- `docs/PROJECT-REVIEW.md`: adjust any stale review findings that describe missing components or outdated scoring architecture; keep still-valid risks.
- `docs/NEXT-SESSION.md`: mark Phase 1 production availability as checked by HTTP 200, keep manual production smoke as pending if it has not been completed, and make the immediate next work this cleanup/security pass.

Documentation should be factual, dated, and clear about what has been verified versus what is still pending.

## Testing

Add unit tests for the new guard helpers:

- Accept requests within configured byte/count/rate limits.
- Reject oversized JSON bodies.
- Reject excessive image or entry counts.
- Enforce rate limit windows for the same IP and route group.
- Keep separate IPs or route groups isolated.

Run:

```bash
npm run typecheck
npm run test:unit
npm run build
```

Run e2e if route changes affect browser-visible flows or if existing tests depend on the guarded routes.

## Rollout

This pass ships as a normal commit or PR on `main` after verification. After it lands, the next product phase can proceed to persistent multi-profile taste profiles with a cleaner project record and a safer hosted-key surface.
