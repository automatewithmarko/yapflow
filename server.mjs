import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createServer } from 'node:http';

const port = Number(process.env.PORT || 3000);
const root = join(process.cwd(), 'dist');
const releaseRoot = join(process.cwd(), 'release-assets');
const release = JSON.parse(readFileSync(join(process.cwd(), 'release.json'), 'utf8'));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.dmg': 'application/x-apple-diskimage', '.exe': 'application/vnd.microsoft.portable-executable', '.gz': 'application/gzip', '.sig': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const publicUrl = (value, protocol, host) => /^https?:\/\//i.test(value) ? value : `${protocol}://${host}${value}`;

const isNewerVersion = (candidate, current) => {
  const parts = value => String(value).replace(/^v/, '').split('.').map(part => Number.parseInt(part, 10) || 0);
  const next = parts(candidate); const installed = parts(current);
  for (let index = 0; index < Math.max(next.length, installed.length); index += 1) {
    if ((next[index] || 0) !== (installed[index] || 0)) return (next[index] || 0) > (installed[index] || 0);
  }
  return false;
};

createServer((request, response) => {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
    response.writeHead(405, { 'content-type': 'application/json', allow: 'GET, HEAD' });
    response.end(JSON.stringify({ error: 'This service is read-only.' }));
    return;
  }
  const host = request.headers['x-forwarded-host'] || request.headers.host || 'localhost';
  const protocol = request.headers['x-forwarded-proto'] || 'https';
  const rawPath = decodeURIComponent((request.url || '/').split('?')[0]);
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, version: release.version }));
    return;
  }
  if (request.url === '/api/releases/latest') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
    response.end(JSON.stringify({ ...release, downloads: Object.fromEntries(Object.entries(release.downloads).map(([platform, path]) => [platform, publicUrl(path, protocol, host)])) }));
    return;
  }
  const updaterRequest = rawPath.match(/^\/api\/updater\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (updaterRequest) {
    const [, target, arch, currentVersion] = updaterRequest;
    const assetPath = release.updater?.[`${target}-${arch}`];
    if (!assetPath || !isNewerVersion(release.version, currentVersion)) {
      response.writeHead(204, { 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      response.end();
      return;
    }
    const assetName = new URL(assetPath, `${protocol}://${host}`).pathname.split('/').pop();
    const asset = normalize(join(releaseRoot, assetName));
    const signature = `${asset}.sig`;
    const remotelyHosted = /^https?:\/\//i.test(assetPath);
    if (!asset.startsWith(releaseRoot) || !existsSync(signature) || (!remotelyHosted && !existsSync(asset))) {
      response.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      response.end(JSON.stringify({ error: 'The signed update artifact is not ready.' }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
    response.end(JSON.stringify({
      version: release.version,
      notes: release.notes,
      pub_date: release.pub_date,
      url: publicUrl(assetPath, protocol, host),
      signature: readFileSync(signature, 'utf8').trim()
    }));
    return;
  }
  if (rawPath.startsWith('/downloads/')) {
    const asset = normalize(join(releaseRoot, rawPath.slice('/downloads/'.length)));
    if (!asset.startsWith(releaseRoot) || !existsSync(asset) || !statSync(asset).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('This YapFlow installer has not been published yet.');
      return;
    }
    response.writeHead(200, { 'content-type': types[extname(asset)] || 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable' });
    if (request.method === 'HEAD') response.end();
    else createReadStream(asset).pipe(response);
    return;
  }
  const relative = rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '');
  const requested = normalize(join(root, relative));
  const file = requested.startsWith(root) && existsSync(requested) && statSync(requested).isFile() ? requested : join(root, 'index.html');
  response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable' });
  if (request.method === 'HEAD') response.end();
  else createReadStream(file).pipe(response);
}).listen(port, '0.0.0.0', () => console.log(`YapFlow web running on ${port}`));
