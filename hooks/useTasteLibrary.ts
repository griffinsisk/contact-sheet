"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TASTE_LIBRARY_CHANGED_EVENT,
  TasteEntry,
  TasteLibrary,
  TasteProfile,
  emptyLibrary,
  getTasteLibraryClient,
  setTasteLibraryClient,
} from "@/lib/taste-library";

export interface UseTasteLibrary {
  library: TasteLibrary;
  isFavorited: (photoHash: string) => boolean;
  toggleFavorite: (entry: TasteEntry) => void;
  addEntries: (entries: TasteEntry[]) => void;
  setProfile: (profile: TasteProfile | null) => void;
  setLastRegenAt: (ts: number) => void;
}

export function useTasteLibrary(): UseTasteLibrary {
  const [library, setLibrary] = useState<TasteLibrary>(() => emptyLibrary());

  useEffect(() => {
    setLibrary(getTasteLibraryClient());
    const onChange = () => setLibrary(getTasteLibraryClient());
    window.addEventListener(TASTE_LIBRARY_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(TASTE_LIBRARY_CHANGED_EVENT, onChange);
  }, []);

  const persist = useCallback((next: TasteLibrary) => {
    setTasteLibraryClient(next);
    setLibrary(getTasteLibraryClient());
  }, []);

  const isFavorited = useCallback(
    (photoHash: string) => library.entries.some((e) => e.photoHash === photoHash),
    [library],
  );

  const toggleFavorite = useCallback(
    (entry: TasteEntry) => {
      const current = getTasteLibraryClient();
      const exists = current.entries.some((e) => e.photoHash === entry.photoHash);
      const nextEntries = exists
        ? current.entries.filter((e) => e.photoHash !== entry.photoHash)
        : [...current.entries, entry];
      persist({ ...current, entries: nextEntries });
    },
    [persist],
  );

  const addEntries = useCallback(
    (entries: TasteEntry[]) => {
      const current = getTasteLibraryClient();
      const existing = new Set(current.entries.map((e) => e.photoHash));
      const additions = entries.filter((e) => !existing.has(e.photoHash));
      if (additions.length === 0) return;
      persist({ ...current, entries: [...current.entries, ...additions] });
    },
    [persist],
  );

  const setProfile = useCallback(
    (profile: TasteProfile | null) => {
      const current = getTasteLibraryClient();
      const next = { ...current };
      if (profile) {
        next.currentProfile = profile;
      } else {
        delete next.currentProfile;
      }
      persist(next);
    },
    [persist],
  );

  const setLastRegenAt = useCallback(
    (ts: number) => {
      const current = getTasteLibraryClient();
      persist({ ...current, lastRegenAt: ts });
    },
    [persist],
  );

  return { library, isFavorited, toggleFavorite, addEntries, setProfile, setLastRegenAt };
}
