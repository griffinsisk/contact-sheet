# Cost And Infrastructure Options

## Do You Need Cloud Resources?

Not immediately.

You can add deterministic analysis in stages. Start browser-side, then move to server or a Python worker only if the browser version is too slow or too limited.

## Option 1: Browser-only Deterministic Analysis

No new cloud resources.

Flow:

```txt
User drops photos
-> browser computes technical metrics
-> app filters or groups obvious rejects and duplicates
-> selected frames go to AI
```

Good for:

- Histogram analysis
- Basic exposure scoring
- Basic blur detection
- Perceptual hashes
- Duplicate grouping
- Privacy-first processing
- Cheap first implementation

Tradeoffs:

- Uses the user's CPU
- Can be slow for very large shoots
- Harder to use heavier CV models
- Work stops if the browser tab closes

Recommended first step.

## Option 2: Vercel API Functions

Uses existing Next.js/Vercel setup.

Flow:

```txt
Browser sends resized image
-> /api/analyze-technical
-> server computes metrics with JS or sharp
-> returns JSON metrics
-> frontend decides what to send to AI
```

Good for:

- Small synchronous analysis
- Server-side `sharp` processing
- Keeping implementation inside the current app

Tradeoffs:

- Not ideal for hundreds of large images
- Function timeouts can become painful
- Python CV is awkward inside a Next/Vercel function

Use this if browser analysis is too limited but you are not ready for a worker.

## Option 3: Background Python Worker

Requires cloud resources.

Typical pieces:

- Object storage: S3, Cloudflare R2, Supabase Storage, or similar
- Queue: Redis, SQS, Cloud Tasks, or similar
- Worker: Modal, Cloud Run, Fly.io, Render, Railway, or similar
- Database: job status and feature results

Flow:

```txt
User uploads photos
-> Next API stores resized images in bucket
-> Next API creates job records
-> queue tells Python worker what to process
-> worker computes image features
-> worker writes results to DB
-> frontend polls job status
-> app sends useful or uncertain frames to AI
```

Good for:

- Large shoots
- Long-running processing
- OpenCV
- CLIP embeddings
- Face/eye detection
- Background work that continues after tab close
- Production-grade scaling

Tradeoffs:

- More moving parts
- More deployment work
- More failure states
- Needs job status UI

Use this after the deterministic layer proves valuable.

## Practical Recommendation

Start with browser-only analysis.

Add a Python worker later if:

- Browser processing is too slow.
- You want CLIP embeddings.
- You want stronger face/eye detection.
- You need jobs to continue after tab close.
- Users are uploading full shoots with hundreds or thousands of images.

