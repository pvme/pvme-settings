import { access, cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateRecognition, sha256 } from './recognition-generator.mjs';

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function withoutGeneratedAssets(source) {
  return !source.includes('/images/recognition') && !source.includes('\\images\\recognition') && !source.includes('/assets') && !source.includes('\\assets') && !source.includes('/node_modules') && !source.includes('\\node_modules');
}

export async function buildSite({ root = scriptRoot, fetchImpl = fetch } = {}) {
  const docs = resolve(root, 'docs'), cataloguePath = resolve(root, 'emojis/emojis_v2.json'), destination = resolve(root, 'dist');
  const staging = `${destination}.next-${process.pid}`;
  const previous = `${destination}.previous-${process.pid}`;
  await rm(staging, { recursive: true, force: true });
  await rm(previous, { recursive: true, force: true });
  try {
    const [catalogueText, index] = await Promise.all([readFile(cataloguePath, 'utf8'), readFile(resolve(docs, 'index.html'), 'utf8')]);
    const catalogue = JSON.parse(catalogueText);
    const recognition = await generateRecognition(catalogue, { fetchImpl });
    const catalogueHash = sha256(catalogueText).slice(0, 20);
    const recognitionHash = sha256(Buffer.concat([Buffer.from(catalogueHash), recognition.png, Buffer.from(JSON.stringify(recognition.records))])).slice(0, 20);
    const atlasName = `recognition.${recognitionHash}.png`;
    const metadataName = `recognition.${recognitionHash}.json`;
    const metadata = { version: 2, size: recognition.size, columns: recognition.columns, catalogueHash, atlas: atlasName, records: recognition.records };
    const manifest = { version: 1, catalogueHash, catalogue: `catalogue.${catalogueHash}.json`, recognition: metadataName };
    const manifestHash = sha256(JSON.stringify(manifest)).slice(0, 20);
    const manifestName = `site-manifest.${manifestHash}.json`;
    const marker = '__PVME_ASSET_MANIFEST_PATH__';
    if (index.split(marker).length !== 2) throw new Error('index.html must contain one asset-manifest marker.');
    await cp(docs, staging, { recursive: true, filter: withoutGeneratedAssets });
    const assets = resolve(staging, 'assets'); await mkdir(assets, { recursive: true });
    await Promise.all([
      writeFile(resolve(assets, manifest.catalogue), catalogueText),
      writeFile(resolve(assets, atlasName), recognition.png),
      writeFile(resolve(assets, metadataName), JSON.stringify(metadata)),
      writeFile(resolve(assets, manifestName), JSON.stringify(manifest)),
      writeFile(resolve(staging, 'index.html'), index.replace(marker, `assets/${manifestName}`))
    ]);
    let hadPrevious = true;
    try { await access(destination); } catch { hadPrevious = false; }
    if (hadPrevious) await rename(destination, previous);
    try { await rename(staging, destination); }
    catch (error) {
      // Windows can reject a directory rename immediately after a large atlas
      // write. The Pages runner uses the atomic rename path above; this local
      // fallback still restores the prior output if copying cannot finish.
      if (process.platform === 'win32' && error.code === 'EPERM') {
        try { await cp(staging, destination, { recursive: true }); await rm(staging, { recursive: true, force: true }); }
        catch (copyError) {
          await rm(destination, { recursive: true, force: true });
          if (hadPrevious) await rename(previous, destination);
          throw copyError;
        }
      } else {
        if (hadPrevious) await rename(previous, destination);
        throw error;
      }
    }
    await rm(previous, { recursive: true, force: true });
    return { destination, manifest, metadata, manifestName };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    await rm(previous, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await buildSite();
  console.log(`Built ${result.destination} with ${result.metadata.records.length} recognition records (${result.manifestName}).`);
}
