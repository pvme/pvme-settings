// Locate isolated item artwork on a compact GE result surface. Work in
// source coordinates: cropping before segmentation can cut the item in half.
export function detectGeResult(source) {
  const { width, height, data } = source;
  if (width < 24 || height < 24 || width > 128 || height > 128) return null;
  const colours = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 255) continue;
    // GE panels are subtly textured. Group nearby colours so their surface
    // still forms a dominant cluster rather than requiring one exact RGB.
    const colour = [data[i], data[i + 1], data[i + 2]];
    const key = colour.map(value => Math.round(value / 8)).join(',');
    const cluster = colours.get(key) || { count: 0, total: [0, 0, 0] };
    cluster.count++;
    for (let channel = 0; channel < 3; channel++) cluster.total[channel] += colour[channel];
    colours.set(key, cluster);
  }
  const dominant = [...colours.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant || dominant.count < width * height * .03) return null;
  const surface = dominant.total.map(total => total / dominant.count);
  const foreground = new Uint8Array(width * height), seen = new Uint8Array(width * height);
  for (let i = 0; i < foreground.length; i++) {
    foreground[i] = data[i * 4 + 3] && surface.some((value, c) => Math.abs(data[i * 4 + c] - value) > 12) ? 1 : 0;
  }
  let best = null;
  for (let start = 0; start < foreground.length; start++) {
    if (!foreground[start] || seen[start]) continue;
    const component = [start]; seen[start] = 1;
    let left = width, right = -1, top = height, bottom = -1;
    for (let cursor = 0; cursor < component.length; cursor++) {
      const index = component[cursor], x = index % width, y = Math.floor(index / width);
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * width + nx;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen[next] || !foreground[next]) continue;
        seen[next] = 1; component.push(next);
      }
    }
    // Reject surrounding panel frames, dividers and small text fragments.
    const w = right - left + 1, h = bottom - top + 1;
    if (left === 0 || top === 0 || right === width - 1 || bottom === height - 1 ||
        w < 10 || h < 10 || w > 40 || h > 40 || component.length < 40) continue;
    if (!best || component.length > best.component.length) best = { left, right, top, bottom, component };
  }
  if (!best) return detectColouredCore(source);
  const x = best.left - 1, y = best.top - 1;
  const w = best.right - best.left + 3, h = best.bottom - best.top + 3;
  const cleaned = new Uint8ClampedArray(w * h * 4);
  for (const index of best.component) {
    const target = ((Math.floor(index / width) - y) * w + index % width - x) * 4;
    cleaned.set(data.subarray(index * 4, index * 4 + 4), target);
  }
  return { x, y, width: w, height: h, data: cleaned };
}

function detectColouredCore(source) {
  const { width, height, data } = source;
  const cornerPoints = [[3, 3], [width - 4, 3], [3, height - 4], [width - 4, height - 4]];
  const surface = [0, 1, 2].map(channel => cornerPoints
    .map(([x, y]) => data[(y * width + x) * 4 + channel])
    .sort((a, b) => a - b)[2]);
  const seen = new Uint8Array(width * height); let best = null;
  const isCore = index => {
    const p = index * 4, colour = [data[p], data[p + 1], data[p + 2]];
    return Math.max(...colour) - Math.min(...colour) > 18 &&
      colour.some((value, channel) => Math.abs(value - surface[channel]) > 12);
  };
  for (let start = 0; start < seen.length; start++) {
    const startX = start % width, startY = Math.floor(start / width);
    if (seen[start] || startX < 2 || startY < 2 || startX >= width - 2 || startY >= height - 2 || !isCore(start)) continue;
    const pixels = [start]; seen[start] = 1; let left = startX, right = startX, top = startY, bottom = startY;
    for (let cursor = 0; cursor < pixels.length; cursor++) {
      const index = pixels[cursor], x = index % width, y = Math.floor(index / width);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * width + nx;
        if (nx < 2 || ny < 2 || nx >= width - 2 || ny >= height - 2 || seen[next] || !isCore(next)) continue;
        seen[next] = 1; pixels.push(next);
      }
    }
    const componentWidth = right - left + 1, componentHeight = bottom - top + 1;
    if (pixels.length < 8 || componentWidth > 36 || componentHeight > 36) continue;
    if (!best || pixels.length > best.pixels.length) best = { left, top, width: componentWidth, height: componentHeight, pixels };
  }
  if (!best) return null;
  // The coloured core omits dark edge pixels. It reliably gives the item's
  // top-left, so keep that anchor and reserve a full compact-icon area.
  const boxWidth = Math.min(32, width - best.left), boxHeight = Math.min(32, height - best.top);
  const cleaned = new Uint8ClampedArray(boxWidth * boxHeight * 4);
  for (const index of best.pixels) {
    const x = index % width - best.left, y = Math.floor(index / width) - best.top;
    if (x >= 0 && y >= 0 && x < boxWidth && y < boxHeight) cleaned.set(data.subarray(index * 4, index * 4 + 4), (y * boxWidth + x) * 4);
  }
  return { x: best.left, y: best.top, width: boxWidth, height: boxHeight, data: cleaned };
}
