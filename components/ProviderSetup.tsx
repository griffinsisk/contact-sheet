"use client";

import { useState } from "react";
import { Provider, ProviderConfig, PROVIDER_INFO } from "@/lib/types";

interface Props {
  onSave: (config: ProviderConfig) => void;
  initial?: ProviderConfig | null;
}

const PROVIDER_ICONS: Record<Provider, string> = {
  anthropic: "auto_awesome",
  openai: "psychology",
  gemini: "cloud",
};

export default function ProviderSetup({ onSave, initial }: Props) {
  const [provider, setProvider] = useState<Provider>(initial?.provider || "anthropic");
  const [apiKey, setApiKey] = useState(initial?.apiKey || "");
  const [model, setModel] = useState(initial?.model || PROVIDER_INFO.anthropic.models[0].id);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const info = PROVIDER_INFO[provider];

  const handleProviderChange = (p: Provider) => {
    setProvider(p);
    setApiKey("");
    setModel(PROVIDER_INFO[p].models[0].id);
    setError(null);
  };

  const handleSave = () => {
    if (!apiKey.trim()) { setError("Please enter an API key"); return; }
    setTesting(true);
    setError(null);

    if (provider === "anthropic" && !apiKey.startsWith("sk-ant-")) {
      setError("Anthropic keys start with sk-ant-. Check your key.");
      setTesting(false);
      return;
    }
    if (provider === "openai" && !apiKey.startsWith("sk-")) {
      setError("OpenAI keys start with sk-. Check your key.");
      setTesting(false);
      return;
    }
    if (provider === "gemini" && !apiKey.startsWith("AIza")) {
      setError("Gemini keys start with AIza. Check your key.");
      setTesting(false);
      return;
    }

    setTesting(false);
    onSave({ provider, apiKey: apiKey.trim(), model });
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex justify-between items-center w-full px-6 py-4 bg-background">
        <div className="text-2xl serif-italic text-on-surface tracking-tight">CONTACT SHEET</div>
        <nav className="hidden md:flex items-center gap-8">
          <span className="mono-label text-[10px] text-on-surface/60">AI PHOTO EDITOR</span>
        </nav>
        <div className="flex items-center gap-6">
          <span className="material-symbols-outlined text-on-surface/60">settings</span>
        </div>
      </header>

      {/* Main */}
      <main className="flex-grow flex items-center justify-center relative px-6 py-10 overflow-y-auto">
        <div className="absolute inset-0 bg-linear-to-tr from-surface-lowest to-transparent pointer-events-none opacity-50" />

        <div
          className="relative w-full max-w-2xl bg-surface-bright p-8 md:p-12 border border-outline-variant/10"
          style={{ boxShadow: "-20px 0 60px -15px rgba(0,0,0,0.8)" }}
        >
          {/* Meta label */}
          <div className="mono-label text-[10px] text-primary mb-8 flex items-center gap-2">
            <span className="w-2 h-2 bg-primary" />
            CONFIGURATION
          </div>

          {/* Heading */}
          <h1 className="text-4xl md:text-5xl serif-italic text-on-surface mb-8 md:mb-12 leading-tight">
            Connect an AI provider
          </h1>

          <div className="space-y-8 md:space-y-12">
            {/* Provider cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(Object.keys(PROVIDER_INFO) as Provider[]).map((p) => {
                const isActive = provider === p;
                const pInfo = PROVIDER_INFO[p];
                return (
                  <button
                    key={p}
                    onClick={() => handleProviderChange(p)}
                    className={`flex flex-col items-start p-6 transition-all active:scale-95 ${
                      isActive
                        ? "bg-surface-highest border-l-2 border-primary shadow-[0_0_20px_-5px_rgba(240,192,64,0.3)]"
                        : "bg-surface-low border-l-2 border-transparent hover:bg-surface-high"
                    }`}
                  >
                    <div className="flex justify-between w-full mb-6">
                      <span className={`material-symbols-outlined ${isActive ? "text-primary" : "text-on-surface-variant"}`}
                        style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                      >
                        {PROVIDER_ICONS[p]}
                      </span>
                      {isActive && (
                        <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                      )}
                    </div>
                    <span className={`mono-label text-xs ${isActive ? "text-on-surface" : "text-on-surface-variant"}`}>
                      {pInfo.label.split(" (")[0]}
                    </span>
                    <span className={`text-[10px] mt-1 leading-none uppercase ${isActive ? "text-on-surface-variant" : "text-on-surface-variant/40"}`}>
                      {pInfo.models[0].label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Model selector (if multiple models) */}
            {info.models.length > 1 && (
              <div className="space-y-4">
                <label className="mono-label text-[10px] text-on-surface-variant">Model</label>
                <div className="flex gap-4">
                  {info.models.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setModel(m.id)}
                      className={`px-4 py-2 font-label text-[11px] transition-colors ${
                        model === m.id
                          ? "bg-surface-highest text-primary border-l-2 border-primary"
                          : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* API key input */}
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <label className="mono-label text-[10px] text-on-surface-variant" htmlFor="api-key">
                  API Key
                </label>
                <a
                  href={info.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono-label text-[10px] text-primary hover:underline"
                >
                  Get your key
                </a>
              </div>
              <div className="relative group">
                <input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                  placeholder={info.placeholder}
                  className="w-full bg-transparent border-t-0 border-x-0 border-b border-outline-variant py-4 text-on-surface font-label placeholder:text-outline-variant focus:ring-0 focus:border-primary transition-all outline-none"
                />
                <div className="absolute right-0 top-1/2 -translate-y-1/2 text-outline-variant group-focus-within:text-primary transition-colors">
                  <span className="material-symbols-outlined text-sm">vpn_key</span>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-3 bg-error/10 border-l-2 border-error">
                <span className="mono-label text-[11px] text-error">{error}</span>
              </div>
            )}

            {/* Submit */}
            <div className="pt-4">
              <button
                onClick={handleSave}
                disabled={testing || !apiKey.trim()}
                className="w-full bg-primary text-on-primary py-6 mono-label font-bold text-sm tracking-widest hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-30"
              >
                {testing ? "Connecting…" : "Connect & Start"}
              </button>
            </div>
          </div>

          {/* Footer */}
          <footer className="mt-12 pt-8 border-t border-outline-variant/10 flex justify-between">
            <div className="mono-label text-[9px] text-on-surface-variant/50">
              LOCALLY STORED SECRETS ONLY
            </div>
            <div className="mono-label text-[9px] text-on-surface-variant/50">
              KEYS SENT DIRECTLY TO PROVIDER
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
