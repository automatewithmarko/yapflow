import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Public macOS releases must use an Apple-issued Developer ID identity and be
// accepted by Apple's notary service. Local/self-signed builds belong in
// macos-build.mjs and must never be copied into release-assets.
if (process.platform !== 'darwin') throw new Error('The notarized macOS release must be built on macOS.');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
const identity = process.env.APPLE_SIGNING_IDENTITY?.trim();
const notaryProfile = process.env.APPLE_NOTARY_PROFILE?.trim() || 'YapFlow';
const updaterKey = process.env.TAURI_SIGNING_PRIVATE_KEY || join(homedir(), 'Library/Application Support/YapFlow Development/updater/yapflow.key');
const distributionDirectory = join(homedir(), 'Library/Application Support/YapFlow Development/apple-distribution');
const distributionKeychain = join(distributionDirectory, 'yapflow-distribution.keychain-db');
const distributionPasswordFile = join(distributionDirectory, 'keychain-password');

const run = (program, args, options = {}) => {
  try {
    return execFileSync(program, args, { cwd: root, encoding: 'utf8', stdio: 'pipe', ...options });
  } catch (error) {
    const details = error.stderr?.toString().trim() || error.stdout?.toString().trim() || 'No diagnostic output.';
    throw new Error(`${program} failed: ${details}`);
  }
};

if (!identity?.startsWith('Developer ID Application:')) {
  throw new Error('Set APPLE_SIGNING_IDENTITY to an Apple-issued “Developer ID Application: …” identity. Self-signed identities cannot be notarized.');
}
const identities = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning']);
if (!identities.includes(identity)) throw new Error(`The requested Developer ID identity is not installed in the keychain: ${identity}`);
if (!existsSync(updaterKey)) throw new Error('The Tauri updater signing key is missing. Restore the existing key before publishing.');
// Authenticated read verifies the profile without exposing stored credentials.
run('/usr/bin/xcrun', ['notarytool', 'history', '--keychain-profile', notaryProfile]);

// CI-style shells do not necessarily inherit the unlocked keychain state from
// the user's graphical login session. Unlock the dedicated distribution
// keychain and authorize Apple's signing tools on every release build so
// codesign cannot stall on a hidden password prompt or fail with
// errSecInternalComponent. Arguments are never logged by this script.
if (existsSync(distributionKeychain) && existsSync(distributionPasswordFile)) {
  const distributionPassword = readFileSync(distributionPasswordFile, 'utf8').trim();
  run('/usr/bin/security', ['unlock-keychain', '-p', distributionPassword, distributionKeychain]);
  run('/usr/bin/security', ['set-keychain-settings', '-lut', '21600', distributionKeychain]);
  run('/usr/bin/security', ['set-key-partition-list', '-S', 'apple-tool:,apple:', '-s', '-k', distributionPassword, distributionKeychain]);
}

const cargoBin = dirname(run('rustup', ['which', 'cargo']).trim());
const buildEnv = {
  ...process.env,
  PATH: `${cargoBin}:${process.env.PATH || ''}`,
  APPLE_SIGNING_IDENTITY: identity,
  TAURI_SIGNING_PRIVATE_KEY: updaterKey,
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD || ''
};
run(join(root, 'node_modules/.bin/tauri'), ['build', '--bundles', 'app'], { env: buildEnv, stdio: 'inherit' });

const app = join(root, 'src-tauri/target/release/bundle/macos/YapFlow.app');
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
const signatureResult = spawnSync('/usr/bin/codesign', ['-dvv', app], { cwd: root, encoding: 'utf8' });
if (signatureResult.status !== 0) throw new Error(`Unable to inspect release signature: ${signatureResult.stderr.trim()}`);
const signature = `${signatureResult.stdout}\n${signatureResult.stderr}`;
if (!signature.includes('Authority=Developer ID Application:') || !signature.includes('Runtime Version=')) {
  throw new Error('Release app is missing its Developer ID signature or hardened runtime.');
}

const work = mkdtempSync(join(tmpdir(), 'yapflow-notary-'));
try {
  const appZip = join(work, `YapFlow-${version}.zip`);
  run('/usr/bin/ditto', ['-c', '-k', '--keepParent', app, appZip]);
  run('/usr/bin/xcrun', ['notarytool', 'submit', appZip, '--keychain-profile', notaryProfile, '--wait'], { stdio: 'inherit' });
  run('/usr/bin/xcrun', ['stapler', 'staple', '-v', app], { stdio: 'inherit' });
  run('/usr/bin/xcrun', ['stapler', 'validate', '-v', app], { stdio: 'inherit' });
  run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=2', app], { stdio: 'inherit' });

  const updaterName = `YapFlow_${version}_${arch}.app.tar.gz`;
  const updaterPath = join(work, updaterName);
  // macOS bsdtar otherwise serializes Finder/extended-attribute metadata as
  // AppleDouble entries such as `._YapFlow.app`. Tauri's updater correctly
  // rejects those synthetic root entries while unpacking. The notarization
  // ticket is part of the stapled bundle and does not require archive xattrs.
  run('/usr/bin/tar', ['--no-xattrs', '-czf', updaterPath, '-C', dirname(app), 'YapFlow.app'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' }
  });
  run(join(root, 'node_modules/.bin/tauri'), ['signer', 'sign', '--app-version', version, updaterPath], {
    env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY_PATH: updaterKey, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD || '' },
    stdio: 'inherit'
  });

  const dmgStage = join(work, 'dmg');
  mkdirSync(dmgStage);
  run('/usr/bin/ditto', [app, join(dmgStage, 'YapFlow.app')]);
  symlinkSync('/Applications', join(dmgStage, 'Applications'));
  const dmgName = `YapFlow_${version}_${arch}.dmg`;
  const dmgPath = join(work, dmgName);
  run('/usr/bin/hdiutil', ['create', '-ov', '-format', 'UDZO', '-volname', 'YapFlow', '-srcfolder', dmgStage, dmgPath], { stdio: 'inherit' });
  run('/usr/bin/codesign', ['--force', '--sign', identity, '--options', 'runtime', '--timestamp', dmgPath], { stdio: 'inherit' });
  run('/usr/bin/xcrun', ['notarytool', 'submit', dmgPath, '--keychain-profile', notaryProfile, '--wait'], { stdio: 'inherit' });
  run('/usr/bin/xcrun', ['stapler', 'staple', '-v', dmgPath], { stdio: 'inherit' });
  run('/usr/bin/xcrun', ['stapler', 'validate', '-v', dmgPath], { stdio: 'inherit' });
  run('/usr/sbin/spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', dmgPath], { stdio: 'inherit' });

  // Only Apple-accepted files enter the publish directory.
  const releaseDir = join(root, 'release-assets');
  mkdirSync(releaseDir, { recursive: true });
  copyFileSync(dmgPath, join(releaseDir, dmgName));
  copyFileSync(updaterPath, join(releaseDir, updaterName));
  copyFileSync(`${updaterPath}.sig`, join(releaseDir, `${updaterName}.sig`));
  console.log(`Notarized Mac installer ready: release-assets/${dmgName}`);
  console.log(`Notarized Mac updater ready: release-assets/${updaterName}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
