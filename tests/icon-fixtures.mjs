import { createCanvas, Image, ImageData, loadImage } from '@napi-rs/canvas';
import { createPresetIconContribution } from '../docs/js/contribution/iconContribution.mjs';
import { fileURLToPath } from 'node:url';

globalThis.document = { createElement: () => createCanvas(1, 1) };
globalThis.Image = Image;
globalThis.ImageData = ImageData;
export const cleaner = createPresetIconContribution(fileURLToPath(new URL('../docs/images/icon-cleanup', import.meta.url)));
export const fixtures = [
  ['toolbelt', '092018'], ['bank', '092029'], ['preset', '092037'], ['inventory', '092052'], ['skill-guide', '092107'], ['spell-book', '092627'], ['ability-book', '092706']
];
const names = new Map([...fixtures.map(([name, time]) => [time, name]), ['092531', 'prayer-book'], ['092627', 'spell-book'], ['092706', 'ability-book']]);
export const readFixture = time => loadImage(fileURLToPath(new URL(`./fixtures/${names.get(time)}.png`, import.meta.url)));
if (process.argv.includes('--report')) {
  for (const [name, time] of fixtures) {
    const slots = await cleaner.extract(await readFixture(time));
    console.log(name, JSON.stringify(slots.map(({ original, icon, ...bounds }) => bounds)));
  }
}
