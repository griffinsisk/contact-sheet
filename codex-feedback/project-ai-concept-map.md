# Project AI Concept Map

## Current Assumption

The project is not fully "agentic." It is a deterministic Next.js application that calls AI models at specific workflow points. However, the core product value is currently carried by AI vision calls.

## Deterministic Today

- File upload and drag-and-drop
- Browser image resizing
- EXIF extraction
- Batch construction
- LocalStorage session persistence
- Clerk tier check
- Vercel API proxy routing
- XMP sidecar generation
- Organization script generation
- Manual rating override display
- Export packaging

## AI-driven Today

- Cull score, rating, and reason
- Deep review critique, title, score, and sequence
- Compare result
- Taste profile prose
- Taste profile tags
- Most rubric interpretation
- Subjective editorial judgment

## Concepts Present

### Rubric Decomposition

Yes, but prompt-level rather than deterministic formula-level.

The rubric is decomposed into five dimensions:

- Impact: 30 percent
- Composition: 25 percent
- Raw quality: 15 percent
- Craft execution: 10 percent
- Story: 20 percent

The model returns per-dimension scores, and the prompt defines guardrails, weights, rating thresholds, and calibration anchors.

Important distinction: the repo explicitly decided not to build a more mechanical enum-observation decomposition system because the variance harness showed the current prompt was already stable enough.

### RAG

Not currently implemented.

There is no vector store, embedding index, retrieval step, or similar-example lookup. The taste library is better described as profile-conditioned prompting: favorite images become prose plus tags, then those are injected into the prompt.

Future RAG-shaped version:

- Store user rating overrides.
- Store image hashes, image features, and possibly embeddings.
- Retrieve similar past overrides for a new image.
- Inject 5-10 examples as calibration context.

### Fine-tuning

Not implemented, and not recommended yet.

The project does not have enough high-quality labeled data to justify fine-tuning. Prompting, evals, retrieval from override history, and deterministic scoring should come first.

### Structured Output

Partially implemented.

The app asks the model for JSON and has JSON parsing/repair logic. It does not currently use provider-native schema enforcement or Anthropic tool-use for structured results.

Recommended improvement:

- Validate output shape with a schema.
- Recompute overall score and rating deterministically from returned dimensions.
- Consider provider-native structured output if reliability becomes a real issue.

### Evals

Yes.

The project has a variance harness that measures repeated scoring behavior across runs and resolutions. This is a strong portfolio signal because it shows measurement-driven product decisions rather than blindly adding complexity.

### Personalization

Yes.

The taste library is the main personalization layer. Users favorite images, the app generates a style profile, and that profile becomes prompt context for future culls and deep reviews.

This is not fine-tuning. It is runtime personalization through prompt context.

### Agentic Orchestration

No, not in the strict sense.

The app follows fixed workflow code:

1. Upload photos.
2. Resize and extract metadata.
3. Cull in batches.
4. Auto-select HERO and SELECT.
5. Optionally deep-review selected frames.
6. Export results.

There is no autonomous planner deciding which tools to use. The workflow is product code, with AI calls at fixed stages.

## Best Way To Describe The Project

"Contact Sheet is a multimodal, rubric-based photo culling tool. It combines deterministic app orchestration, EXIF-aware prompt engineering, two-pass AI review, user taste profiling, and evaluation harnesses for scoring stability."

Avoid claiming:

- "It uses RAG" unless override retrieval is added.
- "It uses fine-tuning" unless a real training pipeline is built.
- "It is an AI agent" unless autonomous planning/tool selection is added.

