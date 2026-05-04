# AI Eval Fixtures

`npm run eval:ai` reads `eval-fixtures/cases.json` by default. Keep real eval photos in this directory or point cases at image paths relative to `cases.json`.

Live evals call Anthropic and are intentionally not part of `npm test`.

## Setup

1. Copy `cases.example.json` to `cases.json`.
2. Add 8-12 stable JPEG/PNG/WebP photos.
3. Update each case's `file`, intent/profile context, and expected ranges.
4. Run:

```bash
npm run eval:ai
```

Results are written to `eval-results/YYYY-MM-DDTHH-mm-ss.json`.

## Expected Fields

- `scoreRange` checks the final app-side score.
- `rubricScoreRange`, `profileDeltaRange`, and `finalScoreRange` check Phase E scoring fields.
- `profileAlignment` checks `profileAffinity.alignment`.
- `matchedTraitsMustMention` and `contradictedTraitsMustMention` check structured affinity traits.
- `mustMention` and `mustNotMention` check the cull note text.

