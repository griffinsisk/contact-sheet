import test from "node:test";
import assert from "node:assert/strict";

import {
  BURST_GAP_MS,
  clusterPhotos,
  dHashFromLuma,
  hammingDistance,
} from "../../lib/clusters";

// 9×8 row-major luma grids
const lumaGradientUp = Array.from({ length: 72 }, (_, i) => i % 9);       // brighter to the right → all bits 0
const lumaGradientDown = Array.from({ length: 72 }, (_, i) => 9 - (i % 9)); // darker to the right → all bits 1

test("dHashFromLuma produces 16 hex chars with expected extremes", () => {
  assert.equal(dHashFromLuma(lumaGradientUp), "0000000000000000");
  assert.equal(dHashFromLuma(lumaGradientDown), "ffffffffffffffff");
});

test("hammingDistance counts differing bits and rejects mismatched lengths", () => {
  assert.equal(hammingDistance("0000000000000000", "0000000000000000"), 0);
  assert.equal(hammingDistance("0000000000000000", "0000000000000001"), 1);
  assert.equal(hammingDistance("0000000000000000", "ffffffffffffffff"), 64);
  assert.equal(hammingDistance("0000000000000000", "00000000000000ff"), 8);
  assert.equal(hammingDistance("00", "0000"), Number.POSITIVE_INFINITY);
});

const H_A = "a5a5a5a5a5a5a5a5";
const H_B = "a5a5a5a5a5a5a55a";   // 8 bits from A
const H_C = "a5a5a5a5a5a55a5a";   // 8 bits from B, 16 from A
const H_FAR = "5a5a5a5a5a5a5a5a"; // 64 bits from A

test("clusterPhotos chains a timed burst of similar frames", () => {
  const photos = [
    { dhash: H_A, capturedAtMs: 0 },
    { dhash: H_B, capturedAtMs: 1000 },
    { dhash: H_C, capturedAtMs: 2000 },
  ];
  assert.deepEqual(clusterPhotos(photos), [[0, 1, 2]]);
});

test("clusterPhotos breaks the chain when the time gap exceeds the burst window", () => {
  const photos = [
    { dhash: H_A, capturedAtMs: 0 },
    { dhash: H_B, capturedAtMs: 1000 },
    // similar look (8 bits from B) but way outside the burst window,
    // and not close enough for the duplicate rule
    { dhash: H_C, capturedAtMs: 1000 + BURST_GAP_MS + 8000 },
  ];
  assert.deepEqual(clusterPhotos(photos), [[0, 1]]);
});

test("clusterPhotos breaks the chain when frames stop looking alike", () => {
  const photos = [
    { dhash: H_A, capturedAtMs: 0 },
    { dhash: H_FAR, capturedAtMs: 500 },
  ];
  assert.deepEqual(clusterPhotos(photos), []);
});

test("clusterPhotos joins near-duplicates without timestamps", () => {
  const photos = [
    { dhash: "a5a5a5a5a5a5a5a5" },
    { dhash: "a5a5a5a5a5a5a5aa" }, // 4 bits apart
    { dhash: "5a5a5a5a5a5a5a5a" }, // unrelated
  ];
  assert.deepEqual(clusterPhotos(photos), [[0, 1]]);
});

test("clusterPhotos never clusters degenerate (uniform-frame) hashes", () => {
  // Two blank frames hash identically but carry no identity signal
  const photos = [
    { dhash: "0000000000000000", capturedAtMs: 0 },
    { dhash: "0000000000000000", capturedAtMs: 500 },
    { dhash: "ffffffffffffffff", capturedAtMs: 1000 },
    { dhash: "ffffffffffffffff", capturedAtMs: 1500 },
  ];
  assert.deepEqual(clusterPhotos(photos), []);
});

test("clusterPhotos walks frames in capture order, not upload order", () => {
  const photos = [
    { dhash: H_C, capturedAtMs: 2000 },
    { dhash: H_A, capturedAtMs: 0 },
    { dhash: H_B, capturedAtMs: 1000 },
  ];
  assert.deepEqual(clusterPhotos(photos), [[1, 2, 0]]);
});

test("clusterPhotos never clusters photos without a hash", () => {
  const photos = [
    { capturedAtMs: 0 },
    { capturedAtMs: 100 },
    { dhash: H_A, capturedAtMs: 200 },
  ];
  assert.deepEqual(clusterPhotos(photos), []);
});

test("clusterPhotos returns no singleton clusters", () => {
  const photos = [
    { dhash: H_A, capturedAtMs: 0 },
    { dhash: H_FAR, capturedAtMs: 60_000 },
  ];
  assert.deepEqual(clusterPhotos(photos), []);
});
