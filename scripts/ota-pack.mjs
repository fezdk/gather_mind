import { mkdirSync, readFileSync, writeFileSync, copyFileSync, realpathSync, existsSync } from 'node:fs';
import { resolve, join, basename, extname } from 'node:path';
import { createHash, randomUUID, sign, verify, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function packExport({ exportDir, output, version, runtime, key, certificate, repository = 'fezdk/gather_mind' }) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(runtime)
    || !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid release identity');
  if (existsSync(output)) throw new Error('Refusing to overwrite an OTA package');
  const cert = new X509Certificate(certificate);
  if (Date.parse(cert.validFrom) > Date.now() || Date.parse(cert.validTo) < Date.now()
    || !cert.keyUsage?.includes('1.3.6.1.5.5.7.3.3')) throw new Error('Certificate is not a currently valid code-signing certificate');
  const metadata = JSON.parse(readFileSync(join(exportDir, 'metadata.json'), 'utf8'));
  const android = metadata.fileMetadata?.android;
  if (!android?.bundle || !Array.isArray(android.assets)) throw new Error('Not an Android Expo export');
  const root = realpathSync(exportDir);
  const used = new Set();
  const files = [];
  const asset = (relative, extension, launch = false) => {
    const file = realpathSync(resolve(root, relative));
    if (!file.startsWith(root + '/')) throw new Error('Export asset escapes its directory');
    if (!/^[a-z0-9]+$/i.test(extension)) throw new Error('Invalid asset extension');
    const bytes = readFileSync(file);
    const digest = createHash('sha256').update(bytes).digest();
    const name = `${digest.toString('hex')}.${extension}`;
    if (!used.has(name)) files.push({ file, name });
    used.add(name);
    return {
      key: launch ? digest.toString('hex') : basename(relative, extname(relative)),
      hash: digest.toString('base64url'), fileExtension: `.${extension}`,
      contentType: launch ? 'application/javascript' : ({ ttf: 'font/ttf', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[extension] ?? 'application/octet-stream'),
      url: `https://github.com/${repository}/releases/download/v${version}/${name}`,
    };
  };
  const manifest = JSON.stringify({
    id: randomUUID(), createdAt: new Date().toISOString(), runtimeVersion: runtime,
    launchAsset: asset(android.bundle, 'hbc', true),
    assets: android.assets.map(entry => asset(entry.path, entry.ext)),
    metadata: { appVersion: version }, extra: { expoClient: { version } },
  });
  const signature = sign('RSA-SHA256', Buffer.from(manifest), key);
  if (!verify('RSA-SHA256', Buffer.from(manifest), cert.publicKey, signature)) throw new Error('Private key does not match the pinned certificate');
  mkdirSync(join(output, 'assets'), { recursive: true });
  for (const file of files) copyFileSync(file.file, join(output, 'assets', file.name));
  writeFileSync(join(output, `${runtime}.json`), JSON.stringify({ manifest, signature: signature.toString('base64') }) + '\n');
  writeFileSync(join(output, 'manifest.json'), manifest);
  writeFileSync(join(output, 'certificate.pem'), certificate);
  return JSON.parse(manifest);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [keyPath, destination] = process.argv.slice(2);
  if (!keyPath || !destination) throw new Error('Usage: node scripts/ota-pack.mjs PRIVATE-KEY NEW-OUTPUT-DIRECTORY');
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const out = resolve(destination);
  if (existsSync(out)) throw new Error('Use a new output directory');
  const config = JSON.parse(readFileSync(join(root, 'mobile/app.json'), 'utf8')).expo;
  const exportDir = out + '-export';
  if (existsSync(exportDir)) throw new Error('Export directory already exists');
  // Always export afresh, never silently package an earlier bundle.
  execFileSync('npx', ['expo', 'export', '--platform', 'android', '--output-dir', exportDir],
    { cwd: join(root, 'mobile'), stdio: ['ignore', 'inherit', 'inherit'] });
  const manifest = packExport({ exportDir, output: out, version: config.version, runtime: config.runtimeVersion,
    key: readFileSync(keyPath), certificate: readFileSync(join(root, 'mobile', config.updates.codeSigningCertificate)) });
  console.log(`Prepared signed ${manifest.metadata.appVersion} for ${manifest.runtimeVersion}. No upload performed.`);
}
