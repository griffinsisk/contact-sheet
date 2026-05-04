"use client";

interface Props {
  deepCount: number;
  onStartDeepReview: () => void;
  isRestored?: boolean;
}

export default function CullBanner({ deepCount, onStartDeepReview, isRestored }: Props) {
  const photoLabel = `${deepCount} ${deepCount === 1 ? "photo" : "photos"}`;

  return (
    <div className="bg-primary px-8 py-4 flex justify-between items-center">
      <div className="flex items-center gap-3">
        <span
          className="material-symbols-outlined text-on-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          check_circle
        </span>
        <span className="font-label font-black uppercase tracking-widest text-on-primary text-sm">
          {isRestored ? "Restored session" : "Cull complete"}
        </span>
      </div>
      {isRestored ? (
        <span className="font-label text-xs text-on-primary/70 uppercase tracking-widest">
          Re-import originals to run new analysis
        </span>
      ) : deepCount > 0 ? (
        <button
          onClick={onStartDeepReview}
          aria-label={`Develop shortlist for ${photoLabel}`}
          className="bg-on-primary text-primary px-6 py-2 font-label font-bold text-xs uppercase tracking-widest hover:bg-black hover:text-white transition-all"
        >
          DEVELOP SHORTLIST · {deepCount}
        </button>
      ) : (
        <span className="font-label text-xs text-on-primary/70 uppercase tracking-widest">
          Toggle "Develop" on photos below, then build editor's notes
        </span>
      )}
    </div>
  );
}
