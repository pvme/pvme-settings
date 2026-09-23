import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import { cleaner, readFixture } from './icon-fixtures.mjs';
import { slotBounds } from '../docs/js/contribution/slotGeometry.mjs';
import { slotsInsideCrop, drawSlotOutline } from '../docs/js/contribution/ui.mjs';

async function pixelHash(slots) {
  const hash = createHash('sha256');
  for (const slot of slots) {
    hash.update(JSON.stringify([slot.x, slot.y]));
    for (const url of [slot.original, slot.icon]) {
      const image = await loadImage(url), canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0); hash.update(JSON.stringify([image.width, image.height]));
      hash.update(ctx.getImageData(0, 0, image.width, image.height).data);
    }
  }
  return hash.digest('hex');
}
const coordinates = slots => slots.map(slotBounds);
const cases = [
  ['toolbelt', '092018', Array.from({ length: 10 }, (_, i) => ({ x: 10 + i * 45, y: 22, width: 40, height: 40 }))],
  ['bank', '092029', [[13, 8, 34, 32], [57, 9, 34, 30], [101, 9, 33, 30], [145, 9, 37, 33], [189, 9, 32, 29], [233, 8, 33, 34], [277, 8, 33, 28]].map(([x, y, width, height]) => ({ x, y, width, height }))],
  ['skill guide', '092107', Array.from({ length: 8 }, (_, i) => ({ x: 9, y: 3 + i * 41, width: 33, height: 32 }))],
  ['spell book', '092627', [7, 41, 75].flatMap(y => [10, 53, 96].map(x => ({ x, y, width: 32, height: 32 })))],
  ['ability book', '092706', [[11, 6], [54, 6], [97, 6], [11, 40], [54, 40], [97, 40], [11, 74], [11, 126], [54, 126], [97, 126]].map(([x, y]) => ({ x, y, width: 32, height: 32 }))]
];
for (const [name, time, expected] of cases) {
  test(`${name}: source pixel coordinates, original crop sizes, and translation invariance`, async () => {
    const image = await readFixture(time), slots = await cleaner.extract(image);
    assert.deepEqual(coordinates(slots), expected);
    for (const slot of slots) {
      const original = await loadImage(slot.original);
      assert.equal(original.width, slot.width); assert.equal(original.height, slot.height);
    }
    const translated = createCanvas(image.width + 51, image.height + 43), ctx = translated.getContext('2d');
    ctx.fillStyle = name === 'bank' ? '#332f29' : '#191713'; ctx.fillRect(0, 0, translated.width, translated.height);
    ctx.drawImage(image, 19, 13);
    assert.deepEqual(coordinates(await cleaner.extract(translated)), expected.map(cell => ({ ...cell, x: cell.x + 19, y: cell.y + 13 })));
  });
}
// Pixel baselines captured before changing the detector; PNG compression is
// deliberately excluded so tests work across encoder versions/platforms.
for (const [name, time, expected] of [
  ['preset', '092037', 'f1d6b0bf05cf912e106e422f67cf0c1a88cda1d3fe26e10b0eb20b62b41d029d'],
  ['inventory', '092052', '98faa9cf94c9468fdd387be3f671ad93c83fc56454f63af30f01ace52b2282e1'],
  ['prayer book', '092531', '279f4ce812842f035db7d0038c0fab651b9f7b4b49ab9c0a6c76afc83eb09b65']
]) {
  test(`${name}: retains original detection and PNG pixels`, async () => {
    assert.equal(await pixelHash(await cleaner.extract(await readFixture(time))), expected);
  });
}
test('frontend outlines and crop inclusion use the extracted size', () => {
  const toolbelt = { x: 10, y: 22, width: 40, height: 40 }, skill = { x: 9, y: 3, width: 33, height: 32 };
  assert.deepEqual(slotsInsideCrop([toolbelt], { x: 10, y: 22, w: 38, h: 34 }), []);
  assert.deepEqual(slotsInsideCrop([skill], { x: 9, y: 3, w: 33, h: 32 }), [skill]);
  const strokes = [], ctx = { strokeRect: (...args) => strokes.push(args) };
  drawSlotOutline(ctx, toolbelt); drawSlotOutline(ctx, skill);
  assert.deepEqual(strokes, [[10.5, 22.5, 39, 39], [9.5, 3.5, 32, 31]]);
});
test('book frames exclude headings and preserve all interior artwork', async () => {
  for (const time of ['092627', '092706']) {
    const slots = await cleaner.extract(await readFixture(time));
    if (time === '092706') assert(!slots.some(slot => slot.y < 126 && slot.y + slot.height > 106), 'heading must not be included');
    for (const slot of slots) {
      assert.equal(slot.layout, 'framed-book');
      const images = await Promise.all([slot.original, slot.icon].map(async url => {
        const image = await loadImage(url), ctx = createCanvas(image.width, image.height).getContext('2d');
        assert.equal(image.width, 32); assert.equal(image.height, 32);
        ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, 32, 32).data;
      }));
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const p = (y * 32 + x) * 4;
        if (x === 0 || y === 0 || x === 31 || y === 31) assert.equal(images[1][p + 3], 0);
        else assert.deepEqual(images[1].slice(p, p + 4), images[0].slice(p, p + 4));
      }
    }
  }
});
test('skill guide removes repeated UI fill while retaining icon pixels', async () => {
  const slots = await cleaner.extract(await readFixture('092107'));
  const icon = await loadImage(slots[0].icon), canvas = createCanvas(icon.width, icon.height), ctx = canvas.getContext('2d');
  ctx.drawImage(icon, 0, 0);
  const data = ctx.getImageData(0, 0, icon.width, icon.height).data;
  assert(data.some((v, i) => i % 4 === 3 && v === 0));
  assert(data.some((v, i) => i % 4 === 3 && v === 255));
  for (let p = 0; p < data.length; p += 4) if (data[p + 3]) {
    assert.notDeepEqual(Array.from(data.slice(p, p + 3)), [0, 18, 28], 'blue UI bevel remains');
    assert.notDeepEqual(Array.from(data.slice(p, p + 3)), [49, 32, 24], 'brown UI surface remains');
  }
  // The four observed flat UI colours are removable; every other colour in
  // these original cells belongs to artwork (including muted brown shading).
  const surface = new Set(['83,77,67', '0,18,28', '75,46,38', '49,32,24']);
  for (const slot of slots) {
    const histograms = [];
    for (const url of [slot.original, slot.icon]) {
      const image = await loadImage(url), ctx = createCanvas(image.width, image.height).getContext('2d');
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, image.width, image.height).data, counts = new Map();
      for (let p = 0; p < pixels.length; p += 4) if (pixels[p + 3]) {
        const colour = Array.from(pixels.slice(p, p + 3)).join(',');
        counts.set(colour, (counts.get(colour) || 0) + 1);
      }
      histograms.push(counts);
    }
    for (const [colour, count] of histograms[0]) if (!surface.has(colour)) {
      assert.equal(histograms[1].get(colour), count, `artwork colour ${colour} was erased`);
    }
  }
});
