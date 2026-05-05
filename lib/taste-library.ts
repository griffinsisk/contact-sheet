import type { Rating } from "./types";
import type { OverrideEntry } from "./overrides";
import { correctionsForProfile } from "./overrides";
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

export interface LegacyTasteLibrary {
  version: 1;
  entries: TasteEntry[];
  pinned?: string[];
  currentProfile?: TasteProfile;
  lastRegenAt?: number;
}

export interface TasteLibrary {
  version: 2;
  id: string;
  name: string;
  entries: TasteEntry[];
  pinned?: string[];
  currentProfile?: TasteProfile;
  lastRegenAt?: number;
}

export interface TasteLibraryCollection {
  version: 2;
  libraries: TasteLibrary[];
  activeId: string | null;
  updatedAt: number;
}

const STORAGE_KEY_V1 = "cs-taste-library";
const STORAGE_KEY_V2 = "cs-taste-libraries";
const MAX_ENTRIES = 100;
const MAX_LIBRARIES = 3;
const DEFAULT_PROFILE_NAME = "My Profile";
const PROFILE_REQUEST_ENTRY_LIMIT = 30;
const MIN_PROFILE_REQUEST_ENTRIES = 4;

function nowId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeName(name: string): string {
  return name.trim();
}

function assertValidName(collection: TasteLibraryCollection, name: string, excludeId?: string): string {
  const trimmed = normalizeName(name);
  if (!trimmed) throw new Error("Profile name is required.");
  if (trimmed.length > 30) throw new Error("Profile name must be 30 characters or less.");
  const lower = trimmed.toLowerCase();
  const exists = collection.libraries.some((library) =>
    library.id !== excludeId && library.name.trim().toLowerCase() === lower
  );
  if (exists) throw new Error(`A profile named "${trimmed}" already exists.`);
  return trimmed;
}

export function emptyLibrary(id = nowId(), name = DEFAULT_PROFILE_NAME): TasteLibrary {
  return { version: 2, id, name: normalizeName(name) || DEFAULT_PROFILE_NAME, entries: [] };
}

export function emptyCollection(updatedAt = Date.now(), library?: TasteLibrary): TasteLibraryCollection {
  const initial = library ?? emptyLibrary(nowId(), DEFAULT_PROFILE_NAME);
  return { version: 2, libraries: [initial], activeId: initial.id, updatedAt };
}

export function migrateLegacyLibrary(
  legacy: LegacyTasteLibrary,
  id = nowId(),
  updatedAt = Date.now(),
): TasteLibraryCollection {
  const migrated: TasteLibrary = {
    version: 2,
    id,
    name: DEFAULT_PROFILE_NAME,
    entries: Array.isArray(legacy.entries) ? legacy.entries : [],
    pinned: legacy.pinned,
    currentProfile: legacy.currentProfile,
    lastRegenAt: legacy.lastRegenAt,
  };
  return { version: 2, libraries: [migrated], activeId: migrated.id, updatedAt };
}

export function getActiveLibrary(collection: TasteLibraryCollection): TasteLibrary {
  return collection.libraries.find((library) => library.id === collection.activeId)
    ?? collection.libraries[0]
    ?? emptyLibrary();
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

export function updateActiveLibrary(
  collection: TasteLibraryCollection,
  updater: (library: TasteLibrary) => TasteLibrary,
  updatedAt = Date.now(),
): TasteLibraryCollection {
  const active = getActiveLibrary(collection);
  const libraries = collection.libraries.map((library) =>
    library.id === active.id ? evictFifo(updater(library)) : library
  );
  return { ...collection, libraries, activeId: active.id, updatedAt };
}

export function addLibraryToCollection(
  collection: TasteLibraryCollection,
  name: string,
  id = nowId(),
  updatedAt = Date.now(),
): { collection: TasteLibraryCollection; library: TasteLibrary } {
  if (collection.libraries.length >= MAX_LIBRARIES) {
    throw new Error("You can create at most 3 taste profiles.");
  }
  const validName = assertValidName(collection, name);
  const library = emptyLibrary(id, validName);
  return {
    library,
    collection: {
      ...collection,
      libraries: [...collection.libraries, library],
      activeId: library.id,
      updatedAt,
    },
  };
}

export function renameLibraryInCollection(
  collection: TasteLibraryCollection,
  id: string,
  name: string,
  updatedAt = Date.now(),
): TasteLibraryCollection {
  const validName = assertValidName(collection, name, id);
  return {
    ...collection,
    libraries: collection.libraries.map((library) =>
      library.id === id ? { ...library, name: validName } : library
    ),
    updatedAt,
  };
}

export function setActiveLibraryInCollection(
  collection: TasteLibraryCollection,
  id: string | null,
  updatedAt = Date.now(),
): TasteLibraryCollection {
  if (id && !collection.libraries.some((library) => library.id === id)) {
    throw new Error("Taste profile not found.");
  }
  return { ...collection, activeId: id, updatedAt };
}

export function deleteLibraryFromCollection(
  collection: TasteLibraryCollection,
  id: string,
  updatedAt = Date.now(),
): TasteLibraryCollection {
  const libraries = collection.libraries.filter((library) => library.id !== id);
  const activeId = collection.activeId === id
    ? libraries[0]?.id ?? null
    : collection.activeId;
  return { ...collection, libraries, activeId, updatedAt };
}

export const TASTE_LIBRARY_CHANGED_EVENT = "cs-taste-library-changed";
export const TASTE_LIBRARY_ENTRY_ADDED_EVENT = "cs-taste-library-entry-added";

export function getTasteLibraryCollectionClient(): TasteLibraryCollection {
  if (typeof window === "undefined") return emptyCollection();
  const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
  if (rawV2) {
    try {
      const parsed = JSON.parse(rawV2) as TasteLibraryCollection;
      if (parsed.version === 2 && Array.isArray(parsed.libraries)) {
        return parsed.libraries.length > 0 ? parsed : emptyCollection();
      }
    } catch {
      return emptyCollection();
    }
  }

  const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
  if (rawV1) {
    try {
      const legacy = JSON.parse(rawV1) as LegacyTasteLibrary;
      if (legacy.version === 1 && Array.isArray(legacy.entries)) {
        const migrated = migrateLegacyLibrary(legacy);
        localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(migrated));
        try {
          const rawOverrides = localStorage.getItem("cs-overrides");
          if (rawOverrides && migrated.activeId) {
            const parsed = JSON.parse(rawOverrides) as { version: 1; entries?: Array<{ profileIdAtCull?: string | null }> };
            if (parsed.version === 1 && Array.isArray(parsed.entries)) {
              const scoped = {
                ...parsed,
                entries: parsed.entries.map((entry) =>
                  entry.profileIdAtCull === undefined ? { ...entry, profileIdAtCull: migrated.activeId } : entry
                ),
              };
              localStorage.setItem("cs-overrides", JSON.stringify(scoped));
            }
          }
        } catch {
          // Ignore override migration failures; the taste library migration still succeeds.
        }
        localStorage.removeItem(STORAGE_KEY_V1);
        return migrated;
      }
    } catch {
      return emptyCollection();
    }
  }

  const empty = emptyCollection();
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(empty));
  return empty;
}

export function setTasteLibraryCollectionClient(collection: TasteLibraryCollection): void {
  if (typeof window === "undefined") return;
  const prev = getTasteLibraryCollectionClient();
  const next: TasteLibraryCollection = {
    ...collection,
    libraries: collection.libraries.map(evictFifo),
  };
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(TASTE_LIBRARY_CHANGED_EVENT));
  if (getActiveLibrary(next).entries.length > getActiveLibrary(prev).entries.length) {
    window.dispatchEvent(new CustomEvent(TASTE_LIBRARY_ENTRY_ADDED_EVENT));
  }
}

export function getTasteLibraryClient(): TasteLibrary {
  return getActiveLibrary(getTasteLibraryCollectionClient());
}

export function setTasteLibraryClient(library: TasteLibrary): void {
  const current = getTasteLibraryCollectionClient();
  setTasteLibraryCollectionClient(updateActiveLibrary(current, () => library));
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
  const scopedCorrections = correctionsForProfile(corrections ?? [], library.id);
  const usableCorrections = scopedCorrections.filter((c) => c.shortDescription.trim().length > 0);
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
