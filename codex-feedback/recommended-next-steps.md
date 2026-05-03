# Recommended Next Steps

## 1. Fix Shared-key Route Exposure

The free/pro API routes use the server Anthropic key. Add server-side protection before relying on this publicly:

- Auth or anonymous session IDs
- Rate limiting
- Payload size limits
- Image count limits
- Server-side quota enforcement
- Basic abuse logging

The current localStorage free quota is useful UX, but it is not security.

## 2. Update Stale Docs

Some docs still describe the app as missing `ContactSheet.tsx`, but the component now exists.

Update:

- `docs/PROJECT-REVIEW.md`
- `docs/HANDOFF-V3.md`
- Any scoring docs that still refer to the old four-dimension rubric

This matters because the project is a portfolio artifact. Stale docs weaken the story.

## 3. Add Deterministic Technical Analysis

Start browser-side.

Initial metrics:

- Blur score
- Highlight clipping
- Shadow clipping
- Contrast score
- Perceptual hash
- Duplicate clusters
- EXIF risk flags

Then pass these metrics into the cull prompt as measured facts.

## 4. Recompute Scores Deterministically

Let the model return dimension scores, but compute final overall score and rating in code.

Benefits:

- Prevents arithmetic mistakes
- Keeps thresholds consistent
- Makes overrides and exports cleaner
- Improves trust in the scoring system

## 5. Build Override Learning Before RAG Or Fine-tuning

The next personalization step should be an override log:

```ts
type OverrideEntry = {
  photoHash: string;
  shortDescription: string;
  sessionIntent: IntentPreset;
  originalScore: number;
  originalRating: Rating;
  userRating: Rating;
  timestamp: number;
};
```

Once enough overrides exist, add retrieval:

- Find similar past overrides.
- Prefer same session intent.
- Inject 5-10 examples into the prompt.

That is the useful version of RAG for this product.

## 6. Add Tests For Non-AI Logic

High-value tests:

- EXIF parser
- JSON parsing and repair
- Deterministic score calculation
- XMP generation
- Filename sanitization
- Tier gate logic
- Taste library persistence

The app already has a strong AI harness. Add conventional tests around the deterministic parts.

## 7. Fix Tooling

`npm run lint` currently uses deprecated `next lint` behavior and opens an interactive setup prompt.

Replace it with a real ESLint CLI setup or remove the script until it is configured.

## Suggested Build Order

1. Secure server routes.
2. Update stale docs.
3. Add deterministic score calculator.
4. Add browser-side technical metrics.
5. Feed measured metrics into prompts.
6. Add override log.
7. Add retrieval from override log.
8. Consider Python worker only after browser-side metrics prove useful.

