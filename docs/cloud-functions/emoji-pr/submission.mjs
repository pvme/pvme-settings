import crypto from 'node:crypto';
import { fail, validateBatch, appendEntries } from './catalogue.mjs';
import { REPO, BASE, PATH, latest } from './github.mjs';

export function validateEnvelope(body) {
  if (!body || Object.keys(body).some(k => !['contributor', 'items'].includes(k))) fail(400, 'Unexpected submission fields.');
  if (typeof body.contributor !== 'string' || body.contributor.trim().length < 2 || body.contributor.length > 80 || /[\x00-\x1f\x7f]/.test(body.contributor)) fail(400, 'Enter your Discord or GitHub username (2–80 characters).');
}

function safeMarkdown(value) {
  return value.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/([\\`*_{}\[\]()#+.!|@~-])/g, '\\$1');
}

export async function submitBatch(body, { github, upload }) {
  validateEnvelope(body);
  const source = await latest(github);
  const items = validateBatch(body.items, JSON.parse(source.text));
  const filenames = [];
  for (const item of items) filenames.push(await upload(item.bytes));
  // Recheck against the latest catalogue after uploading, then commit from
  // that immutable snapshot so unrelated edits and formatting are retained.
  const current = await latest(github);
  validateBatch(body.items, JSON.parse(current.text));
  const text = appendEntries(current.text, items, filenames);
  const branch = `icon-contributions/${crypto.randomUUID()}`;
  const tree = await github(`/repos/${REPO}/git/trees`, { method: 'POST', body: { base_tree: current.tree,
    tree: [{ path: PATH, mode: '100644', type: 'blob', content: text }] } });
  const commit = await github(`/repos/${REPO}/git/commits`, { method: 'POST', body: {
    message: `Add ${items.length} contributed icons`, tree: tree.sha, parents: [current.sha] } });
  await github(`/repos/${REPO}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: commit.sha } });
  const pr = await github(`/repos/${REPO}/pulls`, { method: 'POST', body: {
    title: `Add ${items.length} contributed icon${items.length === 1 ? '' : 's'}`,
    head: branch, base: BASE,
    body: `Contributor username (contributor-provided; not verified): **${safeMarkdown(body.contributor.trim())}**\n\n` +
      `Please review the artwork, metadata, and possible duplicates before merging.\n\n` +
      items.map(item => `- ${safeMarkdown(item.name)} — ${safeMarkdown(item.id)}`).join('\n') +
      '\n\nOnly selected transparent PNGs were uploaded to the PVME image store. No source screenshot was submitted.'
  } });
  return { url: pr.html_url };
}
