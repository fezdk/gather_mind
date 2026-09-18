// Creates a NEW staging tree only; never changes Apache or an existing tree.
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [host, siteRoot, destination] = process.argv.slice(2);
if (!host || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(host)
    || !siteRoot || !/^\/web\/[a-z0-9][a-z0-9._-]*$/.test(siteRoot)
    || !destination || existsSync(destination)) {
  throw new Error('Usage: node render.mjs HOST /web/SITE NEW-STAGING-DIRECTORY');
}
const source = dirname(fileURLToPath(import.meta.url));
const target = resolve(destination);
mkdirSync(target, { recursive: true, mode: 0o700 });
for (const sub of ['html/.well-known/acme-challenge', 'lib', 'updates', 'trust', 'logs', 'ops']) {
  mkdirSync(join(target, sub), { recursive: true, mode: 0o755 });
}
for (const file of ['html/index.php', 'lib/manifest.php']) {
  copyFileSync(join(source, file), join(target, file));
}
for (const kind of ['site', 'tls']) {
  const template = readFileSync(join(source, 'apache', `${kind}.conf.in`), 'utf8');
  writeFileSync(join(target, 'ops', `${host}-${kind}.conf`),
    template.replaceAll('@@HOST@@', host).replaceAll('@@ROOT@@', siteRoot), { mode: 0o644 });
}
copyFileSync(join(source, 'README.md'), join(target, 'ops', 'README.md'));
copyFileSync(join(source, 'install.php'), join(target, 'ops', 'install.php'));
console.log(`Prepared ${target}; no server activation or signing key included.`);
