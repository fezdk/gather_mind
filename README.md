# Gather Mind

Current native release: **0.5.8** · Android application ID: `dk.fez.gathermind`

Gather Mind is a calm, local-first companion for catching thoughts, seeing related ideas, and preparing for appointments. It is designed around the needs described by people dealing with cognitive overload, including AuDHD and menopause-related brain fog, without making medical claims or attempting diagnosis.

The project now has two clients:

- `mobile/` is the MVP phone app. It schedules real Android/iOS local notifications that work when the app is closed.
- The root files are the original installable web prototype and remain useful for rapid browser testing.

## What the first version does

- Captures a thought in one short flow; locally suggested themes and nearby appointment links remain optional.
- Searches thoughts in a dedicated list and offers an optional connection view with explainable local matches.
- Keeps Today focused on capture, goals, and the next appointment while the complete thought archive stays under Thoughts.
- Stores dated appointments, locations, and reminder preferences.
- Keeps a flexible appointment plan for questions, decisions, documents, things to bring, errands, and follow-ups.
- Provides a daily goal list with completion, Undo, calm carry-over labels, optional timed quiet status, one-off and limited recurring deferrals, non-deferrable daily essentials, and daily, weekly, or monthly repetition from a chosen first date.
- Provides create/edit/delete dialogs for goals, thoughts, and appointment-plan items.
- Links free-form thoughts to an appointment so all relevant notes are easy to scan in one place.
- Turns a saved thought into a one-off goal for today without removing the thought, with a link back from the goal.
- Encrypts the native app database locally and offers an optional biometric app lock with an immediate, 1, 5, or 15 minute timeout in Settings.
- Offers light, dark, or device-following appearance without an account or network request.
- Works offline and keeps information on the current device. The original web prototype continues to use browser-local storage.

## Run it

No package install is needed. From this folder:

```bash
npm start
```

Open `http://localhost:4173`. On a phone on the same network, use your computer's local network address in place of `localhost`. Installation is offered by supporting browsers after the app has been served over HTTPS (or from localhost).

Run the logic tests with:

```bash
npm test
```

For the reminder-enabled phone app, see [`mobile/README.md`](mobile/README.md). With Node.js 24 active, it can also be started from the project root with `npm run mobile`.

## Important MVP limits

- Data is local to one browser profile. Clearing site data removes it.
- Browser alarms cannot be guaranteed while the web version is fully closed. Use the native app in `mobile/` for device-scheduled appointment reminders.
- The optional connection view relates thoughts through shared words, themes, and appointment links. It does not perform semantic or diagnostic matching.

## Suggested next product steps

1. Test the capture and appointment-preparation flows with 5–8 target users.
2. Add local encrypted export/import before users trust it with important records.
3. Test notification timing under Android/iOS battery-saving and Focus modes.
4. Only then consider optional sign-in and encrypted sync across devices.

The app intentionally uses neutral, non-judgmental language: items are “open” rather than “overdue,” capture can be messy, and there are no streaks or red badges.

Gather Mind is licensed under the [Apache License 2.0](LICENSE). Android release and Play Console preparation live in [`mobile/RELEASE.md`](mobile/RELEASE.md); the publishable [privacy policy](docs/privacy.html) and [support page](docs/support.html) are ready for static hosting.
