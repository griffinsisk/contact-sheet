"use client";

import { useMemo, useState } from "react";
import { useOverrides } from "@/hooks/useOverrides";
import type { OverrideEntry } from "@/lib/overrides";

interface Props {
  onClose: () => void;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function OverridesModal({ onClose }: Props) {
  const { store, remove, clearAll } = useOverrides();
  const [confirmClear, setConfirmClear] = useState(false);

  const sorted = useMemo(
    () => [...store.entries].sort((a, b) => b.timestamp - a.timestamp),
    [store.entries],
  );

  const isEmpty = sorted.length === 0;

  return (
    <div
      className="fixed inset-0 z-[60] bg-background/90 backdrop-blur-sm flex items-center justify-center"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      tabIndex={-1}
      ref={(el: HTMLDivElement | null) => el?.focus()}
    >
      <div
        className="w-full max-w-2xl bg-surface-bright p-8 md:p-12 max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: "0 0 60px -15px rgba(0,0,0,0.8)" }}
      >
        <div className="flex justify-between items-start mb-10">
          <div>
            <div className="mono-label text-[10px] text-primary mb-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-primary" />
              CORRECTIONS
            </div>
            <h1 className="text-4xl serif-italic text-on-surface">
              Your corrections
            </h1>
            <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mt-2">
              {isEmpty
                ? "Nothing recorded yet"
                : `${sorted.length} ${sorted.length === 1 ? "correction" : "corrections"} weighting future culls`}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {isEmpty ? (
          <div className="p-6 bg-surface-low border-l-2 border-outline-variant">
            <p className="font-body text-sm text-on-surface-variant">
              When you change a cull rating (CUT → MAYBE, etc.), the frame is recorded here. Future culls in similar shoots will weight toward your call. You can clear individual corrections any time.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {sorted.map((e: OverrideEntry) => (
                <div
                  key={e.photoHash + e.timestamp}
                  className="flex items-start gap-4 p-4 bg-surface-low border-l-2 border-outline-variant hover:border-primary transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-body text-sm text-on-surface mb-2">
                      {e.shortDescription || (
                        <span className="italic text-on-surface-variant">Describing…</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                      <span className="px-2 py-0.5 bg-surface-high text-on-surface">
                        {e.sessionIntent}
                      </span>
                      <span>
                        <span className="text-on-surface-variant">{e.originalRating}</span>
                        <span className="text-on-surface-variant/60"> ({e.originalScore})</span>
                        <span className="mx-1">→</span>
                        <span className="text-primary font-bold">{e.userRating}</span>
                      </span>
                      <span>{relativeTime(e.timestamp)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => remove(e.photoHash)}
                    aria-label="Delete correction"
                    title="Delete this correction"
                    className="text-on-surface-variant hover:text-error transition-colors flex-shrink-0 p-1"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-outline-variant flex justify-end">
              {confirmClear ? (
                <div className="flex items-center gap-3">
                  <span className="font-label text-[11px] uppercase tracking-widest text-on-surface-variant">
                    Clear all {sorted.length}?
                  </span>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="px-3 py-2 font-label text-[11px] uppercase tracking-widest bg-surface-high text-on-surface hover:bg-surface-bright transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { clearAll(); setConfirmClear(false); }}
                    className="px-3 py-2 font-label text-[11px] uppercase tracking-widest bg-error text-on-primary hover:opacity-90 transition-opacity"
                  >
                    Clear all
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="px-3 py-2 font-label text-[11px] uppercase tracking-widest text-on-surface-variant hover:text-error transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
                  Clear all
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
