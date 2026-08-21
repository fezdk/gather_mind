# Changelog

All notable Gather Mind changes are documented here.

## Unreleased

## 0.5.8 — 2026-08-21

- Added a calm “Planned yesterday” or “Planned N days ago” marker to unfinished one-off, weekly, and monthly goals carried into Today, without counting the carry-over as a deliberate move.
- Added an optional Quiet daily status with a configurable time (18:00 by default), showing only a silent, private count of unfinished goals in the notification list and keeping its rolling local schedule current as goals change.
- Added a local Appearance setting with Follow device, Light, and Dark choices; the system choice responds to phone changes and the preference covers the full app, sheets, lock screen, and system bars.
- Removed the duplicate Loose threads preview from Today so captured thoughts have one clear home under Thoughts while Today stays focused on goals and the next appointment.
- Expanded create/edit sheets toward the top of the screen, kept their geometry stable when the keyboard opens, and scrolled every focused form input above it, including room for thought-theme hints and suggestions.
- Used the keyboard's actual top edge when Android reports a sheet viewport extending behind it, and wrapped reminder choices within the available width.
- Kept the complete theme autocomplete area above the keyboard and recalculated its position whenever the saved-theme suggestions change.
- Reduced the shared page-heading size consistently across Today, Thoughts, and Appointments so “One thing at a time” fits one line at standard phone text sizes while preserving accessible wrapping.
- Added weekly and monthly recurring goals that retain their calendar rhythm, reset their allowance after completion, and stop moving after 2 or 5 one-day deferrals respectively.
- Added a selectable first occurrence for daily, weekly, and monthly goals, with future recurring goals kept visible and editable under Scheduled ahead.
- Migrated existing one-off goals, daily essentials, and encrypted goal drafts to the expanded recurrence model without changing their behavior.

## 0.5.7 — 2026-08-20

- Kept unfinished thought, goal, appointment, and appointment-plan forms through short app switches and restored an encrypted draft after biometric re-entry when the lock timeout expires.
- Removed duplicate Android keyboard avoidance and reduced keyboard-time bottom padding so sheets no longer leave an empty band covering nearby controls.

## 0.5.6 — 2026-08-20

- Encrypted the native app database at rest with SQLCipher and a random 256-bit key held in the phone's secure key store.
- Added a copy-first migration that verifies existing local data in the encrypted database before scrubbing the previous plaintext value.
- Added an optional **Lock Gather Mind** setting using strong fingerprint or secure face authentication, with device fallback where the operating system supports it.
- Added lock-delay choices for immediate locking or a 1, 5, or 15 minute grace period after leaving the app, while covering private content in the app switcher immediately.
- Cleared sensitive UI state and closed the encrypted database connection when an enabled app lock sends Gather Mind to the background.
- Reworked the Mind cloud around a selected thought with visible local connections and explanations for shared themes, meaningful words, or appointment links.
- Kept unrelated search results outside the connection map while retaining them in the accessible list.
- Reframed Cloud as a searchable Thoughts screen and kept the connection map behind an optional Explore connections action.
- Suggested up to three recent or upcoming appointments while capturing a thought, ranked locally by nearby dates and matching words without assigning anything automatically.
- Prioritized saved-theme suggestions already used with the suggested or selected appointment.
- Added an Undo action after completing, reopening, postponing, or restoring a goal.
- Added **Turn into today’s goal** to saved thoughts, preserving the original and linking the new goal back to its source.

## 0.5.5 — 2026-08-19

- Returned goal rows to their resting position before completing them or opening the move-to-tomorrow confirmation.
- Kept today’s goals in their saved order after completion and postponement changes.

## 0.5.4 — 2026-08-19

- Kept appointment-linked thoughts out of the Today screen's Loose threads list and restored them immediately when unlinked.
- Added a clear empty state when every thought is connected.
- Made Android's hardware back button close the active sheet, leave appointment detail, or return to Today before exiting the app.
- Preserved the originating tab when opening appointment detail from Today or Appointments.

## 0.5.3 — 2026-08-18

- Fixed thought searches so short and common words filter results instead of showing the entire cloud.
- Added accent- and case-insensitive matching across thought text and saved themes.
- Added locally stored theme suggestions while capturing or editing thoughts.
- Added tappable saved-theme filters to the Mind cloud.
- Documented the reproducible development, Android build, verification, signing, and GitHub release workflow in `AGENTS.md`.

## 0.5.2 — 2026-08-18

- Kept the app header below Android’s clock, notification, and battery status area with an explicit inset fallback.
- Removed the temporary five-second notification test from settings and support guidance.
- Kept reminder verification focused on real appointment reminders.

## 0.5.1 — 2026-08-18

- Kept focused editor fields visible when the Android keyboard opens.
- Added safe-area spacing for Android system navigation, bottom tabs, sheets, scrolling content, and status messages.
- Made appointment creation visible from Today and the Appointments screen.
- Added a chronological appointment agenda grouped by date.

## 0.5.0 — 2026-08-18

- Added a local-first native phone app with thought capture and a searchable mind cloud.
- Added general appointment plans, local reminders, and reminder reconciliation.
- Added daily and one-off goals with completion, confirmed deferral, and visible deferral history.
- Added create, edit, and delete flows for thoughts, goals, appointments, and appointment-plan items.
- Removed seeded demo/personal data so production installations start empty.
- Added in-app privacy, support, and complete local-data deletion controls.
- Prepared Android production and internal-test EAS profiles under `dk.fez.gathermind`.
- Published Apache-2.0 licensing and deployable privacy/support documents.
