import fs from 'fs';

const INPUT = './emojis_v2.json';
const OUTPUT = './emoji-merge-report.json';

const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'));

const emojis = data.categories.flatMap(cat =>
  cat.emojis.map(e => ({
    ...e,
    category: cat.name,
  }))
);

// ---------- helpers ----------

const normaliseName = name =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// ---------- indexes ----------

const byId = new Map();
const byAlias = new Map();
const byName = new Map();

// ---------- build indexes ----------

for (const e of emojis) {
  // by id
  if (!byId.has(e.id)) byId.set(e.id, []);
  byId.get(e.id).push(e);

  // by alias
  for (const alias of e.id_aliases ?? []) {
    if (!byAlias.has(alias)) byAlias.set(alias, []);
    byAlias.get(alias).push(e);
  }

  // by normalised name
  const nameKey = normaliseName(e.name);
  if (!byName.has(nameKey)) byName.set(nameKey, []);
  byName.get(nameKey).push(e);
}

// ---------- report builders ----------

const report = {
  duplicateIds: [],
  idUsedAsAlias: [],
  sharedNames: [],
  aliasCollisions: [],
};

// duplicate IDs
for (const [id, list] of byId.entries()) {
  if (list.length > 1) {
    report.duplicateIds.push({
      id,
      reason: 'Same ID appears more than once',
      entries: list.map(e => ({
        name: e.name,
        category: e.category,
        emoji_server: e.emoji_server,
      })),
    });
  }
}

// ID used as alias elsewhere
for (const [alias, owners] of byAlias.entries()) {
  if (byId.has(alias)) {
    report.idUsedAsAlias.push({
      id: alias,
      reason: 'ID exists as an alias of another emoji',
      primary: alias,
      aliasOf: owners.map(e => e.id),
    });
  }
}

// shared names, different IDs
for (const [nameKey, list] of byName.entries()) {
  const uniqueIds = new Set(list.map(e => e.id));
  if (uniqueIds.size > 1) {
    report.sharedNames.push({
      normalisedName: nameKey,
      reason: 'Same display name (normalised), different IDs',
      entries: list.map(e => ({
        id: e.id,
        name: e.name,
        category: e.category,
      })),
    });
  }
}

// alias collisions
for (const [alias, list] of byAlias.entries()) {
  const ids = [...new Set(list.map(e => e.id))];
  if (ids.length > 1) {
    report.aliasCollisions.push({
      alias,
      reason: 'Alias points to multiple IDs',
      ids,
    });
  }
}

// ---------- write file ----------

fs.writeFileSync(
  OUTPUT,
  JSON.stringify(report, null, 2)
);

console.log('Emoji merge analysis complete.');
console.log(`Report written to ${OUTPUT}`);
console.log('');
console.log('Summary:');
console.log(' duplicateIds:', report.duplicateIds.length);
console.log(' idUsedAsAlias:', report.idUsedAsAlias.length);
console.log(' sharedNames:', report.sharedNames.length);
console.log(' aliasCollisions:', report.aliasCollisions.length);
