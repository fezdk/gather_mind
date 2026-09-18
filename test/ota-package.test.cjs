const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

test('local publisher and CLI deployment preserve signed bytes and reject tampering/rollback', async () => {
  const { packExport } = await import('../scripts/ota-pack.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-ota-package-'));
  try {
    const fixture = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const key = fixture.privateKey.export({ type: 'pkcs8', format: 'pem' });
    const keyFile = path.join(dir, 'private-key.pem');
    const certFile = path.join(dir, 'certificate.pem');
    fs.writeFileSync(keyFile, key, { mode: 0o600 });
    const openssl = spawnSync('openssl', ['req', '-new', '-x509', '-key', keyFile, '-days', '1', '-subj', '/CN=OTA test',
      '-addext', 'keyUsage=digitalSignature', '-addext', 'extendedKeyUsage=codeSigning', '-out', certFile],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
    assert.equal(openssl.status, 0, openssl.stderr.toString());
    const certificate = fs.readFileSync(certFile);
    const exportDir = path.join(dir, 'export');
    fs.mkdirSync(exportDir);
    fs.writeFileSync(path.join(exportDir, 'bundle.hbc'), 'fixture bundle');
    fs.writeFileSync(path.join(exportDir, 'font'), 'fixture font');
    fs.writeFileSync(path.join(exportDir, 'metadata.json'), JSON.stringify({ fileMetadata: { android: {
      bundle: 'bundle.hbc', assets: [{ path: 'font', ext: 'ttf' }],
    } } }));
    const runtime = 'native-test';
    const output = path.join(dir, 'package');
    const options = { exportDir, output, runtime, version: '0.6.3', key, certificate };
    const manifest = packExport(options);
    assert.equal(manifest.metadata.appVersion, '0.6.3');
    assert.equal(manifest.assets[0].key, 'font');
    assert.equal(manifest.assets[0].fileExtension, '.ttf');
    assert.equal(manifest.launchAsset.hash, crypto.createHash('sha256').update('fixture bundle').digest('base64url'));
    assert.throws(() => packExport(options), /overwrite/);
    assert.throws(() => packExport({ ...options, output: path.join(dir, 'bad'), runtime: '../escape' }), /identity/);
    const wrong = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    assert.throws(() => packExport({ ...options, output: path.join(dir, 'bad'), key: wrong.privateKey }), /does not match/);

    const site = path.join(dir, 'site');
    for (const folder of ['ops', 'lib', 'trust', 'updates']) fs.mkdirSync(path.join(site, folder), { recursive: true });
    fs.copyFileSync('deploy/updates/install.php', path.join(site, 'ops/install.php'));
    fs.copyFileSync('deploy/updates/lib/manifest.php', path.join(site, 'lib/manifest.php'));
    fs.copyFileSync(certFile, path.join(site, 'trust/certificate.pem'));
    const envelopePath = path.join(output, runtime + '.json');
    const install = () => spawnSync('php', [path.join(site, 'ops/install.php'), envelopePath],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 });
    const first = install();
    assert.equal(first.status, 0, first.stderr);
    const active = fs.readFileSync(path.join(site, 'updates', runtime + '.json'), 'utf8');
    assert.equal(active, fs.readFileSync(envelopePath, 'utf8'));
    assert.notEqual(install().status, 0, 'same version cannot be accidentally reactivated');
    const tampered = JSON.parse(active);
    tampered.manifest = tampered.manifest.replace('0.6.3', '0.6.4');
    fs.writeFileSync(envelopePath, JSON.stringify(tampered));
    assert.notEqual(install().status, 0);
    assert.equal(fs.readFileSync(path.join(site, 'updates', runtime + '.json'), 'utf8'), active);
    assert.ok(!fs.readdirSync(path.join(site, 'updates')).some(name => name.startsWith('.stage-')));
    // Export symlinks may not smuggle in files outside the export directory.
    fs.symlinkSync(certFile, path.join(exportDir, 'escape.hbc'));
    fs.writeFileSync(path.join(exportDir, 'metadata.json'), JSON.stringify({ fileMetadata: { android: { bundle: 'escape.hbc', assets: [] } } }));
    assert.throws(() => packExport({ ...options, output: path.join(dir, 'escape') }), /escapes/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
