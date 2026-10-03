// Refuse to silently produce another hash-identified local Mac bundle. Such a
// build invalidates permission grants each time it replaces the installed app.
const targetPlatform = process.env.TAURI_ENV_PLATFORM;
const buildingForMac = targetPlatform
  ? targetPlatform === 'darwin' || targetPlatform === 'macos'
  : process.platform === 'darwin';

if (buildingForMac
  && process.env.YAPFLOW_LOCAL_SIGNING !== '1'
  && (!process.env.APPLE_SIGNING_IDENTITY || process.env.APPLE_SIGNING_IDENTITY === '-')) {
  console.error('Use npm run desktop:build for a Mac build with the persistent YapFlow identity, or set APPLE_SIGNING_IDENTITY to an Apple-issued signing identity.');
  process.exit(1);
}
