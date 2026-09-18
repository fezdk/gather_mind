# Read-only goal history · UI exploration

Open `index.html` in a browser. No installation, server, network requests, or app data needed. All records are fictional and anchored to 17 September 2026. The app itself is unchanged.

Three concepts use the current mobile light-theme tokens, serif heading, rounded cards, and persistent bottom navigation. UI copy stays English like the app; comparison notes are Danish.

- **A / Month:** per-day progress rings and explicit completed/planned counts. Select a day to read its snapshot below the calendar.
- **B / Week:** a compact date strip with small progress bars, leaving more room for goals and steps. Week/Month switching is functional in both A and B.
- **C / Journal:** reverse-chronological date cards with a completion count; opening one expands its goals inline and closes the previous card.

All concepts enter from a proposed `History` action beside the Today goal section, not a new bottom tab. Date navigation/disclosure remains interactive, but goal states are plain text/icons, never editable checkboxes. There are no drag, swipe, edit, reopen, or delete controls.

## Try it

- Select 14, 15, or 16 September; compare 3/5, 5/5, and 4/5.
- Select 5 September for a recorded day with no goals, or 13 September for missing history. Missing history is deliberately not represented as zero completion.
- Toggle Week/Month; use the week arrows for the fixture's weeks of 7 and 14 September.
- Expand another day in Journal. The inner phone area scrolls for longer lists.
- Use `?view=month`, `?view=week`, or `?view=journal` for a single-phone preview.

Month arrows, app navigation, and settings are illustrative/disabled in this bounded mock. No persistence or actual history collection is implemented. Native TalkBack, 200% text, dark appearance, and actual Android layout must be validated if a concept is implemented.

## Semantics to settle before implementation

The mock proposes **state at the end of the selected day**: completed goals plus a neutral `Still open at the end of the day` status. This makes the progress denominator explainable. No streaks, red failure markers, aggregate score, or inferred records.

This is not a promise that existing storage can reconstruct old denominators, titles, steps, or completion dates. Preserve honest empty/missing states; immutable daily snapshots and their collection rules require a separate data-model decision. Parent completion must not fabricate checked steps.

Suggested direction: B as the default, with A one tap away through Month. C is an alternative for users who mostly want to read what they recently completed. None is implemented in the native app yet.
