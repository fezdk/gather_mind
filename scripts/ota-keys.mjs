import { mkdirSync, existsSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const [directory, certificate] = process.argv.slice(2);
if (!directory || !certificate) throw new Error('Usage: node scripts/ota-keys.mjs PRIVATE-DIRECTORY PUBLIC-CERTIFICATE');
const keyDir = resolve(directory);
mkdirSync(keyDir, { recursive: true, mode: 0o700 });
const repo = realpathSync(new URL('..', import.meta.url).pathname);
if (realpathSync(keyDir).startsWith(repo + '/') || realpathSync(keyDir) === repo) throw new Error('Private keys must live outside the checkout');
const keyPath = resolve(keyDir, 'private-key.pem');
if (existsSync(keyPath) || existsSync(certificate)) throw new Error('Refusing to replace an existing key/certificate');
mkdirSync(dirname(resolve(certificate)), { recursive: true });
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
execFileSync('openssl', ['req', '-new', '-x509', '-key', keyPath, '-sha256', '-days', '3650',
  '-addext', 'keyUsage=critical,digitalSignature', '-addext', 'extendedKeyUsage=codeSigning',
  '-addext', 'basicConstraints=critical,CA:FALSE',
  '-subj', '/CN=Gather Mind OTA', '-out', resolve(certificate)], { stdio: ['ignore', 'pipe', 'pipe'] });
console.log('Created private key outside the checkout and public certificate. Back up the private key securely.');
