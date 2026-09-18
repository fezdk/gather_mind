// GitHub/OTA publication only. Build first; machine-private Drive tooling stays separate.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createHash, verify, X509Certificate } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function parseOptions(args) {
  const options = { publish: false };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--publish') { options.publish = true; continue; }
    if (!['--apk', '--notes', '--ota-dir', '--ssh-host', '--site-root'].includes(flag)
      || !args[index + 1] || args[index + 1].startsWith('--') || options[flag.slice(2)]) {
      throw new Error('Usage: node scripts/deploy-release.mjs --apk APK --notes NOTES [--ota-dir DIR --ssh-host HOST --site-root /web/SITE] [--publish]');
    }
    options[flag.slice(2)] = args[++index];
  }
  if (!options.apk || !options.notes) throw new Error('--apk and --notes are required');
  const ota = [options['ota-dir'], options['ssh-host'], options['site-root']];
  if (ota.some(Boolean) && !ota.every(Boolean)) throw new Error('OTA deployment needs directory, SSH host and site root together');
  if (options['ssh-host'] && !/^[A-Za-z0-9][A-Za-z0-9.@_-]*$/.test(options['ssh-host'])) throw new Error('Unsafe SSH host');
  if (options['site-root'] && !/^\/web\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options['site-root'])) throw new Error('Unsafe site root');
  return options;
}

export function assertAssetDigest(asset, file) {
  const digest = 'sha256:' + createHash('sha256').update(readFileSync(file)).digest('hex');
  if (!asset || asset.state !== 'uploaded' || asset.digest !== digest) {
    throw new Error(`Missing, unready or different release asset: ${basename(file)}. Refusing to overwrite.`);
  }
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const run = (command, args) => execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const config = JSON.parse(readFileSync(join(root, 'mobile/app.json'), 'utf8')).expo;
  const version = config.version;
  const runtime = config.runtimeVersion;
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(runtime)) throw new Error('Invalid version/runtime');
  const tag = `v${version}`;
  for (const file of ['package.json', 'mobile/package.json']) {
    if (JSON.parse(readFileSync(join(root, file), 'utf8')).version !== version) throw new Error('Unsynchronized versions');
  }
  const apk = resolve(options.apk);
  const notes = resolve(options.notes);
  if (basename(apk) !== `Gather-Mind-${version}.apk`) throw new Error('APK filename/version mismatch');
  readFileSync(notes); // Fail before any external write if release notes are unavailable.
  if (!process.env.ANDROID_HOME) throw new Error('Set ANDROID_HOME to the installed SDK');
  const sdk = join(process.env.ANDROID_HOME, 'build-tools/36.0.0');
  const badging = run(join(sdk, 'aapt'), ['dump', 'badging', apk]);
  if (!badging.includes(`package: name='${config.android.package}' versionCode='${config.android.versionCode}' versionName='${version}'`)
    || !badging.includes("sdkVersion:'24'") || !badging.includes("targetSdkVersion:'36'")) throw new Error('Wrong APK identity/SDK');
  const signature = run(join(sdk, 'apksigner'), ['verify', '--verbose', '--print-certs', apk]);
  if (!signature.includes('Verified using v2 scheme (APK Signature Scheme v2): true')
    || !signature.includes('Signer #1 certificate SHA-256 digest: fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c')) throw new Error('Wrong APK signer/invalid v2 signature');
  run(join(sdk, 'zipalign'), ['-c', '-v', '4', apk]);
  const files = [apk];
  let envelope;
  if (options['ota-dir']) {
    const dir = resolve(options['ota-dir']);
    envelope = join(dir, `${runtime}.json`);
    const signed = JSON.parse(readFileSync(envelope, 'utf8'));
    const manifest = JSON.parse(signed.manifest);
    const certificate = new X509Certificate(readFileSync(join(root, 'mobile', config.updates.codeSigningCertificate)));
    if (manifest.runtimeVersion !== runtime || manifest.metadata?.appVersion !== version
      || !verify('RSA-SHA256', Buffer.from(signed.manifest), certificate.publicKey, Buffer.from(signed.signature, 'base64'))) throw new Error('OTA identity/signature mismatch');
    const assets = [manifest.launchAsset, ...manifest.assets];
    const assetFiles = new Set();
    for (const asset of assets) {
      const prefix = `https://github.com/fezdk/gather_mind/releases/download/${tag}/`;
      if (!asset.url.startsWith(prefix)) throw new Error('Wrong OTA release URL');
      const name = asset.url.slice(prefix.length);
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) throw new Error('Unsafe asset name');
      const file = join(dir, 'assets', name);
      if (createHash('sha256').update(readFileSync(file)).digest('base64url') !== asset.hash) throw new Error('OTA asset hash mismatch');
      assetFiles.add(file);
    }
    // Never upload unrelated files simply because they share the package directory.
    files.push(...assetFiles, envelope);
  }
  console.log(`${options.publish ? 'Publish' : 'Dry run'}: ${tag}, APK code ${config.android.versionCode}, ${files.length} verified files.`);
  if (!options.publish) { console.log('No external writes. Commit, tag and push the tested source; add --publish when ready.'); return; }
  if (run('git', ['status', '--porcelain'])) throw new Error('Commit the release source first; worktree must be clean');
  const head = run('git', ['rev-parse', 'HEAD']);
  if (run('git', ['rev-parse', `${tag}^{commit}`]) !== head) throw new Error('Release tag must point at HEAD');
  const remote = run('git', ['ls-remote', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`]);
  if (!remote.split('\n').some(line => line.startsWith(head + '\t'))) throw new Error('Push the release tag before publishing');
  const repo = 'fezdk/gather_mind';
  const releases = JSON.parse(run('gh', ['api', `repos/${repo}/releases`, '--paginate', '--slurp'])).flat();
  let release = releases.find(item => item.tag_name === tag);
  if (!release) {
    run('gh', ['release', 'create', tag, '--repo', repo, '--verify-tag', '--draft', '--title', `Gather Mind ${version}`, '--notes-file', notes]);
  }
  const view = () => JSON.parse(run('gh', ['release', 'view', tag, '--repo', repo, '--json', 'url,assets,isDraft']));
  release = view();
  // Preflight every existing asset before uploading anything on a resumed run.
  for (const file of files) {
    const existing = release.assets.find(asset => asset.name === basename(file));
    if (existing) assertAssetDigest(existing, file);
  }
  for (const file of files) {
    const existing = release.assets.find(asset => asset.name === basename(file));
    if (existing) assertAssetDigest(existing, file);
    else run('gh', ['release', 'upload', tag, file, '--repo', repo]);
  }
  release = view();
  for (const file of files) assertAssetDigest(release.assets.find(asset => asset.name === basename(file)), file);
  if (release.isDraft) run('gh', ['release', 'edit', tag, '--repo', repo, '--draft=false', '--latest']);
  console.log(view().url);
  if (envelope) {
    run(process.execPath, ['scripts/ota-verify-release.mjs', resolve(options['ota-dir']), runtime, join(root, 'mobile', config.updates.codeSigningCertificate)]);
    const host = options['ssh-host'];
    const site = options['site-root'];
    const staged = `${site}/ops/candidate-${version}.json`;
    run('scp', [envelope, `${host}:${staged}`]);
    console.log(run('ssh', ['-o', 'BatchMode=yes', host, `php '${site}/ops/install.php' '${staged}'`]));
  } else console.log('Baseline APK only: OTA endpoint unchanged.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
