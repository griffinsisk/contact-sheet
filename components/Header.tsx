"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

interface Props {
  onHistory: () => void;
  onSettings: () => void;
  onAddFiles: () => void;
}

export default function Header({ onHistory, onSettings, onAddFiles }: Props) {
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
    </header>
  );
}
