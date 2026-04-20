# Next Session Plan

**Starting state:** `main` at `89dc5de`. Clean working tree. Target: v1 shippable by end of next week.

## First 5 minutes — verify state

```bash
cd "/Users/griffin.sisk/Desktop/AI Projects/contact-sheet/contact-sheet-v3"
git log --oneline -3             # confirm 89dc5de is HEAD
npx tsc --noEmit                 # must return clean
cat .env.local | grep -c "^ANTHROPIC_API_KEY=sk-ant"    # 1
cat .env.local | grep -c "^CLERK_SECRET_KEY=sk_"         # 1
cat .env.local | grep -c "^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_"  # 1
npm run dev                      # boot — check port, usually 3001 or 3004
```

Visit the URL. Header should show a **SIGN IN** button on the right. Click it — Clerk's modal should open. If it doesn't, something regressed between sessions.

## Before building — paste Stripe keys to `.env.local`

Open `testing-keys` at project root (gitignored). Copy to `.env.local`:
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...`
- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_PRICE_ID=price_...`
- Leave `STRIPE_WEBHOOK_SECRET` empty — it gets generated when the webhook endpoint is registered against Vercel.

## Ordered TODO

### 1. Stripe subscription flow (1 day)
- New route `app/api/stripe/create-checkout-session/route.ts` — takes an authenticated user (Clerk), creates a Stripe Checkout session for `STRIPE_PRICE_ID` with `success_url` back to `/`, returns the URL.
- Client-side "Upgrade to Pro" button somewhere in the UI (empty state + toolbar?) that POSTs to the above and does `window.location = url`.
- New route `app/api/stripe/webhook/route.ts` — verifies Stripe signature with `STRIPE_WEBHOOK_SECRET`, handles `customer.subscription.created` / `.updated` / `.deleted` by updating Clerk user metadata: `publicMetadata.tier = "pro" | "free"`.
- Update `lib/tier.ts::resolveTier` to read `isPro` from Clerk's `useUser()` in the component, pass through. (It already accepts `isPro` as a param — just stop hardcoding it to false.)
- For local testing, use Stripe CLI: `stripe listen --forward-to localhost:3001/api/stripe/webhook` prints a webhook secret to paste into `.env.local`.

### 2. Route protection decision (30 min)
Decide: does the free tier require sign-in, or is it anonymous?
- **Anonymous free (simpler):** anyone can hit `/api/cull` etc. within free quota. Use localStorage counter.
- **Sign-in free (better data):** Clerk-protect the proxy routes. Clerk user metadata tracks usage instead of localStorage.

My lean: **anonymous free for v1**. Lower friction, matches the "try before you buy" posture. Adds middleware protection only on the Stripe/webhook routes, not on the AI proxy routes.

Add to middleware.ts after Stripe is wired. Do NOT protect AI proxy routes if going anonymous.

### 3. Onboarding UI (1 day)
Empty state is currently a drop zone. Replace with three-path picker:
- **Try free** → 10 photos, no account
- **Upgrade ($5/mo)** → Clerk sign-in → Stripe checkout
- **Bring your own key** → existing ProviderSetup flow

Copy needs to include: "Your key never leaves your browser" (for BYOK), estimated cost for BYOK ("about $0.01 per photo at 1024px"), pre-edit scoring positioning ("we judge the raw material, not the edit"). That last one is the strongest differentiator and is currently buried.

### 4. Vercel deploy (2 hours)
- `gh repo create contact-sheet --private --source=. --push`
- Sign in to Vercel, import from GitHub.
- Set env vars in Vercel dashboard (copy each value from `.env.local`).
- Update Stripe webhook endpoint in the Stripe dashboard to `https://<vercel-domain>/api/stripe/webhook`, generate real webhook secret, update Vercel env.
- Update Clerk application URLs in Clerk dashboard to match Vercel domain.
- Verify: sign-in flow works, Stripe checkout works, webhook fires.

### 5. Polish for photographer testing (parallel with above)
Order by friction a photographer will hit:
1. **Rate limit retry in prod cull/deep** — port from `lib/harness.ts::callWithRetry`. 1 hour. One throttled batch shouldn't kill a 100-photo run.
2. **Hide OpenAI/Gemini cards in `components/ProviderSetup.tsx`** — 15 min, portfolio narrative.
3. **Session restore UX** — store full-res base64 for HERO+SELECT on save so restored sessions can re-analyze/compare without re-upload. ~1 day.
4. **Experience-level scoring thresholds** — Learning users currently see CUT on most frames and quit. Bump HERO threshold to 75 (from 85), etc., for Learning mode. 0.5 day. Touch `lib/prompts.ts` and the RATING mapping in `lib/api.ts`.
5. **Archive `contact-sheet-artifact.jsx`** — 92KB stale monolith at app root. Move to `archive/` or delete. 5 min.

### 6. Deferred — parked until signal justifies
See `docs/DECISIONS.md` deferred-items table for the full list with revisit triggers. Don't touch these without signal:
- Phase 1 override log infrastructure (useful eventually, not a shipping blocker)
- Rubric decomposition (doesn't exist as a problem per Phase 0)
- Style calibration / per-user personalization (no data yet)
- Test suite, typography consolidation

## Open questions to resolve before building

- **Anonymous free or sign-in-required free?** See #2 above. Decide first — affects middleware setup and the onboarding copy.
- **Upgrade-to-Pro button placement.** Empty state only, toolbar always, or both? My lean: both, styled as a subtle ghost button in the toolbar.
- **Should we commit any anonymized snapshot of the harness summary to the repo?** Currently only in `~/Downloads/`. A commit would make the "look, we measured" story reproducible from the repo alone. Tradeoff: photo filenames (IMG_9623.jpg etc.) would be committed — harmless but personal.

## Known gaps to flag if they become blockers

- Vercel Hobby tier has a 4.5MB request body limit. A batch of 20 photos at 1024px ≈ 2–6MB — may exceed on some batches. May need to reduce `CULL_BATCH_SIZE` for the proxy path (keep client-side BYOK batch size as-is).
- Next.js middleware with Clerk + free-tier usage tracking: currently localStorage only. If we move to sign-in-required free, usage needs to move into Clerk user metadata too.
- `contact-sheet-artifact.jsx` at app root is still the old single-file version. Confusing for anyone reading the code. Archive.

## Commit reference (for `git blame` archaeology)

| Commit | What |
|---|---|
| `89dc5de` | DECISIONS.md |
| `8fa306d` + `0a2fd6c` | Clerk scaffold merge |
| `222cfc3` + `c57e1c8` | Tier UI wiring merge |
| `0566ff7` | `lib/tier.ts` |
| `154ee40` | `lib/api.ts` dispatch refactor |
| `24eff8b` | Server routes + prompt caching |
| `0a1797d` | Harness button in ready banner; gitignore test photos |
| `32649ba` + `be518ce` + `8662d30` | Phase 0 harness |
| `160a4ea` + `03b8515` | Docs reorg + Phase 0 pivot |
| `4845887` | Project flattened (un-nest handoff-v3) |

---

When updating this file next session: rewrite from scratch rather than append. This is a rolling plan, not a log. History lives in git and `DECISIONS.md`.
