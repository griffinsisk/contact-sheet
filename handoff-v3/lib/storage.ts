import { SessionData, SessionSummary, ProviderConfig, Provider } from "./types";

const SESSION_INDEX_KEY = "cs-session-index";
const PROVIDER_KEY = "cs-provider-config";

// ── Provider config ──────────────────────────────────────────────────────────

export function loadProviderConfig(): ProviderConfig | null {
  try {
    const raw = localStorage.getItem(PROVIDER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveProviderConfig(config: ProviderConfig): void {
  try {
    localStorage.setItem(PROVIDER_KEY, JSON.stringify(config));
  } catch {}
}

export function clearProviderConfig(): void {
  try { localStorage.removeItem(PROVIDER_KEY); } catch {}
}

// ── Session persistence ──────────────────────────────────────────────────────

export function loadSessionIndex(): SessionSummary[] {
  try {
    const raw = localStorage.getItem(SESSION_INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveSession(sessionId: string, data: SessionData): void {
  try {
    localStorage.setItem(`cs-session:${sessionId}`, JSON.stringify(data));

    let index = loadSessionIndex();
    index = index.filter(s => s.id !== sessionId);
    index.unshift({
      id: sessionId,
      date: data.date,
      photoCount: data.photoCount,
      heroCount: data.heroCount,
      selectCount: data.selectCount,
      level: data.level,
      hasDeepReview: data.hasDeepReview,
    });
    index = index.slice(0, 20);
    localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(index));
  } catch (e) { console.error("Failed to save session:", e); }
}

export function loadSession(sessionId: string): SessionData | null {
  try {
    const raw = localStorage.getItem(`cs-session:${sessionId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function deleteSession(sessionId: string): void {
  try {
    localStorage.removeItem(`cs-session:${sessionId}`);
    let index = loadSessionIndex();
    index = index.filter(s => s.id !== sessionId);
    localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(index));
  } catch {}
}
