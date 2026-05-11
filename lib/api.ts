import { Photo, ProviderConfig, CullResult, DeepResult, CullResponse, DeepResponse, CompareResponse, ExperienceLevel, SessionIntent } from "./types";
import { callProvider, parseJSON } from "./providers";
import { CULL_PROMPT, DEEP_REVIEW_PROMPT, COMPARE_PROMPT, EXPERIENCE_VOICE, buildCullPrompt, buildDeepReviewPrompt } from "./prompts";
import { CULL_BATCH_SIZE, DEEP_BATCH_SIZE } from "./constants";
import { formatExifForPrompt } from "./exif";
import { downsizeForCull, resizeToMax } from "./resize";
import { contentHash } from "./taste-library";
import { applyProfileScoring } from "./profile-scoring";
import { PROXY_PAYLOAD_SOFT_LIMIT_BYTES, estimateProxyBodyBytes, splitByEstimatedProxyBytes } from "./proxy-payload";

type ProgressFn = (message: string, batch: number, total: number) => void;

type ProxyEndpoint = "cull" | "deep-review" | "compare";

const CULL_RETRY_BATCH_SIZE = 4;

type TasteProfileArg = {
  prose: string;
  aestheticTags: string[];
  libraryPhotoHashes?: string[];
} | null;

type PromptProfile = { prose: string; aestheticTags: string[] } | null;

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

function chunkByCount<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function proxyTooLargeMessage(bytes: number): string {
  return `Hosted proxy request is too large (${Math.ceil(bytes / 1024 / 1024)} MB). Try fewer photos, or bring your own API key to bypass the hosted proxy.`;
}

function missingCullResult(index: number, photoName: string): CullResult {
  return {
    index,
    score: 50,
    rating: "MAYBE",
    reason: `No model result was returned for ${photoName} after retry, so Contact Sheet marked it MAYBE for manual review.`,
  };
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

  const body = {
    images: args.images,
    textParts: args.textParts,
    maxTokens: args.maxTokens,
    ...(args.extraBody ?? {}),
  };
  const estimatedBytes = estimateProxyBodyBytes(body);
  if (estimatedBytes > PROXY_PAYLOAD_SOFT_LIMIT_BYTES) {
    throw new Error(proxyTooLargeMessage(estimatedBytes));
  }

  const res = await fetch(`/api/${args.endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 413) {
      throw new Error("Hosted proxy rejected the request as too large. Try fewer photos, or bring your own API key to bypass the hosted proxy.");
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Proxy ${res.status}: request failed`);
  }
  return res.json();
}

function promptProfile(profile: TasteProfileArg): PromptProfile {
  if (!profile) return null;
  return {
    prose: profile.prose,
    aestheticTags: profile.aestheticTags,
  };
}

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function findLibraryMatches(
  cullImages: string[],
  profile: TasteProfileArg,
): Promise<boolean[]> {
  const libraryHashes = new Set(profile?.libraryPhotoHashes ?? []);
  if (libraryHashes.size === 0) return cullImages.map(() => false);

  return Promise.all(cullImages.map(async (image) => {
    try {
      const hash = await contentHash(base64ToBytes(image));
      return libraryHashes.has(hash);
    } catch {
      return false;
    }
  }));
}

export async function runCull(
  photos: Photo[],
  config: ProviderConfig | null,
  intent: SessionIntent | null,
  onProgress?: ProgressFn,
  profile: TasteProfileArg = null,
): Promise<Record<number, CullResult>> {
  const allResults: Record<number, CullResult> = {};
  type CullBatchItem = {
    photo: Photo;
    globalIndex: number;
    image?: { base64: string; mediaType: string };
  };
  const batches: CullBatchItem[][] = [];

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

    const profileForPrompt = promptProfile(profile);
    const extraBody = {
      ...(intent ? { intent } : {}),
      ...(profileForPrompt ? { profile: profileForPrompt } : {}),
    };
    const prepared = batch.map((b, i) => ({
      ...b,
      image: { base64: cullImages[i], mediaType: "image/jpeg" },
    }));
    const makeCullTextParts = (items: CullBatchItem[]) => items.map((b, i) =>
      `[Photo ${i}: ${b.photo.name}${formatExifForPrompt(b.photo.exif)}]`
    );
    const makeCullImages = (items: CullBatchItem[]) => items.map((b) => {
      if (!b.image) throw new Error(`Cull image was not prepared for ${b.photo.name}`);
      return b.image;
    });
    const apiBatches = config
      ? [prepared]
      : splitByEstimatedProxyBytes(prepared, {
          maxItems: CULL_BATCH_SIZE,
          estimateBytes: (items) => estimateProxyBodyBytes({
            images: makeCullImages(items),
            textParts: makeCullTextParts(items),
            maxTokens: 4096,
            ...extraBody,
          }),
        });

    const runCullApiBatch = async (apiBatch: CullBatchItem[]): Promise<CullBatchItem[]> => {
      const images = makeCullImages(apiBatch);
      const textParts = makeCullTextParts(apiBatch);
      const libraryMatchesPromise = findLibraryMatches(images.map(img => img.base64), profile);

      const response = await dispatchApiCall({
        config,
        endpoint: "cull",
        system: buildCullPrompt(intent, profileForPrompt),
        images,
        textParts,
        maxTokens: 4096,
        extraBody,
      });

      const parsed = parseJSON(response.text, response.truncated) as CullResponse;
      const cullData = parsed.cull || [];
      const libraryMatches = await libraryMatchesPromise;
      const returnedLocalIndices = new Set<number>();

      cullData.forEach(c => {
        const parsedIndex = Number(c.index);
        let localIndex: number | null = null;
        if (Number.isInteger(parsedIndex)) {
          localIndex = parsedIndex >= 0 && parsedIndex < apiBatch.length ? parsedIndex : null;
        } else if (apiBatch.length === 1) {
          localIndex = 0;
        }
        if (localIndex == null) return;
        returnedLocalIndices.add(localIndex);
        const gIdx = apiBatch[localIndex].globalIndex;
        allResults[gIdx] = applyProfileScoring(
          { ...c, index: gIdx },
          { hasProfile: !!profileForPrompt, libraryMatch: libraryMatches[localIndex] },
        );
      });

      return apiBatch.filter((_, index) => !returnedLocalIndices.has(index));
    };

    for (const apiBatch of apiBatches) {
      const missing = await runCullApiBatch(apiBatch);
      if (missing.length === 0) continue;

      onProgress?.(
        `Rechecking ${missing.length} omitted photo${missing.length === 1 ? "" : "s"}…`,
        bi,
        batches.length,
      );

      const retryBatches = chunkByCount(missing, CULL_RETRY_BATCH_SIZE);
      for (const retryBatch of retryBatches) {
        const stillMissing = await runCullApiBatch(retryBatch);
        stillMissing.forEach((item) => {
          allResults[item.globalIndex] = missingCullResult(item.globalIndex, item.photo.name);
        });
      }
    }
  }

  return allResults;
}

export async function runDeepReview(
  photos: Photo[],
  indices: number[],
  config: ProviderConfig | null,
  level: ExperienceLevel = "enthusiast",
  intent: SessionIntent | null = null,
  onProgress?: ProgressFn,
  profile: TasteProfileArg = null,
): Promise<{
  analyses: Record<number, DeepResult>;
  curatorialNotes: string | null;
  recommendedSequence: number[] | null;
}> {
  const subset = indices.map(i => ({ photo: photos[i], globalIndex: i }));

  const allResults: Record<number, DeepResult> = {};
  let lastNotes: string | null = null;
  let lastSequence: number[] | null = null;

  // For direct/BYOK: compose the full prompt here. For proxy: the server
  // re-composes using the same constants plus the `level` + `intent` in extraBody.
  const systemPrompt = buildDeepReviewPrompt(intent, profile) + (EXPERIENCE_VOICE[level] || EXPERIENCE_VOICE.enthusiast);
  const extraBody = {
    level,
    ...(intent ? { intent } : {}),
    ...(profile ? { profile } : {}),
  };
  const prepared = await Promise.all(subset.map(async (item) => ({
    ...item,
    image: config
      ? { base64: item.photo.base64!, mediaType: item.photo.mediaType }
      : { base64: await resizeToMax(item.photo, 1024, 0.82), mediaType: "image/jpeg" },
  })));
  const makeDeepTextParts = (items: typeof prepared) => items.map((b, i) =>
    `[Photo ${i}: ${b.photo.name}${formatExifForPrompt(b.photo.exif)}]`
  );
  const makeDeepImages = (items: typeof prepared) => items.map(b => b.image);
  const batches = config
    ? chunkByCount(prepared, DEEP_BATCH_SIZE)
    : splitByEstimatedProxyBytes(prepared, {
        maxItems: DEEP_BATCH_SIZE,
        estimateBytes: (items) => estimateProxyBodyBytes({
          images: makeDeepImages(items),
          textParts: makeDeepTextParts(items),
          maxTokens: 16384,
          ...extraBody,
        }),
      });

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    onProgress?.(`Developing shortlist ${bi + 1} of ${batches.length}…`, bi, batches.length);

    const images = makeDeepImages(batch);
    const textParts = makeDeepTextParts(batch);

    const response = await dispatchApiCall({
      config,
      endpoint: "deep-review",
      system: systemPrompt,
      images,
      textParts,
      maxTokens: 16384,
      extraBody,
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
  const images = config
    ? [
        { base64: photoA.base64!, mediaType: photoA.mediaType },
        { base64: photoB.base64!, mediaType: photoB.mediaType },
      ]
    : [
        { base64: await resizeToMax(photoA, 1024, 0.82), mediaType: "image/jpeg" },
        { base64: await resizeToMax(photoB, 1024, 0.82), mediaType: "image/jpeg" },
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
