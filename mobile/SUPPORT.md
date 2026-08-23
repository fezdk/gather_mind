# Gather Mind support

Gather Mind 0.6.0 is an Android-first beta. It works offline and does not require an account or backend.

The app follows the phone's light or dark appearance by default. Choose a fixed mode under **Settings & privacy → Appearance** if preferred; the choice is stored locally on the phone.

## Home-screen widget

Long-press an empty area of the Android home screen and choose **Widgets → Gather Mind**. Resize the widget to switch between the compact completed/total count and the larger contextual layout. If it has not refreshed yet, open Gather Mind once. Goal and appointment titles are hidden by default; enable them under **Settings & privacy → Home screen** only when they may safely be visible without unlocking the app.

## Reminder troubleshooting

1. Confirm that Android notifications are enabled for Gather Mind.
2. On Android 14 and later, check **Settings → Apps → Special app access → Alarms & reminders**. Without that access, Android may deliver a reminder a little later than requested.
3. Check Focus, Do Not Disturb, and battery-saving settings.
4. Some Android manufacturers require an app to be excluded from aggressive battery optimisation before time-sensitive alarms are dependable.
5. Open the appointment and save it again after changing notification permissions.

**Quiet daily status** is optional and off by default. Enable it and choose its time under **Settings & privacy → Daily goals**. It uses a separate silent channel, appears only when goals remain unfinished, and never includes their titles. Android can still hide a low-priority notification if that channel is disabled in system settings.

## Data and deletion

All content is held in an encrypted database local to the phone. The widget’s bounded summary is encrypted separately with Android Keystore. There is no server copy or recovery password. **Delete all local data** permanently removes all content, the widget summary, and scheduled Gather Mind reminders.

## App lock troubleshooting

- **Lock Gather Mind** is optional and is enabled in **Settings & privacy** after a successful strong fingerprint or secure face check.
- When a locked app opens or returns after its timeout, the biometric prompt starts automatically. Cancelling it leaves the app locked; use **Unlock Gather Mind** when you are ready to try again.
- If the biometric prompt is temporarily locked, unlock the phone normally and try again.
- If every enrolled fingerprint or face was removed, add one again in the phone's settings before opening Gather Mind. The database key is kept separately, so changing biometric enrollment does not delete the data.
- Clearing app storage or uninstalling removes the only local copy. Android cloud backup is disabled.

For support, open an issue in the project's [GitHub issue tracker](https://github.com/fezdk/gather_mind/issues). Do not include private app content or device backups in a public issue.
