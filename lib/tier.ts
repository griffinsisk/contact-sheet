import { ProviderConfig } from "./types";

// ── Tier model ──────────────────────────────────────────────────────────────
//
// Three modes a user can be in when running the app:
//
//   byok  — they've pasted their own Anthropic/OpenAI/Gemini key. Calls
//           bypass our server entirely; they pay their own API bill.
//   free  — no key, no paid account. Uses our /api proxy with a shared
//           server-side Anthropic key, capped at FREE_TIER_LIMIT photos
//           per browser session (localStorage counter — v1 honor-system).
//   pro   — $5/mo subscriber. Uses our /api proxy without quota.
//
// Mode resolution precedence: BYOK > pro > free.
//
// BYOK wins because a user who's taken the trouble to paste a key has
// already opted out of our billing entirely. Pro beats free because it's
// the paid path. If neither, the user is on free.
//
// For v1 (pre-Clerk), "isPro" is always false — it becomes a Clerk user-
// metadata read once auth is wired. Stripe webhooks will update it.

export type Tier = "byok" | "free" | "pro";

export const FREE_TIER_LIMIT = 10;

const USAGE_KEY = "cs-free-usage";

// ── Tier resolution ─────────────────────────────────────────────────────────

export function resolveTier(config: ProviderConfig | null, isPro: boolean = false): Tier {
  if (config) return "byok";
  if (isPro) return "pro";
  return "free";
}

// ── Free-tier usage tracking ────────────────────────────────────────────────
//
// localStorage-backed, so it survives reloads but resets when the user
// clears browser data. Intentionally soft enforcement: the value of
// "free" is getting someone hooked, not preventing abuse. If a user
// really wants 20 free photos, they'll clear localStorage and get them.

export interface FreeUsage {
  used: number;
  limit: number;
  remaining: number;
}

export function getFreeUsage(): FreeUsage {
  if (typeof window === "undefined") {
    return { used: 0, limit: FREE_TIER_LIMIT, remaining: FREE_TIER_LIMIT };
  }
  const raw = localStorage.getItem(USAGE_KEY);
  const parsed = raw ? parseInt(raw, 10) : 0;
  const used = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  return {
    used,
    limit: FREE_TIER_LIMIT,
    remaining: Math.max(0, FREE_TIER_LIMIT - used),
  };
}

export function incrementFreeUsage(photoCount: number): void {
  if (typeof window === "undefined" || photoCount <= 0) return;
  const { used } = getFreeUsage();
  localStorage.setItem(USAGE_KEY, String(used + photoCount));
}

export function resetFreeUsage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USAGE_KEY);
}

// ── Capability gate ─────────────────────────────────────────────────────────
//
// Call this before starting a cull / deep-review to decide whether to
// proceed, show an upgrade nudge, or hard-block. For free tier only —
// BYOK and Pro always pass.

export interface TierGate {
  canProcess: boolean;
  reason?: string;
  suggestedUpgrade?: "pro" | "byok";
}

export function canProcessPhotos(tier: Tier, photoCount: number): TierGate {
  if (tier === "byok" || tier === "pro") {
    return { canProcess: true };
  }
  const { used, limit } = getFreeUsage();
  if (used + photoCount > limit) {
    const remaining = Math.max(0, limit - used);
    return {
      canProcess: false,
      reason: remaining === 0
        ? `Free tier used up (${limit} of ${limit}). Upgrade to Pro or bring your own key to continue.`
        : `Free tier allows ${limit} photos per session. You have ${remaining} remaining; this batch would need ${photoCount}.`,
      suggestedUpgrade: "pro",
    };
  }
  return { canProcess: true };
}
