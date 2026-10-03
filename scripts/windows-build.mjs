import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = execFileSync('node', ['-p', "require('./package.json').version"], { cwd: root, encoding: 'utf8' }).trim();
const cargoBin = dirname(execFileSync('rustup', ['which', 'cargo'], { encoding: 'utf8' }).trim());
const updaterKey = join(homedir(), 'Library', 'Application Support', 'YapFlow Development', 'updater', 'yapflow.key');
const pathEntries = [
  cargoBin,
  join(homedir(), '.cargo', 'bin'),
  '/opt/homebrew/opt/llvm/bin',
  '/opt/homebrew/opt/lld/bin',
  '/opt/homebrew/bin',
  process.env.PATH || ''
];
const env = {
  ...process.env,
  PATH: pathEntries.join(':'),
  CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || '2',
  TAURI_SIGNING_PRIVATE_KEY: updaterKey,
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ''
};

const args = ['tauri', 'build', '--config', 'src-tauri/tauri.windows.conf.json', '--bundles', 'nsis', '--ci'];
if (process.platform !== 'win32') {
  args.push('--runner', 'cargo-xwin', '--target', 'x86_64-pc-windows-msvc');
}

const result = spawnSync('npx', args, { cwd: root, env, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);

const bundleRoot = process.platform === 'win32'
  ? join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis')
  : join(root, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release', 'bundle', 'nsis');
const expectedInstaller = `YapFlow_${version}_x64-setup.exe`;
const installer = readdirSync(bundleRoot).find(file => file === expectedInstaller);
if (!installer) throw new Error(`No NSIS installer was created in ${bundleRoot}`);

const releaseRoot = join(root, 'release-assets');
mkdirSync(releaseRoot, { recursive: true });
const publishedName = `YapFlow_${version}_x64-setup.exe`;
copyFileSync(join(bundleRoot, installer), join(releaseRoot, publishedName));
copyFileSync(join(bundleRoot, `${installer}.sig`), join(releaseRoot, `${publishedName}.sig`));
console.log(`Windows installer ready: release-assets/${publishedName} (from ${basename(installer)})`);
