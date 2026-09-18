const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

test('deploy defaults to no publication and validates remote arguments', async () => {
  const { parseOptions } = await import('../scripts/deploy-release.mjs');
  const base = ['--apk', 'test.apk', '--notes', 'notes.md'];
  assert.equal(parseOptions(base).publish, false);
  assert.equal(parseOptions([...base, '--publish']).publish, true);
  assert.throws(() => parseOptions([...base, '--clobber']));
  assert.throws(() => parseOptions([...base, '--ota-dir', 'dir']));
  assert.throws(() => parseOptions([...base, '--ota-dir', 'dir', '--ssh-host', '-oProxyCommand=bad', '--site-root', '/web/gather']));
  assert.throws(() => parseOptions([...base, '--ota-dir', 'dir', '--ssh-host', 'host', '--site-root', '/web/x;bad']));
});

test('deploy refuses differing or unready existing release assets', async () => {
  const { assertAssetDigest } = await import('../scripts/deploy-release.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-deploy-test-'));
  try {
    const file = path.join(dir, 'fixture.apk');
    fs.writeFileSync(file, 'fixture');
    const asset = { state: 'uploaded', digest: 'sha256:' + crypto.createHash('sha256').update('fixture').digest('hex') };
    assertAssetDigest(asset, file);
    assert.throws(() => assertAssetDigest(undefined, file));
    assert.throws(() => assertAssetDigest({ ...asset, state: 'starter' }, file));
    assert.throws(() => assertAssetDigest({ ...asset, digest: 'wrong' }, file));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
