import crypto from 'node:crypto';
import { fail } from './catalogue.mjs';

export function storageConfigured(env) {
  try {
    const url = new URL(env.IMAGE_UPLOAD_URL);
    return env.IMAGE_STORE_CONFIRMED === 'true' && !!env.IMAGE_UPLOAD_TOKEN && url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/upload' && !url.search && !url.hash;
  } catch { return false; }
}

export async function uploadIcon(bytes, env, request = fetch) {
  if (!storageConfigured(env)) fail(503, 'Image-store integration has not been confirmed.');
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/png' }), crypto.createHash('sha256').update(bytes).digest('hex') + '.png');
  // The bot follows a redirect. Handle it explicitly so the upload credential
  // is never forwarded to the public image host or another origin.
  const response = await request(env.IMAGE_UPLOAD_URL, { method: 'POST', headers: { Authorization: env.IMAGE_UPLOAD_TOKEN },
    body: form, redirect: 'manual', signal: AbortSignal.timeout(20000) });
  if (![301, 302, 303, 307, 308].includes(response.status)) fail(502, 'Image store did not return the confirmed redirect contract.');
  const url = new URL(response.headers.get('location') || '', env.IMAGE_UPLOAD_URL);
  if (url.origin !== 'https://img.pvme.io' || !/^\/images\/[A-Za-z0-9_-]+\.png$/.test(url.pathname) || url.search || url.hash) fail(502, 'Image store returned an unexpected public URL.');
  const image = await request(url.href, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!image.ok || image.headers.get('content-type')?.split(';')[0] !== 'image/png') fail(502, 'Uploaded PNG is not publicly available.');
  const reader = image.body.getReader(), parts = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 65536) fail(502, 'Image-store response is too large.');
      parts.push(value);
    }
  } finally { await reader.cancel(); }
  if (!Buffer.concat(parts).equals(bytes)) fail(502, 'Public image bytes differ from the submitted PNG.');
  return url.pathname.split('/').at(-1);
}
