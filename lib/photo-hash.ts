import { contentHash } from "./taste-library";
import { downsizeForCull } from "./resize";
import type { Photo } from "./types";

export interface CachedHash {
  hash: string;
  image: string;
}

const hashCache = new Map<string, CachedHash>();

export async function computePhotoHash(photo: Photo): Promise<CachedHash> {
  const cached = hashCache.get(photo.id);
  if (cached) return cached;
  const b64 = await downsizeForCull(photo);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const hash = await contentHash(bytes);
  const entry = { hash, image: b64 };
  hashCache.set(photo.id, entry);
  return entry;
}

export function getCachedHash(photoId: string): CachedHash | undefined {
  return hashCache.get(photoId);
}
