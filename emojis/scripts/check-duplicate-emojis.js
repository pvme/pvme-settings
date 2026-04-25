// check-duplicate-emoji-ids.js
// Usage:
// node check-duplicate-emoji-ids.js ../emojis_v2.json

const fs = require("fs");

const file = process.argv[2];

if (!file) {
  console.error("Usage: node check-duplicate-emoji-ids.js <file>");
  process.exit(1);
}

const text = fs.readFileSync(file, "utf8");
const json = JSON.parse(text);

// -------------------------------------
// Helpers
// -------------------------------------
function lineNumberFromIndex(index) {
  return text.slice(0, index).split("\n").length;
}

function normalise(value) {
  return String(value).trim().toLowerCase();
}

// -------------------------------------
// Pre-scan all quoted strings in file
// so repeated values get real line numbers
// -------------------------------------
const occurrenceMap = new Map();

function recordOccurrences() {
  const regex = /"([^"]+)"/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const value = match[1];
    const key = normalise(value);

    if (!occurrenceMap.has(key)) {
      occurrenceMap.set(key, []);
    }

    occurrenceMap.get(key).push(lineNumberFromIndex(match.index));
  }
}

recordOccurrences();

function findLine(value) {
  const key = normalise(value);
  const lines = occurrenceMap.get(key);

  if (!lines || !lines.length) {
    return "?";
  }

  return lines.shift();
}

// -------------------------------------
// Gather entries recursively
// -------------------------------------
const entries = [];

function walk(node) {
  if (Array.isArray(node)) {
    for (const item of node) walk(item);
    return;
  }

  if (node && typeof node === "object") {
    if ("id" in node || "id_aliases" in node) {
      entries.push(node);
    }

    for (const value of Object.values(node)) {
      walk(value);
    }
  }
}

walk(json);

// -------------------------------------
// Build key map
// -------------------------------------
const map = new Map();
const selfAliases = [];

function add(key, type, line, entry) {
  if (!key) return;

  const normalisedKey = normalise(key);

  if (!map.has(normalisedKey)) {
    map.set(normalisedKey, []);
  }

  map.get(normalisedKey).push({
    raw: key,
    type, // id / alias
    line,
    ownerId: entry.id ? normalise(entry.id) : "(no-id)",
    ownerName: entry.name || "(no name)",
  });
}

for (const entry of entries) {
  if (entry.id) {
    add(entry.id, "id", findLine(entry.id), entry);
  }

  if (Array.isArray(entry.id_aliases)) {
    for (const alias of entry.id_aliases) {
      const aliasLine = findLine(alias);

      if (entry.id && normalise(alias) === normalise(entry.id)) {
        selfAliases.push({
          key: alias,
          line: aliasLine,
          id: entry.id,
          name: entry.name || "(no name)",
        });
      }

      add(alias, "alias", aliasLine, entry);
    }
  }
}

// -------------------------------------
// Remove self aliases from clash logic
// but still report separately
// -------------------------------------
const realClashes = [...map.entries()]
  .map(([key, rows]) => {
    const filtered = rows.filter(
      (row) => !(row.type === "alias" && row.ownerId === key),
    );

    return [key, filtered];
  })
  .filter(([, rows]) => rows.length > 1)
  .sort((a, b) => a[0].localeCompare(b[0]));

const realExtraClashes = realClashes.reduce(
  (sum, [, rows]) => sum + (rows.length - 1),
  0,
);

// -------------------------------------
// Output
// -------------------------------------
console.log("Summary");
console.log("-------");
console.log(`Entries scanned          : ${entries.length}`);
console.log(`Real duplicate keys      : ${realClashes.length}`);
console.log(`Real extra clashes       : ${realExtraClashes}`);
console.log(`Redundant self-aliases   : ${selfAliases.length}`);
console.log("");

if (selfAliases.length) {
  console.log("Redundant self-aliases");
  console.log("----------------------");

  const sorted = [...selfAliases].sort(
    (a, b) => Number(a.line) - Number(b.line),
  );

  for (const item of sorted) {
    console.log(`${item.key} alias matches own id (line ${item.line})`);
  }

  console.log("");
}

if (realClashes.length) {
  console.log("Real duplicate clashes");
  console.log("----------------------");

  for (const [key, rows] of realClashes) {
    const [first, ...rest] = rows;

    console.log(`${key} (${first.type}, line ${first.line})`);

    for (const row of rest) {
      console.log(`  clashes with ${row.raw} ${row.type} (line ${row.line})`);
    }

    console.log("");
  }

  process.exit(1);
}

if (selfAliases.length) {
  process.exit(1);
}

console.log("No duplicate ids or aliases found.");
process.exit(0);
