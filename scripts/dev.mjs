import { watch } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from './build-site.mjs';
import { loadLocalContributionEndpoint } from './local-env.mjs';

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon' };
const reloadClient = `<script>new EventSource('/__dev_events').onmessage=()=>location.reload();</script>`;

export function withLiveReload(html) {
  return html.replace('</body>', `${reloadClient}</body>`);
}

function safeDestination(root, pathname) {
  const target = path.resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  if (!target.startsWith(root + path.sep)) throw new Error('Outside site');
  return target;
}

async function currentManifestPath(destination) {
  const html = await readFile(path.join(destination, 'index.html'), 'utf8');
  const match = html.match(/window\.__PVME_ASSET_MANIFEST__\s*=\s*"(assets\/site-manifest\.[a-f0-9]+\.json)"/);
  if (!match) throw new Error('Build the site before syncing source files.');
  return match[1];
}

async function syncDocsChange(root, relativePath) {
  const docs = path.join(root, 'docs'), destination = path.join(root, 'dist');
  const source = path.join(docs, relativePath), target = path.join(destination, relativePath);
  if (relativePath === 'index.html') {
    const [html, manifestPath] = await Promise.all([readFile(source, 'utf8'), currentManifestPath(destination)]);
    await writeFile(target, html
      .replace('__PVME_ASSET_MANIFEST_PATH__', manifestPath)
      .replace('__PVME_CONTRIBUTION_ENDPOINT_JSON__', JSON.stringify(process.env.CONTRIBUTION_ENDPOINT || '')));
    return;
  }
  try {
    const details = await stat(source);
    if (!details.isFile()) return;
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  } catch (error) {
    if (error.code === 'ENOENT') await rm(target, { force: true });
    else throw error;
  }
}

export function createDevServer({ root = scriptRoot, host = '127.0.0.1' } = {}) {
  const destination = path.join(root, 'dist');
  const clients = new Set();
  const server = http.createServer(async (req, res) => {
    if (new URL(req.url, 'http://localhost').pathname === '/__dev_events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
    }
    try {
      const url = new URL(req.url, 'http://localhost');
      const target = safeDestination(destination, url.pathname);
      const extension = path.extname(target);
      res.setHeader('Content-Type', mime[extension] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      const body = await readFile(target, extension === '.html' ? 'utf8' : undefined);
      res.end(extension === '.html' ? withLiveReload(body) : body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  return { server, host, reload: () => clients.forEach(client => client.write('data: reload\n\n')) };
}

export function watchForChanges({ root = scriptRoot, reload, log = console.log } = {}) {
  const docs = path.join(root, 'docs'), catalogue = path.join(root, 'emojis', 'emojis_v2.json'), generator = path.join(root, 'scripts', 'recognition-generator.mjs');
  let timer, rebuilding = false, pending = false;
  const queue = task => { clearTimeout(timer); timer = setTimeout(async () => {
    if (rebuilding) { pending = true; return; }
    rebuilding = true;
    try { await task(); reload(); }
    catch (error) { log(`Local rebuild failed: ${error.message}`); }
    finally { rebuilding = false; if (pending) { pending = false; queue(task); } }
  }, 100); };
  const fullBuild = () => queue(async () => { await buildSite({ root }); log('Rebuilt generated catalogue and matching assets.'); });
  const docsWatcher = watch(docs, { recursive: true }, (_event, filename) => {
    if (!filename || filename.includes('assets') || filename.includes('node_modules')) return;
    queue(async () => { await syncDocsChange(root, filename.toString()); log(`Updated ${filename}.`); });
  });
  const catalogueWatcher = watch(catalogue, fullBuild);
  const generatorWatcher = watch(generator, fullBuild);
  return () => { clearTimeout(timer); docsWatcher.close(); catalogueWatcher.close(); generatorWatcher.close(); };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await loadLocalContributionEndpoint(scriptRoot);
  const preview = createDevServer();
  preview.server.listen(8787, preview.host, () => console.log(`Local site: http://127.0.0.1:8787 (live reload; ${process.env.CONTRIBUTION_ENDPOINT ? 'staging submission enabled' : 'no submission endpoint configured'})`));
  watchForChanges({ reload: preview.reload });
}
