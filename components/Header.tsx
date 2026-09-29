"use client";

import { useState } from "react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { signOutAction } from "@/app/auth/actions";
import { useTasteLibrary } from "@/hooks/useTasteLibrary";
import UpgradeButton from "./UpgradeButton";
import SeedUploadModal from "./SeedUploadModal";

interface Props {
  onHistory: () => void;
  onSettings: () => void;
  onAddFiles: () => void;
  allowMultipleProfiles?: boolean;
}

export default function Header({ onHistory, onSettings, onAddFiles, allowMultipleProfiles = false }: Props) {
  const [showSeedModal, setShowSeedModal] = useState(false);
  const { user, loading, refreshAuth } = useAuth();
  const { library, collection } = useTasteLibrary();
  const profileTitle = library.currentProfile
    ? `Taste profile: ${library.name}`
    : "Add favorites to taste library";

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
          className="text-on-surface/60 hover:text-primary transition-colors duration-200 p-2 flex items-center gap-2"
          aria-label={profileTitle}
          title={profileTitle}
        >
          <span className="material-symbols-outlined">palette</span>
          {collection.libraries.length > 1 && (
            <span className="hidden lg:inline mono-label text-[10px] text-on-surface-variant max-w-[120px] truncate">
              {library.name}
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
        {!loading && !user && (
          <button
            onClick={() => void refreshAuth({ ensureSignedIn: true })}
            className="bg-surface-high px-4 py-2 hover:bg-surface-bright transition-colors duration-200 mono-label text-[10px] uppercase tracking-widest font-bold"
          >
            Sign In
          </button>
        )}
        {!loading && user && (
          <div className="flex items-center gap-3">
            <span className="mono-label text-[10px] text-on-surface-variant">
              {user.email}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="text-on-surface-variant hover:text-on-surface transition-colors duration-200 mono-label text-[10px] uppercase tracking-widest"
              >
                Sign Out
              </button>
            </form>
          </div>
        )}
      </div>
      {showSeedModal && (
        <SeedUploadModal
          onClose={() => setShowSeedModal(false)}
          allowMultipleProfiles={allowMultipleProfiles}
        />
      )}
    </header>
  );
}
