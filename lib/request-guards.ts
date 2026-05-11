import { PROXY_PAYLOAD_SOFT_LIMIT_BYTES } from "./proxy-payload";

export type GuardSuccess<T = unknown> = {
  ok: true;
  value?: T;
};

export type GuardFailure = {
  ok: false;
  status: number;
  error: string;
  retryAfterSeconds?: number;
};

export type GuardResult<T = unknown> = GuardSuccess<T> | GuardFailure;

export type GuardedRouteGroup = "cull" | "deepReview" | "compare" | "tasteProfile" | "overrideDescribe";

export interface RouteGuardLimit {
  maxBodyBytes: number;
  maxImages?: number;
  maxEntries?: number;
  maxRequests: number;
  windowMs: number;
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
    windowMs: 300_000,
  },
  overrideDescribe: {
    maxBodyBytes: 1_500_000,
    maxImages: 1,
    maxRequests: 40,
    windowMs: 60_000,
  },
};

type ArrayLimitOptions = {
  field: string;
  label: string;
  min?: number;
  max: number;
};

type StringFieldOptions = {
  field: string;
  label: string;
  maxLength: number;
};

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

export const MAX_RATE_LIMIT_KEYS = 5_000;

const rateLimitStore = new Map<string, RateLimitRecord>();

export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

export function getRateLimitStoreSizeForTests(): number {
  return rateLimitStore.size;
}

export function assertBodyByteLimit(bodyText: string, maxBodyBytes: number): GuardResult {
  const bodyBytes = new TextEncoder().encode(bodyText).length;
  if (bodyBytes <= maxBodyBytes) return { ok: true };

  return {
    ok: false,
    status: 413,
    error: "Request body is too large.",
  };
}

export function parseJsonBody(bodyText: string): GuardResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(bodyText) };
  } catch {
    return {
      ok: false,
      status: 400,
      error: "Invalid JSON body",
    };
  }
}

export function assertArrayLimit(body: unknown, options: ArrayLimitOptions): GuardResult {
  const value = getRecordField(body, options.field);
  if (!Array.isArray(value)) {
    return {
      ok: false,
      status: 400,
      error: `${options.label} must be an array.`,
    };
  }

  const min = options.min;
  if (value.length > options.max) {
    return {
      ok: false,
      status: 413,
      error: `Expected at most ${options.max} ${options.label}.`,
    };
  }

  if (min !== undefined && min === options.max && value.length !== min) {
    return {
      ok: false,
      status: 400,
      error: `Expected exactly ${min} ${options.label}.`,
    };
  }

  if (min !== undefined && value.length < min) {
    return {
      ok: false,
      status: 400,
      error: `Expected at least ${min} ${options.label}.`,
    };
  }

  return { ok: true };
}

export function assertStringField(body: unknown, options: StringFieldOptions): GuardResult {
  const value = getRecordField(body, options.field);
  if (typeof value !== "string" || value.length === 0) {
    return {
      ok: false,
      status: 400,
      error: `Body must include ${options.label}.`,
    };
  }

  if (value.length > options.maxLength) {
    return {
      ok: false,
      status: 413,
      error: `${options.label} is too large.`,
    };
  }

  return { ok: true };
}

export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();
  if (firstForwardedIp) return firstForwardedIp;

  return headers.get("x-real-ip")?.trim() || headers.get("cf-connecting-ip")?.trim() || "unknown";
}

export function checkRateLimit(options: {
  key: string;
  maxRequests: number;
  windowMs: number;
  now?: number;
}): GuardResult {
  const now = options.now ?? Date.now();
  pruneExpiredRateLimitRecords(now);
  const existing = rateLimitStore.get(options.key);

  if (!existing) {
    evictOldestRateLimitRecordsForNewKey(options.key);
    rateLimitStore.set(options.key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return { ok: true };
  }

  if (existing.count >= options.maxRequests) {
    return {
      ok: false,
      status: 429,
      error: "Too many requests. Try again shortly.",
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)),
    };
  }

  existing.count += 1;
  return { ok: true };
}

export async function readGuardedJson(
  req: {
    text(): Promise<string>;
    headers: Headers;
  },
  routeGroup: GuardedRouteGroup,
): Promise<GuardResult<unknown>> {
  const limits = REQUEST_GUARD_LIMITS[routeGroup];
  const rateLimit = checkRateLimit({
    key: `${getClientIp(req.headers)}:${routeGroup}`,
    maxRequests: limits.maxRequests,
    windowMs: limits.windowMs,
  });
  if (!rateLimit.ok) return rateLimit;

  const bodyText = await req.text();
  const bodyLimit = assertBodyByteLimit(bodyText, limits.maxBodyBytes);
  if (!bodyLimit.ok) return bodyLimit;

  const parsed = parseJsonBody(bodyText);
  if (!parsed.ok) return parsed;

  return parsed;
}

function getRecordField(body: unknown, field: string): unknown {
  if (!body || typeof body !== "object") return undefined;
  return (body as Record<string, unknown>)[field];
}

function pruneExpiredRateLimitRecords(now: number): void {
  for (const [key, record] of rateLimitStore) {
    if (record.resetAt <= now) rateLimitStore.delete(key);
  }
}

function evictOldestRateLimitRecordsForNewKey(key: string): void {
  if (rateLimitStore.has(key) || rateLimitStore.size < MAX_RATE_LIMIT_KEYS) return;

  const deleteCount = rateLimitStore.size - MAX_RATE_LIMIT_KEYS + 1;
  const oldestKeys = Array.from(rateLimitStore.entries())
    .sort(([, a], [, b]) => a.resetAt - b.resetAt)
    .slice(0, deleteCount)
    .map(([entryKey]) => entryKey);

  for (const oldestKey of oldestKeys) {
    rateLimitStore.delete(oldestKey);
  }
}
