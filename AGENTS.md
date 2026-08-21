# Gather Mind agent guide

This file applies to the whole repository. The canonical project directory is:

```text
/home/nezar/projects/gather_mind
```

Start future Codex sessions from that directory. The earlier Codex workspace path under `/home/nezar/Documents/Codex/` is stale and may not exist or be writable.

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

## Toolchain on this machine

The system `node` is v18.19.1, which is too old for Expo 54. It fails during export/prebuild with errors such as `configs.toReversed is not a function`. The project requires Node `>=20.19.4 <25`.

A known-working Node v24.3.0 binary is cached at:

```text
/home/nezar/.npm/_npx/ca19112bc3bc2ce4/node_modules/node/bin/node
```

If that npm cache is gone, recreate/use it with `npx --yes node@24.3.0`. For commands whose scripts find `node` through `PATH`, put this directory first:

```bash
PATH=/home/nezar/.npm/_npx/ca19112bc3bc2ce4/node_modules/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin npm ci
```

Known-working Android toolchain paths:

```text
JDK 17:       /home/nezar/.gradle/jdks/eclipse_adoptium-17-amd64-linux.2
Android SDK:  /home/nezar/Android/Sdk
Build tools:  /home/nezar/Android/Sdk/build-tools/36.0.0
```

The local release build currently resolves to min SDK 24 and target SDK 36.

## Development and verification

From `mobile/`, install dependencies and start Metro with Node 24 first on `PATH`:

```bash
PATH=/home/nezar/.npm/_npx/ca19112bc3bc2ce4/node_modules/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin npm ci
PATH=/home/nezar/.npm/_npx/ca19112bc3bc2ce4/node_modules/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin npm start
```

Run all meaningful mobile checks before a build:

```bash
PATH=/home/nezar/.npm/_npx/ca19112bc3bc2ce4/node_modules/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin npm run check
PATH=/home/nezar/.npm/_npx/ca19112bc3bc2ce4/node_modules/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin npm test
/home/nezar/.npm/_npx/ca19112bc3bc2ce4/node_modules/node/bin/node node_modules/expo/bin/cli export --platform android --output-dir /tmp/gather-mind-release-check
```

The repository-root `npm test` currently discovers no substantive tests; the useful suite is `mobile/test/*.test.cjs`.

Physical-device release checks should cover:

- empty first run and restart persistence;
- keyboard avoidance plus Android status/navigation safe areas;
- create/edit/delete for goals, thoughts, appointments, and appointment-plan items;
- theme autocomplete and thought search filtering;
- notification denial/approval and a real reminder delivered while the app is closed;
- daily rollover, daily non-deferrable goals, move-to-tomorrow confirmation, and distress colors;
- calm carry-over labels plus the optional quiet daily status: chosen time, silent delivery, count updates/removal, tap-to-Today, permission denial, and default-off behavior;
- Delete all local data, including cancellation of scheduled reminders.
- update in place from the previous plaintext beta and confirm all content survives the one-time SQLCipher migration;
- biometric app-lock enable/disable, cancellation/failure, background locking, notification entry, and biometric removal/re-enrollment.

## Versioning a release

Do not infer the next version from this document; inspect Git tags and current files. For each release, keep these synchronized:

- root `package.json` version;
- `mobile/package.json` version;
- `mobile/app.json` Expo `version`;
- `mobile/app.json` Android `versionCode` (strictly increasing);
- `mobile/app.json` iOS `buildNumber` (integer string, increasing);
- the hard-coded visible version in the Settings/privacy copy in `mobile/App.tsx`;
- `README.md`, `CHANGELOG.md`, `mobile/RELEASE.md`, and store/support/privacy copy where applicable.

Use patch releases for the current beta stream. Do not change `dk.fez.gathermind` after store registration.

## Reproducible local Android APK build

`mobile/android/` is generated by Expo prebuild and ignored by Git. Confirm it contains no user-authored work before running the destructive `--clean` generation step.

From `mobile/`:

```bash
PATH=/home/nezar/.npm/_npx/ca19112bc3bc2ce4/node_modules/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node_modules/.bin/expo prebuild --platform android --no-install --clean
```

Expo prebuild has changed the `android` and `ios` package scripts to `expo run:*` in prior runs. Restore the intended Metro scripts immediately afterward and verify the diff:

```bash
npm pkg set "scripts.android=expo start --android" "scripts.ios=expo start --ios"
git diff -- package.json package-lock.json
```

Build from `mobile/android/`:

```bash
JAVA_HOME=/home/nezar/.gradle/jdks/eclipse_adoptium-17-amd64-linux.2 ANDROID_HOME=/home/nezar/Android/Sdk PATH=/home/nezar/.gradle/jdks/eclipse_adoptium-17-amd64-linux.2/bin:/home/nezar/.npm/_npx/ca19112bc3bc2ce4/node_modules/node/bin:/home/nezar/Android/Sdk/platform-tools:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin ./gradlew :app:assembleRelease
```

The output is:

```text
mobile/android/app/build/outputs/apk/release/app-release.apk
```

Copy the final artifact to `releases/Gather-Mind-X.Y.Z.apk`. The `releases/` directory and APKs are intentionally ignored; publish the APK as a GitHub release asset rather than committing it.

## APK inspection and signing checks

Use the installed SDK tools, not similarly named system tools:

```bash
/home/nezar/Android/Sdk/build-tools/36.0.0/aapt dump badging releases/Gather-Mind-X.Y.Z.apk
/home/nezar/Android/Sdk/build-tools/36.0.0/apksigner verify --verbose --print-certs releases/Gather-Mind-X.Y.Z.apk
/home/nezar/Android/Sdk/build-tools/36.0.0/zipalign -c -v 4 releases/Gather-Mind-X.Y.Z.apk
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

The private repository is:

```text
https://github.com/fezdk/gather_mind
```

The authenticated GitHub account is `fezdk`. `gh` is the snap binary at `/snap/bin/gh`; its confinement may require running GitHub/network operations outside a restricted sandbox. The remote is HTTPS. If ordinary Git credential lookup fails, this has worked:

```bash
git -c credential.helper='!gh auth git-credential' push origin main
```

After tests, source commit, and tag, publish a headless-downloadable release asset with a command shaped like:

```bash
gh release create vX.Y.Z releases/Gather-Mind-X.Y.Z.apk --title "Gather Mind X.Y.Z" --notes-file /tmp/gather-mind-release-notes.md
```

Then verify the release and asset digest with `gh release view`. Because the repository is private, direct APK links require signing into GitHub as an authorized user.

Do not push, tag, publish, email, or upload a build unless the user's request includes that external action. Building and verifying locally does not itself authorize distribution.
