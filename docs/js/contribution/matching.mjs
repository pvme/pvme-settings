import { createPresetImageMatcher } from './iconMatcher.mjs';
export const matcher = createPresetImageMatcher();
const normalized = value => String(value).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');

export function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) next[j + 1] = Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (a[i] !== b[j]));
    row = next;
  }
  return row[b.length];
}

export function fuzzyMatches(terms, catalogue, limit = 5) {
  const queries = terms.map(normalized).filter(Boolean);
  if (!queries.length) return [];
  return catalogue.map(icon => ({ icon, score: Math.min(...queries.flatMap(query =>
    [icon.name, icon.id, ...(icon.id_aliases || [])].map(value => {
      const target = normalized(value);
      return target.includes(query) ? (target === query ? 0 : .1 + (target.length - query.length) / Math.max(1, target.length) * .2)
        : distance(query, target) / Math.max(query.length, target.length, 1);
    }))) })).filter(result => result.score < .65).sort((a, b) => a.score - b.score).slice(0, limit);
}

export async function loadAtlas(catalogue, { recognition, catalogueHash } = {}) {
  if (!recognition) throw new Error('The deployed recognition atlas is unavailable.');
  const response = await fetch(recognition);
  if (!response.ok) throw new Error('Visual index could not load. Name, ID and alias search still works.');
  const meta = await response.json();
  if (catalogueHash && meta.catalogueHash !== catalogueHash) throw new Error('The visual index belongs to a different catalogue snapshot.');
  const image = new Image(); image.src = new URL(meta.atlas, recognition); await image.decode();
  if (meta.version !== 2 || meta.size !== 24) throw new Error('Visual index has an unsupported format.');
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
  const ids = new Map();
  for (const icon of catalogue) for (const id of [icon.id, ...(icon.id_aliases || [])]) ids.set(id, icon.id);
  const entries = meta.records.flatMap((entry, i) => {
    if (!ids.has(entry.id)) return [];
    const data = ctx.getImageData(i % meta.columns * 24, Math.floor(i / meta.columns) * 24, 24, 24).data;
    const vector = new Uint8Array(24 * 24 * 3);
    for (let p = 0; p < 24 * 24; p++) vector.set(data.subarray(p * 4, p * 4 + 3), p * 3);
    return [{ ...entry, id: ids.get(entry.id), vector }];
  });
  return entries;
}

export async function visualMatches(png, entries) {
  const image = new Image(); image.src = png; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
  return matcher.suggest(matcher.queries(ctx.getImageData(0, 0, image.width, image.height)), entries, 5).candidates.filter(c => c.id);
}
