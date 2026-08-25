# Changelog

All notable Gather Mind changes are documented here.

## Unreleased

## 0.6.1 — 2026-08-25

- Added optional, default-off **Health tracking** that reveals a private Health tab with immediate on-device 1–5 mood and sleep-quality check-ins.
- Added a separate **Cycle tracking** opt-in inside Health settings, so the general tracker remains useful without period-related UI or Today estimates.
- Added period history with start and optional end dates, recorded-duration summaries, removable entries, and a separate confirmed **Clear health history** action.
- Added a conservative cycle estimate based on the median of recent user-entered start-to-start intervals, recent timing variation, and a Today note only within five days of the estimate, with explicit contraception and medical-use warnings.
- Migrated existing encrypted state to the new health-aware schemas without losing thoughts, goals, appointments, plans, health check-ins, or cycle starts; users of the interim combined Health/cycle setting keep their existing visibility choice.
- Kept health entries in the SQLCipher database and out of notifications, widgets, accounts, analytics, and all network traffic; updated privacy, support, Google Play declaration, and physical QA guidance accordingly.

## 0.6.0 — 2026-08-23

- Unified the Today and Thoughts creation actions with compact green **Goal +**, **Appointment +**, and **Thought +** buttons, moved thought creation above search, and added a visible search icon.
- Made saved-theme chips filter by the complete theme name, so a multi-word theme such as `me social` no longer includes thoughts tagged only `social`.
- Renamed **Make this smaller** to **Split into smaller steps** and clarified that it adds a checkable list inside the goal which appears on Today and completes the goal at the final step.
- Moved public support to GitHub Issues and enabled private GitHub vulnerability reports so no personal support address needs to be published in the app or repository.
- Added one responsive Android home-screen widget: compact sizes show today’s completed/total goal count, larger sizes add calm goal and appointment context, and taps return to the matching in-app view through the existing biometric lock.
- Refreshed every placed widget instance immediately after goal changes through an observed Glance revision, and added a one-row wide layout that shows both goal context and the next appointment.
- Kept widget titles private by default, added an explicit Settings opt-in for details visible on the home screen, and encrypted the bounded widget summary separately with Android Keystore while preserving the no-Internet model.
- Fixed Android hardware back, the close button, and accessibility escape in the goal editor so native event objects cannot be mistaken for an editor-transition callback and crash the app; audited and hardened the remaining sheet and native-event close paths against the same failure mode.
- Warned before closing thought, goal, appointment, or appointment-plan forms with material unsaved changes, while allowing unchanged forms and already auto-saved goal steps to close normally.
- Restored the visible **↶ Today** affordance for bringing a deliberately postponed goal back, and restored clear outlines around Today and per-goal step progress bars.
- Completed an Android accessibility pass with persistent form labels, named controls and checkboxes, selected/expanded/disabled states, headings, modal focus, and polite TalkBack announcements for result counts and Undo feedback.
- Raised interactive targets to at least 48 dp, added a large-text fallback for the visual thought map, and respected the device's reduced-motion preference for sheets and goal animations.
- Corrected light/dark secondary-text and moved-goal colour contrast, with automated 4.5:1 normal-text contrast checks for shared surfaces and every move colour.
- Added **Today**, **Tomorrow**, and **Choose date** planning to one-off goals, keeping intentional future plans at `Moved 0×` and showing them quietly before their day.
- Started biometric unlock automatically when returning to a timed-out or newly opened locked app, while retaining the unlock button as a retry after cancellation or failure.
- Replaced the parent checkbox on goals with steps with a compact overall-progress badge, so the parent state is visually distinct from its checkable steps.
- Moved the goal-step disclosure arrow below the parent summary and the collapse arrow below the full expanded list.
- Saved step edits and explicit removals directly to an existing goal when a field loses focus, without also committing unfinished title, schedule, or recurrence edits.

## 0.5.9 — 2026-08-22 (internal beta)

- Added optional one-level goal steps through **Make this smaller**, with compact progress and the next unfinished step available directly from Today.
- Made checking the last goal step complete its parent goal automatically with Undo, while completing the parent directly leaves individual step history honest.
- Kept step progress with a weekly, monthly, or one-off occurrence when it is carried over or moved, and reset the checks for each new recurring occurrence.

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
