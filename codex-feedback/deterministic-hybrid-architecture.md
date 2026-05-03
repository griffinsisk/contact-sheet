# Deterministic Hybrid Architecture

## Goal

Reduce cost and increase consistency by moving objective photo-quality analysis out of AI prompts and into deterministic compute.

The model should spend tokens on subjective editorial judgment, not tasks that image-processing code can measure.

## What Should Become Deterministic

Good candidates:

- Blur or sharpness score
- Highlight clipping percentage
- Shadow clipping percentage
- Exposure distribution
- Contrast range
- Noise estimate
- Perceptual hash
- Duplicate or near-duplicate grouping
- Burst grouping
- EXIF risk checks
- Face count
- Eye or face sharpness, if using a CV library
- Basic raw-quality score

These produce stable numbers and reduce hallucinated technical critique.

## What Should Stay AI-driven

Keep Claude or another vision model for:

- Emotional impact
- Story or decisive moment
- Composition nuance
- Style fit
- Taste alignment
- Curatorial notes
- Written critique
- Ambiguous artistic intent

These are subjective and benefit from a strong multimodal model.

## Recommended Scoring Split

Instead of asking AI to own every score:

```txt
rawQualityScore = deterministic image metrics
craftRiskScore = deterministic features + EXIF risk
impactScore = AI
compositionScore = AI
storyScore = AI
overallScore = deterministic weighted formula
rating = deterministic threshold from overallScore
```

This makes the output more explainable. The app can say:

"Objective raw quality was measured by image analysis; editorial judgment was provided by Claude."

## Example Feature Payload

```json
{
  "photoHash": "abc123",
  "width": 6240,
  "height": 4160,
  "blurScore": 0.82,
  "highlightClipPct": 0.03,
  "shadowClipPct": 0.11,
  "contrastScore": 0.68,
  "noiseEstimate": 0.24,
  "duplicateClusterId": "cluster_7",
  "isClusterRepresentative": true,
  "exifRisk": {
    "slowShutter": true,
    "highIso": false,
    "wideAperture": true
  },
  "rawQualityScore": 76
}
```

This can be sent into the AI prompt as factual context:

```txt
Technical metrics:
- Raw quality score: 76/100
- Highlight clipping: 3 percent
- Shadow clipping: 11 percent
- Blur score: 0.82
- EXIF risk: slow shutter, wide aperture
Use these as measured facts. Do not invent different technical measurements.
```

## Cost Reduction Pattern

Use deterministic analysis before model calls:

1. Analyze all images locally or in a worker.
2. Remove obvious rejects if the user allows auto-cut.
3. Cluster duplicates and bursts.
4. Send only cluster representatives or uncertain frames to AI.
5. Propagate AI judgment back across similar frames where appropriate.

Example:

```txt
300 uploaded photos
-> deterministic duplicate/burst grouping
-> 120 representative frames
-> obvious technical cuts removed
-> 60-80 frames sent to AI
```

This could cut AI cost by 50-80 percent depending on shoot type.

## Strongest Product Framing

"AI is used where judgment is valuable. Deterministic compute handles measurable image quality."

That is a better technical story than asking the model to do everything.

