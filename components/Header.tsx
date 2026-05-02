"use client";

import { useState } from "react";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import UpgradeButton from "./UpgradeButton";
import SeedUploadModal from "./SeedUploadModal";
import OverridesModal from "./OverridesModal";
import { useOverrides } from "@/hooks/useOverrides";

interface Props {
  onHistory: () => void;
  onSettings: () => void;
  onAddFiles: () => void;
}

export default function Header({ onHistory, onSettings, onAddFiles }: Props) {
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [showOverridesModal, setShowOverridesModal] = useState(false);
  const { store: overridesStore } = useOverrides();
  const overrideCount = overridesStore.entries.length;

  return (
    <header className="fixed top-0 z-50 flex justify-between items-center w-full px-6 py-4 bg-background">
      <div className="flex items-center gap-8">
        <h1 className="text-2xl serif-italic text-on-surface tracking-tight">
          CONTACT SHEET
        </h1>
        <nav className="hidden md:flex gap-6 items-center">
          <span className="mono-label text-[10px] text-primary font-bold">
            AI PHOTO EDITOR
          </span>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={onAddFiles}
          className="text-on-surface/60 hover:text-primary transition-colors duration-200 p-2"
          aria-label="Add files"
        >
          <span className="material-symbols-outlined">add_box</span>
        </button>
        <button
          onClick={() => setShowSeedModal(true)}
          className="text-on-surface/60 hover:text-primary transition-colors duration-200 p-2"
          aria-label="Add favorites to taste library"
          title="Add favorites to taste library"
        >
          <span className="material-symbols-outlined">palette</span>
        </button>
        <button
          onClick={() => setShowOverridesModal(true)}
          className="relative text-on-surface/60 hover:text-primary transition-colors duration-200 p-2"
          aria-label={overrideCount > 0 ? `View ${overrideCount} corrections` : "View corrections"}
          title={overrideCount > 0 ? `${overrideCount} saved correction${overrideCount === 1 ? "" : "s"}` : "View and manage saved corrections"}
        >
          <span className="material-symbols-outlined">tune</span>
          {overrideCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-primary text-on-primary font-label text-[9px] font-bold flex items-center justify-center rounded-full">
              {overrideCount > 99 ? "99+" : overrideCount}
            </span>
          )}
        </button>
        <button
          onClick={onHistory}
          className="bg-surface-high px-4 py-2 flex items-center gap-2 hover:bg-surface-bright transition-colors duration-200"
          aria-label="Session history"
        >
          <span className="material-symbols-outlined text-[16px]">history</span>
          <span className="mono-label text-[10px]">History</span>
        </button>
        <button
          onClick={onSettings}
          className="text-on-surface/60 hover:text-primary transition-colors duration-200 p-2"
          aria-label="Settings"
        >
          <span className="material-symbols-outlined">settings</span>
        </button>
        <UpgradeButton />
        <SignedOut>
          <SignInButton mode="modal">
            <button className="bg-surface-high px-4 py-2 hover:bg-surface-bright transition-colors duration-200 mono-label text-[10px] uppercase tracking-widest font-bold">
              Sign In
            </button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>
      {showSeedModal && <SeedUploadModal onClose={() => setShowSeedModal(false)} />}
      {showOverridesModal && <OverridesModal onClose={() => setShowOverridesModal(false)} />}
    </header>
  );
}
