import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { matcher } from '../docs/js/contribution/matching.mjs';

const SIZE = 24;
const COLUMNS = 64;

export const sha256 = value => createHash('sha256').update(value).digest('hex');

function sourceFor(icon) {
  if (icon.image) return `https://img.pvme.io/images/${encodeURIComponent(icon.image)}`;
  if (icon.emoji_id) return `https://cdn.discordapp.com/emojis/${encodeURIComponent(icon.emoji_id)}.png?size=64`;
  return null;
}

async function pooled(items, worker, concurrency) {
  const results = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

export async function generateRecognition(catalogue, { fetchImpl = fetch, concurrency = 12 } = {}) {
  const inputs = catalogue.categories.flatMap(category => category.emojis).flatMap(icon => {
    const source = sourceFor(icon);
    return source ? [{ id: icon.id, source }] : [];
  });
  if (!inputs.length) throw new Error('The catalogue contains no drawable icons.');
  const groups = await pooled(inputs, async ({ id, source }) => {
    const response = await fetchImpl(source);
    if (!response.ok) throw new Error(`Could not download ${id}: HTTP ${response.status}.`);
    let image;
    try { image = await loadImage(Buffer.from(await response.arrayBuffer())); }
    catch { throw new Error(`Could not decode ${id} from the image host.`); }
    const tile = createCanvas(SIZE, SIZE), context = tile.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, SIZE, SIZE);
    const pixels = context.getImageData(0, 0, SIZE, SIZE);
    return [
      [0, false, false], [1, true, false], [2, false, true], [3, true, true]
    ].map(([variant, strict, hideQuantity]) => ({ id, variant, vector: matcher.fingerprint(pixels, strict, hideQuantity).vector }));
  }, concurrency);
  const tiles = groups.flat();
  const atlas = createCanvas(COLUMNS * SIZE, Math.ceil(tiles.length / COLUMNS) * SIZE);
  const context = atlas.getContext('2d'); context.imageSmoothingEnabled = false;
  for (const [index, tile] of tiles.entries()) {
    const pixels = context.createImageData(SIZE, SIZE);
    for (let pixel = 0; pixel < SIZE * SIZE; pixel++) {
      pixels.data.set(tile.vector.subarray(pixel * 3, pixel * 3 + 3), pixel * 4);
      pixels.data[pixel * 4 + 3] = 255;
    }
    context.putImageData(pixels, index % COLUMNS * SIZE, Math.floor(index / COLUMNS) * SIZE);
  }
  return {
    png: atlas.toBuffer('image/png'),
    records: tiles.map(({ id, variant }) => ({ id, variant })),
    size: SIZE,
    columns: COLUMNS
  };
}
