import test from "node:test";
import assert from "node:assert/strict";

import {
  FREE_TIER_LIMIT,
  canProcessPhotos,
  getFreeUsage,
  incrementFreeUsage,
  resetFreeUsage,
  resolveTier,
} from "../../lib/tier";

class LocalStorageMock {
  private store = new Map<string, string>();

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

test.beforeEach(() => {
  const storage = new LocalStorageMock();
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: storage },
    configurable: true,
  });
});

test("resolveTier prefers BYOK over Pro over Free", () => {
  assert.equal(resolveTier({ provider: "anthropic", apiKey: "sk-test", model: "claude" }, true), "byok");
  assert.equal(resolveTier(null, true), "pro");
  assert.equal(resolveTier(null, false), "free");
});

test("free usage increments and resets", () => {
  assert.deepEqual(getFreeUsage(), {
    used: 0,
    limit: FREE_TIER_LIMIT,
    remaining: FREE_TIER_LIMIT,
  });

  incrementFreeUsage(3);
  assert.equal(getFreeUsage().used, 3);
  assert.equal(getFreeUsage().remaining, FREE_TIER_LIMIT - 3);

  resetFreeUsage();
  assert.equal(getFreeUsage().used, 0);
});

test("free tier blocks batches over the remaining limit", () => {
  incrementFreeUsage(FREE_TIER_LIMIT - 1);

  const gate = canProcessPhotos("free", 2);

  assert.equal(gate.canProcess, false);
  assert.equal(gate.suggestedUpgrade, "pro");
  assert.match(gate.reason ?? "", /remaining/);
});

test("pro and byok tiers always pass the local gate", () => {
  assert.equal(canProcessPhotos("pro", 10_000).canProcess, true);
  assert.equal(canProcessPhotos("byok", 10_000).canProcess, true);
});
