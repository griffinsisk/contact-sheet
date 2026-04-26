import { clerkClient } from "@clerk/nextjs/server";
import type { Rating } from "./types";

export interface TasteEntry {
  photoHash: string;
  addedAt: number;
  originalRating?: Rating;
  rescued?: boolean;
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

export function setTasteLibraryClient(library: TasteLibrary): void {
  if (typeof window === "undefined") return;
  const next = evictFifo(library);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export async function getTasteLibraryServer(clerkUserId: string): Promise<TasteLibrary> {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  const stored = user.publicMetadata?.tasteLibrary as TasteLibrary | undefined;
  if (!stored || stored.version !== 1 || !Array.isArray(stored.entries)) return emptyLibrary();
  return stored;
}

export async function setTasteLibraryServer(clerkUserId: string, library: TasteLibrary): Promise<void> {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  const next = evictFifo(library);
  await client.users.updateUser(clerkUserId, {
    publicMetadata: { ...user.publicMetadata, tasteLibrary: next },
  });
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
