# Phase F - Editorial Review Reframe

## Status: candidate follow-up after Phase E

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
- set-level curatorial notes
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

## Proposed Output Shape

Keep:

- `title`
- `technical`
- `style_story`
- `verdict`
- `curatorial_notes`
- `recommended_sequence`

Consider adding:

```ts
editorialRole: "anchor" | "supporting" | "transition" | "detail" | "near_miss";
editDirection: string;
cropOrCompositionNote?: string;
sequenceRationale?: string;
```

Consider reducing or hiding:

- second `score`
- second `rating`
- repeated dimension bars

If scores remain in the data model for compatibility, the UI should make them secondary to the editorial notes. The user should not read this as a re-cull.

## UX Changes

- Rename the CTA from `DEEP REVIEW N PHOTOS` to `DEVELOP SHORTLIST` or `EDITOR'S NOTES`.
- Rename the grid toggle from `Review` to something like `Develop` or `Notes`.
- In DetailPanel, prioritize editorial role, edit direction, and verdict over a second score.
- Keep set-level notes visible after the pass; this is one of the strongest differentiators from cull.
- Export should continue to use deep/editorial titles and descriptions when present.

## Non-Goals

- Do not make this another personalization/scoring phase.
- Do not add visual-anchor prompting here unless Phase F explicitly chooses that as a separate track.
- Do not require every user to run it. It should remain optional after cull.
- Do not block v1 completion on this unless manual testing shows the current Deep Review actively confuses users.

## Validation

Manual validation should focus on whether the feature earns its cost and time:

- After a Phase E cull, does the CTA feel like the obvious next step for a shortlist?
- Do the notes help decide edit direction or sequencing?
- Does the second score feel redundant or distracting?
- Do exports become more useful with titles/descriptions from this pass?

Success means users understand this as editorial development, not a second opinion on the cull.

## Implementation Sketch

1. Update product language in `CullBanner`, grid toggle labels, progress copy, and docs.
2. Adjust the deep-review prompt to emphasize edit direction, role, set cohesion, and sequence rationale.
3. Add optional structured fields for editorial role and edit direction.
4. Update DetailPanel to lead with editorial notes and de-emphasize repeated scoring.
5. Preserve old saved sessions by rendering missing editorial fields gracefully.
6. Add mocked e2e coverage for the renamed flow and one export assertion if metadata changes.
