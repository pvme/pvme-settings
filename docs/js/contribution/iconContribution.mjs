export const MAX_ICONS = 28;

export function createPresetIconContribution(assetBase) {
  const kinds = ['ge', 'inventory', 'inventory-alt'];
  const canvas = (width, height) => Object.assign(document.createElement('canvas'), { width, height });
  const pixels = image => {
    const output = canvas(image.width, image.height);
    output.getContext('2d').drawImage(image, 0, 0);
    return output.getContext('2d').getImageData(0, 0, output.width, output.height);
  };
  const png = data => {
    const output = canvas(data.width, data.height);
    output.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.data), data.width, data.height), 0, 0);
    return output.toDataURL('image/png');
  };
  let templates;
  async function loadTemplates() {
    if (!templates) templates = Promise.all(kinds.map(async kind => {
      const images = await Promise.all(['border', 'background'].map(async suffix => {
        const image = new Image(); image.src = assetBase + '/' + kind + '-' + suffix + '.png';
        await image.decode(); return pixels(image);
      }));
      return { kind, border: images[0], background: images[1] };
    })).catch(error => { templates = null; throw error; });
    return templates;
  }
  // Native inventory backgrounds vary slightly in colour/texture. Keep the
  // frame geometry fixed; allow only small colour differences, plus a few
  // border pixels covered by artwork (as in the supplied inventory examples).
  function borderFits(source, x, y, border, tolerance, relaxed = false) {
    let mismatches = 0, total = 0;
    for (let p = 0; p < border.data.length; p += 4) {
      if (!border.data[p + 3]) continue;
      const q = ((y + Math.floor(p / 4 / 38)) * source.width + x + p / 4 % 38) * 4;
      if (source.data[q + 3] !== 255) return false;
      const delta = Math.max(Math.abs(source.data[q] - border.data[p]), Math.abs(source.data[q + 1] - border.data[p + 1]), Math.abs(source.data[q + 2] - border.data[p + 2]));
      total += delta;
      if (delta > tolerance) mismatches++;
      // Bank slots use the same geometry as inventory slots, but their lower
      // and side edges can be shaded differently. This relaxed pass only runs
      // on cells aligned to a grid confirmed by a strict slot match.
      if (mismatches > (tolerance ? (relaxed ? 110 : 5) : 0) || total > (tolerance ? (relaxed ? 5000 : 490) : 0)) return false;
    }
    return true;
  }
  function clean(slot, border, background, tolerance = 0, relaxed = false) {
    if (slot.width !== 38 || slot.height !== 34) return null;
    if (!borderFits(slot, 0, 0, border, tolerance, relaxed)) return null;
    const result = new Uint8ClampedArray(slot.data.length);
    let visible = 0;
    for (let p = 0; p < result.length; p += 4) {
      const same = image => slot.data[p + 3] === image.data[p + 3] && [0, 1, 2].every(c => Math.abs(slot.data[p + c] - image.data[p + c]) <= tolerance);
      const [r, g, b, a] = slot.data.subarray(p, p + 4);
      // Stack labels are item data. Preserve them along with the artwork;
      // only the slot frame and background go away. In particular, the yellow
      // pixels used by stack numbers are not a cleanup marker.
      if (same(background) || (tolerance && border.data[p + 3] && same(border))) continue;
      result.set(slot.data.subarray(p, p + 4), p);
      if (a) visible++;
    }
    return visible ? { width: 38, height: 34, data: result } : null;
  }
  function slotAt(source, x, y) {
    const slot = { width: 38, height: 34, data: new Uint8ClampedArray(38 * 34 * 4) };
    for (let row = 0; row < 34; row++) slot.data.set(source.data.subarray(((y + row) * source.width + x) * 4, ((y + row) * source.width + x + 38) * 4), row * 38 * 4);
    return slot;
  }
  function cleanBankCell(slot) {
    const colours = new Map();
    for (let pixel = 0; pixel < slot.data.length; pixel += 4) {
      const key = `${slot.data[pixel]},${slot.data[pixel + 1]},${slot.data[pixel + 2]}`;
      colours.set(key, (colours.get(key) || 0) + 1);
    }
    const background = [...colours].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
    const result = new Uint8ClampedArray(slot.data.length); let visible = 0;
    for (let pixel = 0; pixel < result.length; pixel += 4) {
      const difference = Math.max(...[0, 1, 2].map(channel => Math.abs(slot.data[pixel + channel] - background[channel])));
      if (difference <= 6) continue;
      result.set(slot.data.subarray(pixel, pixel + 4), pixel); visible++;
    }
    // An empty framed slot has 140 non-background border pixels. Bank icons
    // are intentionally required to exceed that so blank cells stay blank.
    return visible > 160 ? { width: 38, height: 34, data: result } : null;
  }
  function expandConfirmedBankGrid(source, found, signal) {
    if (found.length !== 1 || found.length >= MAX_ICONS) return found;
    // Bank cells have no per-item border after the first highlighted cell.
    // Their 44×44 pitch is distinct from the inventory/preset layout; do not
    // reuse its 41×36 spacing or every crop drifts farther from its icon.
    const seed = found[0], pitchX = 44, pitchY = 44;
    let startX = seed.x, startY = seed.y;
    while (startX - pitchX >= 0) startX -= pitchX;
    while (startY - pitchY >= 0) startY -= pitchY;
    const known = new Set(found.map(icon => `${icon.x},${icon.y}`));
    for (let y = startY; y <= source.height - 34 && found.length < MAX_ICONS; y += pitchY) {
      signal?.throwIfAborted();
      for (let x = startX; x <= source.width - 38 && found.length < MAX_ICONS; x += pitchX) {
        if (known.has(`${x},${y}`)) continue;
        const slot = slotAt(source, x, y);
        const icon = cleanBankCell(slot);
        if (icon) { found.push({ x, y, original: png(slot), icon: png(icon) }); known.add(`${x},${y}`); }
      }
    }
    return found.sort((a, b) => a.y - b.y || a.x - b.x);
  }
  async function extract(image, signal) {
    if (image.width > 2048 || image.height > 2048) throw new Error('Crop the bank, preset or inventory screenshot to at most 2048 pixels on each side.');
    const source = pixels(image), entries = await loadTemplates();
    for (const entry of entries) {
      const found = [];
      for (let y = 0; y <= source.height - 34; y++) {
        if (y % 24 === 0) { signal?.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 0)); }
        for (let x = 0; x <= source.width - 38; x++) {
          const exact = borderFits(source, x, y, entry.border, 0);
          if (!exact && !borderFits(source, x, y, entry.border, 8)) continue;
          const slot = slotAt(source, x, y);
          const icon = clean(slot, entry.border, entry.background, exact ? 0 : 8);
          if (icon) found.push({ x, y, original: png(slot), icon: png(icon) });
          if (found.length >= MAX_ICONS) break;
        }
        if (found.length >= MAX_ICONS) break;
      }
      if (found.length) return expandConfirmedBankGrid(source, found, signal);
    }
    throw new Error('No compatible bank, preset or inventory slots found. Use an original PNG at 100% interface scale with opaque backgrounds and full slot borders. Worn equipment is not supported.');
  }
  async function read(file, signal) {
    if (file.type !== 'image/png' || file.size > 6 * 1024 * 1024) throw new Error('Choose an original PNG smaller than 6 MB.');
    const url = URL.createObjectURL(file);
    try { const image = new Image(); image.src = url; await image.decode(); return await extract(image, signal); }
    finally { URL.revokeObjectURL(url); }
  }
  async function prepare(image, region, signal) {
    const icons = await extract(image, signal);
    const selected = region ? icons.findIndex(icon => {
      const overlap = Math.max(0, Math.min(icon.x + 38, region.x + region.w) - Math.max(icon.x, region.x)) *
        Math.max(0, Math.min(icon.y + 34, region.y + region.h) - Math.max(icon.y, region.y));
      return overlap / (region.w * region.h) >= .8 && overlap / (38 * 34) >= .5;
    }) : -1;
    return { icons, selected };
  }
  return { clean, extract, read, prepare };
}
