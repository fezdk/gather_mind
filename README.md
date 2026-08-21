# Gather Mind

Current Android beta: **0.5.8** · Application ID: `dk.fez.gathermind` · [Download the latest release](https://github.com/fezdk/gather_mind/releases/tag/v0.5.8)

Gather Mind is a calm, local-first Android app for catching thoughts, planning appointments, and choosing manageable goals when cognitive load is high. It is informed by needs associated with AuDHD and menopause-related brain fog without making medical claims or attempting diagnosis.

Everything entered in the native app stays on the phone. There is no account, backend, advertising, analytics, cloud sync, or Android Internet permission.

## Platform and project status

- `mobile/` is the current app, built with Expo 54, React Native 0.81, and TypeScript. Android phone/portrait is the supported beta target.
- The permanent Android package and future iOS bundle identifier are both `dk.fez.gathermind`.
- iOS configuration is prepared by the cross-platform framework, but no iPhone build is currently shipped or tested. Tablet work is also out of scope.
- The repository root contains the original static web prototype. It remains useful for quick browser experiments but is not the release app and does not share native app data.

## What 0.5.8 includes

### Thoughts and connections

- Capture a thought immediately; themes and appointment links remain optional and secondary.
- Search the complete Thoughts archive and filter it with saved themes.
- Receive optional, on-device suggestions for nearby appointments and previously used themes without automatic assignment.
- Explore explainable relationships based on shared themes, meaningful words, or appointment links. Matching is local keyword/theme matching, not semantic AI search.
- Link a thought to an appointment or turn it into today's one-off goal while preserving the original thought and a link back to it.

### Goals and Today

- Create one-off, daily, weekly, or monthly goals with an optional first occurrence date.
- Keep daily essentials on Today without deferral; weekly and monthly occurrences can be moved at most 2 or 5 times respectively.
- Keep unfinished goals visible with calm labels such as `Planned yesterday`, while explicitly deferred goals retain their `Moved ×` history.
- Complete, reopen, defer, or restore goals with stable swipe behavior and a temporary Undo action.
- See future recurring goals under a quieter **Scheduled ahead** section.
- Optionally show a silent notification-list count of unfinished goals at a configurable time. It is off by default and never includes goal titles.

### Appointments

- Store an appointment's date, time, place or person, and local reminder choice.
- Keep questions, decisions, documents, errands, things to bring, and follow-ups in a flexible appointment plan.
- Schedule reminders through the phone's operating system and open the relevant appointment when a reminder is tapped.
- Reconcile missing future reminders locally when the app starts.

### Privacy, security, and comfort

- Store content in a SQLCipher-encrypted SQLite database with a random 256-bit key held separately in Expo SecureStore.
- Migrate older beta data copy-first and verify the encrypted copy before removing the legacy plaintext value.
- Optionally lock the app with strong device biometrics after an immediate, 1, 5, or 15 minute timeout. The lock remains separate from the database key so biometric enrollment changes do not destroy the only key copy.
- Preserve unfinished editor drafts across a short app switch or an app-lock timeout.
- Follow the phone's appearance or use a fixed Light or Dark mode.
- Disable Android cloud backup and provide an in-app control that deletes all local content and cancels scheduled notifications.

## Install the Android beta

Download `Gather-Mind-0.5.8.apk` from the [v0.5.8 GitHub release](https://github.com/fezdk/gather_mind/releases/tag/v0.5.8). The current sideload beta uses the same beta signing certificate as earlier 0.5.x APKs, so it can update those installations without clearing local app data.

The beta certificate is not the future Google Play production credential. See [`mobile/RELEASE.md`](mobile/RELEASE.md) for the local APK and EAS/Play release paths.

## Develop the native app

Use Node.js `>=20.19.4 <25`. SQLCipher is not supported in Expo Go, so encryption and app-lock testing require a native development, preview, or release build.

```bash
cd mobile
npm ci
npm start
```

Run the meaningful automated checks from `mobile/`:

```bash
npm run check
npm test
npx expo export --platform android --output-dir /tmp/gather-mind-release-check
```

Machine-specific Android build instructions and the complete physical-device QA list are in [`AGENTS.md`](AGENTS.md). More mobile behavior and reminder-testing guidance live in [`mobile/README.md`](mobile/README.md).

## Run the original web prototype

The root command serves only the static prototype on port 4173:

```bash
npm start
```

Open `http://localhost:4173`. Its data uses browser-local storage, and browser alarms are not dependable while it is closed. The repository-root `npm test` has no substantive mobile coverage.

## Current limitations and direction

- There is no backup, export/import, recovery password, account, or sync. Clearing app storage or uninstalling removes the only copy.
- Real notification delivery, biometric behavior, encrypted migration, keyboard avoidance, and update-in-place behavior still require physical Android QA for each release.
- Thought-to-appointment-plan conversion, one-level **Make this smaller** task steps, handled/archive state, thread-like grouping, and encrypted export/import remain planned rather than shipped.
- Cloud AI, automatic appointment assignment, recursive thought hierarchies, gamification, analytics, and server backup are deliberately not current scope.

The working product rationale and queued ideas are documented in [`docs/product-direction.md`](docs/product-direction.md). Gather Mind intentionally uses neutral language: items stay open rather than becoming overdue, capture can be messy, and there are no streaks or red failure badges.

## Licence, privacy, and support

Gather Mind is licensed under the [Apache License 2.0](LICENSE). The publishable [privacy policy](docs/privacy.html), [support page](docs/support.html), and [Google Play disclosure draft](mobile/store/google-play.md) describe the current local-only behavior.
