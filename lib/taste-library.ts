import type { Rating } from "./types";

export interface TasteEntry {
  photoHash: string;
  addedAt: number;
  originalRating?: Rating;
  rescued?: boolean;
  /** 512px JPEG, base64, no data: prefix. Required for profile generation. */
  image?: string;
}

export interface TasteProfile {
  prose: string;
  aestheticTags: string[];
  generatedAt: number;
  generatedFromEntryCount: number;
}

export interface TasteLibrary {
  version: 1;
  entries: TasteEntry[];
  pinned?: string[];
  currentProfile?: TasteProfile;
  lastRegenAt?: number;
}

const STORAGE_KEY = "cs-taste-library";
const MAX_ENTRIES = 100;

export function emptyLibrary(): TasteLibrary {
  return { version: 1, entries: [] };
}

export function evictFifo(library: TasteLibrary): TasteLibrary {
  if (library.entries.length <= MAX_ENTRIES) return library;
  const pinned = new Set(library.pinned ?? []);
  const sorted = [...library.entries].sort((a, b) => a.addedAt - b.addedAt);
  const survivors: TasteEntry[] = [];
  let toDrop = library.entries.length - MAX_ENTRIES;
  for (const entry of sorted) {
    if (toDrop > 0 && !pinned.has(entry.photoHash)) {
      toDrop--;
      continue;
    }
    survivors.push(entry);
  }
  return { ...library, entries: survivors };
}

export function getTasteLibraryClient(): TasteLibrary {
  if (typeof window === "undefined") return emptyLibrary();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyLibrary();
  try {
    const parsed = JSON.parse(raw) as TasteLibrary;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return emptyLibrary();
    return parsed;
  } catch {
    return emptyLibrary();
  }
}

export const TASTE_LIBRARY_CHANGED_EVENT = "cs-taste-library-changed";

export function setTasteLibraryClient(library: TasteLibrary): void {
  if (typeof window === "undefined") return;
  const next = evictFifo(library);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(TASTE_LIBRARY_CHANGED_EVENT));
}

/**
 * Generate a taste profile from the entries in the library that carry an image.
 * Hash-only entries are ignored — they have no signal for the model.
 */
export async function generateTasteProfile(
  library: TasteLibrary,
): Promise<{
  profile: TasteProfile | null;
  coherence: "high" | "medium" | "low";
  usedEntryCount: number;
}> {
  const usable = library.entries.filter((e) => !!e.image);
  if (usable.length < 4) {
    throw new Error(`Need at least 4 favorites with image data; have ${usable.length}.`);
  }
  const payload = {
    entries: usable.map((e) => ({ photoHash: e.photoHash, image: e.image! })),
  };
  const res = await fetch("/api/taste-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Profile request failed (${res.status})`);
  }
  const json = (await res.json()) as {
    prose: string;
    aestheticTags: string[];
    coherence: "high" | "medium" | "low";
    generatedAt: number;
  };
  if (json.coherence === "low" || json.aestheticTags.length === 0) {
    return { profile: null, coherence: json.coherence, usedEntryCount: usable.length };
  }
  return {
    profile: {
      prose: json.prose,
      aestheticTags: json.aestheticTags,
      generatedAt: json.generatedAt,
      generatedFromEntryCount: usable.length,
    },
    coherence: json.coherence,
    usedEntryCount: usable.length,
  };
}

// Hash downsized pixels (not file bytes) so re-saves of the same image hash identically.
export async function contentHash(downsizedPixels: Uint8Array | ArrayBuffer): Promise<string> {
  const buf: ArrayBuffer = downsizedPixels instanceof Uint8Array
    ? downsizedPixels.slice().buffer as ArrayBuffer
    : downsizedPixels;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}
