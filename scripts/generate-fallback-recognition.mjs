import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateRecognition, sha256 } from './recognition-generator.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = {
  catalogue: 'recognition-fallback.catalogue.json',
  atlas: 'recognition-fallback.atlas.png',
  metadata: 'recognition-fallback.metadata.json',
  manifest: 'recognition-fallback.manifest.json',
};

export async function generateFallbackRecognition({ directory = resolve(root, 'docs'), cataloguePath = resolve(root, 'emojis/emojis_v2.json'), fetchImpl = fetch } = {}) {
  const catalogueText = await readFile(cataloguePath, 'utf8');
  const catalogue = JSON.parse(catalogueText);
  const recognition = await generateRecognition(catalogue, { fetchImpl });
  const catalogueHash = sha256(catalogueText).slice(0, 20);
  const metadata = { version: 2, size: recognition.size, columns: recognition.columns, catalogueHash, atlas: files.atlas, records: recognition.records };
  const manifest = { version: 1, catalogueHash, catalogue: files.catalogue, recognition: files.metadata };
  await Promise.all([
    writeFile(resolve(directory, files.catalogue), catalogueText),
    writeFile(resolve(directory, files.atlas), recognition.png),
    writeFile(resolve(directory, files.metadata), JSON.stringify(metadata)),
    writeFile(resolve(directory, files.manifest), JSON.stringify(manifest)),
  ]);
  return { manifest, metadata, files };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await generateFallbackRecognition();
  console.log(`Wrote fallback snapshot with ${result.metadata.records.length} visual records.`);
}
