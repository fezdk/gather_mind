const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const { compatibleOtaCandidate, findOtaUpdate, downloadOtaUpdate, restartOtaSafely } = require('../src/ota.ts');
const manifest = { id: 'dfc73385-533c-4463-88c5-3f65e215cbd6', runtimeVersion: 'native-test', metadata: { appVersion: '0.6.3' } };
test('OTA only offers newer signed-engine results for the same runtime', async () => {
  assert.equal(compatibleOtaCandidate(null, 'native-test', '0.6.2'), null);
  assert.equal(compatibleOtaCandidate(manifest, 'other', '0.6.2'), null);
  assert.equal(compatibleOtaCandidate(manifest, 'native-test', '0.6.3'), null);
  assert.equal(compatibleOtaCandidate(manifest, 'native-test', '0.6.4'), null);
  assert.deepEqual(compatibleOtaCandidate(manifest, 'native-test', '0.6.2'), { id: manifest.id, version: '0.6.3' });
  let checks = 0, downloads = 0;
  const engine = { isEnabled: false, runtimeVersion: 'native-test',
    checkForUpdateAsync: async () => { checks++; return { isAvailable: true, manifest }; },
    fetchUpdateAsync: async () => { downloads++; return { isNew: true, manifest }; } };
  await assert.rejects(findOtaUpdate(engine, '0.6.2'));
  assert.equal(checks, 0);
  engine.isEnabled = true;
  assert.equal((await findOtaUpdate(engine, '0.6.2')).version, '0.6.3');
  assert.equal(downloads, 0, 'checking never downloads');
  assert.equal((await downloadOtaUpdate(engine, '0.6.2')).version, '0.6.3');
  engine.fetchUpdateAsync = async () => { throw new Error('signature mismatch'); };
  await assert.rejects(downloadOtaUpdate(engine, '0.6.2'), /signature mismatch/);
});
test('native engine stays offline on launch/error recovery and uses a pinned code-signing certificate', () => {
  const app = require('../app.json').expo;
  assert.equal(app.updates.checkAutomatically, 'NEVER');
  assert.equal(app.updates.useEmbeddedUpdate, true);
  assert.equal(app.updates.codeSigningMetadata.alg, 'rsa-v1_5-sha256');
  assert.equal(app.updates.url, 'https://gathermind.control.dk/manifest');
  const source = fs.readFileSync(path.join(__dirname, '../scripts/patch-updates.cjs'), 'utf8');
  assert.match(source, /addNetworkInterceptor/);
  assert.match(source, /headers\(Headers.Builder\(\).build\(\)\)/);
  assert.match(source, /release-assets\.githubusercontent\.com/);
  assert.doesNotMatch(source, /listOf\([^)]*EAS-Client-ID/);
  const { X509Certificate } = require('node:crypto');
  const cert = new X509Certificate(fs.readFileSync(path.join(__dirname, '../certs/ota/certificate.pem')));
  assert.ok(cert.keyUsage.includes('1.3.6.1.5.5.7.3.3'));
});
test('install actions preserve content and cannot silently reload an editor after leaving update settings', () => {
  const app = fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf8');
  const restart = app.slice(app.indexOf('  async function restartForOta()'), app.indexOf('  async function installOta()'));
  assert.match(restart, /waitForMutations: waitForContentMutations/);
  assert.match(restart, /await saveState\(stateRef.current\)/);
  assert.match(restart, /saveDraft: \(\) => saveEditorDraft\(editorDraftRef.current\)/);
  assert.match(restart, /updateModalRef.current/);
  assert.match(restart, /NativeAppState.currentState !== 'active'/);
  assert.match(app, /Connect to check for an update\?/);
  assert.match(app, /Check in browser/);
});
test('restart waits for verified saves and refuses reload after lock, leaving settings, or save failure', async () => {
  const calls = [];
  let ready = true;
  const operations = {
    waitForMutations: async () => { calls.push('wait'); },
    canRestart: () => ready,
    saveCurrentState: async () => { calls.push('state'); },
    saveDraft: async () => { calls.push('draft'); },
    reload: async () => { calls.push('reload'); },
  };
  assert.equal(await restartOtaSafely(operations), true);
  assert.deepEqual(calls, ['wait', 'state', 'draft', 'reload']);
  calls.length = 0;
  ready = false;
  assert.equal(await restartOtaSafely(operations), false);
  assert.deepEqual(calls, ['wait']);
  ready = true;
  calls.length = 0;
  assert.equal(await restartOtaSafely({ ...operations, saveDraft: async () => { ready = false; } }), false);
  assert.ok(!calls.includes('reload'));
  ready = true;
  calls.length = 0;
  await assert.rejects(restartOtaSafely({ ...operations, saveCurrentState: async () => { throw new Error('disk full'); } }), /disk full/);
  assert.ok(!calls.includes('reload'));
});
