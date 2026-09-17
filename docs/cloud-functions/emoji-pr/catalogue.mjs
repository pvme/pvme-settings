import { PNG } from 'pngjs';
import { parseTree, findNodeAtLocation } from 'jsonc-parser';

export function fail(status, message) { throw Object.assign(new Error(message), { status }); }
export const normal = value => value.normalize('NFKC').trim().toLowerCase();
export const MAX_BODY = 900_000;

export function decodeIcon(value) {
  if (typeof value !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) fail(400, 'Each icon must be a PNG data URL.');
  const bytes = Buffer.from(value.slice(22), 'base64');
  if (bytes.length > 65536 || bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      bytes.readUInt32BE(16) !== 38 || bytes.readUInt32BE(20) !== 34) fail(400, 'Icons must be 38×34 PNGs, at most 64 KiB.');
  let png;
  try { png = PNG.sync.read(bytes, { checkCRC: true }); } catch { fail(400, 'Invalid PNG data.'); }
  let visible = 0, transparent = 0;
  for (let i = 3; i < png.data.length; i += 4) { if (png.data[i]) visible++; if (png.data[i] === 0) transparent++; }
  if (!visible || !transparent) fail(400, 'An icon must contain visible artwork and a transparent background.');
  // Re-encoding strips ancillary metadata and any bytes after the image.
  return PNG.sync.write(png);
}

export function validateBatch(items, catalogue) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 10) fail(400, 'Select between 1 and 10 icons.');
  const ids = new Set(), names = new Set();
  for (const category of catalogue.categories) for (const icon of category.emojis) {
    names.add(normal(icon.name));
    for (const id of [icon.id, ...(icon.id_aliases || [])]) ids.add(normal(id));
  }
  const categories = new Set(catalogue.categories.map(c => c.name));
  return items.map(item => {
    if (!item || typeof item !== 'object' || Object.keys(item).some(key => !['category', 'name', 'id', 'id_aliases', 'preset_type', 'preset_slot', 'png'].includes(key))) fail(400, 'Unexpected icon fields.');
    if (typeof item.name !== 'string' || item.name.trim().length < 1 || item.name.length > 100 || /[\x00-\x1f\x7f]/.test(item.name)) fail(400, 'Enter a name of 1–100 characters.');
    if (!categories.has(item.category)) fail(400, 'Choose an existing category.');
    if (!Array.isArray(item.id_aliases) || item.id_aliases.length > 10) fail(400, 'Use at most 10 aliases.');
    for (const id of [item.id, ...item.id_aliases]) {
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,63}$/.test(id)) fail(400, 'IDs and aliases must be 1–64 letters, digits, underscores or hyphens.');
      if (ids.has(normal(id))) fail(409, `ID or alias already exists: ${id}`);
      ids.add(normal(id));
    }
    if (names.has(normal(item.name))) fail(409, `Name already exists: ${item.name.trim()}`);
    names.add(normal(item.name));
    const hasType = item.preset_type !== undefined, hasSlot = item.preset_slot !== undefined;
    if (hasType && !['item', 'relic', 'familiar'].includes(item.preset_type)) fail(400, 'Preset type is invalid.');
    if (item.preset_type !== 'item' && hasSlot) fail(400, 'Preset slots are only used for worn items.');
    if (hasSlot && (!Number.isInteger(item.preset_slot) || item.preset_slot < 1 || item.preset_slot > 13)) fail(400, 'Worn item slot must be 1–13.');
    return { ...item, name: item.name.trim(), bytes: decodeIcon(item.png) };
  });
}

export function appendEntries(text, items, filenames) {
  const catalogue = JSON.parse(text);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const tree = parseTree(text), edits = [];
  for (let index = 0; index < catalogue.categories.length; index++) {
    const entries = items.flatMap((item, i) => {
      if (item.category !== catalogue.categories[index].name) return [];
      if (!/^[A-Za-z0-9_-]+\.png$/.test(filenames[i])) fail(502, 'Image store returned an invalid filename.');
      const entry = { name: item.name, id: item.id, image: filenames[i] };
      if (item.preset_type !== undefined) entry.preset_type = item.preset_type;
      if (item.preset_slot !== undefined) entry.preset_slot = item.preset_slot;
      if (item.id_aliases.length) entry.id_aliases = item.id_aliases;
      return [JSON.stringify(entry, null, 2)];
    });
    if (!entries.length) continue;
    const node = findNodeAtLocation(tree, ['categories', index, 'emojis']);
    const last = node.children.at(-1);
    const lineIndent = offset => text.slice(text.lastIndexOf('\n', offset) + 1, offset).match(/^[\t ]*/)[0];
    const closingIndent = lineIndent(node.offset);
    const entryIndent = last ? lineIndent(last.offset) : closingIndent + '  ';
    const formatted = entries.map(entry => entry.split('\n').map(line => entryIndent + line).join(eol));
    edits.push({ offset: last ? last.offset + last.length : node.offset + 1,
      content: (last ? ',' : '') + eol + formatted.join(',' + eol) + (last ? '' : eol + closingIndent) });
  }
  for (const edit of edits.sort((a, b) => b.offset - a.offset)) text = text.slice(0, edit.offset) + edit.content + text.slice(edit.offset);
  JSON.parse(text);
  return text;
}
