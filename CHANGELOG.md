# Changelog

All notable Gather Mind changes are documented here.

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
