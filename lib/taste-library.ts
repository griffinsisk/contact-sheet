import type { Rating } from "./types";
import type { OverrideEntry } from "./overrides";
import { PROXY_PAYLOAD_SOFT_LIMIT_BYTES, estimateProxyBodyBytes } from "./proxy-payload";

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
const PROFILE_REQUEST_ENTRY_LIMIT = 30;
const MIN_PROFILE_REQUEST_ENTRIES = 4;

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
export const TASTE_LIBRARY_ENTRY_ADDED_EVENT = "cs-taste-library-entry-added";

export function setTasteLibraryClient(library: TasteLibrary): void {
  if (typeof window === "undefined") return;
  const prevCount = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return 0;
      const parsed = JSON.parse(raw) as TasteLibrary;
      return Array.isArray(parsed?.entries) ? parsed.entries.length : 0;
    } catch {
      return 0;
    }
  })();
  const next = evictFifo(library);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(TASTE_LIBRARY_CHANGED_EVENT));
  if (next.entries.length > prevCount) {
    window.dispatchEvent(new CustomEvent(TASTE_LIBRARY_ENTRY_ADDED_EVENT));
  }
}

/**
 * Generate a taste profile from the entries in the library that carry an image.
 * Hash-only entries are ignored — they have no signal for the model.
 *
 * Optionally accepts past corrections (rating overrides) to express direction
 * signals in the regen prompt: rescues = positive, downgrades = negative.
 */
export async function generateTasteProfile(
  library: TasteLibrary,
  corrections?: OverrideEntry[],
): Promise<{
  profile: TasteProfile | null;
  coherence: "high" | "medium" | "low";
  usedEntryCount: number;
  usedCorrectionCount: number;
}> {
  const usable = library.entries.filter((e) => !!e.image);
  if (usable.length < MIN_PROFILE_REQUEST_ENTRIES) {
    throw new Error(`Need at least ${MIN_PROFILE_REQUEST_ENTRIES} favorites with image data; have ${usable.length}.`);
  }
  // Only ship corrections that have a description (others were just hashed and
  // their describe call hadn't returned yet).
  const usableCorrections = (corrections ?? []).filter((c) => c.shortDescription.trim().length > 0);
  let requestEntries = usable.slice(0, PROFILE_REQUEST_ENTRY_LIMIT);
  const buildPayload = (entries: TasteEntry[]) => ({
    entries: entries.map((e) => ({ photoHash: e.photoHash, image: e.image! })),
    corrections: usableCorrections.map((c) => ({
      shortDescription: c.shortDescription,
      originalRating: c.originalRating,
      userRating: c.userRating,
      sessionIntent: c.sessionIntent,
    })),
  });
  while (
    requestEntries.length >= MIN_PROFILE_REQUEST_ENTRIES
    && estimateProxyBodyBytes(buildPayload(requestEntries)) > PROXY_PAYLOAD_SOFT_LIMIT_BYTES
  ) {
    requestEntries = requestEntries.slice(0, -1);
  }
  if (requestEntries.length < MIN_PROFILE_REQUEST_ENTRIES) {
    throw new Error("Favorite images are too large for hosted profile generation. Use smaller seed images or bring your own key.");
  }
  const payload = buildPayload(requestEntries);
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
    return {
      profile: null,
      coherence: json.coherence,
      usedEntryCount: requestEntries.length,
      usedCorrectionCount: usableCorrections.length,
    };
  }
  return {
    profile: {
      prose: json.prose,
      aestheticTags: json.aestheticTags,
      generatedAt: json.generatedAt,
      generatedFromEntryCount: requestEntries.length,
    },
    coherence: json.coherence,
    usedEntryCount: requestEntries.length,
    usedCorrectionCount: usableCorrections.length,
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
