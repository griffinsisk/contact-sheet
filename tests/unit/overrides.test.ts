import test from "node:test";
import assert from "node:assert/strict";

import {
  correctionsForProfile,
  scopeUnscopedOverrides,
  type OverrideStore,
} from "../../lib/overrides";

test("correctionsForProfile returns only corrections for the active profile", () => {
  const store: OverrideStore = {
    version: 1,
    entries: [
      {
        photoHash: "a",
        shortDescription: "soft ceremony frame",
        sessionIntent: "events",
        originalScore: 60,
        originalRating: "MAYBE",
        userRating: "SELECT",
        timestamp: 1,
        profileIdAtCull: "wedding",
      },
      {
        photoHash: "b",
        shortDescription: "hard street light",
        sessionIntent: "street",
        originalScore: 60,
        originalRating: "MAYBE",
        userRating: "SELECT",
        timestamp: 2,
        profileIdAtCull: "street",
      },
      {
        photoHash: "c",
        shortDescription: "old global correction",
        sessionIntent: "mixed",
        originalScore: 60,
        originalRating: "MAYBE",
        userRating: "SELECT",
        timestamp: 3,
        profileIdAtCull: null,
      },
    ],
  };

  assert.deepEqual(correctionsForProfile(store.entries, "wedding").map((e) => e.photoHash), ["a"]);
  assert.deepEqual(correctionsForProfile(store.entries, "street").map((e) => e.photoHash), ["b"]);
});

test("scopeUnscopedOverrides assigns old undefined corrections to migrated profile", () => {
  const store: OverrideStore = {
    version: 1,
    entries: [{
      photoHash: "legacy",
      shortDescription: "legacy correction",
      sessionIntent: "mixed",
      originalScore: 50,
      originalRating: "MAYBE",
      userRating: "SELECT",
      timestamp: 1,
    }],
  };

  const scoped = scopeUnscopedOverrides(store, "profile-1");
  assert.equal(scoped.entries[0].profileIdAtCull, "profile-1");
});
