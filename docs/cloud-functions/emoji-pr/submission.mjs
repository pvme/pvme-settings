import crypto from 'node:crypto';
import { fail, validateBatch, appendEntries } from './catalogue.mjs';
import { REPO, BASE, PATH, latest } from './github.mjs';
import { validatePublicIcon } from './public-image.mjs';

export function validateEnvelope(body) {
  if (!body || Object.keys(body).some(k => !['contributor', 'items'].includes(k))) fail(400, 'Unexpected submission fields.');
  if (typeof body.contributor !== 'string' || body.contributor.trim().length < 2 || body.contributor.length > 80 || /[\x00-\x1f\x7f]/.test(body.contributor)) fail(400, 'Enter your Discord or GitHub username (2–80 characters).');
}

function safeMarkdown(value) {
  return value.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/([\\`*_{}\[\]()#+.!|@~-])/g, '\\$1');
}

export async function submitBatch(body, { github, request = fetch, target = { repo: REPO, base: BASE, path: PATH } }) {
  validateEnvelope(body);
  const source = await latest(github, target);
  const items = validateBatch(body.items, JSON.parse(source.text));
  await Promise.all(items.map(item => validatePublicIcon(item.image_url, request)));
  // Recheck against the latest catalogue after public image validation, then
  // commit from that immutable snapshot so unrelated edits are retained.
  const current = await latest(github, target);
  validateBatch(body.items, JSON.parse(current.text));
  const text = appendEntries(current.text, items);
  const branch = `icon-contributions/${crypto.randomUUID()}`;
  const tree = await github(`/repos/${target.repo}/git/trees`, { method: 'POST', body: { base_tree: current.tree,
    tree: [{ path: target.path, mode: '100644', type: 'blob', content: text }] } });
  const commit = await github(`/repos/${target.repo}/git/commits`, { method: 'POST', body: {
    message: `Add ${items.length} contributed icons`, tree: tree.sha, parents: [current.sha] } });
  await github(`/repos/${target.repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: commit.sha } });
  const pr = await github(`/repos/${target.repo}/pulls`, { method: 'POST', body: {
    title: `Add ${items.length} contributed icon${items.length === 1 ? '' : 's'}`,
    head: branch, base: target.base,
    body: `Contributor username (contributor-provided; not verified): **${safeMarkdown(body.contributor.trim())}**\n\n` +
      `Please review the artwork, metadata, and possible duplicates before merging.\n\n` +
      items.map(item => `- ${safeMarkdown(item.name)} — ${safeMarkdown(item.id)}`).join('\n') +
      '\n\nEach linked public PNG was validated. No source screenshot was submitted.'
  } });
  return { url: pr.html_url };
}
