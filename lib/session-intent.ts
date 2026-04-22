import { IntentPreset, SessionIntent } from "./types";

const PRESET_KEY = "cs-session-intent";
const FREE_FORM_KEY = "cs-session-free-form";

const VALID_PRESETS: IntentPreset[] = [
  "documentary", "street", "film", "wildlife",
  "landscape", "portrait", "events", "mixed",
];

export function loadSessionIntent(): SessionIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const preset = window.sessionStorage.getItem(PRESET_KEY) as IntentPreset | null;
    if (!preset || !VALID_PRESETS.includes(preset)) return null;
    const freeForm = window.sessionStorage.getItem(FREE_FORM_KEY) || undefined;
    return { preset, freeForm };
  } catch {
    return null;
  }
}

export function saveSessionIntent(intent: SessionIntent | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!intent) {
      window.sessionStorage.removeItem(PRESET_KEY);
      window.sessionStorage.removeItem(FREE_FORM_KEY);
      return;
    }
    window.sessionStorage.setItem(PRESET_KEY, intent.preset);
    if (intent.freeForm && intent.freeForm.trim()) {
      window.sessionStorage.setItem(FREE_FORM_KEY, intent.freeForm.trim());
    } else {
      window.sessionStorage.removeItem(FREE_FORM_KEY);
    }
  } catch {
    // storage disabled / quota — intent is ephemeral anyway
  }
}
