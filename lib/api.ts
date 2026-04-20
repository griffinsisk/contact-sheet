import { Photo, ProviderConfig, CullResult, DeepResult, CullResponse, DeepResponse, CompareResponse, ExperienceLevel } from "./types";
import { callProvider, parseJSON } from "./providers";
import { CULL_PROMPT, DEEP_REVIEW_PROMPT, COMPARE_PROMPT, EXPERIENCE_VOICE } from "./prompts";
import { CULL_BATCH_SIZE, DEEP_BATCH_SIZE } from "./constants";
import { formatExifForPrompt } from "./exif";
import { downsizeForCull, resizeToMax } from "./resize";

type ProgressFn = (message: string, batch: number, total: number) => void;

type ProxyEndpoint = "cull" | "deep-review" | "compare";

interface ApiCallArgs {
  /** When null, the call is proxied through /api/{endpoint} (free/pro tiers). */
  config: ProviderConfig | null;
  /** Which server route to use when proxying. Ignored for direct calls. */
  endpoint: ProxyEndpoint;
  /** System prompt. Used on direct calls; ignored on proxy (server owns the prompt). */
  system: string;
  images: { base64: string; mediaType: string }[];
  textParts: string[];
  maxTokens: number;
  /** Extra fields appended to the proxy request body. Ignored on direct calls. */
  extraBody?: Record<string, unknown>;
}

/**
 * Single dispatch point: BYOK calls hit Anthropic (or the other providers)
 * directly via callProvider; tier-gated calls post to our own API routes
 * where the server owns the system prompt and the shared Anthropic key.
 */
async function dispatchApiCall(
  args: ApiCallArgs,
): Promise<{ text: string; truncated: boolean }> {
  if (args.config) {
    return callProvider(args.config.provider, args.config.apiKey, args.config.model, {
      system: args.system,
      images: args.images,
      textParts: args.textParts,
      maxTokens: args.maxTokens,
    });
  }

  const res = await fetch(`/api/${args.endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      images: args.images,
      textParts: args.textParts,
      maxTokens: args.maxTokens,
      ...(args.extraBody ?? {}),
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Proxy ${res.status}: request failed`);
  }
  return res.json();
}

export async function runCull(
  photos: Photo[],
  config: ProviderConfig | null,
  onProgress?: ProgressFn,
): Promise<Record<number, CullResult>> {
  const allResults: Record<number, CullResult> = {};
  const batches: { photo: Photo; globalIndex: number }[][] = [];

  for (let i = 0; i < photos.length; i += CULL_BATCH_SIZE) {
    batches.push(
      photos.slice(i, i + CULL_BATCH_SIZE).map((p, j) => ({ photo: p, globalIndex: i + j }))
    );
  }

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    onProgress?.(`Culling batch ${bi + 1} of ${batches.length}…`, bi, batches.length);

    // Downsize for cull pass
    const cullImages = await Promise.all(batch.map(b => downsizeForCull(b.photo)));

    const images = cullImages.map(b64 => ({ base64: b64, mediaType: "image/jpeg" }));
    const textParts = batch.map((b, i) =>
      `[Photo ${i}: ${b.photo.name}${formatExifForPrompt(b.photo.exif)}]`
    );

    const response = await dispatchApiCall({
      config,
      endpoint: "cull",
      system: CULL_PROMPT,
      images,
      textParts,
      maxTokens: 4096,
    });

    const parsed = parseJSON(response.text, response.truncated) as CullResponse;
    const cullData = parsed.cull || [];

    cullData.forEach(c => {
      const gIdx = batch[c.index]?.globalIndex ?? c.index;
      allResults[gIdx] = { ...c, index: gIdx };
    });
  }

  return allResults;
}

export async function runDeepReview(
  photos: Photo[],
  indices: number[],
  config: ProviderConfig | null,
  level: ExperienceLevel = "enthusiast",
  onProgress?: ProgressFn,
): Promise<{
  analyses: Record<number, DeepResult>;
  curatorialNotes: string | null;
  recommendedSequence: number[] | null;
}> {
  const subset = indices.map(i => ({ photo: photos[i], globalIndex: i }));
  const batches: typeof subset[] = [];
  for (let i = 0; i < subset.length; i += DEEP_BATCH_SIZE) {
    batches.push(subset.slice(i, i + DEEP_BATCH_SIZE));
  }

  const allResults: Record<number, DeepResult> = {};
  let lastNotes: string | null = null;
  let lastSequence: number[] | null = null;

  // For direct/BYOK: compose the full prompt here. For proxy: the server
  // re-composes using the same constants plus the `level` in extraBody.
  const systemPrompt = DEEP_REVIEW_PROMPT + (EXPERIENCE_VOICE[level] || EXPERIENCE_VOICE.enthusiast);

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    onProgress?.(`Deep review ${bi + 1} of ${batches.length}…`, bi, batches.length);

    const images = batch.map(b => ({
      base64: b.photo.base64!,
      mediaType: b.photo.mediaType,
    }));

    const textParts = batch.map((b, i) =>
      `[Photo ${i}: ${b.photo.name}${formatExifForPrompt(b.photo.exif)}]`
    );

    const response = await dispatchApiCall({
      config,
      endpoint: "deep-review",
      system: systemPrompt,
      images,
      textParts,
      maxTokens: 16384,
      extraBody: { level },
    });

    const parsed = parseJSON(response.text, response.truncated) as DeepResponse;
    (parsed.analysis || []).forEach(a => {
      const gIdx = batch[a.index]?.globalIndex ?? a.index;
      allResults[gIdx] = { ...a, index: gIdx };
    });

    lastNotes = parsed.curatorial_notes || lastNotes;
    lastSequence = parsed.recommended_sequence?.map(i => batch[i]?.globalIndex ?? i) || lastSequence;
  }

  return { analyses: allResults, curatorialNotes: lastNotes, recommendedSequence: lastSequence };
}

export async function runCompare(
  photoA: Photo,
  photoB: Photo,
  config: ProviderConfig | null,
): Promise<CompareResponse> {
  const images = [
    { base64: photoA.base64!, mediaType: photoA.mediaType },
    { base64: photoB.base64!, mediaType: photoB.mediaType },
  ];
  const textParts = [
    `[Frame A: ${photoA.name}${formatExifForPrompt(photoA.exif)}]`,
    `[Frame B: ${photoB.name}${formatExifForPrompt(photoB.exif)}]\n\nCompare these two frames. Which is stronger?`,
  ];

  const response = await dispatchApiCall({
    config,
    endpoint: "compare",
    system: COMPARE_PROMPT,
    images,
    textParts,
    maxTokens: 1000,
  });

  return parseJSON(response.text, response.truncated) as CompareResponse;
}

/** Dev tool: run the same cull prompt at two resolutions and compare scores */
export async function runResolutionTest(
  photo: Photo,
  config: ProviderConfig,
): Promise<{ res512: CullResult; res1024: CullResult; res1536: CullResult }> {
  const run = async (maxDim: number): Promise<CullResult> => {
    const b64 = await resizeToMax(photo, maxDim, 0.85);
    const images = [{ base64: b64, mediaType: "image/jpeg" }];
    const textParts = [`[Photo 0: ${photo.name}${formatExifForPrompt(photo.exif)}]`];

    const response = await callProvider(config.provider, config.apiKey, config.model, {
      system: CULL_PROMPT,
      images,
      textParts,
      maxTokens: 1024,
    });

    const parsed = parseJSON(response.text, response.truncated) as CullResponse;
    return parsed.cull?.[0] || { index: 0, score: 0, rating: "CUT" as const, reason: "No response" };
  };

  const [res512, res1024, res1536] = await Promise.all([
    run(512),
    run(1024),
    run(1536),
  ]);

  return { res512, res1024, res1536 };
}
