# Profile-Aware Scoring Feedback

Date: 2026-05-03

## Triggering Observation

During testing, a red flower photo was seeded into the taste library through `set-a-favorites`. A later cull included that exact same red flower photo. The cull result still labeled the image as diverging from the user's library, even though the frame was literally present in the library.

This exact duplicate workflow is unlikely in normal usage, so the duplicate itself is not the core product issue. The test exposed a more important weakness: the seeded profile does not appear to have enough concrete influence over scoring or alignment language.

## Diagnosis

The current profile mechanism is mostly prompt context:

- Taste profile regen produces prose and aesthetic tags.
- The cull prompt injects those as a soft bias.
- The model is asked to modestly adjust its read and close the cull note with one of three phrases: aligns, diverges, or outside.
- The final score is still produced by the model under the main rubric, not by deterministic profile-aware math.

That means the profile can affect language more than scoring. It also means "Diverges from your library" is not a computed fact; it is a model-written interpretation of prose and tags.

This creates a structural mismatch:

- The rubric is concrete: dimensions, weights, thresholds, and calibration anchors.
- The profile is fuzzy: prose and tags that the model may or may not apply strongly.
- When the two conflict, the concrete rubric usually wins.

The result is a profile that can feel present in the note copy but weak or inconsistent in the actual decision.

## Recommended Direction

Make taste profile influence a structured scoring artifact instead of only prose in the prompt.

Keep the generic rubric score as the baseline, then add a separate profile-affinity result:

```ts
type ProfileAffinity = {
  alignment: "aligned" | "diverged" | "outside";
  confidence: number; // 0.0-1.0
  matchedTraits: string[];
  contradictedTraits: string[];
  suggestedDelta: {
    impact?: number;
    composition?: number;
    story?: number;
  };
};
```

Then apply profile influence in app code with bounded rules:

- Strong alignment: usually +2 to +6 overall.
- Medium alignment: usually +1 to +3 overall.
- Divergence: usually 0, rarely -1 to -3.
- Profile deltas cannot rescue a weak frame across a major bucket unless the baseline score is already near the boundary.
- Story guardrails still win. A frame with no decisive moment should not become story-rich because it matches palette, light, or subject preference.

The displayed result should keep the pieces visible:

```ts
type ProfileAwareScore = {
  rubricScore: number;
  profileDelta: number;
  finalScore: number;
  profileAffinity: ProfileAffinity;
};
```

Example:

> Rubric score 52. Profile alignment +4 because this matches warm color, close subject, and botanical-detail preferences. Final score 56.

## Why Not Just Strengthen The Prompt

Prompt tuning alone will likely keep oscillating between two bad states:

- Too weak: profile changes the wording but barely moves scores.
- Too strong: profile alignment rescues objectively weak frames.

The Phase B validation notes already show this tension: profile influence was directionally useful but often conservative, and stronger prompting previously risked large score swings on weak but aesthetically aligned frames.

The cleaner rule is: the model reads taste, but the app applies bounded math.

## Duplicate-Photo Edge Case

A hash-based duplicate check could prevent the specific "this exact library photo diverges from your library" message:

- If a culled photo hash exists in the taste library, force `alignment = "aligned"` or show an "already in library" badge.
- This should be treated as a narrow sanity check, not the central solution.

The real fix is that the alignment badge and profile score delta should come from a structured affinity object, not from a sentence in the cull note.

## Product Outcome

The user should be able to verify how their profile affected a score:

- What the generic rubric thought.
- Which profile traits matched or conflicted.
- How many points the profile added or subtracted.
- Why the final bucket did or did not change.

That turns the taste profile from vibes context into an inspectable scoring lever.
