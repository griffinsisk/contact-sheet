"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TasteEntry,
  TasteLibrary,
  emptyLibrary,
  getTasteLibraryClient,
  setTasteLibraryClient,
} from "@/lib/taste-library";

export interface UseTasteLibrary {
  library: TasteLibrary;
  isFavorited: (photoHash: string) => boolean;
  toggleFavorite: (entry: TasteEntry) => void;
  addEntries: (entries: TasteEntry[]) => void;
}

export function useTasteLibrary(): UseTasteLibrary {
  const [library, setLibrary] = useState<TasteLibrary>(() => emptyLibrary());

  useEffect(() => {
    setLibrary(getTasteLibraryClient());
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

  return { library, isFavorited, toggleFavorite, addEntries };
}
