const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = require('node:fs').readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(output, filename);
};

const {
  LATEST_RELEASE_API_URL,
  RELEASES_PAGE_URL,
  UPDATE_CHECK_INTERVAL_MS,
  automaticUpdateCheckIsDue,
  fetchLatestRelease,
  isReleaseNewer,
  shouldNotifyAboutRelease,
} = require('../src/updates.ts');

test('semantic release comparison handles newer, equal, older, and invalid versions', () => {
  assert.equal(isReleaseNewer('v0.6.2', '0.6.1'), true);
  assert.equal(isReleaseNewer('0.7.0', '0.6.9'), true);
  assert.equal(isReleaseNewer('1.0.0', '0.99.99'), true);
  assert.equal(isReleaseNewer('v0.6.1', '0.6.1'), false);
  assert.equal(isReleaseNewer('0.6.0', '0.6.1'), false);
  assert.equal(isReleaseNewer('release-latest', '0.6.1'), false);
});

test('automatic checks are opt-in and limited to once per 24 hours', () => {
  const now = Date.UTC(2026, 8, 7, 12);
  assert.equal(automaticUpdateCheckIsDue(false, null, now), false);
  assert.equal(automaticUpdateCheckIsDue(true, null, now), true);
  assert.equal(automaticUpdateCheckIsDue(true, now - UPDATE_CHECK_INTERVAL_MS + 1, now), false);
  assert.equal(automaticUpdateCheckIsDue(true, now - UPDATE_CHECK_INTERVAL_MS, now), true);
  assert.equal(automaticUpdateCheckIsDue(true, now + 1, now), true);
});

test('a newer release is announced only once per version', () => {
  assert.equal(shouldNotifyAboutRelease('0.6.2', '0.6.1', null), true);
  assert.equal(shouldNotifyAboutRelease('0.6.2', '0.6.1', '0.6.2'), false);
  assert.equal(shouldNotifyAboutRelease('0.6.1', '0.6.1', null), false);
});

test('latest release lookup calls only the public GitHub endpoint and builds a trusted URL', async () => {
  let call;
  const release = await fetchLatestRelease(async (input, init) => {
    call = { input, init };
    return {
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v0.7.0', html_url: 'https://attacker.invalid/' }),
    };
  });
  assert.equal(call.input, LATEST_RELEASE_API_URL);
  assert.equal(call.init.method, 'GET');
  assert.equal(call.init.headers.Accept, 'application/vnd.github+json');
  assert.ok(call.init.signal);
  assert.deepEqual(release, {
    version: '0.7.0',
    tagName: 'v0.7.0',
    url: `${RELEASES_PAGE_URL}/tag/v0.7.0`,
  });
});

test('latest release lookup rejects failed and malformed responses', async () => {
  await assert.rejects(
    fetchLatestRelease(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    /status 503/,
  );
  await assert.rejects(
    fetchLatestRelease(async () => ({ ok: true, status: 200, json: async () => ({ tag_name: 'latest' }) })),
    /X\.Y\.Z/,
  );
});
