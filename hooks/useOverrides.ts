"use client";

import { useCallback, useEffect, useState } from "react";
import {
  OVERRIDES_CHANGED_EVENT,
  OverrideEntry,
  OverrideStore,
  clearAllOverrides,
  emptyStore,
  getOverridesClient,
  recordOverride,
  removeOverride,
} from "@/lib/overrides";
import type { IntentPreset } from "@/lib/types";

export interface UseOverrides {
  store: OverrideStore;
  add: (entry: OverrideEntry) => void;
  remove: (photoHash: string) => void;
  clearAll: () => void;
  hasOverride: (photoHash: string) => boolean;
  countForIntent: (intent: IntentPreset) => number;
}

export function useOverrides(): UseOverrides {
  const [store, setStore] = useState<OverrideStore>(() => emptyStore());

  useEffect(() => {
    setStore(getOverridesClient());
    const onChange = () => setStore(getOverridesClient());
    window.addEventListener(OVERRIDES_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(OVERRIDES_CHANGED_EVENT, onChange);
  }, []);

  const add = useCallback((entry: OverrideEntry) => {
    recordOverride(entry);
  }, []);

  const remove = useCallback((photoHash: string) => {
    removeOverride(photoHash);
  }, []);

  const clearAll = useCallback(() => {
    clearAllOverrides();
  }, []);

  const hasOverride = useCallback(
    (photoHash: string) => store.entries.some((e) => e.photoHash === photoHash),
    [store],
  );

  const countForIntent = useCallback(
    (intent: IntentPreset) => store.entries.filter((e) => e.sessionIntent === intent).length,
    [store],
  );

  return { store, add, remove, clearAll, hasOverride, countForIntent };
}
