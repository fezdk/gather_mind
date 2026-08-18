# Android release runbook — Gather Mind 0.5.1

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

Test the signed app on at least one supported Android phone. Cover empty first run, notification denial and approval, the five-second test, create/edit/delete for every item type, reminder delivery while the app is closed, restart persistence, daily rollover, move-to-tomorrow confirmation, and **Delete all local data**.

## Build and distribute

Create an installable APK for a small beta group:

```bash
npm run build:preview:android
```

Create the production Android App Bundle (`.aab`):

```bash
npm run build:production:android
```

The production profile auto-increments the remote Android version code while the user-visible version remains `0.5.1`. Upload the first AAB manually to Play Console so Google Play App Signing and the application record are established. Later internal-track drafts can be submitted with:

```bash
npm run submit:android
```

Promote from internal testing only after the console declarations, privacy/support URLs, screenshots, content rating, exact-alarm review, and health-app declaration are complete.

## iOS preparation

The future iOS bundle identifier is also `dk.fez.gathermind`, tablet support is disabled for now, and the configuration declares that the app does not use non-exempt encryption. No iOS build or App Store submission is part of 0.5.1.
