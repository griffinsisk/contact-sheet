// Burst & near-duplicate clustering — deterministic, client-side, zero API cost.
//
// A "burst" is a run of frames shot within BURST_GAP_MS of each other that
// also look alike (dHash hamming ≤ BURST_MAX_HAMMING). Near-duplicates with
// no usable timestamp still cluster when they look nearly identical
// (hamming ≤ DUPE_MAX_HAMMING). Clustering changes the unit of culling from
// "frame" to "moment": the grid collapses each cluster behind its
// best-scoring frame after the cull.

export const BURST_GAP_MS = 2500;
export const BURST_MAX_HAMMING = 16;
export const DUPE_MAX_HAMMING = 6;

/**
 * 64-bit difference hash from a 9×8 row-major luma grid: each bit is
 * "pixel brighter than its right neighbor". Returns 16 hex chars.
 */
export function dHashFromLuma(luma: ArrayLike<number>): string {
  let hash = "";
  let nibble = 0;
  let bits = 0;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const bit = luma[row * 9 + col] > luma[row * 9 + col + 1] ? 1 : 0;
      nibble = (nibble << 1) | bit;
      bits++;
      if (bits === 4) {
        hash += nibble.toString(16);
        nibble = 0;
        bits = 0;
      }
    }
  }
  return hash;
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

/**
 * A uniform frame (blank sky, wall, lens cap) has no gradient, so its dHash
 * collapses to all-zeros — and every such frame hashes identically regardless
 * of color. A structureless hash carries no identity signal, so it must never
 * cluster: falsely stacking distinct frames is worse than missing a burst.
 */
export function isDegenerateHash(hash: string): boolean {
  return hash === "0000000000000000" || hash === "ffffffffffffffff";
}

export interface ClusterablePhoto {
  dhash?: string;
  capturedAtMs?: number;
}

/**
 * Group photos into burst/duplicate clusters. Returns only clusters of
 * two or more photos, each as an array of indices into the input.
 *
 * Frames are walked in capture order (upload order when timestamps are
 * missing — filenames off a card are sequential) and chained greedily:
 * a frame joins the current cluster when it's close in time AND look,
 * or nearly identical in look regardless of time.
 */
export function clusterPhotos(photos: ClusterablePhoto[]): number[][] {
  const order = photos.map((_, i) => i).sort((a, b) => {
    const ta = photos[a].capturedAtMs;
    const tb = photos[b].capturedAtMs;
    if (ta != null && tb != null && ta !== tb) return ta - tb;
    return a - b;
  });

  const joins = (prev: number, cur: number): boolean => {
    const a = photos[prev];
    const b = photos[cur];
    if (!a.dhash || !b.dhash) return false;
    if (isDegenerateHash(a.dhash) || isDegenerateHash(b.dhash)) return false;
    const dist = hammingDistance(a.dhash, b.dhash);
    if (a.capturedAtMs != null && b.capturedAtMs != null) {
      if (Math.abs(b.capturedAtMs - a.capturedAtMs) <= BURST_GAP_MS && dist <= BURST_MAX_HAMMING) {
        return true;
      }
    }
    return dist <= DUPE_MAX_HAMMING;
  };

  const clusters: number[][] = [];
  let current: number[] = [];
  for (const i of order) {
    if (current.length > 0 && joins(current[current.length - 1], i)) {
      current.push(i);
    } else {
      if (current.length > 1) clusters.push(current);
      current = [i];
    }
  }
  if (current.length > 1) clusters.push(current);
  return clusters;
}

/** Browser-side dHash from an already-decoded image. Returns undefined on failure. */
export function computeDHash(img: CanvasImageSource): string | undefined {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 9;
    canvas.height = 8;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, 9, 8);
    const { data } = ctx.getImageData(0, 0, 9, 8);
    const luma = new Array<number>(72);
    for (let i = 0; i < 72; i++) {
      luma[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }
    return dHashFromLuma(luma);
  } catch {
    return undefined;
  }
}
