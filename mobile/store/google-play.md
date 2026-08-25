# Google Play listing and declarations — Gather Mind 0.6.1

## Product identity

- App name: Gather Mind
- Package name: `dk.fez.gathermind`
- Category: Productivity
- Release target: phones; Android first
- Short description: Catch thoughts, plan appointments, and manage today gently.

## Full description draft

Gather Mind is a calm place to catch a thought before it disappears, see related ideas together, and prepare for any kind of appointment.

Build a gentle daily list, optionally break larger goals into smaller checkable steps, plan a one-off goal for another day, and move already-due goals to tomorrow with a deliberate confirmation. Calm labels show when unfinished goals were originally planned without treating advance planning or carry-over as a deliberate move. Repeatedly moved items become warmer in colour so they are easier to notice without using streaks, shame, or alarming badges. Daily, weekly, and monthly goals can begin on a chosen date; daily essentials cannot be deferred, while weekly and monthly goals have a limited move allowance for each occurrence. An optional quiet status can show only the unfinished count after a chosen time, without sound or goal titles.

Add appointments, choose local reminders, and keep questions, decisions, documents, errands, things to bring, and follow-ups together in a readable appointment plan.

Gather Mind works offline. There is no account, advertising, analytics, or cloud backend. Your content stays encrypted on your phone, and you can optionally lock the app with your phone's biometrics. A resizable Android home-screen widget can show today’s count and, only after an explicit privacy choice, goal and appointment context.

Choose a light or dark appearance, or let Gather Mind follow your phone automatically.

If useful to you, enable a private Health tab for simple daily mood and sleep-quality check-ins. Period history and local cycle estimates have a separate opt-in: record start and optional end dates, review recent timing and duration, and receive an optional Today note near an estimated next start. Both choices are off by default, health entries stay encrypted on the phone, and they never appear in widgets or notifications.

Gather Mind is an organisational aid, not a medical device. It does not diagnose, treat, cure, or prevent any medical condition. Cycle estimates do not predict fertility or ovulation and must not be used for contraception or medical decisions.

## Console declarations

- Ads: No.
- App access: No account or default restricted area. The optional biometric app lock is off on a fresh installation and has no developer-issued credential.
- Data safety: No data collected and no data shared. All user content, including optional mood, sleep-quality, and period start/end entries, is processed locally on the device, and the Android release does not request Internet access.
- Account deletion: Not applicable because no account can be created. Health history can be cleared separately; the in-app **Delete all local data** control erases all content, the encrypted widget summary, and reminders.
- Privacy-policy URL: host the project-level `docs/privacy.html` at a stable public HTTPS URL and enter it in Play Console.
- Support URL: host the project-level `docs/support.html` at a stable public HTTPS URL.
- Public project support: `https://github.com/fezdk/gather_mind/issues`.
- Support email: configure a monitored address privately in Play Console; do not store it in this repository.
- Exact alarms: locally chosen appointment-reminder and quiet-status times use Expo's Android alarm scheduler, which calls exact alarms when access is available and otherwise falls back to inexact delivery. Document the user-facing appointment-reminder function and optional quiet status honestly if Play requests a declaration.
- Health apps: declare **Period Tracking** and **Sleep Management**. The mood check-in is a lightweight record rather than counselling or medical guidance; review the current form wording to determine whether Google also expects **Stress Management, Relaxation, Mental Acuity**. Do not select fertility awareness, ovulation prediction, medical-device, diagnosis, or treatment claims. Keep the public privacy-policy URL and the clear non-medical disclaimer above in the listing.
- Target audience: choose the tested adult age groups; do not select children unless the product and disclosures are redesigned for them.
- Content rating: complete the IARC questionnaire from actual functionality.

## Required creative assets

- 512 × 512 Play icon (PNG)
- 1024 × 500 feature graphic
- At least two phone screenshots from the signed release build
- App name and descriptions reviewed in every published language
