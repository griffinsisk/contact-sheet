"use client";

import { useState } from "react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { isE2EMockPro } from "@/lib/e2e";

export default function UpgradeButton() {
  const { user, loading: authLoading, refreshAuth } = useAuth();
  const isPro = isE2EMockPro() || (user as any)?.publicMetadata?.tier === "pro";
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  if (isPro) return null;

  const startCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setCheckoutLoading(false);
        alert(data.error || "Checkout failed");
      }
    } catch {
      setCheckoutLoading(false);
      alert("Checkout failed");
    }
  };

  const className =
    "bg-primary text-background px-4 py-2 hover:opacity-90 transition-opacity duration-200 mono-label text-[10px] uppercase tracking-widest font-bold disabled:opacity-50";

  if (authLoading) return null;

  if (!user) {
    return (
      <button
        className={className}
        onClick={() => void refreshAuth({ ensureSignedIn: true })}
      >
        Upgrade to Pro
      </button>
    );
  }

  return (
    <button className={className} onClick={startCheckout} disabled={checkoutLoading}>
      {checkoutLoading ? "Loading…" : "Upgrade to Pro"}
    </button>
  );
}
