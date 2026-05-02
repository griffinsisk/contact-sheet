"use client";

import { useEffect, useRef, useState } from "react";
import { Photo, Rating } from "@/lib/types";
import { computePhotoHash, getCachedHash, type CachedHash } from "@/lib/photo-hash";
import { useTasteLibrary } from "@/hooks/useTasteLibrary";

interface Props {
  photo: Photo;
  rating: Rating | null;
  size?: "sm" | "md";
  className?: string;
}

export default function TasteStarButton({ photo, rating, size = "md", className = "" }: Props) {
  const { isFavorited, toggleFavorite } = useTasteLibrary();
  const [cached, setCached] = useState<CachedHash | null>(() => getCachedHash(photo.id) ?? null);
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!cached) {
      computePhotoHash(photo).then((c) => {
        if (mounted.current) setCached(c);
      }).catch(() => {});
    }
    return () => { mounted.current = false; };
  }, [photo, cached]);

  const favorited = cached ? isFavorited(cached.hash) : false;
  const iconSize = size === "sm" ? "text-[16px]" : "text-[20px]";

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pending) return;
    setPending(true);
    try {
      let c = cached;
      if (!c) {
        c = await computePhotoHash(photo);
        if (mounted.current) setCached(c);
      }
      toggleFavorite({
        photoHash: c.hash,
        addedAt: Date.now(),
        originalRating: rating ?? undefined,
        rescued: rating === "CUT" ? true : undefined,
        image: c.image,
      });
    } finally {
      if (mounted.current) setPending(false);
    }
  };

  const label = favorited ? "Remove from taste library" : "Add to taste library";
  const fillStyle = favorited ? { fontVariationSettings: "'FILL' 1" } : undefined;
  const tone = favorited ? "text-primary" : "text-on-surface/60 hover:text-primary";

  return (
    <button
      onClick={handleClick}
      aria-label={label}
      aria-pressed={favorited}
      title={label}
      disabled={pending && !cached}
      className={`transition-colors ${tone} ${className}`}
    >
      <span className={`material-symbols-outlined ${iconSize}`} style={fillStyle}>
        star
      </span>
    </button>
  );
}
