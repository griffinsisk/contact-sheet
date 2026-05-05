import test from "node:test";
import assert from "node:assert/strict";

import {
  PROXY_PAYLOAD_SOFT_LIMIT_BYTES,
  estimateProxyBodyBytes,
  splitByEstimatedProxyBytes,
} from "../../lib/proxy-payload";
import { generateTasteProfile, type TasteLibrary } from "../../lib/taste-library";

test("splitByEstimatedProxyBytes respects item count and estimated byte caps", () => {
  const chunks = splitByEstimatedProxyBytes([400, 400, 400, 400, 400], {
    maxItems: 3,
    maxBytes: 1_000,
    estimateBytes: (items) => 100 + items.reduce((sum, n) => sum + n, 0),
  });

  assert.deepEqual(chunks, [[400, 400], [400, 400], [400]]);
});

test("splitByEstimatedProxyBytes rejects an item that cannot fit by itself", () => {
  assert.throws(
    () => splitByEstimatedProxyBytes([1_200], {
      maxItems: 3,
      maxBytes: 1_000,
      estimateBytes: (items) => 100 + items.reduce((sum, n) => sum + n, 0),
    }),
    /single item exceeds/i,
  );
});

test("estimateProxyBodyBytes measures the JSON body sent to a proxy route", () => {
  const body = {
    images: [{ base64: "abc", mediaType: "image/jpeg" }],
    textParts: ["[Photo 0]"],
    maxTokens: 1000,
  };

  assert.equal(estimateProxyBodyBytes(body), new TextEncoder().encode(JSON.stringify(body)).length);
});

test("generateTasteProfile trims favorite entries before posting an oversized proxy body", async () => {
  const originalFetch = globalThis.fetch;
  const bigImage = "a".repeat(250_000);
  const library: TasteLibrary = {
    version: 2,
    id: "profile-a",
    name: "My Profile",
    entries: Array.from({ length: 40 }, (_, i) => ({
      photoHash: `hash-${i}`,
      addedAt: i,
      image: bigImage,
    })),
  };

  let requestBody = "";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = String(init?.body ?? "");
    return Response.json({
      prose: "You favor clean geometric frames.",
      aestheticTags: ["clean_geometry"],
      coherence: "high",
      generatedAt: 123,
    });
  }) as typeof fetch;

  try {
    const result = await generateTasteProfile(library);
    const parsed = JSON.parse(requestBody);

    assert.ok(estimateProxyBodyBytes(parsed) <= PROXY_PAYLOAD_SOFT_LIMIT_BYTES);
    assert.ok(parsed.entries.length >= 4);
    assert.ok(parsed.entries.length < library.entries.length);
    assert.equal(result.usedEntryCount, parsed.entries.length);
    assert.equal(result.profile?.generatedFromEntryCount, parsed.entries.length);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
