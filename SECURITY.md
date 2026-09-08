# Security policy

Security fixes are made against the latest Gather Mind Android beta.

Please [report a suspected vulnerability privately through GitHub](https://github.com/fezdk/gather_mind/security/advisories/new) rather than opening a public issue. Include the affected version and a minimal reproduction, but do not send real thoughts, goals, appointments, database files, device backups, biometric material, signing keys, or other personal data.

Gather Mind is designed to work without an account or backend. It stores user content in an on-device SQLCipher database and keeps its database key separately in the operating system's secure storage. Android Internet access is used only for a clearly explained, default-off GitHub release check; no user content or usage data is included. See [the privacy policy](mobile/PRIVACY.md) for the current data-handling model.
