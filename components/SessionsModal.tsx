"use client";

import { SessionSummary } from "@/lib/types";

interface Props {
  sessions: SessionSummary[];
  onRestore: (id: string) => void;
  onClose: () => void;
}

export default function SessionsModal({ sessions, onRestore, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[60] bg-background/90 backdrop-blur-sm flex items-center justify-center"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      tabIndex={-1}
      ref={(el: HTMLDivElement | null) => el?.focus()}
    >
      <div className="w-full max-w-3xl bg-surface-bright p-8 md:p-12 max-h-[90vh] overflow-y-auto" style={{ boxShadow: "0 0 60px -15px rgba(0,0,0,0.8)" }}>
        <div className="flex justify-between items-start mb-10">
          <div>
            <div className="mono-label text-[10px] text-primary mb-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-primary" />
              HISTORY
            </div>
            <h1 className="text-4xl serif-italic text-on-surface">Previous sessions</h1>
            <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mt-2">
              {sessions.length} stored · originals not retained
            </p>
          </div>
          <button onClick={onClose} aria-label="Close history" className="text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {sessions.length === 0 ? (
          <div className="p-6 bg-surface-low border-l-2 border-outline-variant">
            <p className="font-body text-sm text-on-surface-variant">
              No saved sessions yet. Run a cull to start one.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => { onRestore(s.id); onClose(); }}
                className="text-left p-4 bg-surface-low hover:bg-surface-high transition-colors flex justify-between items-start gap-4"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="mono-label text-[11px] text-on-surface truncate">
                    Session_{s.id.slice(0, 6)}
                  </h4>
                  <p className="mono-label text-[9px] text-outline mt-1">
                    {s.date} · {s.photoCount} FRAMES
                  </p>
                  <p className="mono-label text-[9px] text-on-surface-variant/70 mt-2">
                    {s.heroCount} HERO · {s.selectCount} SELECT
                    {s.hasDeepReview && " · DEEP"}
                  </p>
                </div>
                <span className="material-symbols-outlined text-outline flex-shrink-0">
                  chevron_right
                </span>
              </button>
            ))}
          </div>
        )}

        <p className="mt-6 font-label text-[10px] text-on-surface-variant/60 uppercase tracking-widest">
          Restoring a session loads ratings &amp; thumbnails — re-import originals to run new analysis or export.
        </p>
      </div>
    </div>
  );
}
