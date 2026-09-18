const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { generateKeyPairSync, sign } = require('node:crypto');
const { spawnSync } = require('node:child_process');

test('manifest endpoint: signatures, protocol, runtime isolation and fail-closed responses', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gm-manifest-test-'));
  try {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const certificate = join(dir, 'public.pem');
    writeFileSync(certificate, publicKey.export({ type: 'spki', format: 'pem' }));
    const asset = { key: 'bundle', hash: 'A'.repeat(43), contentType: 'application/javascript',
      url: 'https://github.com/fezdk/gather_mind/releases/download/v0.6.3/bundle.hbc' };
    const data = { id: '7a38a0eb-6f6f-4ed4-9aaf-718683bf6f16', createdAt: '2026-09-18T00:00:00Z',
      runtimeVersion: 'native-1-data-8', launchAsset: asset, assets: [], metadata: { appVersion: '0.6.3' } };
    const request = { method: 'GET', path: '/manifest', protocol: '1', platform: 'android',
      runtime: data.runtimeVersion, accept: 'multipart/mixed,application/expo+json,application/json' };
    const envelopeFile = join(dir, `${data.runtimeVersion}.json`);
    const put = (object) => {
      const manifest = JSON.stringify(object);
      writeFileSync(envelopeFile, JSON.stringify({ manifest,
        signature: sign('RSA-SHA256', Buffer.from(manifest), privateKey).toString('base64') }));
      return manifest;
    };
    const run = (change = {}, cert = certificate) => {
      const input = { request: { ...request, ...change }, dir, cert };
      const code = 'require $argv[1]; $i=json_decode($argv[2],true);'
        + 'echo json_encode(gm_manifest_response($i["request"],$i["dir"],$i["cert"]));';
      const result = spawnSync('php', ['-r', code, resolve('deploy/updates/lib/manifest.php'), JSON.stringify(input)],
        { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 5000 });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, '');
      return JSON.parse(result.stdout);
    };
    assert.equal(run()[0], 204);
    const manifest = put(data);
    const [status, headers, body] = run();
    assert.equal(status, 200);
    assert.equal(body, manifest, 'signed bytes must not be reformatted');
    assert.equal(headers['expo-protocol-version'], '1');
    assert.equal(headers['expo-sfv-version'], '0');
    assert.match(headers['expo-signature'], /^sig="[A-Za-z0-9+/=]+", keyid="main"/);
    assert.match(headers['Cache-Control'], /no-store/);
    assert.equal(run({ runtime: 'other-native' })[0], 204);
    assert.equal(run({ runtime: '../secret' })[0], 400);
    assert.equal(run({ runtime: 'x'.repeat(101) })[0], 400);
    assert.equal(run({ platform: 'ios' })[0], 400);
    assert.equal(run({ protocol: '0' })[0], 406);
    assert.equal(run({ path: '/trust/certificate.pem' })[0], 404);
    assert.equal(run({ method: 'POST' })[0], 405);
    assert.equal(run({ accept: 'text/html' })[0], 406);
    assert.equal(run({ accept: '*/*;q=1,application/*;q=0,multipart/*;q=0' })[0], 406);
    const multipart = run({ accept: 'multipart/mixed' });
    assert.equal(multipart[0], 200);
    assert.match(multipart[1]['Content-Type'], /^multipart\/mixed; boundary=/);
    assert.ok(multipart[2].includes('\r\n\r\n' + manifest + '\r\n--'));
    assert.ok(multipart[2].includes(headers['expo-signature']));
    assert.equal(run({}, join(dir, 'missing.pem'))[0], 503);
    const wrong = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const wrongCert = join(dir, 'wrong.pem');
    writeFileSync(wrongCert, wrong.publicKey.export({ type: 'spki', format: 'pem' }));
    assert.equal(run({}, wrongCert)[0], 503);
    const envelope = JSON.parse(readFileSync(envelopeFile, 'utf8'));
    envelope.manifest = envelope.manifest.replace('bundle.hbc', 'tampered.hbc');
    writeFileSync(envelopeFile, JSON.stringify(envelope));
    assert.equal(run()[0], 503);
    put({ ...data, runtimeVersion: 'different-runtime' });
    assert.equal(run()[0], 503);
    for (const url of ['https://evil.test/bundle.hbc',
      asset.url + '?redirect=evil', asset.url.replace('fezdk', 'other'),
      asset.url.replace('v0.6.3', 'latest'), asset.url.replace('bundle.hbc', '../secrets')]) {
      put({ ...data, launchAsset: { ...asset, url } });
      assert.equal(run()[0], 503);
    }
    writeFileSync(envelopeFile, '{');
    assert.deepEqual(run().filter((_, i) => i !== 1), [503, '']);
    writeFileSync(envelopeFile, 'x'.repeat(1048577));
    assert.equal(run()[0], 503);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vhost renderer rejects unsafe names and existing destinations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gm-vhost-test-'));
  try {
    const render = (...args) => spawnSync(process.execPath, ['deploy/updates/render.mjs', ...args], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 5000 });
    assert.notEqual(render('evil\nDirective', '/web/gathermind', join(dir, 'bad')).status, 0);
    assert.notEqual(render('updates.example.org', '/etc/apache2', join(dir, 'bad')).status, 0);
    assert.notEqual(render('updates.example.org', '/web/gathermind', dir).status, 0);
    const out = join(dir, 'site');
    assert.equal(render('updates.example.org', '/web/gathermind', out).status, 0);
    const http = readFileSync(join(out, 'ops/updates.example.org-site.conf'), 'utf8');
    const tls = readFileSync(join(out, 'ops/updates.example.org-tls.conf'), 'utf8');
    assert.match(http, /ServerName updates\.example\.org/);
    assert.ok(!http.includes('SSLCertificateFile'));
    assert.match(tls, /AllowOverride None/);
    assert.match(tls, /CustomLog \/dev\/null common/);
    assert.ok(!tls.includes('@@'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
