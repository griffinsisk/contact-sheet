# Codex Feedback

Reference notes from the project review on 2026-05-02.

This folder captures the main feedback about how Contact Sheet currently uses AI, which concepts it demonstrates, and where deterministic compute could replace or reduce AI calls.

## Files

- `project-ai-concept-map.md` - What the project currently uses: rubric decomposition, RAG, fine-tuning, personalization, evals, structured output, and agentic orchestration.
- `deterministic-hybrid-architecture.md` - How to move objective photo analysis into deterministic browser/server/Python compute.
- `profile-aware-scoring.md` - How to make taste profiles affect scoring through structured affinity and bounded deltas instead of prompt-only prose.
- `cost-and-infra-options.md` - Whether cloud resources are needed and what each deployment option looks like.
- `recommended-next-steps.md` - Practical next moves in priority order.
- `testing/` - Testing handoff docs for unit tests, mocked browser smoke tests, live AI evals, and manual Vercel testing.

## One-line Summary

The app is code-orchestrated but AI-dependent for its core judgment layer. The strongest next evolution is a hybrid pipeline: deterministic image analysis for objective quality signals, Claude for subjective editorial judgment.
