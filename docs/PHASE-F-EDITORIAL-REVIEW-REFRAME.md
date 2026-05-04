# Phase F - Editorial Review Reframe

## Status: PR open, preview checks passed

Phase F has been implemented on `feature/editorial-review-reframe`, pushed to GitHub, and opened as PR #5. It is not yet merged or deployed to production.

- PR: https://github.com/griffinsisk/contact-sheet/pull/5
- Latest functional commit: `36c4b12` (`Include promoted selects in shortlist development`)
- Vercel preview: https://contact-sheet-git-feature-editoria-10da4d-griffinsisks-projects.vercel.app
- Vercel status: passed
- CodeRabbit status: passed
- Preview access note: direct HTTP check returns 401 because Vercel preview protection/SSO is enabled.
- Remaining work: run manual preview smoke, merge PR #5, then smoke production.

Verification completed on 2026-05-04:

```bash
npm run typecheck      # passed
npm run test:unit      # 29 passed
npm run test:e2e       # 7 passed
npm run build          # passed
gh pr checks 5         # Vercel, Vercel Preview Comments, and CodeRabbit passed
```

Phase E made the cull pass stronger: scoring is now app-side, profile-aware, bounded, inspectable, and covered by live evals. That changes the role of the existing Deep Review feature.

Deep Review should no longer be treated as "a better scoring pass." The cull is now the decision engine. The follow-up opportunity is to turn Deep Review into the editorial development layer for the shortlist.

## Diagnosis

The current Deep Review still returns a second rating, score, and dimension breakdown. That made sense when the first cull pass was comparatively lightweight. After Phase E, this creates overlap:

- Cull now explains rubric score, profile delta, final score, matched traits, and contradicted traits.
- Running another scored pass can feel redundant or confusing.
- A second score can undermine trust if it disagrees with the cull score for reasons that are hard to explain.

The useful parts of Deep Review are not the second rating. They are:

- richer critique for selected frames
- title and description generation for export
- edit/development direction
- set-level editor's notes
- recommended sequence

## Product Positioning

Rename or reframe Deep Review as one of:

- Editor's Notes
- Develop Shortlist
- Portfolio Review
- Sequence & Notes

Recommended direction: **Develop Shortlist** for the action label, with **Editor's Notes** as the output language.

The user mental model should be:

1. Cull decides what survives.
2. Develop Shortlist explains what to do with the survivors.
3. Export carries ratings plus editorial metadata into the photographer's next workflow.

## Desired Behavior

The feature should answer different questions from culling.

Cull answers:

- Keep or cut?
- How strong is this frame before editing?
- How did my taste profile affect the score?

Editorial review should answer:

- What is this image's role in the shortlist?
- What edit direction would make it stronger?
- What crop, tonal treatment, or sequencing choice should the photographer consider?
- Is this a portfolio anchor, supporting image, transition frame, or near miss?
- How does the selected set work together?

## Implemented Output Shape

Keep:

- `title`
- `technical`
- `style_story`
- `verdict`
- `curatorial_notes`
- `recommended_sequence`

Added optional per-photo fields:

```ts
editorialRole: "anchor" | "supporting" | "transition" | "detail" | "near_miss";
editDirection: string;
cropOrCompositionNote?: string;
```

The second `score`, `rating`, and dimension bars remain in the data model for compatibility, but the UI now makes the score secondary to editorial guidance. The user should read this as shortlist development, not a re-cull.

## UX Changes

- CTA is now `DEVELOP SHORTLIST`.
- Grid toggle is now `DEVELOP`.
- Progress and sidebar copy now frame the pass as shortlist notes/development.
- DetailPanel leads with `Editor's Notes`, editorial role, edit direction, crop/composition, and verdict.
- The second score is shown lower as `EDITOR'S SCORE` with secondary rubric dimensions.
- Set-level notes are shown as `Editor's Notes`.
- Manifest export includes optional editorial role, edit direction, and crop/composition fields when present.
- XMP export continues to use deep/editorial titles and descriptions when present.
- Develop Shortlist now tracks the current effective rating, so manually promoted `HERO`/`SELECT` photos are included and manually demoted `MAYBE`/`CUT` photos are excluded.
- Vercel proxy payloads for AI routes are split and downsized to avoid `Proxy 413: request failed` during larger Develop Shortlist calls.
- Favorites now show a pending-regeneration cue in the profile modal, matching the correction signal behavior.

## Non-Goals

- Do not make this another personalization/scoring phase.
- Do not add visual-anchor prompting here unless Phase F explicitly chooses that as a separate track.
- Do not require every user to run it. It should remain optional after cull.
- Do not block v1 completion on this unless manual testing shows the current Deep Review actively confuses users.

## Validation

Manual validation should still focus on whether the feature earns its cost and time:

- After a Phase E cull, does the CTA feel like the obvious next step for a shortlist?
- Do the notes help decide edit direction or sequencing?
- Does the second score feel redundant or distracting?
- Do exports become more useful with titles/descriptions from this pass?

Success means users understand this as editorial development, not a second opinion on the cull.

Preview smoke checklist:

- Open the preview while logged into the Vercel account/team.
- Upload a small set and run cull.
- Confirm the post-cull action reads `DEVELOP SHORTLIST`.
- Run shortlist development and confirm set-level `Editor's Notes` appears.
- Promote a `MAYBE` frame to `SELECT`, confirm the CTA count increases, and confirm Develop Shortlist includes that frame.
- Confirm the Develop Shortlist request does not hit `Proxy 413: request failed` on the previously failing batch shape.
- Star a favorite, open View Profile, and confirm the pending-regeneration cue appears until profile regen.
- Open a developed frame and confirm editorial guidance appears before `EDITOR'S SCORE`.
- Export the manifest and confirm editorial fields are included when returned by the model.
- If preview smoke passes, merge PR #5 and verify production.

## Implementation Sketch

Completed:

1. Updated product language in `CullBanner`, grid toggle labels, progress copy, sidebar, export copy, and docs.
2. Adjusted the deep-review prompt to emphasize edit direction, role, set cohesion, and sequence rationale.
3. Added optional structured fields for editorial role, edit direction, and crop/composition notes.
4. Updated DetailPanel to lead with editorial notes and de-emphasize repeated scoring.
5. Preserved old saved sessions by rendering missing editorial fields gracefully.
6. Added mocked e2e coverage for the renamed flow and unit coverage for prompt/export contract changes.
7. Added e2e coverage for manually promoted selects being included in Develop Shortlist.
