import { decodeIconBytes, fail, imageFilename } from './catalogue.mjs';

export async function validatePublicIcon(value, request = fetch) {
  const filename = imageFilename(value);
  let response;
  try { response = await request(value, { redirect: 'error', signal: AbortSignal.timeout(15000) }); }
  catch { fail(422, 'The public icon URL could not be read. Check that the bot upload has finished and the link opens in a browser.'); }
  // The image host may omit or vary Content-Type for a bot upload. The PNG
  // signature and strict decode below are the authoritative validation.
  if (!response.ok) fail(422, 'The public icon URL did not return an image. Check that the bot upload has finished.');
  const reader = response.body?.getReader();
  if (!reader) fail(422, 'The public icon could not be read.');
  const parts = []; let length = 0;
  try {
    while (true) {
      const { done, value: chunk } = await reader.read(); if (done) break;
      length += chunk.length;
      if (length > 65536) fail(422, 'The public icon PNG is too large. Use a PNG smaller than 64 KiB.');
      parts.push(chunk);
    }
  } finally { await reader.cancel(); }
  decodeIconBytes(Buffer.concat(parts), 422);
  return filename;
}
