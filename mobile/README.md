# Gather Mind mobile 0.6.1

This is the native Android/iOS version of Gather Mind. It encrypts its local SQLCipher database and schedules appointment reminders plus the optional quiet daily goal status entirely on the phone. The random database key is kept in the operating system's secure key store. No runtime backend, account, push token, or internet connection is required.

New installations start empty. Existing beta data is copied into the encrypted database and verified before the old plaintext value is scrubbed. The gear button opens appearance and reminder settings, an optional biometric **Lock Gather Mind** control, the in-app privacy summary and support guidance, and a confirmed full-data deletion control. Full deletion cancels reminders as well as erasing all app content.

The Today screen also includes a daily goal list:

- Swipe right or tap the main completion control to complete a goal. Goals with steps use an overall `x/y` progress badge instead of another step-like checkbox. Completed goals remain visible for the day.
- Swipe left to open a confirmation before moving an eligible goal to tomorrow. TalkBack exposes the same move as an action on the goal title without adding a visible deferral button.
- Use the temporary **Undo** action after completing, reopening, postponing, or restoring a goal.
- Use **Make this smaller** while creating or editing a goal to add one level of optional steps. Today shows compact progress and the next unfinished step, which can expand for direct check-off.
- Existing goals save an edited step as soon as its field loses focus; unfinished changes to the parent title, recurrence, or date still wait for **Save changes**.
- Checking the final step completes the parent goal with Undo. Completing the parent directly does not mark unfinished steps as done.
- Repeated deferrals use a yellow-to-rust color ramp and show an explicit `Moved ×` count.
- One-off goals offer **Today**, **Tomorrow**, or **Choose date**. Planning ahead keeps `Moved 0×`; it is distinct from deliberately moving an already due goal.
- Daily essentials can begin on a chosen first date, then return each day and cannot be deferred, making them suitable for medication.
- Weekly goals can begin on a chosen first date, return on that weekday, and can be moved to tomorrow at most twice per occurrence.
- Monthly goals can begin on a chosen first date, return on that calendar date (or that month's final day), and can be moved at most five times per occurrence.
- Unfinished one-off, weekly, and monthly goals remain on Today with a calm `Planned yesterday` or `Planned N days ago` label; this automatic carry-over does not use a deliberate move.
- **Settings & privacy → Quiet daily status** is off by default. When enabled, its configurable time defaults to 18:00 and it shows a silent notification-list count only if goals remain unfinished; it never exposes their titles.
- Goals planned for tomorrow remain visible under **Waiting for tomorrow**, while later one-off and recurring goals remain visible and editable under **Scheduled ahead**.
- Completing a weekly or monthly occurrence resets its move allowance without changing its underlying rhythm.
- Step progress stays with a carried-over or deliberately moved occurrence, resets for each new recurring occurrence, and is restored if a completed weekly or monthly occurrence is reopened.
- Tap a goal or thought to edit it; removal is available inside its editor.

The **Thoughts** screen is a searchable list first. Its optional connection view explains matches through shared themes, meaningful words, or appointment links. Thought capture can suggest up to three appointments from the previous 7 days or next 30 days; suggestions are calculated on-device and nothing is linked until it is selected. A saved thought can become a one-off goal for today while the original remains available; opening that goal provides a link back to its source thought.

Today deliberately does not repeat a partial thought list. Its capture action remains immediately available, while all saved thoughts live in the searchable Thoughts screen or inside a linked appointment.

## Optional Health tab

- **Settings & privacy → Health tracking** is off by default. Enabling it adds Health to the bottom navigation for mood and sleep check-ins; disabling it hides the tab while retaining encrypted entries.
- Mood and sleep quality use independent 1–5 choices for the current local day and save immediately. Tapping a selected choice again clears it.
- A second **Cycle tracking** switch appears only after Health is enabled. It reveals period history and Today estimates without being required for the general Health tracker. Hiding it retains encrypted cycle entries.
- A period has a user-selected first day and optional last day. Start/end history shows recorded duration and can be edited or removed individually; **Clear health history** removes all mood, sleep, and period entries without changing either switch.
- An estimate requires at least two usefully spaced starts. It uses the median of up to six recent start-to-start intervals, reports recent variation without labelling it normal or abnormal, and never predicts fertility or ovulation. Completed start/end entries provide a separate typical recorded period length.
- Today shows the estimate only from five days before through the estimated date. The app clearly states that cycle timing is not contraception, diagnosis, treatment, or a basis for medical decisions.
- Health entries stay in the encrypted app database and are never copied to the widget, notifications, analytics, a backend, or network traffic. No Android health permission or Internet permission is requested.

## Android home-screen widget

- Long-press an empty area of the Android home screen, choose **Widgets → Gather Mind**, and resize the same responsive widget to the amount of context wanted.
- A compact widget shows today’s completed/total goal count. At larger sizes it also shows remaining-goal context and the next appointment.
- Goal and appointment titles are excluded by default. Enable **Settings & privacy → Home screen → Show details in the widget** only if that content may be visible on the unlocked home screen.
- Tapping the widget opens Today; tapping a visible goal or appointment opens that item after the normal app-lock flow.
- The app writes a bounded summary after a successful local save. The summary is encrypted separately with Android Keystore, refreshed at date changes and by Android’s periodic widget update, and removed by **Delete all local data**.

## Appearance

- **Settings & privacy → Appearance** offers **Follow device**, **Light**, and **Dark**.
- Follow device is the default and updates when Android or iOS changes appearance.
- A manual choice applies to the full app, including sheets, inputs, navigation, the privacy cover, biometric lock screen, and status bars.
- The preference is stored only on this phone and requires no account, analytics, or internet access.

## Accessibility

- Interactive controls expose TalkBack names, roles, and states, including goal and appointment-plan checkboxes, filters, radio choices, expanding goal steps, disabled controls, and the selected bottom tab.
- Form fields retain a programmatic label instead of relying on placeholder text. Sheets keep screen-reader focus inside the modal, and non-editor sheets focus their heading when opened.
- Completion, postponement, Undo, and search-result changes use polite live announcements. Moving a goal to tomorrow remains available as a TalkBack custom action as well as the left-swipe gesture.
- Touch targets are at least 48 dp. Text follows the phone's font scale; at large text sizes, the geometric thought map becomes a short explanation and the full accessible connection list remains below it.
- Gather Mind follows the phone's reduced-motion preference and skips optional sheet and goal animations when it is enabled.
- Shared light/dark surfaces and every moved-goal colour are covered by automated 4.5:1 normal-text contrast tests. A physical TalkBack, Switch Access, 200% font, and Accessibility Scanner pass is still required for each release candidate.

Each appointment has a general-purpose appointment plan. It can hold questions, decisions, documents, things to bring, errands, and follow-ups—not only medical talking points. Plan items have their own create/edit dialog and a separate completion checkbox.

## Try it on a phone

Use Node.js 24 LTS. SQLCipher requires a native development or release build and is not supported in Expo Go. To generate and run the Android development build:

```bash
cd mobile
npm install
npx expo run:android
```

After the native build is installed, Metro can be restarted with `npm start`. Keep the phone and computer on the same network for development.

To verify reminders with a real appointment:

1. Open **Appointments** and tap **Schedule an appointment**.
2. Choose a time about 31 minutes ahead and select **30 min** under **Remind me**.
3. Save, allow notifications when asked, and put the app in the background.
4. The appointment reminder should arrive in about one minute.

A distributable build uses the project-specific Android exact-alarm permission, notification icon, SQLCipher, secure key storage, and biometric APIs configured in `app.json`.

## Local security behavior

- Database encryption is always on and has no password prompt.
- **Settings & privacy → Lock Gather Mind** is off by default and can be enabled only after successful strong biometric authentication.
- When the lock is enabled, you can require biometric unlock immediately or after 1, 5, or 15 minutes away. Private content is covered in the app switcher immediately; after the timeout the visible state is cleared and the encrypted database connection is closed. A fresh app start always requires unlock. The biometric prompt starts automatically when a locked app becomes active; cancelling it leaves a manual unlock button without reopening the prompt in a loop.
- An unfinished thought, goal, appointment, or appointment-plan item stays mounted during the grace period. If the timeout expires, its draft is saved in the encrypted database and restored after unlock; closing an editor normally still discards its unsaved draft.
- The database key is not bound to the biometric profile, so adding a fingerprint does not destroy the encrypted data. If every biometric is removed, add one again in phone settings before unlocking.
- There is no server copy or recovery password. Uninstalling or clearing app storage removes the local database; Android cloud backup remains disabled.

## Reminder behavior

- Creating an appointment requests notification permission and schedules its alarm.
- Editing its time or reminder cancels the old native alarm and schedules a new one.
- Deleting it cancels the alarm.
- Tapping a reminder opens the matching appointment and its appointment plan.
- Startup reconciliation restores a missing future alarm if the operating system removed it.
- Quiet daily status uses its own non-interruptive notification channel, schedules a rolling seven-day window locally, and refreshes or removes the generic count when goals change. Tapping it opens Today.
- Focus, Do Not Disturb, or aggressive battery-saving settings can still suppress or delay alerts.

## Checks

```bash
npm run check
npm test
npx expo export --platform android --output-dir /tmp/gather-expo-export
```

The Expo development server is only used while developing. An installed release build runs without the computer and continues to use encrypted on-device storage and local notifications.

For a signed Android beta or Google Play build, follow [`RELEASE.md`](RELEASE.md). The publishable policy and support pages are in the project-level [`docs/`](../docs/), and the Play listing/declaration draft is in [`store/google-play.md`](store/google-play.md).
