import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_RATE_LIMIT_KEYS,
  REQUEST_GUARD_LIMITS,
  assertArrayLimit,
  assertBodyByteLimit,
  assertStringField,
  checkRateLimit,
  clearRateLimitStore,
  getClientIp,
  getRateLimitStoreSizeForTests,
  parseJsonBody,
  readGuardedJson,
} from "../../lib/request-guards";
import { PROXY_PAYLOAD_SOFT_LIMIT_BYTES } from "../../lib/proxy-payload";

test.beforeEach(() => {
  clearRateLimitStore();
});

test("assertBodyByteLimit accepts within cap and rejects oversized bodies with 413", () => {
  assert.deepEqual(assertBodyByteLimit("hello", 5), { ok: true });

  const result = assertBodyByteLimit("hello!", 5);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 413);
    assert.match(result.error, /too large/i);
  }
});

test("parseJsonBody returns 400 Invalid JSON body for malformed JSON", () => {
  assert.deepEqual(parseJsonBody('{"ok":true}'), { ok: true, value: { ok: true } });

  const result = parseJsonBody("{bad json");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.equal(result.error, "Invalid JSON body");
  }
});

test("assertArrayLimit rejects excessive image counts", () => {
  const result = assertArrayLimit(
    { images: Array.from({ length: 21 }, (_, index) => ({ id: index })) },
    { field: "images", label: "images", max: 20 },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 413);
    assert.match(result.error, /at most 20 images/i);
  }
});

test("assertArrayLimit can require exactly two comparison images", () => {
  assert.deepEqual(
    assertArrayLimit(
      { images: [{ id: "a" }, { id: "b" }] },
      { field: "images", label: "comparison images", min: 2, max: 2 },
    ),
    { ok: true },
  );

  const result = assertArrayLimit(
    { images: [{ id: "a" }] },
    { field: "images", label: "comparison images", min: 2, max: 2 },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.match(result.error, /exactly 2 comparison images/i);
  }
});

test("assertArrayLimit classifies too many exact-count items as oversized", () => {
  const result = assertArrayLimit(
    { images: [{ id: "a" }, { id: "b" }, { id: "c" }] },
    { field: "images", label: "comparison images", min: 2, max: 2 },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 413);
    assert.match(result.error, /at most 2 comparison images/i);
  }
});

test("assertStringField rejects empty strings as missing fields", () => {
  const result = assertStringField(
    { prompt: "" },
    { field: "prompt", label: "prompt", maxLength: 10 },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.equal(result.error, "Body must include prompt.");
  }
});

test("assertStringField rejects overlong strings as oversized", () => {
  const result = assertStringField(
    { prompt: "a".repeat(11) },
    { field: "prompt", label: "prompt", maxLength: 10 },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 413);
    assert.match(result.error, /too large/i);
  }
});

test("getClientIp prefers x-forwarded-for first IP, then falls back to unknown", () => {
  assert.equal(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.10, 198.51.100.8" })), "203.0.113.10");
  assert.equal(getClientIp(new Headers()), "unknown");
});

test("getClientIp falls back to cf-connecting-ip after x-real-ip", () => {
  assert.equal(
    getClientIp(new Headers({ "x-real-ip": "198.51.100.9", "cf-connecting-ip": "203.0.113.22" })),
    "198.51.100.9",
  );
  assert.equal(getClientIp(new Headers({ "cf-connecting-ip": "203.0.113.22" })), "203.0.113.22");
});

test("checkRateLimit blocks repeated calls in same window", () => {
  assert.deepEqual(checkRateLimit({ key: "ip-a:cull", maxRequests: 2, windowMs: 60_000, now: 1_000 }), { ok: true });
  assert.deepEqual(checkRateLimit({ key: "ip-a:cull", maxRequests: 2, windowMs: 60_000, now: 2_000 }), { ok: true });

  const result = checkRateLimit({ key: "ip-a:cull", maxRequests: 2, windowMs: 60_000, now: 3_000 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 429);
    assert.equal(result.error, "Too many requests. Try again shortly.");
    assert.ok((result.retryAfterSeconds ?? 0) >= 1);
  }
});

test("checkRateLimit allows a key again after its window expires", () => {
  assert.deepEqual(checkRateLimit({ key: "ip-a:cull", maxRequests: 1, windowMs: 1_000, now: 1_000 }), { ok: true });

  const blocked = checkRateLimit({ key: "ip-a:cull", maxRequests: 1, windowMs: 1_000, now: 1_500 });
  assert.equal(blocked.ok, false);

  assert.deepEqual(checkRateLimit({ key: "ip-a:cull", maxRequests: 1, windowMs: 1_000, now: 2_000 }), { ok: true });
});

test("checkRateLimit prunes expired entries before adding new keys", () => {
  assert.deepEqual(checkRateLimit({ key: "stale-a:cull", maxRequests: 1, windowMs: 1_000, now: 1_000 }), { ok: true });
  assert.deepEqual(checkRateLimit({ key: "stale-b:cull", maxRequests: 1, windowMs: 1_000, now: 1_001 }), { ok: true });
  assert.equal(getRateLimitStoreSizeForTests(), 2);

  assert.deepEqual(checkRateLimit({ key: "fresh-a:cull", maxRequests: 1, windowMs: 1_000, now: 2_001 }), { ok: true });
  assert.equal(getRateLimitStoreSizeForTests(), 1);
});

test("checkRateLimit caps the store and evicts the oldest live key", () => {
  for (let index = 0; index < MAX_RATE_LIMIT_KEYS + 1; index += 1) {
    assert.deepEqual(
      checkRateLimit({
        key: `ip-${index}:cull`,
        maxRequests: 1,
        windowMs: 1_000_000,
        now: 1_000 + index,
      }),
      { ok: true },
    );
  }

  assert.equal(getRateLimitStoreSizeForTests(), MAX_RATE_LIMIT_KEYS);

  const newestResult = checkRateLimit({
    key: `ip-${MAX_RATE_LIMIT_KEYS}:cull`,
    maxRequests: 1,
    windowMs: 1_000_000,
    now: 10_000,
  });
  assert.equal(newestResult.ok, false);

  assert.deepEqual(
    checkRateLimit({
      key: "ip-0:cull",
      maxRequests: 1,
      windowMs: 1_000_000,
      now: 10_001,
    }),
    { ok: true },
  );
  assert.equal(getRateLimitStoreSizeForTests(), MAX_RATE_LIMIT_KEYS);
});

test("checkRateLimit isolates different IPs and route groups", () => {
  assert.deepEqual(checkRateLimit({ key: "ip-a:cull", maxRequests: 1, windowMs: 60_000, now: 1_000 }), { ok: true });
  assert.deepEqual(checkRateLimit({ key: "ip-b:cull", maxRequests: 1, windowMs: 60_000, now: 2_000 }), { ok: true });
  assert.deepEqual(checkRateLimit({ key: "ip-a:compare", maxRequests: 1, windowMs: 60_000, now: 3_000 }), { ok: true });

  const result = checkRateLimit({ key: "ip-a:cull", maxRequests: 1, windowMs: 60_000, now: 4_000 });
  assert.equal(result.ok, false);
});

test("REQUEST_GUARD_LIMITS values match hosted-key route caps", () => {
  assert.equal(REQUEST_GUARD_LIMITS.cull.maxBodyBytes, PROXY_PAYLOAD_SOFT_LIMIT_BYTES);
  assert.equal(REQUEST_GUARD_LIMITS.cull.maxImages, 20);
  assert.equal(REQUEST_GUARD_LIMITS.cull.maxRequests, 30);
  assert.equal(REQUEST_GUARD_LIMITS.cull.windowMs, 60_000);
  assert.equal(REQUEST_GUARD_LIMITS.deepReview.maxBodyBytes, PROXY_PAYLOAD_SOFT_LIMIT_BYTES);
  assert.equal(REQUEST_GUARD_LIMITS.deepReview.maxImages, 12);
  assert.equal(REQUEST_GUARD_LIMITS.deepReview.maxRequests, 15);
  assert.equal(REQUEST_GUARD_LIMITS.deepReview.windowMs, 60_000);
  assert.equal(REQUEST_GUARD_LIMITS.compare.maxBodyBytes, PROXY_PAYLOAD_SOFT_LIMIT_BYTES);
  assert.equal(REQUEST_GUARD_LIMITS.compare.maxImages, 2);
  assert.equal(REQUEST_GUARD_LIMITS.compare.maxRequests, 30);
  assert.equal(REQUEST_GUARD_LIMITS.compare.windowMs, 60_000);
  assert.equal(REQUEST_GUARD_LIMITS.tasteProfile.maxBodyBytes, PROXY_PAYLOAD_SOFT_LIMIT_BYTES);
  assert.equal(REQUEST_GUARD_LIMITS.tasteProfile.maxEntries, 30);
  assert.equal(REQUEST_GUARD_LIMITS.tasteProfile.maxRequests, 10);
  assert.equal(REQUEST_GUARD_LIMITS.tasteProfile.windowMs, 300_000);
  assert.equal(REQUEST_GUARD_LIMITS.overrideDescribe.maxBodyBytes, 1_500_000);
  assert.equal(REQUEST_GUARD_LIMITS.overrideDescribe.maxImages, 1);
  assert.equal(REQUEST_GUARD_LIMITS.overrideDescribe.maxRequests, 40);
  assert.equal(REQUEST_GUARD_LIMITS.overrideDescribe.windowMs, 60_000);
});

test("readGuardedJson only rate-limits, checks body bytes, and parses JSON", async () => {
  const result = await readGuardedJson(
    {
      headers: new Headers({ "x-forwarded-for": "203.0.113.11" }),
      text: async () => JSON.stringify({ images: Array.from({ length: 3 }, (_, index) => ({ id: index })) }),
    },
    "compare",
  );

  assert.deepEqual(result, {
    ok: true,
    value: { images: [{ id: 0 }, { id: 1 }, { id: 2 }] },
  });
});
