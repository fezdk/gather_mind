// Isolated TLS/Apache test. No root, system configuration, real keys, or port 80/443.
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import https from 'node:https';
import http from 'node:http';
import assert from 'node:assert/strict';

const dir = mkdtempSync(join(tmpdir(), 'gm-apache-smoke-'));
let child;
try {
  const run = (command, args) => {
    const r = spawnSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 10000 });
    assert.equal(r.status, 0, `${command}: ${r.stderr}`);
  };
  const site = join(dir, 'site');
  run(process.execPath, ['deploy/updates/render.mjs', 'updates.example.org', '/web/gm-test', site]);
  run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost', '-keyout', join(dir, 'fixture.key'), '-out', join(dir, 'fixture.crt')]);
  const portServer = net.createServer();
  await new Promise((done, reject) => { portServer.once('error', reject); portServer.listen(0, '127.0.0.1', done); });
  const port = portServer.address().port;
  await new Promise(done => portServer.close(done));
  const httpPortServer = net.createServer();
  await new Promise((done, reject) => { httpPortServer.once('error', reject); httpPortServer.listen(0, '127.0.0.1', done); });
  const httpPort = httpPortServer.address().port;
  await new Promise(done => httpPortServer.close(done));
  const modules = '/usr/lib/apache2/modules';
  const php = readdirSync(modules).find(name => /^libphp[0-9.]+\.so$/.test(name));
  assert.ok(php, 'This integration test needs Apache mod_php');
  const template = readFileSync(join(site, 'ops/updates.example.org-tls.conf'), 'utf8')
    .replaceAll('/web/gm-test', site)
    .replace('*:443', `127.0.0.1:${port}`)
    .replace('/etc/letsencrypt/live/updates.example.org/fullchain.pem', join(dir, 'fixture.crt'))
    .replace('/etc/letsencrypt/live/updates.example.org/privkey.pem', join(dir, 'fixture.key'));
  const config = [
    `ServerRoot "${dir}"`, `PidFile "${dir}/apache.pid"`, `DefaultRuntimeDir "${dir}"`, 'KeepAlive Off',
    `Listen 127.0.0.1:${port}`, `Listen 127.0.0.1:${httpPort}`, 'ServerName localhost', `ErrorLog "${dir}/error.log"`,
    `User #${process.getuid()}`, `Group #${process.getgid()}`,
    ...['mpm_prefork', 'authz_core', 'authz_host', 'unixd', 'log_config', 'mime', 'dir', 'rewrite', 'socache_shmcb', 'ssl']
      .filter(name => !['unixd', 'log_config'].includes(name))
      .map(name => `LoadModule ${name}_module ${modules}/mod_${name}.so`),
    `LoadModule php_module ${modules}/${php}`, 'TypesConfig /etc/mime.types',
    '<FilesMatch "\\.php$">', 'SetHandler application/x-httpd-php', '</FilesMatch>',
    '<Directory />', 'Require all denied', '</Directory>', template,
    readFileSync(join(site, 'ops/updates.example.org-site.conf'), 'utf8')
      .replaceAll('/web/gm-test', site).replace('*:80', `127.0.0.1:${httpPort}`),
  ].join('\n');
  const configPath = join(dir, 'apache.conf');
  writeFileSync(configPath, config);
  run('/usr/sbin/apache2', ['-t', '-f', configPath]);
  child = spawn('/usr/sbin/apache2', ['-X', '-f', configPath], { stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', bytes => { errors += bytes; });
  const request = (path, plain = false) => new Promise((done, reject) => {
    const req = (plain ? http : https).get({ hostname: '127.0.0.1', port: plain ? httpPort : port, path,
      rejectUnauthorized: false, // Self-signed ephemeral fixture only; NEVER the public smoke check.
      headers: { Host: 'updates.example.org', 'expo-protocol-version': '1', 'expo-platform': 'android',
        'expo-runtime-version': 'native-test', Accept: 'multipart/mixed,application/expo+json' } }, res => {
      let body = '';
      res.on('data', bytes => { body += bytes; });
      res.on('end', () => done({ status: res.statusCode, headers: res.headers, body }));
    });
    req.setTimeout(2000, () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject);
  });
  let ready;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { ready = await request('/manifest'); break; } catch {
      if (child.exitCode !== null) throw new Error(errors);
      await new Promise(done => setTimeout(done, 100));
    }
  }
  assert.ok(ready, errors);
  assert.equal(ready.status, 204, JSON.stringify(ready) + readFileSync(join(site, 'logs/error_log'), 'utf8'));
  assert.equal(ready.headers['expo-protocol-version'], '1');
  assert.equal(ready.headers['expo-sfv-version'], '0');
  assert.equal(ready.headers['content-type'], undefined);
  assert.equal(ready.headers['x-powered-by'], undefined);
  assert.equal(ready.body, '');
  for (const path of ['/trust/certificate.pem', '/updates/', '/ops/', '/lib/manifest.php', '/random.txt']) {
    const res = await request(path);
    assert.ok([403, 404].includes(res.status), `${path}: ${res.status}`);
  }
  // A populated but invalid runtime must never be delivered as an update.
  writeFileSync(join(site, 'updates/native-test.json'), '{}');
  assert.equal((await request('/manifest')).status, 503);
  assert.equal((await request('/index.php')).status, 404);
  const redirect = await request('/manifest', true);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.location, 'https://updates.example.org/manifest');
  writeFileSync(join(site, 'html/.well-known/acme-challenge/test-token'), 'fixture-challenge');
  const challenge = await request('/.well-known/acme-challenge/test-token', true);
  assert.equal(challenge.status, 200);
  assert.equal(challenge.body, 'fixture-challenge');
  console.log('Apache HTTP/ACME + TLS/rewrite/PHP smoke passed: 204 protocol response, private paths denied, invalid update 503.');
} finally {
  if (child && child.exitCode === null) {
    const stopped = new Promise(done => child.once('exit', done));
    child.kill('SIGTERM');
    await stopped;
  }
  rmSync(dir, { recursive: true, force: true });
}
