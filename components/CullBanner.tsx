"use client";

interface Props {
  deepCount: number;
  onStartDeepReview: () => void;
}

export default function CullBanner({ deepCount, onStartDeepReview }: Props) {
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
          Cull complete
        </span>
      </div>
      {deepCount > 0 ? (
        <button
          onClick={onStartDeepReview}
          aria-label={`Start deep review of ${deepCount} photos`}
          className="bg-on-primary text-primary px-6 py-2 font-label font-bold text-xs uppercase tracking-widest hover:bg-black hover:text-white transition-all"
        >
          DEEP REVIEW {deepCount} {deepCount === 1 ? "PHOTO" : "PHOTOS"}
        </button>
      ) : (
        <span className="font-label text-xs text-on-primary/70 uppercase tracking-widest">
          Toggle "Review" on photos below, then deep review
        </span>
      )}
    </div>
  );
}
