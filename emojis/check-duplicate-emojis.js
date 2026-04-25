// check-duplicate-emoji-ids.js
// Usage:
// node check-duplicate-emoji-ids.js ./emojis_v2.json

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

function findLine(snippet) {
  const idx = text.indexOf(snippet);
  return idx === -1 ? "?" : lineNumberFromIndex(idx);
}

const entries = [];

// -------------------------------------
// Recursively gather entries
// -------------------------------------
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

function add(key, type, line) {
  if (!key) return;

  const normalised = String(key).trim().toLowerCase();

  if (!map.has(normalised)) map.set(normalised, []);

  map.get(normalised).push({
    raw: key,
    type, // id / alias
    line,
  });
}

for (const entry of entries) {
  if (entry.id) {
    add(entry.id, "id", findLine(`"id": "${entry.id}"`));
  }

  if (Array.isArray(entry.id_aliases)) {
    for (const alias of entry.id_aliases) {
      add(alias, "alias", findLine(`"${alias}"`));
    }
  }
}

// -------------------------------------
// Find clashes
// -------------------------------------
const clashes = [...map.entries()]
  .filter(([, rows]) => rows.length > 1)
  .sort((a, b) => a[0].localeCompare(b[0]));

const totalDuplicateRefs = clashes.reduce(
  (sum, [, rows]) => sum + (rows.length - 1),
  0,
);

// -------------------------------------
// Summary
// -------------------------------------
if (!clashes.length) {
  console.log("Summary");
  console.log("-------");
  console.log(`Entries scanned : ${entries.length}`);
  console.log(`Duplicate keys  : 0`);
  console.log(`Extra clashes   : 0`);
  console.log("");
  console.log("No duplicate ids or aliases found.");
  process.exit(0);
}

console.log("Summary");
console.log("-------");
console.log(`Entries scanned : ${entries.length}`);
console.log(`Duplicate keys  : ${clashes.length}`);
console.log(`Extra clashes   : ${totalDuplicateRefs}`);
console.log("");

// -------------------------------------
// Detailed output
// -------------------------------------
for (const [key, rows] of clashes) {
  const [first, ...rest] = rows;

  console.log(`${key} (${first.type}, line ${first.line})`);

  for (const row of rest) {
    console.log(`  clashes with ${row.raw} ${row.type} (line ${row.line})`);
  }

  console.log("");
}

process.exit(1);
