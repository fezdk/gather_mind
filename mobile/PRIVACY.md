# Gather Mind privacy policy

Effective: 25 August 2026

Applies to: Gather Mind 0.5.0 and later until this policy is updated

Gather Mind is a local-first organisational app maintained by Nezar. It is designed to work without an account or backend.

## Data collection and sharing

Gather Mind does not collect, transmit, sell, or share personal data. It contains no advertising, third-party analytics, tracking SDK, cloud sync, or account system. The Android release does not request Internet access.

Thoughts, tags, goals, appointments, locations, appointment-plan items, and optional mood, sleep-quality, and period start/end entries are stored only in an encrypted database in the app's private storage on the user's device. Health tracking is off by default, and cycle tracking has a separate opt-in inside it. Turning either on does not transmit data or request access to another health service.

Reminder details and an optional generic count of unfinished goals are given to the device operating system solely so it can deliver the notifications the user requests. Health entries are not included in notifications or the Android home-screen widget. The widget uses a bounded summary encrypted separately with Android Keystore; titles remain excluded unless the user explicitly enables them.

## Permissions

- Notification permission is used only to show locally scheduled appointment reminders and the optional quiet daily goal status.
- Exact-alarm access is used on Android only to deliver those chosen local times accurately.
- Biometric authentication is used only on the device when the user enables **Lock Gather Mind**. The app does not receive or store fingerprint or face data.

The rest of the app remains usable if notification permission is denied. Health tracking requires no Android health permission, sensor permission, or Internet permission.

## Retention and deletion

Data remains on the device until the user deletes individual items, clears health history from Health, selects **Settings & privacy → Delete all local data**, clears the app's storage, or uninstalls the app. Turning Health off hides its tab; turning cycle tracking off hides period history and Today cycle estimates. Neither setting deletes encrypted history. The full in-app deletion control also removes the encrypted widget summary, cancels Gather Mind's scheduled reminders, and dismisses its delivered notifications. Android operating-system backup is disabled for the app.

## Children, health, and sensitive content

Gather Mind is a general organisational aid. Its optional cycle estimate is calculated only from manually entered start dates. It does not predict ovulation or fertility and must not be used for contraception or medical decisions. Gather Mind does not diagnose, treat, cure, or prevent any condition and is not a medical device or a substitute for professional care. Users decide what they enter; no entered content is sent to the developer.

## Security

The app's local database is encrypted with SQLCipher using a random 256-bit key held separately in the operating system's secure key store. The optional app lock can require strong device biometrics after leaving the app; it is deliberately separate from the database key. Anyone authorised to unlock the device and app may still see its content, and no local-only design can protect a compromised device.

## Open-source licence

Gather Mind's source code is available under the Apache License 2.0. That software licence does not give the developer, contributors, or recipients any rights to a user's personal content.

## Contact

For non-sensitive privacy or support questions, open an issue in the project's [GitHub issue tracker](https://github.com/fezdk/gather_mind/issues). Do not include thoughts, goals, appointments, database files, device backups, biometric material, or other personal content in a public issue. Suspected vulnerabilities can be [reported privately through GitHub](https://github.com/fezdk/gather_mind/security/advisories/new).

If Gather Mind later adds optional sync, accounts, analytics, or any other data transfer, this policy and the in-app notice must be updated before that feature is released.
