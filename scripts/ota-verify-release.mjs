import { readFileSync } from 'node:fs';
import { createHash, verify, X509Certificate } from 'node:crypto';
import { join } from 'node:path';

const [directory, runtime, certificatePath] = process.argv.slice(2);
if (!directory || !runtime || !certificatePath || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(runtime)) {
  throw new Error('Usage: node scripts/ota-verify-release.mjs PACKAGE-DIR RUNTIME PINNED-CERTIFICATE');
}
const envelope = JSON.parse(readFileSync(join(directory, `${runtime}.json`), 'utf8'));
const certificate = new X509Certificate(readFileSync(certificatePath));
if (!verify('RSA-SHA256', Buffer.from(envelope.manifest), certificate.publicKey, Buffer.from(envelope.signature, 'base64'))) {
  throw new Error('Manifest signature does not match the pinned certificate');
}
const manifest = JSON.parse(envelope.manifest);
if (manifest.runtimeVersion !== runtime) throw new Error('Runtime mismatch');
for (const asset of [manifest.launchAsset, ...manifest.assets]) {
  let url = new URL(asset.url);
  if (!/^https:\/\/github\.com\/fezdk\/gather_mind\/releases\/download\/v\d+\.\d+\.\d+\/[A-Za-z0-9._-]+$/.test(url.href)) throw new Error('Unexpected asset URL');
  let response;
  for (let redirects = 0; redirects < 4; redirects++) {
    if (url.protocol !== 'https:' || !['github.com', 'release-assets.githubusercontent.com'].includes(url.hostname)
        || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Unexpected download host');
    response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(60000) });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) throw new Error('Missing redirect location');
    url = new URL(location, url);
  }
  if (!response?.ok || !response.body) throw new Error('Release asset is not publicly downloadable');
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 100 * 1024 * 1024) throw new Error('Asset exceeds 100 MiB');
    hash.update(chunk);
  }
  if (hash.digest('base64url') !== asset.hash) throw new Error('Published asset hash mismatch');
  console.log(`Verified ${asset.key} (${size} bytes)`);
}
console.log('All release assets match the signed manifest. It is safe to stage this envelope.');
