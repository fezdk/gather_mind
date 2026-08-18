# Gather Mind mobile 0.5.1

This is the native Android/iOS version of Gather Mind. It stores its data and schedules appointment reminders entirely on the phone. No runtime backend, account, push token, or internet connection is required.

New installations start empty. The gear button opens reminder settings, the in-app privacy summary and support guidance, and a confirmed full-data deletion control. Full deletion cancels reminders as well as erasing all app content.

The Today screen also includes a daily goal list:

- Swipe right or tap the checkbox to complete a goal. Completed goals remain visible for the day.
- Swipe left or tap the arrow to open a confirmation before moving a one-off goal to tomorrow.
- Repeated deferrals use a yellow-to-rust color ramp and show an explicit `Moved ×` count.
- Daily essentials return each day and cannot be deferred, making them suitable for medication.
- Tap a goal or thought to edit it; removal is available inside its editor.

Each appointment has a general-purpose appointment plan. It can hold questions, decisions, documents, things to bring, errands, and follow-ups—not only medical talking points. Plan items have their own create/edit dialog and a separate completion checkbox.

## Try it on a phone

Use Node.js 24 LTS, then:

```bash
cd mobile
npm install
npm start
```

Install **Expo Go** on the phone, keep the phone and computer on the same network, and scan the QR code printed by Expo.

In Gather Mind:

1. Tap the gear button in the top-right.
2. Tap **Enable reminders** and allow notifications.
3. Tap **Send a test in 5 seconds**.
4. Put the app in the background. The phone should display the test reminder.

Local notifications are supported in Expo Go. A distributable build uses the project-specific Android exact-alarm permission and notification icon configured in `app.json`.

## Reminder behavior

- Creating an appointment requests notification permission and schedules its alarm.
- Editing its time or reminder cancels the old native alarm and schedules a new one.
- Deleting it cancels the alarm.
- Tapping a reminder opens the matching appointment and its appointment plan.
- Startup reconciliation restores a missing future alarm if the operating system removed it.
- Focus, Do Not Disturb, or aggressive battery-saving settings can still suppress or delay alerts.

## Checks

```bash
npm run check
npm test
npx expo export --platform android --output-dir /tmp/gather-expo-export
```

The Expo development server is only used while developing. An installed release build runs without the computer and continues to use on-device storage and notifications.

For a signed Android beta or Google Play build, follow [`RELEASE.md`](RELEASE.md). The publishable policy and support pages are in the project-level [`docs/`](../docs/), and the Play listing/declaration draft is in [`store/google-play.md`](store/google-play.md).
