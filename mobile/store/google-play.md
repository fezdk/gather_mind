# Google Play listing and declarations — Gather Mind 0.5.2

## Product identity

- App name: Gather Mind
- Package name: `dk.fez.gathermind`
- Category: Productivity
- Release target: phones; Android first
- Short description: Catch thoughts, plan appointments, and manage today gently.

## Full description draft

Gather Mind is a calm place to catch a thought before it disappears, see related ideas together, and prepare for any kind of appointment.

Build a gentle daily list, check off completed goals without hiding them, and move one-off items to tomorrow with a deliberate confirmation. Repeatedly moved items become warmer in colour so they are easier to notice without using streaks, shame, or alarming badges. Daily essentials stay on today's list and cannot be deferred.

Add appointments, choose local reminders, and keep questions, decisions, documents, errands, things to bring, and follow-ups together in a readable appointment plan.

Gather Mind works offline. There is no account, advertising, analytics, or cloud backend. Your content stays on your phone.

Gather Mind is an organisational aid, not a medical device, diagnosis, treatment, or substitute for professional care.

## Console declarations

- Ads: No.
- App access: No login or restricted area.
- Data safety: No data collected and no data shared. All user content is processed locally on the device, and the Android release does not request Internet access.
- Account deletion: Not applicable because no account can be created. The in-app **Delete all local data** control erases content and reminders.
- Privacy-policy URL: host the project-level `docs/privacy.html` at a stable public HTTPS URL and enter it in Play Console.
- Support URL: host the project-level `docs/support.html` at a stable public HTTPS URL.
- Support email: `https://github.com/fezdk/gather_mind/issues`.
- Exact alarms: appointment reminders use `SCHEDULE_EXACT_ALARM`; document the user-facing reminder function honestly if Play requests a declaration.
- Health apps: review and complete the Health apps declaration honestly. The proposed store category and product function are Productivity/organisation, but the app may be used for medication or health appointments and Google can still consider that context relevant.
- Target audience: choose the tested adult age groups; do not select children unless the product and disclosures are redesigned for them.
- Content rating: complete the IARC questionnaire from actual functionality.

## Required creative assets

- 512 × 512 Play icon (PNG)
- 1024 × 500 feature graphic
- At least two phone screenshots from the signed release build
- App name and descriptions reviewed in every published language
