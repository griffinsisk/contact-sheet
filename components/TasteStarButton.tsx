"use client";

import { useEffect, useRef, useState } from "react";
import { Photo, Rating } from "@/lib/types";
import { downsizeForCull } from "@/lib/resize";
import { contentHash } from "@/lib/taste-library";
import { useTasteLibrary } from "@/hooks/useTasteLibrary";

interface Props {
  photo: Photo;
  rating: Rating | null;
  size?: "sm" | "md";
  className?: string;
}

interface CachedHash {
  hash: string;
  image: string;
}
const hashCache = new Map<string, CachedHash>();

async function computePhotoHash(photo: Photo): Promise<CachedHash> {
  const cached = hashCache.get(photo.id);
  if (cached) return cached;
  const b64 = await downsizeForCull(photo);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const hash = await contentHash(bytes);
  const entry = { hash, image: b64 };
  hashCache.set(photo.id, entry);
  return entry;
}

export default function TasteStarButton({ photo, rating, size = "md", className = "" }: Props) {
  const { isFavorited, toggleFavorite } = useTasteLibrary();
  const [cached, setCached] = useState<CachedHash | null>(() => hashCache.get(photo.id) ?? null);
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
