# Gather Mind

Current source build: **0.5.9** · Application ID: `dk.fez.gathermind` · Latest published GitHub release: [v0.5.8](https://github.com/fezdk/gather_mind/releases/tag/v0.5.8)

Gather Mind is a calm, local-first Android app for catching thoughts, planning appointments, and choosing manageable goals when cognitive load is high. It is informed by needs associated with AuDHD and menopause-related brain fog without making medical claims or attempting diagnosis.

Everything entered in the native app stays on the phone. There is no account, backend, advertising, analytics, cloud sync, or Android Internet permission.

## Platform and project status

- `mobile/` is the current app, built with Expo 54, React Native 0.81, and TypeScript. Android phone/portrait is the supported beta target.
- The permanent Android package and future iOS bundle identifier are both `dk.fez.gathermind`.
- iOS configuration is prepared by the cross-platform framework, but no iPhone build is currently shipped or tested. Tablet work is also out of scope.
- The repository root contains the original static web prototype. It remains useful for quick browser experiments but is not the release app and does not share native app data.

## What the current app includes

### Thoughts and connections

- Capture a thought immediately; themes and appointment links remain optional and secondary.
- Search the complete Thoughts archive and filter it with saved themes.
- Receive optional, on-device suggestions for nearby appointments and previously used themes without automatic assignment.
- Explore explainable relationships based on shared themes, meaningful words, or appointment links. Matching is local keyword/theme matching, not semantic AI search.
- Link a thought to an appointment or turn it into today's one-off goal while preserving the original thought and a link back to it.

### Goals and Today

- Create one-off, daily, weekly, or monthly goals with an optional planned or first-occurrence date; one-offs offer quick Today and Tomorrow choices without pretending advance planning was a deferral.
- Keep daily essentials on Today without deferral; weekly and monthly occurrences can be moved at most 2 or 5 times respectively.
- Keep unfinished goals visible with calm labels such as `Planned yesterday`, while explicitly deferred goals retain their `Moved ×` history.
- Complete, reopen, defer, or restore goals with stable swipe behavior and a temporary Undo action.
- Optionally break a goal into one level of smaller steps, check them directly from Today, and complete the parent automatically with Undo when the last step is checked.
- Preserve step progress while an occurrence is carried over or moved, then reset it for each new daily, weekly, or monthly occurrence.
- See future goals under quieter Tomorrow and **Scheduled ahead** sections until their planned day.
- Optionally show a silent notification-list count of unfinished goals at a configurable time. It is off by default and never includes goal titles.

### Appointments

- Store an appointment's date, time, place or person, and local reminder choice.
- Keep questions, decisions, documents, errands, things to bring, and follow-ups in a flexible appointment plan.
- Schedule reminders through the phone's operating system and open the relevant appointment when a reminder is tapped.
- Reconcile missing future reminders locally when the app starts.

### Privacy, security, and comfort

- Store content in a SQLCipher-encrypted SQLite database with a random 256-bit key held separately in Expo SecureStore.
- Migrate older beta data copy-first and verify the encrypted copy before removing the legacy plaintext value.
- Optionally lock the app with strong device biometrics after an immediate, 1, 5, or 15 minute timeout. Unlock starts automatically when the locked app becomes active, with a manual retry after cancellation. The lock remains separate from the database key so biometric enrollment changes do not destroy the only key copy.
- Preserve unfinished editor drafts across a short app switch or an app-lock timeout.
- Follow the phone's appearance or use a fixed Light or Dark mode.
- Support TalkBack with named controls, form labels, selection and checkbox states, modal focus, live Undo/result announcements, and a non-gesture move-to-tomorrow action.
- Keep interactive targets at least 48 dp, preserve 4.5:1 normal-text contrast on shared surfaces and move colours, follow reduced-motion settings, and replace the geometric thought map at large font sizes.
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

### Build a verified local Android APK

The canonical development machine uses Node 24.3.0, JDK 17, Android SDK 36, and the existing sideload-beta signing lineage. Follow this sequence for every local APK so the generated native project, artifact naming, and verification are consistent:

1. Confirm the intended version is synchronized across both `package.json` files, `mobile/app.json`, the visible Settings version, and the release documentation. Android `versionCode` and iOS `buildNumber` must increase for a new release.
2. From `mobile/`, run the checks and export with the known-working Node version:

```bash
PATH=/home/nezar/.npm/_npx/ca19112bc3bc2ce4/node_modules/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin npm run check
PATH=/home/nezar/.npm/_npx/ca19112bc3bc2ce4/node_modules/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin npm test
/home/nezar/.npm/_npx/ca19112bc3bc2ce4/node_modules/node/bin/node node_modules/expo/bin/cli export --platform android --output-dir /tmp/gather-mind-release-check
```

3. Run `git diff --check` from the repository root. Then confirm the ignored `mobile/android/` tree contains no user-authored work before replacing it with a clean Expo prebuild:

```bash
cd mobile
PATH=/home/nezar/.npm/_npx/ca19112bc3bc2ce4/node_modules/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node_modules/.bin/expo prebuild --platform android --no-install --clean
npm pkg set "scripts.android=expo start --android" "scripts.ios=expo start --ios"
cd ..
git diff -- mobile/package.json mobile/package-lock.json
```

The package diff must contain only the already-intended source changes; Expo must not leave `expo run:*` script changes behind.

4. Build the native release from `mobile/android/`:

```bash
cd mobile/android
JAVA_HOME=/home/nezar/.gradle/jdks/eclipse_adoptium-17-amd64-linux.2 ANDROID_HOME=/home/nezar/Android/Sdk PATH=/home/nezar/.gradle/jdks/eclipse_adoptium-17-amd64-linux.2/bin:/home/nezar/.npm/_npx/ca19112bc3bc2ce4/node_modules/node/bin:/home/nezar/Android/Sdk/platform-tools:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin ./gradlew :app:assembleRelease
cd ../..
cp mobile/android/app/build/outputs/apk/release/app-release.apk releases/Gather-Mind-X.Y.Z.apk
```

Replace `X.Y.Z` with the verified version. The generated native directory and APK are ignored build products and must not be committed.

5. Inspect the copied artifact with the installed Android SDK tools:

```bash
/home/nezar/Android/Sdk/build-tools/36.0.0/aapt dump badging releases/Gather-Mind-X.Y.Z.apk
/home/nezar/Android/Sdk/build-tools/36.0.0/apksigner verify --verbose --print-certs releases/Gather-Mind-X.Y.Z.apk
/home/nezar/Android/Sdk/build-tools/36.0.0/zipalign -c -v 4 releases/Gather-Mind-X.Y.Z.apk
sha256sum releases/Gather-Mind-X.Y.Z.apk
```

Verify package `dk.fez.gathermind`, the intended version name/code, min SDK 24, target SDK 36, APK Signature Scheme v2, successful alignment, and beta certificate SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. Report the APK checksum with the handoff. Distribution is deliberately not prescribed here; APK upload configuration belongs in each developer's private local tooling.

The authoritative agent workflow and complete physical-device QA list are in [`AGENTS.md`](AGENTS.md). More mobile behavior and reminder-testing guidance live in [`mobile/README.md`](mobile/README.md).

## Run the original web prototype

The root command serves only the static prototype on port 4173:

```bash
npm start
```

Open `http://localhost:4173`. Its data uses browser-local storage, and browser alarms are not dependable while it is closed. The repository-root `npm test` has no substantive mobile coverage.

## Current limitations and direction

- There is no backup, export/import, recovery password, account, or sync. Clearing app storage or uninstalling removes the only copy.
- Real notification delivery, biometric behavior, encrypted migration, keyboard avoidance, and update-in-place behavior still require physical Android QA for each release.
- Thought-to-appointment-plan conversion, handled/archive state, thread-like grouping, and encrypted export/import remain planned rather than shipped.
- Cloud AI, automatic appointment assignment, recursive thought hierarchies, gamification, analytics, and server backup are deliberately not current scope.

The working product rationale and queued ideas are documented in [`docs/product-direction.md`](docs/product-direction.md). Gather Mind intentionally uses neutral language: items stay open rather than becoming overdue, capture can be messy, and there are no streaks or red failure badges.

## Licence, privacy, and support

Gather Mind is licensed under the [Apache License 2.0](LICENSE). The publishable [privacy policy](docs/privacy.html), [support page](docs/support.html), and [Google Play disclosure draft](mobile/store/google-play.md) describe the current local-only behavior.
