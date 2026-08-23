# Gather Mind product direction

Working product notes, not a committed release scope. Last updated 2026-08-23.

## Product promise

Gather Mind should help a person move from a fleeting, possibly messy thought to the right next context without requiring them to organize everything up front:

```text
Capture safely -> find again -> connect deliberately -> act today or bring it to an appointment
```

The app should remain calm, local-first, understandable without setup, and useful without an account or network connection. Suggestions may reduce cognitive work, but the user remains in control.

## Agreed direction

- Reframe the Cloud tab as a searchable **Thoughts** or **Threads** home. The visual cloud becomes an optional way to explore a selected thought, not the main destination.
- Make every inferred relationship explainable. Prefer explicit user-confirmed links for relationships that matter.
- Let a thought become an action: a goal for today, an appointment-plan item, or a handled/archived thought.
- Offer optional task breakdown on today's goals for tasks that feel too large to start.
- Add Undo after swipe actions and other fast state changes.
- Preserve the local-only privacy model. No suggestion feature should require sending text away from the device.

## Implementation status

Included through the 0.6.0 source build:

- Default SQLCipher database encryption with a random 256-bit key in the operating system's secure key store.
- Copy-first migration from the previous plaintext key-value store, with encrypted read-back verification before the old value is scrubbed.
- Optional strong-biometric app lock in Settings, separate from the encryption key, with sensitive UI state cleared and the database closed on backgrounding.
- Undo after completing, reopening, postponing, or restoring a goal.
- A searchable Thoughts screen with the visual connection map behind **Explore connections**.
- Up to three local, optional appointment suggestions from the previous 7 days or next 30 days, with matching words taking priority.
- Contextual theme suggestions that prioritize themes already used with the selected or suggested appointments.
- Thought-to-goal conversion that keeps the original thought and links the new one-off goal back to it.
- One-off, daily, weekly, and monthly goals with selectable planned/first dates and visible future occurrences; advance planning stays distinct from deferral history.
- A locally persisted light/dark/device-following appearance setting.
- A quieter Today screen without a duplicate partial thought list; Thoughts remains the single searchable archive.
- Calm planned-date labels for non-daily goals carried into Today, plus an optional locally scheduled quiet status at a user-chosen time with only the unfinished count.
- Optional one-level goal steps through **Make this smaller**, with compact progress on Today and direct step check-off.
- Automatic parent completion when the last step is checked, protected by Undo.
- Per-occurrence step progress that survives carry-over and deliberate deferral, resets for each new recurring occurrence, and is restored when a completed weekly or monthly goal is reopened.
- A responsive Android home-screen widget with completed/total progress at compact sizes, optional goal and appointment context at larger sizes, explicit title privacy, encrypted local summary storage, and app-lock-preserving deep links.

Still queued:

- thought-to-appointment-plan conversion;
- handled/archive state and thread-like grouping;
- encrypted export/import and recovery testing.

## Thought capture: suggestions without classification pressure

The thought text field and **Keep this thought** action must remain primary. Context suggestions should never block saving, steal keyboard focus, or make an unclassified thought feel incomplete.

Suggested flow:

1. Let the user type and save immediately.
2. Below the text, show a quiet, optional **Add context** area.
3. Suggest at most two or three nearby appointments and a few existing themes.
4. Apply nothing until the user taps a suggestion.
5. Explain why an appointment is shown, for example `Tomorrow`, `3 days ago`, or `Theme used with this appointment`.

Appointment suggestions can be ranked locally from:

- the appointment from which capture was opened;
- recently completed appointments, initially within the last 7 days;
- upcoming appointments, initially within the next 30 days;
- words in the thought that match an appointment title, location, plan item, or already linked thought;
- themes frequently used with that appointment.

The time windows are starting hypotheses for user testing, not fixed product rules. A plain **Not linked** state must remain the default unless capture was explicitly started inside an appointment.

Theme suggestions can reuse saved tags and local keyword matching. Show contextual suggestions when they are supported by a nearby appointment or enough typed text to make them credible. A collapsed list of possibly related thoughts may be useful after saving, but should not turn quick capture into a filing workflow.

## Thoughts, threads, and explicit connections

The current `Thought` model is deliberately flat: text, tags, one optional appointment, and a creation date. Making a thought recursively contain other thoughts is technically possible, but unrestricted nesting introduces unclear deletion, re-parenting, search, cycle, and mobile-navigation behavior.

A separate one-level **Thread** or **Collection** is safer than treating every thought as both content and folder. Example:

```text
Thread: Symptoms I notice
  - Headache after lunch
  - Forgot a familiar word during the meeting
  - Slept badly and could not focus
```

Recommended model direction:

- A thread has a title, creation date, and optional archived date.
- Thoughts remain independently searchable and retain their own dates, tags, and appointment links.
- A thread groups thoughts without owning or deleting them.
- Removing a thread keeps its thoughts.
- Start with one visible level; do not add recursive subthreads.
- Explicit thought-to-thought links can be added later if user testing shows that grouping is insufficient.

This supports symptom observations without turning Gather Mind into a full symptom tracker. `Symptoms I notice` is a user-created context, not a diagnosis or a hard-coded medical schema. The same mechanism works for `House move`, `Things to discuss at work`, or `Ideas for the garden`.

The existing theme system may provide a lightweight first prototype: present a saved theme as a thread-like page before adding a new persisted entity. This can test the interaction before committing to an `AppState` migration.

## Reframed Thoughts screen

The default screen should prioritize retrieval and outcomes:

- search and saved-theme filters;
- Loose thoughts;
- Linked to appointments;
- Threads or collections;
- Handled/archived thoughts;
- a selected thought's related items, with a visible reason for every inferred link.

An optional **Explore connections** view can show the current focus-and-relations visualization. If target users do not choose it without prompting, keep the related list and remove or further demote the graph.

Useful actions on a thought:

- **Add to appointment**
- **Add to appointment plan**
- **Turn into today's goal**
- **Add to thread**
- **Mark handled** / archive

Conversion should retain a reference to the source thought so the user can return to the original context. Avoid silently deleting or hiding the original.

## Breaking a large task into steps

The optional **Make this smaller** action on a goal is manual and guided rather than cloud-AI powered.

Implemented interaction:

- Open it from the task editor or a small secondary action on the task.
- Ask `What is the smallest first step?` before showing an empty multi-field form.
- Allow one level of checklist steps under the parent task.
- Keep the parent in its current position while steps are expanded or completed.
- Show quiet progress such as `2 of 4 steps`.
- Checking the final step completes the parent in place and offers Undo for the combined action.
- A step can be unchecked directly; fast parent completion and deferral actions retain their existing Undo.

Implemented model:

```ts
type TaskStep = {
  id: string;
  text: string;
};

type TaskStepProgress = {
  occurrence: string;
  completedStepIds: string[];
};

type DailyTask = {
  // existing fields
  steps: TaskStep[];
  stepProgress?: TaskStepProgress;
};
```

Steps are not independent daily goals. Keeping definitions under their parent and completion state on the current occurrence avoids list reordering and extra scheduling decisions. Explicitly moving an occurrence preserves its progress; completing it prepares a blank set of checks for the next recurrence.

Later research can compare manual guidance with private on-device assistance. Remote AI should not be introduced implicitly because it would change the privacy promise.

## Undo and stable interactions

Fast gestures should be recoverable. After completion, move-to-tomorrow, archive, or conversion, show a brief snackbar with **Undo**. Delay irreversible persistence only if that remains safe across app backgrounding; otherwise persist immediately and store enough local information to reverse the action.

The affected row should remain visually stable during the undo window when practical. Completion may change styling without immediately re-sorting the list. A confirmed move to tomorrow may leave a temporary placeholder until the snackbar expires.

Delete can continue to use an explicit confirmation dialog. Undo is most valuable for actions designed to be fast.

## Local security, biometrics, and encryption

### Current state

App content is stored in a SQLCipher-encrypted SQLite database. A random 256-bit database key is generated on the device and stored in the operating system's secure key store without biometric binding. Android cloud backup remains disabled and Android Internet permission remains blocked.

Existing beta data is migrated copy-first: Gather Mind reads the previous plaintext key-value record, writes and reads back the encrypted copy, and only then deletes and vacuums the old value. Physical update testing is still release-blocking before this can ship.

### Keep two concepts separate in the UI

1. **Lock Gather Mind**: require the phone's enrolled fingerprint, face, or device credential when opening or returning to the app.
2. **Local data encryption**: encrypt the stored database at rest.

Biometric authentication does not itself encrypt the database. It can authenticate the user or release an encryption key. Calling a biometric toggle `Encrypt data` would therefore be misleading.

Current settings model:

```text
Lock Gather Mind                         [toggle]
Use your phone's fingerprint, face, or screen lock to open the app.
Works entirely on this device.

Local data encryption                    On
Your Gather Mind database is encrypted on this device.
```

The app lock works without internet traffic using Expo LocalAuthentication. SQLCipher provides database encryption on Android and iOS, and the random database key is kept in the operating system's secure key storage rather than hard-coded or saved beside the database.

Expo SecureStore is suitable for a small database key, not for the complete Gather Mind state. On Android it uses encrypted SharedPreferences backed by Android Keystore; on iOS it uses Keychain. Expo warns that authentication-protected keys can become unreadable when enrolled biometrics change. Therefore:

- do not make biometric enrollment the only unrecoverable copy of the database key;
- prefer a recoverable design with device-credential fallback, or keep the database key in SecureStore and use biometric authentication as a separate app lock;
- if a stronger biometric-bound key mode is ever offered, require a tested recovery password/key first and explain the lockout risk clearly;
- test fingerprint/face changes, device-passcode changes, app updates, background locking, uninstall/reinstall, and failed authentication on physical devices.

Database encryption should preferably be the default once migration is safe, not an optional checkbox. Optional encryption creates two storage formats, more migration paths, and uncertainty about whether sensitive data is protected.

The implementation uses an explicitly opened database so the key is applied before any schema or content query. SQLCipher availability is checked against a disposable database first, which prevents Expo Go or another non-SQLCipher build from accidentally creating a plaintext file at the encrypted database path.

Official implementation references:

- [Expo LocalAuthentication](https://docs.expo.dev/versions/v54.0.0/sdk/local-authentication/)
- [Expo SecureStore](https://docs.expo.dev/versions/v54.0.0/sdk/securestore/)
- [Expo SQLite and SQLCipher](https://docs.expo.dev/versions/v54.0.0/sdk/sqlite/#sqlcipher)

### Passwords and backups

An app-specific password is most useful for an encrypted export or remote backup, where a key must survive loss of the phone. It adds avoidable lockout and support risk if used only to open data that already lives behind the phone's screen lock.

A future local encrypted backup should:

- be encrypted on the device before the system share/save sheet opens;
- use a password-derived key with a random salt and a deliberately slow, reviewed key-derivation function;
- authenticate the ciphertext so corruption or modification is detected;
- include a versioned manifest and support restore testing;
- state clearly that the password cannot be recovered by Gather Mind.

A later paid server backup is compatible with the privacy model only if encryption and decryption happen on the device and the service stores ciphertext it cannot decrypt. That feature would still require careful design for account metadata, password reset expectations, key recovery, deletion, billing, storage limits, breach response, and reliable restore. It is explicitly not current scope.

## Appointment follow-through

The appointment flow is a stronger differentiator than a generic planner or health tracker. Potential additions after thought-to-action:

- a focused visit view with the most important questions first;
- quick capture of answers and decisions during the appointment;
- convert follow-ups into today's or a future goal;
- a user-initiated plain-text or PDF summary through the operating system share sheet;
- a post-appointment review that asks what still needs action.

This can support medical appointments without making diagnoses or requiring a comprehensive symptom database.

## Proposed sequence

### Next interaction release

1. Finish physical-device QA for Undo, the Thoughts reframe, and local context suggestions.
2. Add thought-to-goal and thought-to-appointment-plan conversion.

### Following product release

1. Handled/archive state for thoughts.
2. Prototype thread-like grouping using themes; validate before adding a new entity.
3. Appointment follow-up and user-initiated summary/export.

### Privacy and resilience project

1. Versioned local export/import with restore tests.
2. Physically prove the existing-data migration, biometric changes, background locking, and deletion behavior on supported Android devices.
3. Release default local database encryption and the optional offline app lock only after that QA passes.

## Research questions

Test with 5–8 people from the target audience:

- Do appointment suggestions feel helpful or intrusive, and what time window feels natural?
- Do people understand why each theme or appointment was suggested?
- Is a named thread easier to understand than a parent thought or a tag?
- Can a user collect several symptom observations without feeling that the app is asking them to complete a health diary?
- Does **Make this smaller** help someone start, or merely ask them to do more planning?
- Do users expect completing all steps to complete the parent automatically?
- Can users find, connect, and act on a captured thought without opening the visual graph?
- Does an app lock provide meaningful reassurance, and is device-credential fallback expected?

## Deliberately not now

- automatic appointment assignment;
- recursive thought hierarchies;
- a comprehensive symptom, menstrual-cycle, medication, or HRT tracker;
- cloud-based semantic matching or task decomposition;
- gamification, streaks, social features, or analytics;
- server backup before local export/import and key recovery are reliable.
