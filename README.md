# Gather Mind

Current Android beta: **0.6.4** · Application ID: `dk.fez.gathermind` · [GitHub release](https://github.com/fezdk/gather_mind/releases/tag/v0.6.4)

Gather Mind is a calm, local-first Android app for anyone who wants a quieter way to catch thoughts, plan appointments, and choose manageable goals when life feels mentally crowded. It supports everyday cognitive overload, changing energy, brain fog, and executive-function challenges without making medical claims or attempting diagnosis.

Everything entered in the native app stays on the phone. There is no account, content backend, advertising, analytics, or cloud sync. Automatic release checks are off by default. A separate, explicitly approved in-app update can contact the manifest service and download signed files from GitHub; browser-only checking remains available without either option.

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
- Open **History** from Today for read-only previous days: a default week strip, optional month calendar, daily completion counts, and saved goal/step states. History starts with this update on days the app is used; missing earlier days are not reconstructed.
- Hold a goal's reorder handle to place routines and other goals in a preferred order; daily, weekly, and monthly goals keep that relative position when they reappear.
- Optionally break a goal into one level of smaller steps, check them directly from Today, and complete the parent automatically with Undo when the last step is checked.
- Preserve step progress while an occurrence is carried over or moved, then reset it for each new daily, weekly, or monthly occurrence.
- See future goals under quieter Tomorrow and **Scheduled ahead** sections until their planned day.
- Optionally show a silent notification-list count of unfinished goals at a configurable time. It is off by default and never includes goal titles.
- Add a responsive Android home-screen widget: compact sizes show today’s completed/total count, while larger sizes add open-goal and next-appointment context. Titles are off by default and require an explicit privacy opt-in.

### Appointments

- Store an appointment's date, time, place or person, and local reminder choice.
- Switch between upcoming and past dated agendas; historical appointments remain available newest-first and can be opened or corrected with their plans and linked thoughts intact.
- Keep questions, decisions, documents, errands, things to bring, and follow-ups in a flexible appointment plan.
- Schedule reminders through the phone's operating system and open the relevant appointment when a reminder is tapped.
- Reconcile missing future reminders locally when the app starts.

### Optional Health

- Enable **Health tracking** explicitly in Settings to add the private Health tab; fresh installations keep it off until chosen.
- Record a simple 1–5 mood and sleep-quality check-in for each day without creating an account or granting a health permission.
- If useful, enable the separate **Cycle tracking** switch inside Health settings. Mood and sleep remain available without it.
- Log a period's first day and optional last day, review start/end history and recorded duration, or remove entries individually.
- After two useful period starts, calculate a deliberately simple local estimate and recent timing variation from start-to-start intervals rather than assuming a fixed 28-day cycle. Completed start/end entries also show typical recorded period length.
- Optionally show a Today note during the five days before that estimate. The estimate is informational only and must not be used for contraception, diagnosis, treatment, or medical decisions.
- Keep all health entries inside the same SQLCipher-encrypted on-device database; they are excluded from widgets and notifications.

### Privacy, security, and comfort

- Store content in a SQLCipher-encrypted SQLite database with a random 256-bit key held separately in Expo SecureStore.
- Migrate older beta data copy-first and verify the encrypted copy before removing the legacy plaintext value.
- Optionally lock the app with strong device biometrics after an immediate, 1, 5, or 15 minute timeout. Unlock starts automatically when the locked app becomes active, with a manual retry after cancellation. The lock remains separate from the database key so biometric enrollment changes do not destroy the only key copy.
- Preserve unfinished editor drafts across a short app switch or an app-lock timeout.
- Follow the phone's appearance or use a fixed Light or Dark mode.
- Support TalkBack with named controls, form labels, selection and checkbox states, modal focus, live Undo/result announcements, and non-gesture actions for moving goals to tomorrow or earlier/later in the list.
- Keep interactive targets at least 48 dp, preserve 4.5:1 normal-text contrast on shared surfaces and move colours, follow reduced-motion settings, and replace the geometric thought map at large font sizes.
- Disable Android cloud backup and provide an in-app control that deletes all local content and cancels scheduled notifications.
- Keep the widget’s bounded local summary encrypted separately with Android Keystore and remove it with **Delete all local data**; the widget itself makes no network request.
- Offer a clearly explained, default-off automatic release check against GitHub at most once daily when the app is active. The manual option opens the public releases page in the browser while all user content remains local.

## Install the Android beta

Download `Gather-Mind-0.6.4.apk` from the [v0.6.4 GitHub release](https://github.com/fezdk/gather_mind/releases/tag/v0.6.4). The current sideload beta uses the same beta signing certificate as earlier 0.5.x APKs, so it can update those installations without clearing local app data. Version 0.6.3 can also install this compatible update from **Settings → App updates → Find updates**.

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

Use Node 24, JDK 17, and Android SDK/build tools 36. Keep `JAVA_HOME` and `ANDROID_HOME` pointed at those installations. Follow this sequence for every local APK so the generated native project, artifact naming, and verification are consistent:

1. Confirm the intended version is synchronized across both `package.json` files, `mobile/app.json`, the visible Settings version, and the release documentation. Android `versionCode` and iOS `buildNumber` must increase for a new release.
2. From `mobile/`, run the checks and export:

```bash
npm run check
npm test
npx expo export --platform android --output-dir /tmp/gather-mind-release-check
```

3. Run `git diff --check` from the repository root. Then confirm the ignored `mobile/android/` tree contains no user-authored work before replacing it with a clean Expo prebuild:

```bash
cd mobile
npx expo prebuild --platform android --no-install --clean
npm pkg set "scripts.android=expo start --android" "scripts.ios=expo start --ios"
cd ..
git diff -- mobile/package.json mobile/package-lock.json
```

The package diff must contain only the already-intended source changes; Expo must not leave `expo run:*` script changes behind.

4. Build the native release from `mobile/android/`:

```bash
cd mobile/android
./gradlew :app:assembleRelease
cd ../..
cp mobile/android/app/build/outputs/apk/release/app-release.apk releases/Gather-Mind-X.Y.Z.apk
```

Replace `X.Y.Z` with the verified version. The generated native directory and APK are ignored build products and must not be committed.

5. Inspect the copied artifact with the installed Android SDK tools:

```bash
"$ANDROID_HOME/build-tools/36.0.0/aapt" dump badging releases/Gather-Mind-X.Y.Z.apk
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose --print-certs releases/Gather-Mind-X.Y.Z.apk
"$ANDROID_HOME/build-tools/36.0.0/zipalign" -c -v 4 releases/Gather-Mind-X.Y.Z.apk
sha256sum releases/Gather-Mind-X.Y.Z.apk
```

Verify package `dk.fez.gathermind`, the intended version name/code, min SDK 24, target SDK 36, APK Signature Scheme v2, and successful alignment. The APK published by this project uses beta certificate SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`; a clone built with another local signing key will correctly have a different signer. Report the APK checksum with the handoff. Distribution is deliberately not prescribed here; APK upload configuration belongs in each developer's private local tooling.

The authoritative agent workflow and complete physical-device QA list are in [`AGENTS.md`](AGENTS.md). More mobile behavior and reminder-testing guidance live in [`mobile/README.md`](mobile/README.md).

## Signed OTA updates and release rollout

**Status:** 0.6.4 is the first signed OTA test release for the 0.6.3 baseline APK. It simplifies the update settings without changing native dependencies, the trust certificate or storage schema. Use **Find updates → Install version 0.6.4** to test the full flow. Existing 0.6.2 APKs need a new APK first because they cannot bootstrap the update engine or pinned certificate through JavaScript. Physical-device update/recovery QA is still required before production OTA rollout.

Automatic checks still only query GitHub for a release version; they never download code. An explicit in-app check asks permission to contact the manifest host (behind Cloudflare). Installation fetches GitHub release assets, verifies the pinned RSA signature and SHA-256 hashes, saves local state/drafts, and restarts when the app is unlocked, foregrounded, and still in update settings. If you leave, a verified download applies on the next app start. Browser fallback remains available offline/after failure/without opting in; native changes still require an APK.

### Repeatable release procedure

For the normal APK/GitHub rollout, use the small deployment wrapper after the
verified build above. It requires Node, Git, authenticated `gh`, Android build
tools 36.0.0 via `ANDROID_HOME`, and Java for `apksigner`. First run it without
`--publish`; this inspects the APK but makes no external changes:

```bash
node scripts/deploy-release.mjs \
  --apk releases/Gather-Mind-0.6.3.apk --notes docs/releases/v0.6.3.md
```

Commit the tested source, tag that commit `v0.6.3`, and push both the source and
tag. Repeat the command with `--publish`. Substitute the new version and notes
file for subsequent releases. Publication requires a clean worktree and a local
and remote release tag matching HEAD. The script checks package/version/SDK,
beta signer, alignment and GitHub asset SHA-256, uploads to a draft release,
then publishes it. A retry accepts identical uploaded files, but never overwrites
a different file. It does not build, commit, tag, push or upload private keys.
Forks must adapt its repository and APK signer checks to their own identities.

With only `--apk` and `--notes`, the manifest service is deliberately unchanged:
this is the baseline release path. For a subsequent signed OTA, prepare the
package and server as described below, then add these three arguments to the
same deployment command (plus `--publish` when ready):

```bash
--ota-dir "$OTA_OUT" --ssh-host "$OTA_SSH_HOST" --site-root "$OTA_SITE_ROOT"
```

This uploads only assets named in the verified signed envelope, verifies their
public downloads, then stages and activates the envelope over SSH. It automates
steps 4 and 6 below. Server activation failure leaves the published APK available
and the preceding manifest intact; fix the cause and rerun with the same files.
An already activated version is intentionally rejected by the server. Finish
with the endpoint/device checks in step 7. Private distribution tooling belongs
in each maintainer's local runbook, not this repository.

Use the supported Node version. The initial APK embeds runtime
`gathermind-android-1-data-8` and `mobile/certs/ota/certificate.pem`. Keep the runtime
only for native- and data-compatible JS/asset changes. Any native dependency,
permission, trust-key change, or incompatible schema change needs a **new runtime
and APK**. Expo recovery cannot undo database migrations; the embedded bundle must
still read data written by every OTA in its runtime.

1. Synchronize source versions and release documentation as described above. Run
   `npm --prefix mobile run check`, `npm --prefix mobile test`, root `npm test`,
   and `git diff --check`. Review changes before signing. Commit/tag/publish only
   when authorized. Do not silently replace published OTA assets or reuse a tag.
2. Set these operator-local variables. The private key is **outside the checkout**;
   the public certificate is the reviewed certificate already embedded in the APK.

```bash
export OTA_KEY="/absolute/private/location/private-key.pem"
export OTA_OUT="/absolute/new/output-directory"
export OTA_SSH_HOST="your-ssh-host"
export OTA_SITE_ROOT="/web/gathermind.control.dk"
export OTA_VERSION="X.Y.Z"
export OTA_RUNTIME="gathermind-android-1-data-8"
```

3. Prepare once. This command freshly exports Android, hashes assets, builds the
   final Expo manifest, signs its exact bytes, verifies the signature against the
   pinned certificate, and refuses to overwrite an output directory. It does not
   upload anything. Version/runtime come from `mobile/app.json`; confirm they
   match the variables above. Keep the output and its sibling `-export` directory
   outside the checkout (or in ignored build storage).

```bash
node scripts/ota-pack.mjs "$OTA_KEY" "$OTA_OUT"
```

4. Create the GitHub release using the normal APK/release workflow, then upload
   its OTA files. Upload **only** the named package outputs, never a key directory.
   Do not use `--clobber`. The envelope contains a public signature, not a secret.

```bash
gh release upload "v$OTA_VERSION" "$OTA_OUT"/assets/* \
  "$OTA_OUT/$OTA_RUNTIME.json" "$OTA_OUT/manifest.json"
node scripts/ota-verify-release.mjs "$OTA_OUT" "$OTA_RUNTIME" mobile/certs/ota/certificate.pem
```

The verifier downloads every asset anonymously, restricts redirects to GitHub's
release CDN, and compares its hash with the signed manifest. **Stop on any failure**;
do not activate a manifest pointing at draft/private/missing/changed files.

5. One-time server prerequisite: install the reviewed public certificate at
   `$OTA_SITE_ROOT/trust/certificate.pem`, and the current PHP sources/CLI helper
   from `deploy/updates/`. The public cert must match the APK; never replace it
   with a certificate supplied by a downloaded update. Never upload the private
   key. See [server layout and activation](deploy/updates/README.md). PHP 7.4 on
   the current host remains a production blocker until upgraded to supported PHP.
6. Stage the envelope outside `html`, then activate through the CLI helper. Use
   simple operator-controlled host/path/version values in these SSH commands.

```bash
scp "$OTA_OUT/$OTA_RUNTIME.json" "$OTA_SSH_HOST:$OTA_SITE_ROOT/ops/candidate-$OTA_VERSION.json"
ssh "$OTA_SSH_HOST" "php '$OTA_SITE_ROOT/ops/install.php' '$OTA_SITE_ROOT/ops/candidate-$OTA_VERSION.json'"
```

The helper verifies the pinned signature, runtime, asset URLs and version; rejects
non-increasing versions/timestamps; archives the preceding envelope; then atomically
renames the new envelope on the same filesystem. The endpoint cannot see half a
manifest/signature pair. No Apache reload/root access is needed for normal OTA releases.

7. Check public HTTPS without `-k`, then install on a disposable test phone before
   announcing the release. An active envelope returns **200**, the exact manifest,
   and `expo-signature`; an unknown runtime returns **204**. Both must be `no-store`.

```bash
curl --fail -i https://gathermind.control.dk/manifest \
  -H 'expo-protocol-version: 1' -H 'expo-platform: android' \
  -H "expo-runtime-version: $OTA_RUNTIME" \
  -H 'Accept: multipart/mixed,application/expo+json,application/json'
```

Test wrong signatures, tampered assets, incompatible runtimes, loss of network,
restart persistence, app-lock/background transitions and preservation of drafts.
Pause delivery by moving the active `updates/RUNTIME.json` out of `updates/`;
that does **not** uninstall copies already downloaded. Recover via a tested,
newer signed update or APK, never by bypassing signature checks or blindly
restoring an older database-incompatible bundle.

### Security and maintenance

Only `html/index.php` belongs in the document root. Trust certificates, envelopes,
logs, CLI tools and Apache configuration remain outside it. No server file should
ever contain the private OTA key. Both CDN-facing and origin access controls must
be checked after configuration changes; see the [audit record](docs/update-security-audit.md).

`expo-updates` is pinned to **29.0.20**. `mobile/scripts/patch-updates.cjs` is run
by `npm ci`/`npm install` and fails on another version. It limits Android update
hosts to the manifest host, GitHub and `release-assets.githubusercontent.com`,
requires HTTPS, strips installation IDs, error text, cookies and other unnecessary
headers (also on redirects). Do not build with `--ignore-scripts`; rerun the patch
and its tests after changing dependencies. `checkAutomatically: NEVER` disables
both launch and error-recovery network checks. iOS OTA delivery is not shipped.

### Signing recipe for forks

OTA signing is separate from Android APK/AAB signing and from the on-device database key. A fork must own its OTA private key, Android signing identity, update endpoint, and release repository. Choose a distinct application identifier for a separately distributed fork; do not change this project's `dk.fez.gathermind` identity or reuse its beta signer as a production credential.

### 1. Generate your own OTA key pair and certificate

In **your fork**, use the supported Node version and install the SDK-compatible update library. Set `OTA_KEY_DIR` to a new, durable directory **outside the entire checkout**, not `mobile/../keys`. Run these commands in the same Bash session, and stop if any command fails:

```bash
set -euo pipefail
cd mobile
npx expo install expo-updates

export OTA_KEY_DIR="/absolute/path/outside-your-checkout/my-fork-ota-keys"
umask 077
mkdir -p "$OTA_KEY_DIR"
test ! -e "$OTA_KEY_DIR/private-key.pem"
test ! -e "$OTA_KEY_DIR/public-key.pem"
test ! -e certs/fork-ota/certificate.pem

npx expo-updates codesigning:generate \
  --key-output-directory "$OTA_KEY_DIR" \
  --certificate-output-directory certs/fork-ota \
  --certificate-validity-duration-years 10 \
  --certificate-common-name "My Fork OTA"

chmod 600 "$OTA_KEY_DIR/private-key.pem"
npx expo-updates codesigning:configure \
  --certificate-input-directory certs/fork-ota \
  --key-input-directory "$OTA_KEY_DIR"
```

This produces `private-key.pem`, `public-key.pem`, and `certs/fork-ota/certificate.pem`. Keep the private key in a secret manager with a protected backup. Git ignores private-key filenames (including backups), local key directories, and PEM files. Only the explicitly named public certificates in `mobile/certs/ota/` and `mobile/certs/fork-ota/` are exceptions. Inspect it and add **only that exact public certificate**:

```bash
openssl x509 -in certs/fork-ota/certificate.pem -noout -subject -dates -fingerprint -sha256
git add -- certs/fork-ota/certificate.pem
git diff --cached -- certs/fork-ota/certificate.pem
```

Never force-add a private key or keys directory. Ignore rules do not protect files already tracked by Git or prevent `git add -f`; review staged contents before committing. The ten-year lifetime is an example: record the expiry and plan rotation before it. See [Expo's signing and rotation guide](https://docs.expo.dev/eas-update/code-signing/).

### 2. Pin trust in a new native build

Merge this configuration into the fork's `mobile/app.json` without removing existing plugins/settings. Replace the example URL with your own compatible HTTPS service. The certificate contains the public key; no private-key path belongs in the app configuration.

```json
{
  "expo": {
    "runtimeVersion": "my-fork-native-1-data-8",
    "updates": {
      "url": "https://updates.example.org/manifest",
      "checkAutomatically": "NEVER",
      "useEmbeddedUpdate": true,
      "codeSigningCertificate": "./certs/fork-ota/certificate.pem",
      "codeSigningMetadata": {
        "keyid": "main",
        "alg": "rsa-v1_5-sha256"
      }
    }
  }
}
```

The runtime string is an explicit compatibility boundary, not the visible app version. Change it when native dependencies, trust certificates, or incompatible database assumptions change. A matching string alone does not prove database compatibility.

Build and install a new APK using the verified build procedure above and your fork's Android signer. Existing APKs cannot acquire the initial OTA engine or a new trust certificate merely by downloading JavaScript. Keep `NEVER` and the embedded bundle for offline startup. Forks must also change the explicit host/repository allowlists in the native privacy patch, publisher, release verifier, server handler, and UI/privacy copy to their own services. See the [SDK 54 update configuration](https://docs.expo.dev/versions/v54.0.0/config/app/#updates).

### 3. Sign the exact manifest bytes and verify them locally

Prerequisites: OpenSSL and a finished Expo-protocol `manifest.json` from the publisher above. **Expo export's `metadata.json` is not that manifest**. The following shows the cryptographic operation used by the publisher; it is not a replacement for creating a valid manifest. Do not sign an arbitrary ZIP and expect `expo-updates` to load it.

The manifest identifies the update/runtime and binds every downloaded asset, including the launch bundle, to its Base64URL-encoded SHA-256 hash. The pinned certificate authenticates the manifest; the hashes authenticate its referenced bytes. A checksum downloaded alongside an unsigned package is not an independent trust anchor. Your server must deliver the exact signed bytes and the protocol's signature headers; an ordinary GitHub release page is not itself an OTA endpoint. Follow the [Expo Updates protocol](https://docs.expo.dev/technical-specs/expo-updates-1/).

With `OTA_KEY_DIR` still set, run from the directory containing the final manifest:

```bash
openssl dgst -sha256 \
  -sign "$OTA_KEY_DIR/private-key.pem" \
  -sigopt rsa_padding_mode:pkcs1 \
  -out manifest.sig manifest.json

openssl x509 \
  -in /absolute/path/to/your-fork/mobile/certs/fork-ota/certificate.pem \
  -pubkey -noout -out trusted-public-key.pem

openssl dgst -sha256 \
  -verify trusted-public-key.pem \
  -sigopt rsa_padding_mode:pkcs1 \
  -signature manifest.sig manifest.json

openssl base64 -A -in manifest.sig -out manifest.sig.base64
```

Verification must report `Verified OK`. The binary signature is converted to Base64 for the publisher's `expo-signature` field. Do not reformat the JSON after signing. Verification must use the certificate destined for the APK, never a replacement key supplied by the download server. Command reference: [OpenSSL digest signing and verification](https://docs.openssl.org/3.0/man1/openssl-dgst/).

For an **EAS-hosted fork instead**, first [configure your own EAS project, channel, and environment](https://docs.expo.dev/eas-update/getting-started/). Then, from `mobile/`, EAS CLI can prepare and sign the manifest during publication:

```bash
eas update --platform android --channel production --environment production \
  --message "Describe the tested update" \
  --private-key-path "$OTA_KEY_DIR/private-key.pem"
```

This command publishes externally; it is not a local verification command. EAS-hosted code signing currently requires a Production or Enterprise plan; consult [Expo's current requirements](https://docs.expo.dev/eas-update/code-signing/) before choosing it. Self-hosting requires a conforming publisher/service; the signing commands above do not provide one. Use a tested, pinned EAS CLI version in a repeatable release pipeline. See the [EAS CLI reference](https://docs.expo.dev/eas/cli/).

### Release and key-handling checklist

- Review the exact code/artifacts before signing. Never give private keys to pull-request jobs, untrusted fork code, build artifacts, APK assets, or logs. Signing is permission to execute code on users' phones.
- On a disposable test installation, verify valid signatures, wrong-key rejection, altered-manifest rejection, altered-asset rejection, and incompatible-runtime rejection. A local OpenSSL check alone is not end-to-end client verification.
- Test disabled network use, offline startup, interrupted download, draft preservation, and the browser fallback. Keep every update/asset host and metadata recipient synchronized with the privacy policy, native allowlist and consent copy.
- Keep old published assets immutable. Test storage migration and recovery against real saved data before rollout; do not revert to a bundle that cannot read the migrated schema. Do not promise automatic rollback can undo database changes.
- Rotation or a lost/compromised signing key requires a newly distributed native build with a new certificate/runtime. Stop signing with a compromised key; never bypass signature verification to recover. Keep the Android signing key separate so a replacement APK remains possible.

## Run the original web prototype

The root command serves only the static prototype on port 4173:

```bash
npm start
```

Open `http://localhost:4173`. Its data uses browser-local storage, and browser alarms are not dependable while it is closed. The repository-root `npm test` runs both prototype and mobile tests; use `npm --prefix mobile test` for the native-only suite.

## Current limitations and direction

- There is no backup, export/import, recovery password, account, or sync. Clearing app storage or uninstalling removes the only copy.
- Real notification delivery, biometric behavior, encrypted migration, keyboard avoidance, launcher-widget sizing/deep links, and update-in-place behavior still require physical Android QA for each release.
- Thought-to-appointment-plan conversion, handled/archive state, thread-like grouping, and encrypted export/import remain planned rather than shipped.
- Cycle timing is a simple estimate from manually entered starts, not a fertility prediction or medical assessment; irregular or missing entries can make it inaccurate.
- Cloud AI, automatic appointment assignment, recursive thought hierarchies, gamification, analytics, and server backup are deliberately not current scope.

The working product rationale and queued ideas are documented in [`docs/product-direction.md`](docs/product-direction.md). Gather Mind intentionally uses neutral language: items stay open rather than becoming overdue, capture can be messy, and there are no streaks or red failure badges.

## Licence, privacy, and support

Gather Mind is licensed under the [Apache License 2.0](LICENSE). The publishable [privacy policy](docs/privacy.html), [support page](docs/support.html), [security reporting policy](SECURITY.md), and [Google Play disclosure draft](mobile/store/google-play.md) describe the current local-first behavior and the optional GitHub release check.
