// All rectangles are in source-image pixels, independent of the PNG's later
// transparent-bounds trim. The overlay and crop selection share this contract.
export const slotBounds = slot => ({ x: slot.x, y: slot.y, width: slot.width ?? 38, height: slot.height ?? 34 });

const difference = (a, b) => Math.max(...a.map((value, channel) => Math.abs(value - b[channel])));
const rgb = (source, x, y) => {
  const p = (y * source.width + x) * 4;
  return [source.data[p], source.data[p + 1], source.data[p + 2]];
};

function edgeScore(source, x, y, dx, dy, length) {
  const samples = [];
  for (let i = 3; i < length - 3; i++) samples.push(rgb(source, x + dx * i, y + dy * i));
  const median = [0, 1, 2].map(c => samples.map(pixel => pixel[c]).sort((a, b) => a - b)[Math.floor(samples.length / 2)]);
  return samples.filter(pixel => difference(pixel, median) <= 5).length / samples.length;
}

function frameContrast(source, x, y, width, height) {
  // Uniform image background also makes four uniform lines. Require a real
  // boundary on each side, comparing the line with pixels on either side.
  const sides = [
    [x, y, 1, 0, width, 0, 1], [x, y + height - 1, 1, 0, width, 0, 1],
    [x, y, 0, 1, height, 1, 0], [x + width - 1, y, 0, 1, height, 1, 0]
  ];
  const scores = sides.map(([sx, sy, dx, dy, length, nx, ny]) => {
    let count = 0, total = 0, strength = 0;
    for (let i = 4; i < length - 4; i += 2) {
      const px = sx + dx * i, py = sy + dy * i, colour = rgb(source, px, py);
      const contrasts = [-1, 1].filter(direction => px + nx * direction >= 0 && px + nx * direction < source.width && py + ny * direction >= 0 && py + ny * direction < source.height)
        .map(direction => {
          const neighbour = rgb(source, px + nx * direction, py + ny * direction);
          return Math.max(...colour.map((value, c) => value - neighbour[c]));
        });
      const contrast = Math.max(0, ...contrasts);
      if (contrast >= 4) count++;
      strength += contrast;
      total++;
    }
    return { ratio: count / total, strength: strength / total };
  });
  return { ratio: Math.min(...scores.map(score => score.ratio)), strength: Math.min(...scores.map(score => score.strength)) };
}

export async function detectFramedCells(source, signal) {
  const candidates = [];
  for (let y = 0; y <= source.height - 30; y++) {
    if (y % 24 === 0) { signal?.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 0)); }
    // Long horizontal runs supply candidates. Artwork centroids and screenshot
    // aspect ratios do not determine a framed cell's origin or spacing.
    for (let start = 0; start < source.width;) {
      const colour = rgb(source, start, y);
      let end = start + 1;
      while (end < source.width && difference(rgb(source, end, y), colour) <= 4) end++;
      const length = end - start;
      if (length >= 26 && length <= 44) {
        for (let inset = 0; inset <= 3; inset++) {
          const x = start - inset;
          for (let width = Math.max(30, length + inset); width <= Math.min(44, length + inset + 3); width++) {
            for (let height = width - 2; height <= width + 2; height++) {
              if (x < 0 || x + width > source.width || y + height > source.height) continue;
              const edges = [edgeScore(source, x, y, 1, 0, width), edgeScore(source, x, y + height - 1, 1, 0, width),
                edgeScore(source, x, y, 0, 1, height), edgeScore(source, x + width - 1, y, 0, 1, height)];
              if (Math.min(...edges) < .85) continue;
              const contrast = frameContrast(source, x, y, width, height);
              if (contrast.ratio < .65) continue;
              candidates.push({ x, y, width, height, strength: contrast.strength });
            }
          }
        }
      }
      start = end;
    }
  }
  // Parallel bevel lines can describe the same frame. Keep the strongest
  // complete boundary; then require repeated frames in a row or column.
  candidates.sort((a, b) => b.strength - a.strength || b.width - a.width || a.y - b.y || a.x - b.x);
  const distinct = [];
  for (const cell of candidates) {
    if (!distinct.some(other => Math.abs(other.x - cell.x) < 8 && Math.abs(other.y - cell.y) < 8)) distinct.push(cell);
  }
  const repeated = distinct.filter(cell => distinct.filter(other => other !== cell && Math.abs(other.width - cell.width) <= 1 &&
    (Math.abs(other.x - cell.x) <= 1 || Math.abs(other.y - cell.y) <= 1)).length >= 2)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  // Artwork can cover part of a frame. Only bridge a missing cell when two
  // visible neighbours establish its position and its remaining edges agree.
  for (const a of [...repeated]) for (const b of [...repeated]) {
    if (a.x !== b.x || a.width !== b.width || a.height !== b.height) continue;
    const gap = b.y - a.y;
    if (gap < a.height * 2 || gap > (a.height + 16) * 2 || gap % 2) continue;
    const y = a.y + gap / 2;
    if (repeated.some(cell => Math.abs(cell.x - a.x) < 5 && Math.abs(cell.y - y) < 5)) continue;
    const edges = [edgeScore(source, a.x, y, 1, 0, a.width), edgeScore(source, a.x, y + a.height - 1, 1, 0, a.width),
      edgeScore(source, a.x, y, 0, 1, a.height), edgeScore(source, a.x + a.width - 1, y, 0, 1, a.height)];
    if (edges.filter(score => score >= .85).length >= 2 && edges.reduce((sum, score) => sum + score, 0) >= 3)
      repeated.push({ ...a, y });
  }
  return repeated.sort((a, b) => a.y - b.y || a.x - b.x).map(({ strength, ...cell }) => cell);
}

export async function detectFramedBookCells(source, frames, signal) {
  const size = 32;
  const anchors = frames.filter(cell => cell.width === size && cell.height === size);
  if (anchors.length < 3 || new Set(anchors.map(cell => cell.x)).size < 2 || new Set(anchors.map(cell => cell.y)).size < 2) return [];
  // Learn the bevel from already confirmed frames. Only the one-pixel frame
  // participates in matching: filled ability artwork is not a background cue.
  const border = [];
  for (let i = 2; i < size - 2; i++) for (const [x, y] of [[i, 0], [i, size - 1], [0, i], [size - 1, i]]) {
    const colours = anchors.map(cell => rgb(source, cell.x + x, cell.y + y));
    const colour = [0, 1, 2].map(c => colours.map(value => value[c]).sort((a, b) => a - b)[Math.floor(colours.length / 2)]);
    border.push({ x, y, colour });
  }
  const candidates = anchors.map(cell => ({ ...cell, score: 0 }));
  for (let y = 0; y <= source.height - size; y++) {
    if (y % 24 === 0) { signal?.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 0)); }
    for (let x = 0; x <= source.width - size; x++) {
      let mismatches = 0, score = 0;
      for (const pixel of border) {
        const delta = difference(rgb(source, x + pixel.x, y + pixel.y), pixel.colour);
        score += Math.min(delta, 30);
        if (delta > 8) mismatches++;
        if (mismatches > border.length * .15) break;
      }
      if (mismatches <= border.length * .15) candidates.push({ x, y, width: size, height: size, score });
    }
  }
  const found = [];
  for (const cell of candidates.sort((a, b) => a.score - b.score)) {
    if (!found.some(other => Math.abs(other.x - cell.x) < size / 2 && Math.abs(other.y - cell.y) < size / 2)) found.push(cell);
  }
  return found.sort((a, b) => a.y - b.y || a.x - b.x).map(({ score, ...cell }) => cell);
}

function bands(values, maxGap) {
  const result = [];
  for (let i = 0; i < values.length; i++) {
    if (!values[i]) continue;
    const last = result.at(-1);
    if (last && i - last.end - 1 <= maxGap) last.end = i;
    else result.push({ start: i, end: i });
  }
  return result;
}

export function detectUnframedBankCells(source) {
  // A flat bank surface supplies a strong background consensus. Requiring
  // that consensus prevents textured/framed UI from being treated as a bank.
  const colours = new Map(), total = source.width * source.height;
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    if (source.data[p + 3] !== 255) continue;
    const colour = Array.from(source.data.subarray(p, p + 3)), key = colour.join(',');
    const entry = colours.get(key) || { colour, count: 0 }; entry.count++; colours.set(key, entry);
  }
  const dominant = [...colours.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant || dominant.count < total * .5 || Math.max(...dominant.colour) > 100) return [];
  const foreground = new Uint8Array(total), rows = new Uint32Array(source.height);
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    if (source.data[p + 3] && difference(Array.from(source.data.subarray(p, p + 3)), dominant.colour) > 6) {
      foreground[i] = 1; rows[Math.floor(i / source.width)]++;
    }
  }
  const cells = [];
  for (const row of bands(rows, 5)) {
    if (row.end - row.start < 12 || row.end - row.start > 42) continue;
    const columns = new Uint32Array(source.width);
    for (let y = row.start; y <= row.end; y++) for (let x = 0; x < source.width; x++) columns[x] += foreground[y * source.width + x];
    const groups = bands(columns, 3).filter(group => group.end - group.start >= 10 && group.end - group.start <= 42);
    if (groups.length < 3) continue;
    // Repetition validates the row; actual bounds still come from the pixels.
    const centres = groups.map(group => (group.start + group.end) / 2);
    if (centres.slice(1).some((centre, i) => centre - centres[i] < 30 || centre - centres[i] > 58)) continue;
    for (const group of groups) {
      let top = row.end, bottom = row.start;
      for (let y = row.start; y <= row.end; y++) for (let x = group.start; x <= group.end; x++) if (foreground[y * source.width + x]) {
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      const x = Math.max(0, group.start - 1), y = Math.max(0, top - 1);
      cells.push({ x, y, width: Math.min(source.width, group.end + 2) - x, height: Math.min(source.height, bottom + 2) - y });
    }
  }
  return cells;
}
