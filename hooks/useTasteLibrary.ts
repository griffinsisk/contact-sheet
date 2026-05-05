"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TASTE_LIBRARY_CHANGED_EVENT,
  TasteEntry,
  TasteLibrary,
  TasteLibraryCollection,
  TasteProfile,
  addLibraryToCollection,
  deleteLibraryFromCollection,
  emptyLibrary,
  emptyCollection,
  getActiveLibrary,
  getTasteLibraryCollectionClient,
  renameLibraryInCollection,
  setActiveLibraryInCollection,
  setTasteLibraryCollectionClient,
  updateActiveLibrary,
} from "@/lib/taste-library";

export interface UseTasteLibrary {
  library: TasteLibrary;
  collection: TasteLibraryCollection;
  activeId: string | null;
  isFavorited: (photoHash: string) => boolean;
  toggleFavorite: (entry: TasteEntry) => void;
  addEntries: (entries: TasteEntry[]) => void;
  setProfile: (profile: TasteProfile | null) => void;
  setLastRegenAt: (ts: number) => void;
  setActiveId: (id: string | null) => void;
  createLibrary: (name: string) => string;
  renameLibrary: (id: string, name: string) => void;
  deleteLibrary: (id: string) => void;
}

export function useTasteLibrary(): UseTasteLibrary {
  const [collection, setCollection] = useState<TasteLibraryCollection>(() => emptyCollection());

  useEffect(() => {
    setCollection(getTasteLibraryCollectionClient());
    const onChange = () => setCollection(getTasteLibraryCollectionClient());
    window.addEventListener(TASTE_LIBRARY_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(TASTE_LIBRARY_CHANGED_EVENT, onChange);
  }, []);

  const persist = useCallback((next: TasteLibraryCollection) => {
    setTasteLibraryCollectionClient(next);
    setCollection(getTasteLibraryCollectionClient());
  }, []);

  const library = collection.activeId === null && collection.libraries.length === 0
    ? emptyLibrary()
    : getActiveLibrary(collection);

  const isFavorited = useCallback(
    (photoHash: string) => library.entries.some((e) => e.photoHash === photoHash),
    [library],
  );

  const toggleFavorite = useCallback(
    (entry: TasteEntry) => {
      const current = getTasteLibraryCollectionClient();
      const next = updateActiveLibrary(current, (active) => {
        const exists = active.entries.some((e) => e.photoHash === entry.photoHash);
        const nextEntries = exists
          ? active.entries.filter((e) => e.photoHash !== entry.photoHash)
          : [...active.entries, entry];
        return { ...active, entries: nextEntries };
      });
      persist(next);
    },
    [persist],
  );

  const addEntries = useCallback(
    (entries: TasteEntry[]) => {
      const current = getTasteLibraryCollectionClient();
      const active = getActiveLibrary(current);
      const existing = new Set(active.entries.map((e) => e.photoHash));
      const additions = entries.filter((e) => !existing.has(e.photoHash));
      if (additions.length === 0) return;
      persist(updateActiveLibrary(current, (library) => ({
        ...library,
        entries: [...library.entries, ...additions],
      })));
    },
    [persist],
  );

  const setProfile = useCallback(
    (profile: TasteProfile | null) => {
      const current = getTasteLibraryCollectionClient();
      persist(updateActiveLibrary(current, (library) => {
        const next = { ...library };
        if (profile) {
          next.currentProfile = profile;
        } else {
          delete next.currentProfile;
        }
        return next;
      }));
    },
    [persist],
  );

  const setLastRegenAt = useCallback(
    (ts: number) => {
      persist(updateActiveLibrary(getTasteLibraryCollectionClient(), (library) => ({
        ...library,
        lastRegenAt: ts,
      })));
    },
    [persist],
  );

  const setActiveId = useCallback(
    (id: string | null) => {
      persist(setActiveLibraryInCollection(getTasteLibraryCollectionClient(), id));
    },
    [persist],
  );

  const createLibrary = useCallback(
    (name: string) => {
      const { collection: next, library } = addLibraryToCollection(getTasteLibraryCollectionClient(), name);
      persist(next);
      return library.id;
    },
    [persist],
  );

  const renameLibrary = useCallback(
    (id: string, name: string) => {
      persist(renameLibraryInCollection(getTasteLibraryCollectionClient(), id, name));
    },
    [persist],
  );

  const deleteLibrary = useCallback(
    (id: string) => {
      persist(deleteLibraryFromCollection(getTasteLibraryCollectionClient(), id));
    },
    [persist],
  );

  return {
    library,
    collection,
    activeId: collection.activeId,
    isFavorited,
    toggleFavorite,
    addEntries,
    setProfile,
    setLastRegenAt,
    setActiveId,
    createLibrary,
    renameLibrary,
    deleteLibrary,
  };
}
