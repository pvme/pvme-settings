import { detectFramedCells, detectFramedBookCells, detectUnframedBankCells, slotBounds } from './slotGeometry.mjs';

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
  function trimTransparent(icon, padding = 1) {
    let left = icon.width, top = icon.height, right = -1, bottom = -1;
    for (let index = 0; index < icon.width * icon.height; index++) {
      if (!icon.data[index * 4 + 3]) continue;
      const x = index % icon.width, y = Math.floor(index / icon.width);
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    if (right < left) return icon;
    left = Math.max(0, left - padding); top = Math.max(0, top - padding);
    right = Math.min(icon.width - 1, right + padding); bottom = Math.min(icon.height - 1, bottom + padding);
    const width = right - left + 1, height = bottom - top + 1, data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) data.set(icon.data.subarray(((top + y) * icon.width + left) * 4, ((top + y) * icon.width + right + 1) * 4), y * width * 4);
    return { width, height, data };
  }
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
    // The template gives us the frame geometry, while the screenshot gives us
    // the background colour. Combining both lets an otherwise exact frame work
    // against a differently coloured (including dark) UI background.
    const connectedBackground = cleanConnectedBackground(slot);
    const result = new Uint8ClampedArray(slot.data.length);
    let visible = 0;
    for (let p = 0; p < result.length; p += 4) {
      const same = image => slot.data[p + 3] === image.data[p + 3] && [0, 1, 2].every(c => Math.abs(slot.data[p + c] - image.data[p + c]) <= tolerance);
      const [r, g, b, a] = slot.data.subarray(p, p + 4);
      // Stack labels are item data. Preserve them along with the artwork;
      // only the slot frame and background go away. In particular, the yellow
      // pixels used by stack numbers are not a cleanup marker.
      if (same(background) || (tolerance && border.data[p + 3] && same(border)) || !connectedBackground.data[p + 3]) continue;
      result.set(slot.data.subarray(p, p + 4), p);
      if (a) visible++;
    }
    return visible ? { width: 38, height: 34, data: result } : null;
  }
  function slotAt(source, x, y, width = 38, height = 34) {
    const slot = { width, height, data: new Uint8ClampedArray(width * height * 4) };
    for (let row = 0; row < height; row++) slot.data.set(source.data.subarray(((y + row) * source.width + x) * 4, ((y + row) * source.width + x + width) * 4), row * width * 4);
    return slot;
  }
  // Background colour is a property of the screenshot, not of a particular
  // UI. Sample the cell perimeter and remove only matching pixels connected to
  // it. This deliberately keeps dark artwork surrounded by other artwork.
  function cleanConnectedBackground(slot) {
    const perimeter = [];
    for (let y = 0; y < slot.height; y++) for (let x = 0; x < slot.width; x++) {
      // Sample just inside each corner, rather than the outer frame. Book
      // cells often have a dark frame enclosing a differently coloured slot
      // surface; the latter is what must become transparent.
      const inCorner = (x >= 2 && x < 7 || x >= slot.width - 7 && x < slot.width - 2) &&
        (y >= 2 && y < 7 || y >= slot.height - 7 && y < slot.height - 2);
      if (!inCorner) continue;
      const pixel = (y * slot.width + x) * 4;
      if (slot.data[pixel + 3]) perimeter.push([slot.data[pixel], slot.data[pixel + 1], slot.data[pixel + 2]]);
    }
    if (!perimeter.length) return null;
    const distance = (pixel, colour) => Math.max(...[0, 1, 2].map(channel => Math.abs(slot.data[pixel + channel] - colour[channel])));
    // An item can touch a cell edge. Its colours must not turn into a second
    // background palette, so use only the dominant, coarsely quantised edge
    // colour (normally the interface surface) as the flood-fill seed.
    const clusters = new Map();
    for (const colour of perimeter) {
      const key = colour.map(channel => Math.round(channel / 8)).join(',');
      const cluster = clusters.get(key) || { count: 0, total: [0, 0, 0], colours: [] };
      cluster.count++; cluster.colours.push(colour);
      for (let channel = 0; channel < 3; channel++) cluster.total[channel] += colour[channel];
      clusters.set(key, cluster);
    }
    const cluster = [...clusters.values()].sort((a, b) => b.count - a.count)[0];
    const backgroundColour = cluster.total.map(total => total / cluster.count);
    // UI textures normally vary by only a few values. Keep the threshold
    // bounded so a border or item cannot grow into the background mask.
    const variations = cluster.colours.map(colour => Math.max(...[0, 1, 2].map(channel => Math.abs(colour[channel] - backgroundColour[channel])))).sort((a, b) => a - b);
    const tolerance = Math.max(6, Math.min(14, (variations[Math.floor(variations.length * .9)] || 0) + 4));
    const matchesBackground = pixel => slot.data[pixel + 3] && distance(pixel, backgroundColour) <= tolerance;
    const background = new Uint8Array(slot.width * slot.height), queue = [];
    for (let y = 0; y < slot.height; y++) for (let x = 0; x < slot.width; x++) {
      const inCorner = (x >= 2 && x < 7 || x >= slot.width - 7 && x < slot.width - 2) &&
        (y >= 2 && y < 7 || y >= slot.height - 7 && y < slot.height - 2);
      if (!inCorner) continue;
      const index = y * slot.width + x, pixel = index * 4;
      if (matchesBackground(pixel)) { background[index] = 1; queue.push(index); }
    }
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor], x = index % slot.width, y = Math.floor(index / slot.width);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nextX = x + dx, nextY = y + dy;
        if (nextX < 0 || nextX >= slot.width || nextY < 0 || nextY >= slot.height) continue;
        const next = nextY * slot.width + nextX;
        if (!background[next] && matchesBackground(next * 4)) { background[next] = 1; queue.push(next); }
      }
    }
    const result = new Uint8ClampedArray(slot.data.length); let visible = 0;
    for (let index = 0; index < background.length; index++) {
      if (background[index]) continue;
      const pixel = index * 4; result.set(slot.data.subarray(pixel, pixel + 4), pixel); visible++;
    }
    // An empty framed slot has 140 non-background border pixels. Bank icons
    // are intentionally required to exceed that so blank cells stay blank.
    return { width: slot.width, height: slot.height, data: result, visible };
  }
  function roughIconMeasure(source, originX, originY, width, height) {
    let count = 0, sumX = 0, sumY = 0;
    // Sample only the cell interior: book frames are often bright, while the
    // empty cell itself is consistently dark. Artwork has either colour or a
    // noticeably higher luminance than that background.
    for (let y = 3; y < height - 3; y += 3) for (let x = 3; x < width - 3; x += 3) {
      const pixel = ((originY + y) * source.width + originX + x) * 4, r = source.data[pixel], g = source.data[pixel + 1], b = source.data[pixel + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) > 28 || Math.max(r, g, b) > 88) { count++; sumX += x; sumY += y; }
    }
    return { count, centerX: count ? sumX / count : width / 2, centerY: count ? sumY / count : height / 2 };
  }
  function removeSmallEdgeComponents(icon) {
    const total = icon.width * icon.height, seen = new Uint8Array(total), data = new Uint8ClampedArray(icon.data);
    for (let start = 0; start < total; start++) {
      if (seen[start] || !data[start * 4 + 3]) continue;
      const pixels = [start]; seen[start] = 1; let touchesEdge = false, minX = icon.width, maxX = -1, minY = icon.height, maxY = -1;
      for (let cursor = 0; cursor < pixels.length; cursor++) {
        const index = pixels[cursor], x = index % icon.width, y = Math.floor(index / icon.width);
        if (!x || !y || x === icon.width - 1 || y === icon.height - 1) touchesEdge = true;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
          const nextX = x + dx, nextY = y + dy, next = nextY * icon.width + nextX;
          if (nextX >= 0 && nextX < icon.width && nextY >= 0 && nextY < icon.height && !seen[next] && data[next * 4 + 3]) { seen[next] = 1; pixels.push(next); }
        }
      }
      // Remove isolated pinpricks wherever they occur, plus the thin
      // full-height UI divider seen at a cell edge. Larger detached regions
      // (including the icon's circular treatment) remain untouched.
      const thinDivider = (maxX - minX + 1 <= 3 && maxY - minY + 1 >= icon.height - 2) ||
        (maxY - minY + 1 <= 3 && maxX - minX + 1 >= icon.width - 2);
      if (pixels.length <= 8 || touchesEdge && thinDivider) for (const index of pixels) data[index * 4 + 3] = 0;
    }
    return { ...icon, data };
  }
  function scoreCells(cells, width, height) {
    const occupied = cells.filter(cell => cell.count >= 4);
    return { occupied, score: occupied.reduce((total, cell) => total + Math.min(cell.count, 14) + 12 -
      1.5 * (Math.abs(cell.centerX - width / 2) + Math.abs(cell.centerY - height / 2)), 0) };
  }
  function cleanFramedCells(source, cells, signal) {
    const found = [];
    for (const cell of cells.slice(0, MAX_ICONS)) {
      signal?.throwIfAborted();
      const slot = slotAt(source, cell.x, cell.y, cell.width, cell.height);
      const peers = cells.filter(other => other.width === cell.width && other.height === cell.height)
        .map(other => slotAt(source, other.x, other.y, other.width, other.height));
      // Compact list icons can reach every inner corner. Their repeated-cell
      // model is safer than learning a fill colour from the artwork itself.
      const textured = cell.width === 40 && cell.height === 40;
      const data = new Uint8ClampedArray(textured ? cleanConnectedBackground(slot).data : slot.data);
      const borderPalette = new Set();
      // Repeated frames provide an empty-surface model at each coordinate,
      // including bevels and the skill guide's nested blue/brown fill. Only
      // remove a dark pixel when a majority of independent cells agree there.
      for (let p = 0; p < data.length; p += 4) {
        if (Math.max(data[p], data[p + 1], data[p + 2]) > 140) continue;
        const matching = peers.filter(peer => [0, 1, 2].every(c => Math.abs(peer.data[p + c] - data[p + c]) <= (textured ? 6 : 0))).length;
        if (matching >= Math.max(3, Math.ceil(peers.length * .65))) {
          const x = p / 4 % cell.width, y = Math.floor(p / 4 / cell.width);
          if (!textured && (x < 5 || y < 5 || x >= cell.width - 5 || y >= cell.height - 5)) borderPalette.add(Array.from(data.subarray(p, p + 3)).join(','));
          data.fill(0, p, p + 4);
        }
      }
      // Flat list fills can show through enclosed gaps in the artwork. Their
      // exact palette is learned from repeated borders; near-colour shading
      // remains intact. No global dark-colour threshold is used here.
      if (!textured) for (let p = 0; p < data.length; p += 4) {
        if (borderPalette.has(Array.from(data.subarray(p, p + 3)).join(','))) data.fill(0, p, p + 4);
      }
      if (!data.some((value, i) => i % 4 === 3 && value)) continue;
      found.push({ ...cell, layout: 'framed', original: png(slot), icon: png(trimTransparent({ ...slot, data })) });
    }
    return found;
  }
  function cleanedGrid(source, cells, width, height, signal) {
    const found = [];
    for (const cell of cells) {
      signal?.throwIfAborted();
      const { x, y } = cell;
      if (x < 0 || y < 0 || x + width > source.width || y + height > source.height) continue;
      const slot = slotAt(source, x, y, width, height), icon = removeSmallEdgeComponents(cleanConnectedBackground(slot));
      if (icon.visible > slot.width * slot.height * .03) found.push({ x, y, width, height, layout: 'book', original: png(slot), icon: png(trimTransparent(icon)) });
      if (found.length >= MAX_ICONS) break;
    }
    return found.sort((a, b) => a.y - b.y || a.x - b.x);
  }
  async function extractBookGrid(source, signal) {
    // Prayer, spell and ability books use the same small, regular grid but not
    // the inventory frame. Locate its phase from the densest repeated artwork
    // pattern, then use connected-background cleanup for every occupied cell.
    if (source.width > 512 || source.height > 512) return [];
    let best = null;
    let phases = 0;
    // These are the native book-cell shapes. Do not combine every width with
    // every height: for example, treating a 42×40 prayer cell as 42×34 can
    // score highly by cutting one icon across two rows, but drifts visibly.
    for (const { pitchX, pitchY } of [
      { pitchX: 42, pitchY: 40 }, // prayer book
      { pitchX: 40, pitchY: 38 }, // ability book
      { pitchX: 44, pitchY: 42 }, // large-scale book UI
      { pitchX: 40, pitchY: 34 }, // spell book
      { pitchX: 38, pitchY: 36 }
    ]) {
      for (let startY = 0; startY < pitchY; startY++) for (let startX = 0; startX < pitchX; startX++) {
        if (++phases % 128 === 0) { signal?.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 0)); }
        const cells = [];
        for (let y = startY; y <= source.height - pitchY; y += pitchY) for (let x = startX; x <= source.width - pitchX; x += pitchX) {
          cells.push({ x, y, ...roughIconMeasure(source, x, y, pitchX, pitchY) });
        }
        if (cells.length < 6) continue;
        const { occupied, score } = scoreCells(cells, pitchX, pitchY);
        // A phase that is merely shifted down-left can still contain all the
        // same pixels. Prefer the phase whose artwork centroids sit near the
        // centres of their cells, which anchors the grid to its content.
        if (occupied.length >= 3 && (!best || score > best.score)) best = { score, occupied, pitchX, pitchY };
      }
    }
    if (!best) return [];
    return cleanedGrid(source, best.occupied, best.pitchX, best.pitchY, signal);
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
          if (icon) found.push({ x, y, width: 38, height: 34, layout: entry.kind, original: png(slot), icon: png(trimTransparent(icon)) });
          if (found.length >= MAX_ICONS) break;
        }
        if (found.length >= MAX_ICONS) break;
      }
      if (found.length) return found;
    }
    const framedCells = await detectFramedCells(source, signal);
    const firstFrame = framedCells[0];
    const uniformFrames = firstFrame && framedCells.every(cell => cell.width === firstFrame.width && cell.height === firstFrame.height);
    const framedList = uniformFrames && framedCells.every(cell => cell.x === firstFrame.x);
    const toolbeltFrames = uniformFrames && firstFrame.width === 40 && firstFrame.height === 40;
    if (framedList || toolbeltFrames) return cleanFramedCells(source, framedCells, signal);
    const bookFrames = await detectFramedBookCells(source, framedCells, signal);
    if (bookFrames.length) return bookFrames.slice(0, MAX_ICONS).map(cell => {
      const slot = slotAt(source, cell.x, cell.y, cell.width, cell.height);
      // The enclosing bevel belongs to the UI; the rectangular artwork and
      // its background inside the frame belong to the icon.
      const data = new Uint8ClampedArray(slot.data);
      for (let y = 0; y < slot.height; y++) for (let x = 0; x < slot.width; x++) {
        if (x === 0 || y === 0 || x === slot.width - 1 || y === slot.height - 1) data.fill(0, (y * slot.width + x) * 4, (y * slot.width + x + 1) * 4);
      }
      return { ...cell, layout: 'framed-book', original: png(slot), icon: png(trimTransparent({ ...slot, data })) };
    });
    const bankCells = detectUnframedBankCells(source);
    if (bankCells.length) return bankCells.slice(0, MAX_ICONS).map(cell => {
      const slot = slotAt(source, cell.x, cell.y, cell.width, cell.height);
      return { ...cell, layout: 'bank', original: png(slot), icon: png(trimTransparent(cleanConnectedBackground(slot))) };
    });
    const bookIcons = await extractBookGrid(source, signal);
    if (bookIcons.length) return bookIcons;
    throw new Error('No compatible bank, preset, inventory, prayer, spell or ability-book slots found. Use an original PNG at 100% interface scale with opaque backgrounds and full slot borders. Worn equipment is not supported.');
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
      const { width, height } = slotBounds(icon);
      const overlap = Math.max(0, Math.min(icon.x + width, region.x + region.w) - Math.max(icon.x, region.x)) *
        Math.max(0, Math.min(icon.y + height, region.y + region.h) - Math.max(icon.y, region.y));
      return overlap / (region.w * region.h) >= .8 && overlap / (width * height) >= .5;
    }) : -1;
    return { icons, selected };
  }
  return { clean, extract, read, prepare };
}
