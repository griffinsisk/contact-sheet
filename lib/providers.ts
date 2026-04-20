import { Provider } from "./types";

interface ImagePart {
  base64: string;
  mediaType: string;
}

interface Message {
  system: string;
  images: ImagePart[];
  textParts: string[];
  maxTokens: number;
  /**
   * When true, wraps the system prompt in Anthropic's prompt-cache block.
   * The first call writes the cache (~25% input-token cost premium on the
   * cached tokens); subsequent calls within the 5-min TTL read it at ~10%
   * cost. Only applied on the Anthropic path; no-op for other providers.
   * Only meaningful server-side where the system prompt is stable across
   * calls — BYOK batches vary too much to cache reliably.
   */
  cacheSystem?: boolean;
}

interface ProviderResponse {
  text: string;
  truncated: boolean;
}

// ── Anthropic ────────────────────────────────────────────────────────────────

async function callAnthropic(apiKey: string, model: string, msg: Message): Promise<ProviderResponse> {
  const content: any[] = [];
  msg.images.forEach((img, i) => {
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
    if (msg.textParts[i]) content.push({ type: "text", text: msg.textParts[i] });
  });
  // Add any remaining text parts
  for (let i = msg.images.length; i < msg.textParts.length; i++) {
    content.push({ type: "text", text: msg.textParts[i] });
  }

  // The dangerous-direct-browser-access header is required for browser-side
  // calls (BYOK). It's meaningless and inappropriate server-side (Next.js
  // API routes), where CORS isn't involved.
  const isBrowser = typeof window !== "undefined";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
  if (isBrowser) {
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }

  const systemField = msg.cacheSystem
    ? [{ type: "text" as const, text: msg.system, cache_control: { type: "ephemeral" as const } }]
    : msg.system;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: msg.maxTokens,
      temperature: 0,
      system: systemField,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`Anthropic: ${data.error?.message || JSON.stringify(data.error)}`);

  const text = data.content?.filter((c: any) => c.type === "text").map((c: any) => c.text).join("") || "";
  return { text, truncated: data.stop_reason === "max_tokens" };
}

// ── OpenAI ───────────────────────────────────────────────────────────────────

async function callOpenAI(apiKey: string, model: string, msg: Message): Promise<ProviderResponse> {
  const content: any[] = [];
  msg.images.forEach((img, i) => {
    content.push({
      type: "image_url",
      image_url: { url: `data:${img.mediaType};base64,${img.base64}`, detail: "low" },
    });
    if (msg.textParts[i]) content.push({ type: "text", text: msg.textParts[i] });
  });
  for (let i = msg.images.length; i < msg.textParts.length; i++) {
    content.push({ type: "text", text: msg.textParts[i] });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: msg.maxTokens,
      temperature: 0,
      messages: [
        { role: "system", content: msg.system },
        { role: "user", content },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`OpenAI: ${data.error?.message || JSON.stringify(data.error)}`);

  const text = data.choices?.[0]?.message?.content || "";
  const truncated = data.choices?.[0]?.finish_reason === "length";
  return { text, truncated };
}

// ── Gemini ───────────────────────────────────────────────────────────────────

async function callGemini(apiKey: string, model: string, msg: Message): Promise<ProviderResponse> {
  const parts: any[] = [{ text: msg.system + "\n\n" }];

  msg.images.forEach((img, i) => {
    parts.push({
      inlineData: { mimeType: img.mediaType, data: img.base64 },
    });
    if (msg.textParts[i]) parts.push({ text: msg.textParts[i] });
  });
  for (let i = msg.images.length; i < msg.textParts.length; i++) {
    parts.push({ text: msg.textParts[i] });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: msg.maxTokens,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`Gemini: ${data.error?.message || JSON.stringify(data.error)}`);

  const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
  const truncated = data.candidates?.[0]?.finishReason === "MAX_TOKENS";
  return { text, truncated };
}

// ── Unified call ─────────────────────────────────────────────────────────────

export async function callProvider(
  provider: Provider,
  apiKey: string,
  model: string,
  msg: Message
): Promise<ProviderResponse> {
  switch (provider) {
    case "anthropic": return callAnthropic(apiKey, model, msg);
    case "openai": return callOpenAI(apiKey, model, msg);
    case "gemini": return callGemini(apiKey, model, msg);
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}

// ── JSON parsing with repair ─────────────────────────────────────────────────

export function parseJSON(text: string, truncated: boolean): any {
  const clean = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    if (truncated) {
      const repaired = repairJSON(clean);
      if (repaired) return repaired;
      throw new Error("Response was truncated — try fewer photos per batch");
    }
    throw new Error(`Invalid JSON response: ${clean.slice(0, 200)}`);
  }
}

function repairJSON(text: string): any {
  try {
    const pat = /"(?:reason|verdict)"\s*:\s*"[^"]*"/g;
    let last = null, m;
    while ((m = pat.exec(text)) !== null) last = m;
    if (!last) return null;

    let pos = last.index + last[0].length;
    let depth = 0;
    for (let i = pos; i < text.length; i++) {
      if (text[i] === "{") depth++;
      if (text[i] === "}") {
        if (depth === 0) { pos = i + 1; break; }
        depth--;
      }
    }

    let repaired = text.substring(0, pos);
    if (text.includes('"cull"')) {
      repaired += "] }";
    } else {
      repaired += '], "curatorial_notes": "Analysis was partially truncated.", "recommended_sequence": [] }';
    }
    const parsed = JSON.parse(repaired);
    parsed._truncated = true;
    return parsed;
  } catch {
    return null;
  }
}
