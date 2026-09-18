# Signed update manifest service (Apache)

The source includes the server, local publisher and native update flow. A new
APK and physical-device validation are still required before release; existing
APKs cannot bootstrap the engine. Do not advertise OTA availability merely
because this endpoint responds. The complete repeatable release flow is in
the [root README](../../README.md#signed-ota-updates-and-release-rollout).

The Android-only endpoint is `/manifest`. It serves exact, locally signed
manifest bytes with the [Expo Updates v1](https://docs.expo.dev/technical-specs/expo-updates-1/)
headers. APKs, launch bundles, and other assets stay on the public GitHub release.
There is no database, account, upload endpoint, outbound HTTP request, or server
signing key. Public manifest envelopes are deployed by the maintainer over SSH.

## Prepare without root

Requirements: Apache 2.4 with rewrite, SSL, and a supported PHP/OpenSSL runtime.
The handler is syntax-compatible with PHP 7.4 for the existing server, but PHP 7.4
is end-of-life: upgrade the host's PHP before treating it as a production service.
No Composer dependencies or persistent background service are needed.

Render a **new** staging directory from the repository root:

```bash
node deploy/updates/render.mjs updates.example.org /web/updates.example.org /tmp/my-new-update-site
```

This follows the existing server's `/web/SITE/html` and separate logs convention.
Copy the generated tree to `/web/updates.example.org` only after checking that
the destination is new. Make the site root traversable (`0755`) by Apache.
Do not enable a dynamic wildcard router or change unrelated sites. Keep `lib`,
`trust`, `updates`, and `ops` outside the document root. Apache needs read access,
not write access. Never copy a private key, `.git`, or the whole app checkout.

## Root activation (two phases)

Substitute your actual hostname and site directory in every command. First
review the generated files in `ops/`. Do not copy the TLS file into an enabled
configuration before its certificate exists. Back up any existing target
configuration instead of overwriting it. The initial install should fail if
either site name already exists.

1. Confirm DNS resolves to this server (or to its intended proxy). For Cloudflare,
   use Full (strict) for HTTPS, ensure ACME HTTP-01 can reach this origin, and
   bypass caching/challenges/bot checks for `/manifest`. Do not use Flexible mode.
2. Install and enable **only** the HTTP site, test Apache, then reload:

```bash
set -e
sudo test ! -e /etc/apache2/sites-available/updates.example.org-site.conf
sudo install -o root -g root -m 0644 /web/updates.example.org/ops/updates.example.org-site.conf /etc/apache2/sites-available/updates.example.org-site.conf
sudo a2ensite updates.example.org-site.conf
sudo apache2ctl configtest
# Only if the configuration test passed:
sudo systemctl reload apache2
```

3. Issue a certificate using the server's installed Certbot and webroot flow.
   Do not switch to standalone mode or stop Apache. Example:

```bash
sudo /opt/certbot/bin/certbot certonly --webroot -w /web/updates.example.org/html --cert-name updates.example.org -d updates.example.org
```

4. Install/enable the generated `updates.example.org-tls.conf` in the same way;
   run `apache2ctl configtest` before reloading. Confirm the renewal timer and
   deploy hook test/reload Apache after successful renewals. Use Certbot's
   `renew --cert-name updates.example.org --dry-run` to verify renewal.
5. Check HTTPS from outside the server **without** `curl -k`. An empty store
   deliberately yields HTTP 204, not an unsigned placeholder update:

```bash
curl --fail -i https://updates.example.org/manifest \
  -H 'expo-protocol-version: 1' -H 'expo-platform: android' \
  -H 'expo-runtime-version: native-1-data-8' \
  -H 'Accept: multipart/mixed,application/expo+json,application/json'
```

Require `expo-protocol-version: 1`, `expo-sfv-version: 0`, and `Cache-Control:
private, no-store, max-age=0`. Verify `/trust/certificate.pem`, `/updates/`,
`/lib/`, `/ops/`, and arbitrary files cannot be fetched. No access log is
configured for this vhost; infrastructure/proxy logs may still contain IPs.
Error logs are separate and must have an operator-defined retention policy.

Rollback activation by disabling **only these two new sites**, running a config
test, and reloading if it passes. Do not delete certificates or user data.

## Deploying signed manifests

Install the same **public certificate** embedded in the APK at
`trust/certificate.pem`. Only the local build machine holds the private key.
The endpoint fails closed (503) for missing trust when an update is present,
wrong signatures, modified bytes, malformed manifests, or untrusted asset URLs.
The phone must independently verify signatures; server verification does not
replace the APK's trust anchor.

Each runtime has one envelope at `updates/RUNTIME.json`:

```json
{
  "manifest": "<exact signed Expo manifest JSON as a string>",
  "signature": "<Base64 RSA PKCS#1 v1.5 SHA-256 signature of those UTF-8 bytes>"
}
```

The envelope itself is not an Expo manifest and is never returned to clients.
Install `install.php` at `ops/install.php` outside the document root. Use that CLI
helper to validate, archive and atomically activate a staged envelope; it is not
a web upload endpoint. The manifest must contain `metadata.appVersion` as X.Y.Z.
Keep manifest/signature together in this one file and publish using an atomic
rename on the same filesystem, only after local validation. Upload immutable
assets to the release **before** publishing its manifest; never overwrite
published bytes. Use increasing `createdAt` values for successive compatible
updates. Remove the envelope to pause delivery (does not uninstall an update).

The runtime must be 1–100 characters, start alphanumeric, and otherwise contain
only letters, digits, dots, underscores, or hyphens. Missing runtimes return 204
for clients accepting multipart, or 406 for JSON-only clients. Bad requests
return 400/405/406; other routes return 404. Both JSON and multipart manifests
are supported. The fixed signing metadata is `main` / `rsa-v1_5-sha256`.

Asset URLs are restricted to versioned files in
`https://github.com/fezdk/gather_mind/releases/download/vX.Y.Z/`. Forks must
change this explicit allowlist and use their own certificate/repository.
GitHub redirects asset downloads to its CDN: app consent and network controls
must cover the manifest host, GitHub, and the actual release-asset CDN. Do not
send user content, persistent device IDs, crash messages, or usage data; audit
Expo's native request headers before enabling it (defaults include identifiers).

## Checks

```bash
php -l deploy/updates/lib/manifest.php
php -l deploy/updates/html/index.php
node --test test/update-server.test.cjs
node deploy/updates/smoke-apache.mjs
```

Tests use ephemeral fixture keys, never production credentials. Validate the
actual rendered vhost with Apache as well as the PHP handler; PHP's development
server does not implement Apache rewrite/access-control rules.
