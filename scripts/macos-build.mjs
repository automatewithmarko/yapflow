import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// A persistent, certificate-backed local identity makes consecutive development
// builds the same application to TCC. This is NOT a public distribution identity.
// Never use a bare identifier-only requirement or alter the TCC database.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const cargoBin = dirname(execFileSync('rustup', ['which', 'cargo'], { encoding: 'utf8' }).trim());
const updaterKey = join(homedir(), 'Library/Application Support/YapFlow Development/updater/yapflow.key');
if (!existsSync(updaterKey)) throw new Error('The persistent YapFlow updater signing key is missing. Restore it before publishing another update.');
const buildEnv = {
  ...process.env,
  PATH: `${cargoBin}:${process.env.PATH || ''}`,
  YAPFLOW_LOCAL_SIGNING: '1',
  TAURI_SIGNING_PRIVATE_KEY: updaterKey,
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ''
};
const signerEnv = {
  ...process.env,
  PATH: `${cargoBin}:${process.env.PATH || ''}`,
  TAURI_SIGNING_PRIVATE_KEY_PATH: updaterKey,
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ''
};
const run = (program, args, options = {}) => {
  try { return execFileSync(program, args, { cwd: root, stdio: 'pipe', ...options }); }
  catch (error) {
    // Never include subprocess arguments: keychain setup uses a local secret.
    throw new Error(`${program} failed (${error.status}): ${error.stderr?.toString() || 'see output above'}`);
  }
};
if (process.platform !== 'darwin') {
  run(process.execPath, [join(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'build'], { stdio: 'inherit' });
  process.exit(0);
}
const signing = join(homedir(), 'Library/Application Support/YapFlow Development/signing');
mkdirSync(signing, { recursive: true, mode: 0o700 });
const passwordFile = join(signing, 'keychain-password');
const keychain = join(signing, 'yapflow-development.keychain-db');
const key = join(signing, 'development.key');
const certificate = join(signing, 'development.crt');
const identity = 'YapFlow Local Development';
const openssl = existsSync('/opt/homebrew/bin/openssl') ? '/opt/homebrew/bin/openssl' : '/usr/bin/openssl';
if (!existsSync(passwordFile)) writeFileSync(passwordFile, randomBytes(32).toString('hex'), { mode: 0o600 });
const password = readFileSync(passwordFile, 'utf8').trim();
if (!existsSync(certificate)) {
  if (existsSync(key)) throw new Error('Signing key exists without its certificate; restore the original certificate instead of replacing the identity.');
  run(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', certificate,
    '-days', '3650', '-subj', `/CN=${identity}/O=YapFlow Local Development`,
    '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,digitalSignature,keyCertSign', '-addext', 'extendedKeyUsage=codeSigning']);
  chmodSync(key, 0o600);
}
if (!existsSync(keychain)) {
  run('/usr/bin/security', ['create-keychain', '-p', password, keychain]);
  const p12 = join(signing, 'development.p12');
  run(openssl, ['pkcs12', '-export', '-inkey', key, '-in', certificate, '-out', p12,
    '-passout', `file:${passwordFile}`, '-keypbe', 'PBE-SHA1-3DES', '-certpbe', 'PBE-SHA1-3DES', '-macalg', 'sha1']);
  chmodSync(p12, 0o600);
  run('/usr/bin/security', ['import', p12, '-k', keychain, '-P', password, '-T', '/usr/bin/codesign']);
}
run('/usr/bin/security', ['unlock-keychain', '-p', password, keychain]);
run('/usr/bin/security', ['set-keychain-settings', '-lut', '21600', keychain]);
run('/usr/bin/security', ['set-key-partition-list', '-S', 'apple-tool:,apple:', '-s', '-k', password, keychain]);

if (!process.argv.includes('--sign-only')) {
  run(join(root, 'node_modules/.bin/tauri'), ['build', '--bundles', 'app'], { stdio: 'inherit', env: buildEnv });
}
const app = process.argv.includes('--sign-only') ? resolve(process.argv.at(-1)) : join(root, 'src-tauri/target/release/bundle/macos/YapFlow.app');
// codesign requires the keychain to be on the search list even with --keychain.
// Restore the original list immediately; no trust settings are changed.
const previousKeychains = [...run('/usr/bin/security', ['list-keychains', '-d', 'user']).toString().matchAll(/"([^"]+)"/g)].map(match => match[1]);
try {
  run('/usr/bin/security', ['list-keychains', '-d', 'user', '-s', ...new Set([...previousKeychains, keychain])]);
  run('/usr/bin/codesign', ['--force', '--sign', identity, '--keychain', keychain, '--timestamp=none', '--identifier', 'app.yapflow.desktop', app], { stdio: 'inherit' });
} finally {
  run('/usr/bin/security', ['list-keychains', '-d', 'user', '-s', ...previousKeychains]);
}
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
const requirement = run('/usr/bin/codesign', ['-d', '-r-', app], { stdio: ['ignore', 'pipe', 'pipe'] });
// codesign writes the requirement to stdout and signing details to stderr.
const expectedFile = join(signing, 'designated-requirement.txt');
if (existsSync(expectedFile) && readFileSync(expectedFile, 'utf8') !== requirement.toString()) {
  throw new Error('Signing identity changed. Do not install a build that invalidates existing permission grants.');
}
if (!existsSync(expectedFile)) writeFileSync(expectedFile, requirement);
console.log('Verified persistent signing identity for app.yapflow.desktop.');
if (!process.argv.includes('--sign-only')) {
  // The app is signed after Tauri bundles it so macOS keeps a stable privacy
  // identity. Rebuild and sign the updater archive from that final app.
  const updaterName = `YapFlow_${version}_${process.arch === 'arm64' ? 'aarch64' : 'x64'}.app.tar.gz`;
  const updaterPath = join(dirname(app), updaterName);
  run('/usr/bin/tar', ['-czf', updaterPath, '-C', dirname(app), 'YapFlow.app']);
  run(join(root, 'node_modules/.bin/tauri'), ['signer', 'sign', '--app-version', version, updaterPath], { stdio: 'inherit', env: signerEnv });
  const staging = mkdtempSync(join(tmpdir(), 'yapflow-dmg-'));
  run('/usr/bin/ditto', [app, join(staging, 'YapFlow.app')]);
  symlinkSync('/Applications', join(staging, 'Applications'));
  const dmgDir = join(root, 'src-tauri/target/release/bundle/dmg');
  mkdirSync(dmgDir, { recursive: true });
  const fileName = `YapFlow_${version}_${process.arch === 'arm64' ? 'aarch64' : 'x64'}.dmg`;
  const dmgPath = join(dmgDir, fileName);
  run('/usr/bin/hdiutil', ['create', '-ov', '-format', 'UDZO', '-volname', 'YapFlow', '-srcfolder', staging,
    dmgPath], { stdio: 'inherit' });
  console.log(`Local-only Mac installer ready: ${dmgPath}`);
  console.log(`Local-only updater archive ready: ${updaterPath}`);
  console.log('These self-signed artifacts are not eligible for public distribution.');
}
