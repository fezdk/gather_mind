# Gather Mind agent guide

This file applies to the whole repository. Start agent sessions from the repository root.

After reading this file, read `AGENTS.local.md` completely if it exists in the repository root. It is intentionally gitignored and may contain machine-local operational details. Never commit that file or copy local credentials or private distribution configuration from it into tracked documentation.

## Product and repository constraints

- The mobile app is in `mobile/`; the repository-root `npm start` only serves the static prototype on port 4173.
- Run the actual app with `npm --prefix mobile start` (Expo/Metro). Metro is a development asset server, not the app's data backend.
- The installed app is local-first and has no backend, account, analytics, advertising, or cloud sync. User content is stored in an on-device SQLCipher database; its random 256-bit key is held separately in Expo SecureStore.
- SQLCipher is enabled through the `expo-sqlite` config plugin and is not supported in Expo Go. Use a native development, preview, or release build for runtime testing.
- Existing `expo-sqlite/kv-store` content is migrated copy-first. Preserve the migration and never remove or overwrite the legacy value until the encrypted write has been read back successfully.
- The optional app lock uses local device authentication and is deliberately separate from the database key, so biometric enrollment changes do not destroy the only key copy.
- Keep Android Internet access blocked unless the user explicitly changes the privacy model. `mobile/app.json` also disables Android cloud backup.
- Appointment reminders are local OS notifications. Test real scheduled appointment reminders on a physical Android device.
- The permanent Android package and future iOS bundle identifier are both `dk.fez.gathermind`.
- Android phone/portrait is the current target. Tablet support is deliberately off; iOS is prepared but not currently shipped.
- Preserve user changes in a dirty worktree. Do not edit or commit generated native projects, APKs, AABs, keystores, service-account files, or other ignored credentials/artifacts.

## Toolchain

The project requires Node `>=20.19.4 <25`; Node 24.3.0, JDK 17, Android SDK 36, and build tools 36.0.0 are known to work. Older Node versions fail during Expo export/prebuild with errors such as `configs.toReversed is not a function`. Keep `JAVA_HOME` and `ANDROID_HOME` pointed at the selected JDK and SDK. Machine-specific binary paths belong in the gitignored `AGENTS.local.md`, never in this tracked guide.

The local release build currently resolves to min SDK 24 and target SDK 36.

## Development and verification

From `mobile/`, install dependencies and start Metro with a supported Node version:

```bash
npm ci
npm start
```

Run all meaningful mobile checks before a build:

```bash
npm run check
npm test
npx expo export --platform android --output-dir /tmp/gather-mind-release-check
```

The repository-root `npm test` discovers both the web-prototype tests and `mobile/test/*.test.cjs`; use `npm --prefix mobile test` when only the native app is in scope.

Physical-device release checks should cover:

- empty first run and restart persistence;
- keyboard avoidance plus Android status/navigation safe areas;
- create/edit/delete for goals, thoughts, appointments, and appointment-plan items;
- theme autocomplete and thought search filtering;
- notification denial/approval and a real reminder delivered while the app is closed;
- daily rollover, future-dated one-offs without false move history, daily non-deferrable goals, move-to-tomorrow confirmation, and distress colors;
- Today goal reordering by hold-and-drag: variable-height/expanded rows, scrolling a longer list, coexistence with horizontal swipe, persistence across restart and recurring occurrences, and TalkBack move-earlier/move-later actions;
- one-level goal-step creation/edit/removal, blur-save without saving unrelated parent edits, Today expansion/collapse, last-step auto-completion plus Undo, progress preserved on deferral, and checks reset for new recurring occurrences;
- calm carry-over labels plus the optional quiet daily status: chosen time, silent delivery, count updates/removal, tap-to-Today, permission denial, and default-off behavior;
- Delete all local data, including cancellation of scheduled reminders.
- update in place from the previous plaintext beta and confirm all content survives the one-time SQLCipher migration;
- biometric app-lock enable/disable, automatic foreground prompt without cancellation loops, manual retry, background locking, notification entry, and biometric removal/re-enrollment;
- TalkBack and Switch Access navigation for every flow, including the custom move-to-tomorrow action and Undo announcement;
- Android font size at 200%, reduced motion, and Accessibility Scanner in light and dark appearance, including every sheet with the keyboard open.
- home-screen widget discovery and resizing on at least Pixel and Samsung launchers; compact/expanded layouts, light/dark system appearance, counts-only/detail privacy, date rollover, deep links through app lock, and Delete all widget cleanup.
- Health default-off migration and opt-in/out; separate cycle opt-in; 1–5 mood/sleep selection and clearing; period start/end add/edit/remove with date bounds; duration and start-to-start variation; median estimate and five-day Today window; separate health-history deletion and full deletion; no health content in widgets or notifications; TalkBack, 200% font, light/dark, restart persistence, and explicit non-medical/contraception warnings.

## Versioning a release

Do not infer the next version from this document; inspect Git tags and current files. For each release, keep these synchronized:

- root `package.json` version;
- `mobile/package.json` version;
- `mobile/app.json` Expo `version`;
- `mobile/app.json` Android `versionCode` (strictly increasing);
- `mobile/app.json` iOS `buildNumber` (integer string, increasing);
- the hard-coded visible version in the Settings/privacy copy in `mobile/App.tsx`;
- `README.md`, `CHANGELOG.md`, `mobile/RELEASE.md`, and store/support/privacy copy where applicable.

Use semantic versioning and inspect the existing release history before selecting a version. Do not change `dk.fez.gathermind` after store registration.

## Reproducible local Android APK build

Use this exact order for every local sideload APK. Do not reuse an older `app-release.apk`, skip the prebuild, or upload an artifact before all inspection commands pass.

1. Inspect `git status --short`, determine the intended version from the source files and tags, and confirm the version metadata listed above is synchronized.
2. From `mobile/`, run `npm run check`, `npm test`, and the Android Expo export using the Node 24 commands in **Development and verification**.
3. Run `git diff --check` from the repository root.
4. Confirm `mobile/android/` contains no user-authored work. It is generated by Expo prebuild and ignored by Git; the next command deliberately replaces it.
5. Generate a clean Android native project from `mobile/`:

```bash
npx expo prebuild --platform android --no-install --clean
```

6. Expo prebuild has changed the `android` and `ios` package scripts to `expo run:*` in prior runs. Restore the intended Metro scripts immediately afterward and verify that the package diff contains no new prebuild side effects:

```bash
npm pkg set "scripts.android=expo start --android" "scripts.ios=expo start --ios"
git diff -- mobile/package.json mobile/package-lock.json
```

The `git diff` command above is run from the repository root; use `git diff -- package.json package-lock.json` instead when still inside `mobile/`.

7. Build from `mobile/android/`:

```bash
./gradlew :app:assembleRelease
```

The output is:

```text
mobile/android/app/build/outputs/apk/release/app-release.apk
```

8. Copy that newly built artifact to `releases/Gather-Mind-X.Y.Z.apk`, using the exact version name verified in step 1. Overwrite a same-version local artifact only when the user has asked for a replacement build. The `releases/` directory and APKs are intentionally ignored; never commit them.
9. Run every command in **APK inspection and signing checks** against the copied file. Only proceed when every command exits successfully and every expected identity value matches.
10. Report the artifact path, version name/code, certificate digest, and APK SHA-256. Upload or publish it only when the user has explicitly requested that external action.

## APK inspection and signing checks

Use the installed SDK tools, not similarly named system tools:

```bash
"$ANDROID_HOME/build-tools/36.0.0/aapt" dump badging releases/Gather-Mind-X.Y.Z.apk
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose --print-certs releases/Gather-Mind-X.Y.Z.apk
"$ANDROID_HOME/build-tools/36.0.0/zipalign" -c -v 4 releases/Gather-Mind-X.Y.Z.apk
sha256sum releases/Gather-Mind-X.Y.Z.apk
```

Verify at minimum:

- package is `dk.fez.gathermind`;
- version name/code match the intended release;
- APK signature scheme v2 verifies;
- zip alignment passes;
- min/target SDK values are expected;
- the signing certificate matches the intended distribution lineage.

The existing v0.5.x sideload APKs were produced by the generated local Gradle release task using the Android debug signing certificate. Its SHA-256 certificate digest is:

```text
fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c
```

Continue using that certificate only when an APK must update existing sideload beta installs without clearing their local data. This is not production signing and must not be used as the Google Play release credential.

## Google Play / EAS production path

`mobile/eas.json` defines:

- `preview`: internally distributed APK;
- `production`: AAB with remote version auto-increment;
- `submit.production`: draft submission to the Play internal track.

From `mobile/`, after Expo login and EAS project linking:

```bash
npm run build:preview:android
npm run build:production:android
npm run submit:android
```

Keep the production keystore and Play service-account JSON in EAS or a secure credential manager; never commit them. The first AAB normally needs manual Play Console upload to establish the app and Play App Signing. Complete privacy/support URLs, screenshots, content rating, data safety, exact-alarm review, and any health-app declaration before promotion.

## Git and GitHub release specifics

The public repository is:

```text
https://github.com/fezdk/gather_mind
```

Keep authenticated account details and machine-specific Git credential commands in `AGENTS.local.md`.

After tests, source commit, and tag, publish a headless-downloadable release asset with a command shaped like:

```bash
gh release create vX.Y.Z releases/Gather-Mind-X.Y.Z.apk --title "Gather Mind X.Y.Z" --notes-file /tmp/gather-mind-release-notes.md
```

Then verify the release and asset digest with `gh release view`. Public release assets must be downloadable without a GitHub account.

Do not push, tag, publish, email, or upload a build unless the user's request includes that external action. Building and verifying locally does not itself authorize distribution.
