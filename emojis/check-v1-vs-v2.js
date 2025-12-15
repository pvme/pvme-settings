import fs from 'fs';

const V1 = './emojis.json';
const V2 = './emojis_v2.json';
const OUT = './emoji-final-audit.json';

// ---------- helpers ----------

const normalise = s =>
  s.toLowerCase().replace(/[^a-z0-9]/g, '');

const flatten = data =>
  data.categories.flatMap(c => c.emojis);

// ---------- load ----------

const v1 = flatten(JSON.parse(fs.readFileSync(V1, 'utf8')));
const v2 = flatten(JSON.parse(fs.readFileSync(V2, 'utf8')));

// ---------- index v2 ----------

const byId = new Map();
const byAlias = new Map();
const byEmojiId = new Map();

for (const e of v2) {
  byId.set(e.id, e);

  for (const a of e.id_aliases ?? []) {
    byAlias.set(a, e);
  }

  if (e.emoji_id) {
    if (!byEmojiId.has(e.emoji_id)) {
      byEmojiId.set(e.emoji_id, []);
    }
    byEmojiId.get(e.emoji_id).push(e);
  }

}

// ---------- report ----------

const report = {
  missing: [],
  semanticMismatch: [],
  idRepurposed: [],
  emojiIdCollision: [],
};

// ---------- v1 → v2 audit ----------

for (const old of v1) {
  const id = old.emoji_name;
  const emojiId = old.emoji_id;

  const match =
    byId.get(id) ||
    byAlias.get(id);

  const sameEmoji = byEmojiId.get(emojiId) ?? [];

  // ---------- missing ----------
  if (!match && sameEmoji.length === 0) {
    report.missing.push({
      name: old.name,
      id,
      emoji_id: emojiId,
      server: old.server,
    });
    continue;
  }

  // ---------- id repurposed ----------
  if (
    match &&
    match.emoji_id !== emojiId &&
    sameEmoji.length > 0
  ) {
    report.idRepurposed.push({
      id,
      old: {
        name: old.name,
        emoji_id: emojiId,
      },
      new: {
        name: match.name,
        emoji_id: match.emoji_id,
      },
    });
    continue;
  }

  // ---------- semantic mismatch ----------
  if (
    match &&
    match.emoji_id !== emojiId &&
    normalise(match.name) === normalise(old.name)
  ) {
    report.semanticMismatch.push({
      name: old.name,
      id,
      oldEmojiId: emojiId,
      newEmojiId: match.emoji_id,
    });
  }
}

// ---------- emoji id collisions (v2 only) ----------

for (const [emojiId, items] of byEmojiId.entries()) {
  if (items.length > 1) {
    const names = new Set(items.map(e => normalise(e.name)));

    if (names.size > 1) {
      report.emojiIdCollision.push({
        emoji_id: emojiId,
        items: items.map(e => ({
          id: e.id,
          name: e.name,
        })),
      });
    }
  }
}

// ---------- write ----------

fs.writeFileSync(
  OUT,
  JSON.stringify(report, null, 2)
);

console.log('Final emoji audit complete.');
console.log(`Output: ${OUT}`);
console.log('');
console.log('missing:', report.missing.length);
console.log('semanticMismatch:', report.semanticMismatch.length);
console.log('idRepurposed:', report.idRepurposed.length);
console.log('emojiIdCollision:', report.emojiIdCollision.length);
