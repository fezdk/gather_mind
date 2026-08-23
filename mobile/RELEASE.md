# Android release runbook — Gather Mind 0.5.9

The app identifier is `dk.fez.gathermind`. Treat it as permanent after the first Google Play upload; changing it later creates a different app.

## One-time setup

1. Install Node.js 24 LTS and run `npm install` in `mobile/`.
2. Create or sign in to an Expo account: `npx eas-cli@latest login`.
3. Link this directory to an EAS project: `npx eas-cli@latest init`.
4. Keep Android signing credentials in EAS or another secure credential manager; never commit a keystore or service-account JSON file.
5. Create the app in Play Console with package name `dk.fez.gathermind`.
6. Host the project-level `docs/privacy.html` and `docs/support.html` at stable public HTTPS URLs. The monitored support email is `https://github.com/fezdk/gather_mind/issues`. A GitHub repository can publish the `docs/` folder directly with GitHub Pages.

## Verify the source

```bash
npm ci
npm run check
npm test
npx expo export --platform android --output-dir /tmp/gather-mind-release-check
```

Test the signed app on at least one supported Android phone. Cover empty first run, notification denial and approval, create/edit/delete for every item type, real appointment-reminder delivery while the app is closed, restart persistence, future one-off planning without a false move count, future first dates plus daily/weekly/monthly recurrence and move limits, move-to-tomorrow confirmation, and **Delete all local data**.

For every form with an explicit save action—thought, goal, appointment, and appointment-plan item—change one value and try the close button, Android hardware back, and TalkBack escape. Confirm each route offers to keep editing or discard the unsaved change, while opening and closing an unchanged form does not warn. Confirm existing goal-step edits still save on blur and do not produce a false warning after that save.

Quiet-status checks should cover its default-off state, permission denial, enabling, changing its time to a few minutes ahead, delivery without sound/vibration/banner while the app is closed, correct singular/plural counts, no notification when all goals are complete, immediate removal/update after a goal changes, carry-over labels after midnight, tapping through the optional app lock to Today, disabling the setting, and verifying that no goal title appears on the lock screen.

Appearance checks should cover Follow device while the system changes between light and dark, both manual overrides, restart persistence, the biometric lock/privacy cover, every tab and sheet, focused keyboard inputs, date/time pickers, status/navigation bars, and readable distress colours.

Accessibility checks should use a physical Android phone and cover:

1. Navigate every screen, sheet, alert, field, picker, switch, radio choice, checkbox, expandable goal-step list, and bottom tab with TalkBack using swipe navigation and Explore by Touch.
2. Complete and reopen a goal, toggle a goal step and appointment-plan item, move an eligible goal with its TalkBack custom action, and activate Undo. Confirm each name, role, state, and live announcement is understandable without looking at the screen.
3. Repeat the core create/edit/delete flows with Switch Access or Voice Access so no required action depends only on a directional swipe.
4. Set Android font size to 200%, then inspect every tab and sheet with the keyboard open. Confirm text is not clipped, controls do not overlap, and Thoughts replaces the geometric connection map with its large-text fallback while retaining the related-thought list.
5. Enable Remove animations/reduced motion and confirm optional sheet and goal animations are suppressed. Run Android Accessibility Scanner in both light and dark appearance and resolve label, touch-target, and contrast findings before release.

Security and migration checks are release-blocking:

1. Install the previous beta, create representative thoughts, goals, appointments, and plan items, then update in place to the candidate build. Confirm every item survives the one-time plaintext-to-SQLCipher migration.
2. Restart the candidate twice and edit migrated content to confirm encrypted persistence.
3. Turn **Lock Gather Mind** on and test successful authentication, cancellation, failure, Android hardware back, background/app-switcher locking, and returning from a notification.
4. Add another enrolled fingerprint or face and confirm access still works. Remove every enrolled biometric, confirm the app remains locked, then re-enrol one and confirm the data is still readable.
5. Confirm **Delete all local data** removes content after restart and cancels scheduled reminders.

SQLCipher is not supported in Expo Go. These checks require a native development, preview, or release build.

## Build and distribute

Create an installable APK for a small beta group:

```bash
npm run build:preview:android
```

Create the production Android App Bundle (`.aab`):

```bash
npm run build:production:android
```

The production profile auto-increments the remote Android version code while the user-visible version remains `0.5.9`. Upload the first AAB manually to Play Console so Google Play App Signing and the application record are established. Later internal-track drafts can be submitted with:

```bash
npm run submit:android
```

Promote from internal testing only after the console declarations, privacy/support URLs, screenshots, content rating, exact-alarm review, and health-app declaration are complete.

## iOS preparation

The future iOS bundle identifier is also `dk.fez.gathermind`, tablet support is disabled for now, and the configuration declares that the app does not use non-exempt encryption. No iOS build or App Store submission is part of 0.5.9.
