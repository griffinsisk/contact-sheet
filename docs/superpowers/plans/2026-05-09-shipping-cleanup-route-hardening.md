# Shipping Cleanup and Shared-Key Route Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update stale project docs and add best-effort server guardrails around hosted-key model routes.

**Architecture:** Add `lib/request-guards.ts` as a small shared server guard layer with pure helpers for byte limits, array-count limits, safe JSON parsing, IP extraction, and fixed-window rate limiting. Wire every hosted-key model route through those guards before provider calls while preserving existing route contracts and client behavior. Update handoff/review docs after the route hardening lands.

**Tech Stack:** Next.js route handlers, TypeScript, Node `node:test`, existing provider/proxy helpers, in-memory fixed-window rate limiting.

---

## File Structure

- Create `lib/request-guards.ts`: shared request guard types, constants, byte/count validation, JSON parsing, IP extraction, in-memory rate limiter, and `readGuardedJson`.
- Create `tests/unit/request-guards.test.ts`: unit coverage for guard helpers and rate limiting behavior.
- Modify `app/api/cull/route.ts`: replace `req.json()` with guarded JSON read; enforce cull image/text limits before `callProvider`.
- Modify `app/api/deep-review/route.ts`: replace `req.json()` with guarded JSON read; enforce develop-shortlist image/text limits before `callProvider`.
- Modify `app/api/compare/route.ts`: replace `req.json()` with guarded JSON read; enforce exactly two comparison images.
- Modify `app/api/taste-profile/route.ts`: replace `req.json()` with guarded JSON read; preserve existing Pro gate and entry/correction validation.
- Modify `app/api/override-describe/route.ts`: replace `req.json()` with guarded JSON read; enforce single-image request limits.
- Modify `docs/HANDOFF-V3.md`: remove stale "ContactSheet missing" state and describe the current shipped app.
- Modify `docs/PROJECT-REVIEW.md`: replace obsolete review findings with current risks, including shared-key protection status.
- Modify `docs/NEXT-SESSION.md`: record this cleanup/security pass as current work and keep manual Phase 1 production smoke pending.

---

### Task 1: Request Guard Tests

**Files:**
- Create: `tests/unit/request-guards.test.ts`
- Later implementation: `lib/request-guards.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/request-guards.test.ts` with:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  REQUEST_GUARD_LIMITS,
  assertArrayLimit,
  assertBodyByteLimit,
  clearRateLimitStore,
  getClientIp,
  parseJsonBody,
  checkRateLimit,
} from "../../lib/request-guards";

test.beforeEach(() => {
  clearRateLimitStore();
});

test("assertBodyByteLimit accepts bodies within the configured cap", () => {
  const result = assertBodyByteLimit(JSON.stringify({ ok: true }), 100);

  assert.deepEqual(result, { ok: true });
});

test("assertBodyByteLimit rejects oversized JSON bodies", () => {
  const result = assertBodyByteLimit(JSON.stringify({ image: "x".repeat(50) }), 20);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 413);
    assert.match(result.error, /too large/i);
  }
});

test("parseJsonBody returns safe 400 failures for malformed JSON", () => {
  const result = parseJsonBody("{bad json");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.equal(result.error, "Invalid JSON body");
  }
});

test("assertArrayLimit rejects excessive image counts", () => {
  const result = assertArrayLimit(
    { images: [1, 2, 3] },
    { field: "images", label: "images", max: 2 },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 413);
    assert.match(result.error, /at most 2 images/i);
  }
});

test("assertArrayLimit can require exactly two comparison images", () => {
  const result = assertArrayLimit(
    { images: [1] },
    { field: "images", label: "comparison images", min: 2, max: 2 },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.match(result.error, /at least 2 comparison images/i);
  }
});

test("getClientIp prefers forwarded client headers", () => {
  const headers = new Headers({
    "x-forwarded-for": "203.0.113.4, 10.0.0.1",
    "x-real-ip": "198.51.100.2",
  });

  assert.equal(getClientIp(headers), "203.0.113.4");
});

test("getClientIp falls back to unknown when headers are absent", () => {
  assert.equal(getClientIp(new Headers()), "unknown");
});

test("checkRateLimit blocks repeated calls in the same fixed window", () => {
  const first = checkRateLimit({
    key: "ip-a:cull",
    maxRequests: 2,
    windowMs: 1_000,
    now: 10_000,
  });
  const second = checkRateLimit({
    key: "ip-a:cull",
    maxRequests: 2,
    windowMs: 1_000,
    now: 10_100,
  });
  const third = checkRateLimit({
    key: "ip-a:cull",
    maxRequests: 2,
    windowMs: 1_000,
    now: 10_200,
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(third.ok, false);
  if (!third.ok) {
    assert.equal(third.status, 429);
    assert.equal(third.retryAfterSeconds, 1);
  }
});

test("checkRateLimit isolates different IPs and route groups", () => {
  assert.equal(checkRateLimit({ key: "ip-a:cull", maxRequests: 1, windowMs: 1_000, now: 1 }).ok, true);
  assert.equal(checkRateLimit({ key: "ip-a:cull", maxRequests: 1, windowMs: 1_000, now: 2 }).ok, false);
  assert.equal(checkRateLimit({ key: "ip-b:cull", maxRequests: 1, windowMs: 1_000, now: 3 }).ok, true);
  assert.equal(checkRateLimit({ key: "ip-a:compare", maxRequests: 1, windowMs: 1_000, now: 4 }).ok, true);
});

test("configured hosted-key limits match current app batch contracts", () => {
  assert.equal(REQUEST_GUARD_LIMITS.cull.maxImages, 20);
  assert.equal(REQUEST_GUARD_LIMITS.deepReview.maxImages, 12);
  assert.equal(REQUEST_GUARD_LIMITS.compare.maxImages, 2);
  assert.equal(REQUEST_GUARD_LIMITS.tasteProfile.maxEntries, 30);
  assert.equal(REQUEST_GUARD_LIMITS.overrideDescribe.maxImages, 1);
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm run test:unit
```

Expected: FAIL because `../../lib/request-guards` does not exist.

- [ ] **Step 3: Commit nothing**

Do not commit the failing tests alone. Continue to Task 2.

---

### Task 2: Request Guard Implementation

**Files:**
- Create: `lib/request-guards.ts`
- Test: `tests/unit/request-guards.test.ts`

- [ ] **Step 1: Implement `lib/request-guards.ts`**

Create `lib/request-guards.ts` with:

```ts
import { PROXY_PAYLOAD_SOFT_LIMIT_BYTES } from "./proxy-payload";

export type GuardSuccess<T = void> = { ok: true; value?: T };
export type GuardFailure = {
  ok: false;
  status: number;
  error: string;
  retryAfterSeconds?: number;
};
export type GuardResult<T = void> = GuardSuccess<T> | GuardFailure;

export type GuardedRouteGroup =
  | "cull"
  | "deepReview"
  | "compare"
  | "tasteProfile"
  | "overrideDescribe";

export interface RouteGuardLimit {
  maxBodyBytes: number;
  maxRequests: number;
  windowMs: number;
  maxImages?: number;
  maxEntries?: number;
}

export const REQUEST_GUARD_LIMITS: Record<GuardedRouteGroup, RouteGuardLimit> = {
  cull: {
    maxBodyBytes: PROXY_PAYLOAD_SOFT_LIMIT_BYTES,
    maxImages: 20,
    maxRequests: 30,
    windowMs: 60_000,
  },
  deepReview: {
    maxBodyBytes: PROXY_PAYLOAD_SOFT_LIMIT_BYTES,
    maxImages: 12,
    maxRequests: 15,
    windowMs: 60_000,
  },
  compare: {
    maxBodyBytes: PROXY_PAYLOAD_SOFT_LIMIT_BYTES,
    maxImages: 2,
    maxRequests: 30,
    windowMs: 60_000,
  },
  tasteProfile: {
    maxBodyBytes: PROXY_PAYLOAD_SOFT_LIMIT_BYTES,
    maxEntries: 30,
    maxRequests: 10,
    windowMs: 5 * 60_000,
  },
  overrideDescribe: {
    maxBodyBytes: 1_500_000,
    maxImages: 1,
    maxRequests: 40,
    windowMs: 60_000,
  },
};

type RateBucket = { count: number; resetAt: number };
const rateLimitStore = new Map<string, RateBucket>();

function jsonByteLength(bodyText: string): number {
  return new TextEncoder().encode(bodyText).length;
}

function failure(status: number, error: string, retryAfterSeconds?: number): GuardFailure {
  return retryAfterSeconds === undefined
    ? { ok: false, status, error }
    : { ok: false, status, error, retryAfterSeconds };
}

export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

export function assertBodyByteLimit(bodyText: string, maxBodyBytes: number): GuardResult {
  const bytes = jsonByteLength(bodyText);
  if (bytes <= maxBodyBytes) return { ok: true };
  return failure(
    413,
    `Request body is too large. Limit is ${Math.floor(maxBodyBytes / 1024 / 1024)} MB.`,
  );
}

export function parseJsonBody(bodyText: string): GuardResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(bodyText) };
  } catch {
    return failure(400, "Invalid JSON body");
  }
}

export function assertArrayLimit(
  body: unknown,
  options: { field: string; label: string; min?: number; max: number },
): GuardResult {
  const value = body && typeof body === "object"
    ? (body as Record<string, unknown>)[options.field]
    : undefined;
  if (!Array.isArray(value)) return failure(400, `Body must include ${options.field}[]`);
  if (options.min !== undefined && value.length < options.min) {
    return failure(400, `Request must include at least ${options.min} ${options.label}.`);
  }
  if (value.length > options.max) {
    return failure(413, `Request may include at most ${options.max} ${options.label}.`);
  }
  return { ok: true };
}

export function assertStringField(
  body: unknown,
  options: { field: string; label: string; maxLength: number },
): GuardResult {
  const value = body && typeof body === "object"
    ? (body as Record<string, unknown>)[options.field]
    : undefined;
  if (typeof value !== "string" || value.length === 0) {
    return failure(400, `Body must include ${options.label}`);
  }
  if (value.length > options.maxLength) {
    return failure(413, `${options.label} is too large.`);
  }
  return { ok: true };
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const cfIp = headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;
  return "unknown";
}

export function checkRateLimit(options: {
  key: string;
  maxRequests: number;
  windowMs: number;
  now?: number;
}): GuardResult {
  const now = options.now ?? Date.now();
  const existing = rateLimitStore.get(options.key);
  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(options.key, { count: 1, resetAt: now + options.windowMs });
    return { ok: true };
  }

  if (existing.count >= options.maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return failure(429, "Too many requests. Try again shortly.", retryAfterSeconds);
  }

  existing.count += 1;
  rateLimitStore.set(options.key, existing);
  return { ok: true };
}

export async function readGuardedJson(
  req: { text(): Promise<string>; headers: Headers },
  routeGroup: GuardedRouteGroup,
): Promise<GuardResult<unknown>> {
  const limits = REQUEST_GUARD_LIMITS[routeGroup];
  const clientIp = getClientIp(req.headers);
  const rate = checkRateLimit({
    key: `${clientIp}:${routeGroup}`,
    maxRequests: limits.maxRequests,
    windowMs: limits.windowMs,
  });
  if (!rate.ok) return rate;

  const bodyText = await req.text();
  const size = assertBodyByteLimit(bodyText, limits.maxBodyBytes);
  if (!size.ok) return size;

  return parseJsonBody(bodyText);
}
```

- [ ] **Step 2: Run the guard tests**

Run:

```bash
npm run test:unit
```

Expected: PASS, with the total test count increased by the new request guard tests.

- [ ] **Step 3: Commit guard helpers and tests**

Run:

```bash
git add lib/request-guards.ts tests/unit/request-guards.test.ts
git commit -m "test: add shared request guard coverage"
```

Expected: commit succeeds with only the guard module and its tests.

---

### Task 3: Wire Guards Into Hosted-Key Routes

**Files:**
- Modify: `app/api/cull/route.ts`
- Modify: `app/api/deep-review/route.ts`
- Modify: `app/api/compare/route.ts`
- Modify: `app/api/taste-profile/route.ts`
- Modify: `app/api/override-describe/route.ts`
- Test: `tests/unit/request-guards.test.ts`

- [ ] **Step 1: Add guard imports to each hosted-key route**

In each route file, add the imports needed by that route:

```ts
import {
  assertArrayLimit,
  assertStringField,
  readGuardedJson,
  REQUEST_GUARD_LIMITS,
  type GuardFailure,
} from "@/lib/request-guards";
```

Routes that do not validate a string field do not need `assertStringField`. Routes that do not reference `REQUEST_GUARD_LIMITS` directly do not need that import.

- [ ] **Step 2: Add a local guard response helper in each route**

Add this helper near the top of each modified route:

```ts
function guardResponse(failure: GuardFailure) {
  return NextResponse.json(
    { error: failure.error },
    {
      status: failure.status,
      headers: failure.retryAfterSeconds
        ? { "Retry-After": String(failure.retryAfterSeconds) }
        : undefined,
    },
  );
}
```

- [ ] **Step 3: Replace JSON parsing in `app/api/cull/route.ts`**

Replace the existing `let body` / `req.json()` block with:

```ts
  const guarded = await readGuardedJson(req, "cull");
  if (!guarded.ok) return guardResponse(guarded);
  const body: any = guarded.value;
```

After the existing `images` / `textParts` array check, add:

```ts
  const imageLimit = assertArrayLimit(body, {
    field: "images",
    label: "images",
    max: REQUEST_GUARD_LIMITS.cull.maxImages ?? 20,
  });
  if (!imageLimit.ok) return guardResponse(imageLimit);

  const textLimit = assertArrayLimit(body, {
    field: "textParts",
    label: "text parts",
    max: REQUEST_GUARD_LIMITS.cull.maxImages ?? 20,
  });
  if (!textLimit.ok) return guardResponse(textLimit);
```

- [ ] **Step 4: Replace JSON parsing in `app/api/deep-review/route.ts`**

Replace the existing `let body` / `req.json()` block with:

```ts
  const guarded = await readGuardedJson(req, "deepReview");
  if (!guarded.ok) return guardResponse(guarded);
  const body: any = guarded.value;
```

After the existing `images` / `textParts` array check, add:

```ts
  const imageLimit = assertArrayLimit(body, {
    field: "images",
    label: "images",
    max: REQUEST_GUARD_LIMITS.deepReview.maxImages ?? 12,
  });
  if (!imageLimit.ok) return guardResponse(imageLimit);

  const textLimit = assertArrayLimit(body, {
    field: "textParts",
    label: "text parts",
    max: REQUEST_GUARD_LIMITS.deepReview.maxImages ?? 12,
  });
  if (!textLimit.ok) return guardResponse(textLimit);
```

- [ ] **Step 5: Replace JSON parsing in `app/api/compare/route.ts`**

Replace the existing `let body` / `req.json()` block with:

```ts
  const guarded = await readGuardedJson(req, "compare");
  if (!guarded.ok) return guardResponse(guarded);
  const body: any = guarded.value;
```

After the existing `images` / `textParts` array check, add:

```ts
  const imageLimit = assertArrayLimit(body, {
    field: "images",
    label: "comparison images",
    min: 2,
    max: REQUEST_GUARD_LIMITS.compare.maxImages ?? 2,
  });
  if (!imageLimit.ok) return guardResponse(imageLimit);

  const textLimit = assertArrayLimit(body, {
    field: "textParts",
    label: "text parts",
    min: 2,
    max: 2,
  });
  if (!textLimit.ok) return guardResponse(textLimit);
```

- [ ] **Step 6: Replace JSON parsing in `app/api/taste-profile/route.ts`**

Replace the existing `let body` / `req.json()` block with:

```ts
  const guarded = await readGuardedJson(req, "tasteProfile");
  if (!guarded.ok) return guardResponse(guarded);
  const body: any = guarded.value;
```

Immediately before `const entries = coerceEntries(body?.entries);`, add:

```ts
  const entryLimit = assertArrayLimit(body, {
    field: "entries",
    label: "entries",
    max: REQUEST_GUARD_LIMITS.tasteProfile.maxEntries ?? 30,
  });
  if (!entryLimit.ok) return guardResponse(entryLimit);
```

- [ ] **Step 7: Replace JSON parsing in `app/api/override-describe/route.ts`**

Replace the existing `let body` / `req.json()` block with:

```ts
  const guarded = await readGuardedJson(req, "overrideDescribe");
  if (!guarded.ok) return guardResponse(guarded);
  const body: any = guarded.value;
```

Immediately before the existing image string check, add:

```ts
  const imageGuard = assertStringField(body, {
    field: "image",
    label: "image (base64)",
    maxLength: REQUEST_GUARD_LIMITS.overrideDescribe.maxBodyBytes,
  });
  if (!imageGuard.ok) return guardResponse(imageGuard);
```

- [ ] **Step 8: Run targeted verification**

Run:

```bash
npm run typecheck
npm run test:unit
```

Expected: both commands pass.

- [ ] **Step 9: Commit route hardening**

Run:

```bash
git add app/api/cull/route.ts app/api/deep-review/route.ts app/api/compare/route.ts app/api/taste-profile/route.ts app/api/override-describe/route.ts
git commit -m "fix: guard hosted model routes"
```

Expected: commit succeeds with only the route integrations.

---

### Task 4: Documentation Cleanup

**Files:**
- Modify: `docs/HANDOFF-V3.md`
- Modify: `docs/PROJECT-REVIEW.md`
- Modify: `docs/NEXT-SESSION.md`

- [ ] **Step 1: Update `docs/HANDOFF-V3.md` current-state sections**

Replace the stale section that says the Next.js app is partially scaffolded and `ContactSheet.tsx` is missing with current prose:

```md
## Current State

The Next.js app is built and live in production at https://contact-sheet-three.vercel.app. The current component tree includes `components/ContactSheet.tsx`, focused UI components for the grid/detail/modals/sidebar, and server routes for hosted-key free/pro model calls.

Phase F reframed the second pass from Deep Review to **Develop Shortlist** with **Editor's Notes** output. Phase 1 local multi-profile taste profiles is merged on `main`: local v2 taste-library collections, named profiles, active-profile switching at cull time, per-profile favorites/profile regeneration, and profile-scoped corrections.

The next product phase is persistent Pro taste profiles: Clerk manifest, private Vercel Blob collection storage, private image upload/resolve/delete routes, and local-to-server migration. This is documented in `docs/superpowers/specs/2026-05-05-persistent-multi-profile-design.md`.
```

Replace "What Needs to Be Built" with:

```md
## What Needs to Be Built Next

### 1. Production Smoke for Phase 1

- Create a new named profile and confirm typing does not lose focus.
- Seed the new profile and confirm View Profile shows favorites under that profile, not `My Profile`.
- Switch between profiles in the modal and at cull time.
- Cull once with each active profile and confirm the selected profile influences request/profile context.
- Star and correct a frame, then confirm View Profile only shows signals for the active profile.

### 2. Persistent Multi-Profile Taste Profiles

Build the Phase 2 persistence layer from `docs/superpowers/specs/2026-05-05-persistent-multi-profile-design.md`:

- Clerk `tasteProfileManifest`.
- Private Vercel Blob collection JSON at `taste/{clerkUserId}/collection.json`.
- Private image upload, resolve, and delete routes.
- Pro sync and local-to-server migration.
- Conflict handling with `updatedAt`.

### 3. Deterministic/Measured Photo Analysis

Add browser-side measured facts such as blur score, clipping, contrast, perceptual hashes, duplicate clusters, and EXIF risk flags before feeding those facts into cull prompts.
```

- [ ] **Step 2: Update `docs/PROJECT-REVIEW.md`**

Replace the opening current-state bullets with:

```md
## Current State
- **Next.js app**: Built and live. `components/ContactSheet.tsx` now drives the full workflow with focused components for grid, detail panel, export, compare, sessions, seed upload, sidebar, and profile controls.
- **AI workflow**: Cull remains the decision engine. The second pass is now **Develop Shortlist**, producing **Editor's Notes** rather than a competing score-first review.
- **Taste profiles**: Phase 1 local multi-profile support is merged: v2 localStorage collection migration, named local profiles, active-profile switching, profile-scoped favorites/profile regeneration, and correction scoping.
- **Hosted-key routes**: Free/pro server routes use the hosted Anthropic key and now need server-side guardrails before the next public iteration.
```

Replace the obsolete critical finding "The App Doesn't Exist Yet" with:

```md
### 1. Hosted-Key Route Exposure (Critical)

Free/pro model routes spend the hosted Anthropic key. Client-side localStorage quota is useful UX, but direct callers can bypass it. Server routes need body-size limits, image-count limits, best-effort IP rate limiting, and safe error responses.

**What to do**: Add shared request guards for `/api/cull`, `/api/deep-review`, `/api/compare`, `/api/taste-profile`, and `/api/override-describe`. Keep BYOK direct-provider behavior unchanged.
```

Replace "No Tests" with:

```md
### 6. Broaden Conventional Tests

The project now has unit and e2e coverage for scoring, exports, provider parsing, proxy payload splitting, tier gates, taste-library persistence, and the main mocked browser flow. Remaining high-value conventional tests include EXIF binary edge cases, raw-preview extraction, more API-route guard behavior, and failure-path UI states.
```

Update the priority list to:

```md
## Priority Order for the Next Public Iteration

1. **Guard hosted-key routes** — body limits, image-count limits, and best-effort server rate limiting.
2. **Run Phase 1 production smoke** — verify multi-profile flows on the live Vercel app.
3. **Update stale handoff docs** — keep the portfolio story aligned with the shipped app.
4. **Build Phase 2 persistence** — Clerk manifest plus private Vercel Blob sync for Pro taste profiles.
5. **Add deterministic technical metrics** — blur, clipping, contrast, duplicate clusters, and EXIF risk flags.
```

- [ ] **Step 3: Update `docs/NEXT-SESSION.md`**

Change the title to:

```md
# Next Session — Shipping Cleanup / Shared-Key Route Hardening
```

Change the updated date to:

```md
**Updated:** 2026-05-09
```

Add this current-work paragraph after the production line:

```md
**Current cleanup spec:** `docs/superpowers/specs/2026-05-09-shipping-cleanup-route-hardening-design.md`
**Current cleanup plan:** `docs/superpowers/plans/2026-05-09-shipping-cleanup-route-hardening.md`
```

Replace the next steps with:

```md
## Next Steps

1. Finish shipping cleanup and shared-key route hardening:
   - Add `lib/request-guards.ts`.
   - Guard `/api/cull`, `/api/deep-review`, `/api/compare`, `/api/taste-profile`, and `/api/override-describe`.
   - Update stale handoff/review docs.
   - Verify with `npm run typecheck`, `npm run test:unit`, and `npm run build`.
2. Run production smoke on https://contact-sheet-three.vercel.app:
   - Create a new named profile and confirm typing does not lose focus.
   - Seed the new profile and confirm View Profile shows favorites under that profile, not `My Profile`.
   - Switch between profiles in the modal and at cull time.
   - Cull once with each active profile and confirm the selected profile influences the request/profile context.
   - Star and correct a frame, then confirm View Profile only shows signals for the active profile.
3. Start Phase 2 persistence after cleanup/security and production smoke:
   - Clerk `tasteProfileManifest`.
   - Private Vercel Blob `taste/{clerkUserId}/collection.json`.
   - Private image upload/resolve/delete routes.
   - Pro sync and local-to-server migration.
   - Conflict handling with `updatedAt`.
```

- [ ] **Step 4: Run docs scan**

Run:

```bash
rg -n "ContactSheet.tsx.*missing|Does not exist|partially scaffolded|cannot render|PR #5 is open|feature/editorial-review-reframe" docs/HANDOFF-V3.md docs/PROJECT-REVIEW.md docs/NEXT-SESSION.md
```

Expected: no matches.

- [ ] **Step 5: Commit docs cleanup**

Run:

```bash
git add docs/HANDOFF-V3.md docs/PROJECT-REVIEW.md docs/NEXT-SESSION.md
git commit -m "docs: refresh project handoff status"
```

Expected: commit succeeds with only docs changes.

---

### Task 5: Final Verification

**Files:**
- No edits.

- [ ] **Step 1: Run required verification**

Run:

```bash
npm run typecheck
npm run test:unit
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Decide whether e2e is required**

Run e2e because route files changed and the mocked browser flow intercepts the guarded endpoints:

```bash
npm run test:e2e
```

Expected: Playwright passes.

- [ ] **Step 3: Check git status**

Run:

```bash
git status --short --branch
```

Expected: clean working tree on `main`, ahead of `origin/main` by the spec and implementation commits.

- [ ] **Step 4: Report outcome**

Report:

- Commits created.
- Guarded routes.
- Docs updated.
- Verification command results.
- Any remaining manual production-smoke gaps.

