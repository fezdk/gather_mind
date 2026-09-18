# Update service review — 18 September 2026

Scope: the Gather Mind Apache vhost, its PHP manifest handler, local publisher,
deployment helper, and Android update integration. This is a scoped review, not
a guarantee that the host or app has no security vulnerabilities.

## Confirmed checks

- Public HTTPS `/manifest` returned 204 and correct Expo/no-store headers for an
  empty runtime. The same check passed directly against Apache's loopback origin,
  bypassing Cloudflare, with TLS verification still enabled.
- Both routes returned 403 for `.env`, `.git/config`, `ops/ACTIVATE.md`,
  `lib/manifest.php`, `trust/certificate.pem`, `updates/native-1-data-8.json`,
  `logs/error_log`, and `index.php.bak`. Encoded/traversal probes through the public
  hostname returned 400. No response bodies from sensitive probes were printed.
- Inspected site files matched their source checksums. Only `index.php` is in
  `html`; configs, logs, manifests, certificate, and CLI helper are outside it.
  No signing private key is deployed. Apache has no write access to site code.
- PHP has no HTTP upload function, shell/process execution, SQL, dynamic include
  path, or outbound request. Runtime names use a bounded allowlist, reads are
  bounded to 1 MiB, symlink envelopes are rejected, and errors return no paths.
- Unit tests cover wrong keys, changed manifest bytes, absent trust, malformed
  envelopes, runtime mismatch, forbidden asset URLs and content negotiation.
  Publisher/deployer tests cover signed-byte preservation, export path escape,
  wrong signing keys, duplicate activation and tampering; failures preserve the
  active envelope. Deployment archives the previous envelope and uses an atomic
  rename under a writer lock; the CLI helper is not under the document root.
- An isolated Apache test exercises real TLS/PHP/rewrite, private path denial,
  HTTP-to-HTTPS redirect, HTTP-01 challenge exception, and invalid-update 503.
- Android `expo-updates` is pinned and patched to strip install IDs/crash strings/
  cookies/custom headers, restrict HTTPS hosts, including redirects, and avoid
  native launch/error-recovery requests. Its Kotlin library compiled successfully.
  The app keeps the signing certificate independent from SQLCipher/Android keys.

## Remaining risks and release gates

1. **The live Apache module is PHP 7.4**, not just the CLI. It is end-of-life.
   Upgrade to a [supported PHP branch](https://www.php.net/supported-versions.php)
   and rerun syntax, Apache and public/origin checks before production OTA use.
   This task did not upgrade the shared server or change unrelated sites.
2. The user confirmed a successful 0.6.3 → 0.6.4 OTA installation on a physical
   Android phone on 18 September 2026; the automatic restart felt abrupt.
   Further physical Android end-to-end validation remains required: signature failure,
   altered asset, runtime mismatch, interrupted downloads, cold launch/recovery,
   app lock and draft retention. Automated/source checks cannot replace it.
3. `npm audit` reports 21 dependency findings (11 high, 10 moderate), largely
   inherited through Expo/Metro build/configuration parsers. This is **not** a
   clean dependency audit and not proof that those findings are exploitable in
   the installed app or the PHP service. Major Expo upgrades suggested by npm
   need a separate compatibility assessment; do not apply `audit fix --force`
   blindly. Do not build/sign untrusted pull-request content using the real key.
4. Ordinary connection metadata can exist in Cloudflare/infrastructure and
   Apache error logs despite disabled per-request access logging. Establish an
   operational error-log retention policy. Do not claim an anonymous connection.
5. Keep the private key outside the repo and server, back it up securely, and
   replace the native certificate/runtime through a new APK if it is lost or
   compromised. Never trust a replacement certificate received with an update.
6. The configured certificate expires in September 2036. Plan rotation before
   expiry. Runtime compatibility includes database readability of the embedded
   recovery bundle; rollback cannot undo arbitrary data migrations.
