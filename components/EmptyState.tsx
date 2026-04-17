"use client";

import { useCallback, useRef } from "react";
import { ExperienceLevel, SessionSummary } from "@/lib/types";
import { isRawFile } from "@/lib/raw-preview";

interface Props {
  level: ExperienceLevel;
  onLevelChange: (level: ExperienceLevel) => void;
  onFiles: (files: File[]) => void;
  sessions: SessionSummary[];
  onRestoreSession: (id: string) => void;
}

export default function EmptyState({ level, onLevelChange, onFiles, sessions, onRestoreSession }: Props) {
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

  const levels: { key: ExperienceLevel; label: string }[] = [
    { key: "learning", label: "Learning" },
    { key: "enthusiast", label: "Enthusiast" },
    { key: "pro", label: "Pro" },
  ];

  return (
    <main className="flex-grow flex flex-col items-start justify-center px-6 pt-12 pb-24">
      <div className="w-full max-w-5xl flex flex-col items-start mx-auto">
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
        <div className="mt-20 w-full max-w-xl">
          <div className="flex justify-between items-end mb-4 px-2">
            <span className="mono-label text-[10px] text-outline">Feedback Style</span>
          </div>
          <div className="grid grid-cols-3 bg-surface-low p-1" role="radiogroup" aria-label="Feedback style">
            {levels.map((l) => (
              <button
                key={l.key}
                onClick={() => onLevelChange(l.key)}
                role="radio"
                aria-checked={level === l.key}
                className={`py-4 mono-label text-[11px] transition-colors ${
                  level === l.key
                    ? "bg-surface-bright text-primary font-bold"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {l.label}
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
