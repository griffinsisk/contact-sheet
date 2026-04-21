"use client";

import { useState } from "react";
import { SignedIn, SignedOut, SignInButton, useUser } from "@clerk/nextjs";

export default function UpgradeButton() {
  const { user } = useUser();
  const isPro = user?.publicMetadata?.tier === "pro";
  const [loading, setLoading] = useState(false);

  if (isPro) return null;

  const startCheckout = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setLoading(false);
        alert(data.error || "Checkout failed");
      }
    } catch {
      setLoading(false);
      alert("Checkout failed");
    }
  };

  const className =
    "bg-primary text-background px-4 py-2 hover:opacity-90 transition-opacity duration-200 mono-label text-[10px] uppercase tracking-widest font-bold disabled:opacity-50";

  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <button className={className}>Upgrade to Pro</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <button className={className} onClick={startCheckout} disabled={loading}>
          {loading ? "Loading…" : "Upgrade to Pro"}
        </button>
      </SignedIn>
    </>
  );
}
