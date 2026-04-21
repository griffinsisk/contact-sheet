"use client";

import { useCallback, useRef, useState } from "react";
import { SignedIn, SignedOut, SignInButton, useUser } from "@clerk/nextjs";
import { ExperienceLevel, SessionSummary } from "@/lib/types";
import { isRawFile } from "@/lib/raw-preview";

interface Props {
  level: ExperienceLevel;
  onLevelChange: (level: ExperienceLevel) => void;
  onFiles: (files: File[]) => void;
  sessions: SessionSummary[];
  onRestoreSession: (id: string) => void;
  onOpenSettings: () => void;
}

export default function EmptyState({ level, onLevelChange, onFiles, sessions, onRestoreSession, onOpenSettings }: Props) {
  const { user } = useUser();
  const isPro = user?.publicMetadata?.tier === "pro";
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  const startCheckout = async () => {
    setUpgradeLoading(true);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else {
        setUpgradeLoading(false);
        alert(data.error || "Checkout failed");
      }
    } catch {
      setUpgradeLoading(false);
      alert("Checkout failed");
    }
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const items = e.dataTransfer.items;
    const files: File[] = [];

    const processEntry = (entry: FileSystemEntry): Promise<void> => {
      return new Promise((resolve) => {
        if (entry.isFile) {
          (entry as FileSystemFileEntry).file((f) => {
            if (f.type.startsWith("image/") || isRawFile(f)) files.push(f);
            resolve();
          });
        } else if (entry.isDirectory) {
          const reader = (entry as FileSystemDirectoryEntry).createReader();
          reader.readEntries(async (entries) => {
            await Promise.all(entries.map(processEntry));
            resolve();
          });
        } else {
          resolve();
        }
      });
    };

    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) entries.push(entry);
    }

    Promise.all(entries.map(processEntry)).then(() => {
      if (files.length > 0) onFiles(files);
    });
  }, [onFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    const files = Array.from(fileList).filter(f => f.type.startsWith("image/") || isRawFile(f));
    if (files.length > 0) onFiles(files);
    e.target.value = "";
  }, [onFiles]);

  const levels: { key: ExperienceLevel; label: string; subtitle: string; description: string }[] = [
    {
      key: "learning",
      label: "Learning",
      subtitle: "New to critique",
      description: "Each note is a micro-lesson — concepts explained in context so you build intuition shot by shot.",
    },
    {
      key: "enthusiast",
      label: "Enthusiast",
      subtitle: "Shoots regularly",
      description: "Conversational feedback. Names techniques naturally without over-explaining the basics.",
    },
    {
      key: "pro",
      label: "Pro",
      subtitle: "Working photographer",
      description: "Technical shorthand only. Direct calls on DOF, compression, separation — no lectures.",
    },
  ];

  const cardBase =
    "flex flex-col justify-between p-6 border border-outline-variant/40 bg-surface-lowest/40 hover:border-primary/60 transition-colors duration-200";
  const ctaBase =
    "w-full py-3 mono-label text-[11px] uppercase tracking-widest font-bold transition-colors duration-200 disabled:opacity-50";

  return (
    <main className="flex-grow flex flex-col items-start justify-center px-6 pt-12 pb-24">
      <div className="w-full max-w-5xl flex flex-col items-start mx-auto">
        {/* Hero tagline — pre-edit scoring differentiator */}
        <div className="mb-10">
          <span className="mono-label text-[10px] text-primary tracking-[0.25em]">
            PRE-EDIT SCORING
          </span>
          <h2 className="mt-3 text-4xl md:text-5xl serif-italic text-on-surface leading-tight">
            We judge the raw material, not the edit.
          </h2>
          <p className="mt-4 text-on-surface-variant max-w-2xl">
            Drop a shoot. Get HERO / SELECT / MAYBE / CUT calls on what you captured — before Lightroom, before the edit,
            before the attachment sets in.
          </p>
        </div>

        {/* Three-path picker */}
        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {/* Try free */}
          <div className={cardBase}>
            <div>
              <span className="mono-label text-[10px] text-outline tracking-[0.2em]">TRY FREE</span>
              <h3 className="mt-2 serif-italic text-2xl text-on-surface">10 photos, no account</h3>
              <p className="mt-3 text-sm text-on-surface-variant">
                Drop up to 10 frames. Runs on our Claude key. No sign-up, no card.
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`${ctaBase} mt-6 bg-primary text-on-primary hover:bg-primary-dim`}
            >
              Start Free
            </button>
          </div>

          {/* Upgrade to Pro */}
          <div className={cardBase}>
            <div>
              <span className="mono-label text-[10px] text-outline tracking-[0.2em]">PRO · $5/MO</span>
              <h3 className="mt-2 serif-italic text-2xl text-on-surface">Unlimited culls</h3>
              <p className="mt-3 text-sm text-on-surface-variant">
                Full shoots, deep reviews, comparisons. Cancel anytime.
              </p>
            </div>
            {isPro ? (
              <div className={`${ctaBase} mt-6 bg-surface-high text-on-surface-variant text-center`}>You're Pro</div>
            ) : (
              <>
                <SignedOut>
                  <SignInButton mode="modal">
                    <button className={`${ctaBase} mt-6 bg-surface-high text-on-surface hover:bg-surface-bright`}>
                      Upgrade to Pro
                    </button>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <button
                    onClick={startCheckout}
                    disabled={upgradeLoading}
                    className={`${ctaBase} mt-6 bg-surface-high text-on-surface hover:bg-surface-bright`}
                  >
                    {upgradeLoading ? "Loading…" : "Upgrade to Pro"}
                  </button>
                </SignedIn>
              </>
            )}
          </div>

          {/* BYOK */}
          <div className={cardBase}>
            <div>
              <span className="mono-label text-[10px] text-outline tracking-[0.2em]">BRING YOUR OWN KEY</span>
              <h3 className="mt-2 serif-italic text-2xl text-on-surface">~$0.01 / photo</h3>
              <p className="mt-3 text-sm text-on-surface-variant">
                Paste an Anthropic key. Calls go direct from your browser — your key never touches our servers.
              </p>
            </div>
            <button
              onClick={onOpenSettings}
              className={`${ctaBase} mt-6 bg-transparent border border-outline-variant text-on-surface hover:bg-surface-high`}
            >
              Paste Your Key
            </button>
          </div>
        </div>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          role="region"
          aria-label="Drop zone — drag photos here or use the buttons below"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
          className="w-full aspect-[21/9] border-2 border-dashed border-outline-variant flex flex-col items-center justify-center relative group cursor-pointer hover:border-primary/50 transition-colors duration-500 bg-surface-lowest/30"
        >
          <div className="absolute inset-0 bg-linear-to-b from-transparent to-surface-low opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="z-10 pl-12">
            <span className="material-symbols-outlined text-5xl text-outline mb-6 block">filter_none</span>
            <h2 className="text-5xl md:text-6xl serif-italic text-on-surface mb-4">
              Drop your frames here
            </h2>
            <p className="mono-label text-[12px] text-on-surface-variant tracking-[0.2em]">
              RAW, JPEG, TIFF, PNG &middot; Up to 200 frames
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-12 flex flex-wrap gap-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-primary text-on-primary px-10 py-4 mono-label text-[12px] font-bold hover:bg-primary-dim transition-colors active:scale-95 duration-100"
          >
            Pick Files
          </button>
          <button
            onClick={() => folderInputRef.current?.click()}
            className="bg-transparent border border-outline-variant text-on-surface px-10 py-4 mono-label text-[12px] hover:bg-surface-high transition-colors active:scale-95 duration-100"
          >
            Open Folder
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.cr2,.cr3,.nef,.arw,.raf,.orf,.rw2,.dng,.pef,.raw"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <input
            ref={folderInputRef}
            type="file"
            accept="image/*,.cr2,.cr3,.nef,.arw,.raf,.orf,.rw2,.dng,.pef,.raw"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            {...({ webkitdirectory: "", directory: "" } as any)}
          />
        </div>

        {/* Experience Level Picker */}
        <div className="mt-20 w-full">
          <div className="flex justify-between items-end mb-4 px-2">
            <span className="mono-label text-[10px] text-outline">Feedback Style</span>
            <span className="mono-label text-[10px] text-outline/60">Pick the tone that matches where you are</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-surface-low p-2" role="radiogroup" aria-label="Feedback style">
            {levels.map((l) => (
              <button
                key={l.key}
                onClick={() => onLevelChange(l.key)}
                role="radio"
                aria-checked={level === l.key}
                className={`flex flex-col items-start text-left px-6 py-5 transition-colors ${
                  level === l.key
                    ? "bg-surface-bright"
                    : "hover:bg-surface-high/60"
                }`}
              >
                <div className="flex items-baseline justify-between w-full mb-1">
                  <span className={`mono-label text-[12px] ${level === l.key ? "text-primary font-bold" : "text-on-surface"}`}>
                    {l.label}
                  </span>
                  <span className="mono-label text-[9px] text-outline tracking-[0.15em] uppercase">{l.subtitle}</span>
                </div>
                <span className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">{l.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Previous Sessions */}
      {sessions.length > 0 && (
        <section className="w-full mt-24 border-t border-outline-variant/10 pt-12">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-10">
              <h3 className="serif-italic text-2xl">Previous Sessions</h3>
              <span className="mono-label text-[10px] text-outline">
                {sessions.length} session{sessions.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {sessions.slice(0, 4).map((s) => (
                <button
                  key={s.id}
                  onClick={() => onRestoreSession(s.id)}
                  className="group text-left"
                >
                  <div className="aspect-video bg-surface-high mb-3 flex items-center justify-center">
                    <span className="mono-label text-[9px] text-on-surface-variant/40">
                      {s.photoCount} FRAMES
                    </span>
                  </div>
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="mono-label text-[11px] text-on-surface">
                        Session_{s.id.slice(0, 6)}
                      </h4>
                      <p className="mono-label text-[9px] text-outline mt-1">
                        {s.date} // {s.heroCount} HERO, {s.selectCount} SELECT
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors">
                      chevron_right
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
