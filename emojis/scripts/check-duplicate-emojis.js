// check-duplicate-emojis.js
// Usage:
// node check-duplicate-emojis.js ../emojis_v2.json
//
// Tightened fuzzy detection:
// Only surfaces likely duplicate entities,
// not tiers / ranks / doses / perk levels / variants.

const fs = require("fs");

const file = process.argv[2];

if (!file) {
  console.error("Usage: node check-duplicate-emojis.js <file>");
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

function normalise(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

function softNormalise(v) {
  return normalise(v)
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/pouch/g, "")
    .replace(/scrolls?/g, "")
    .replace(/stack/g, "")
    .replace(/noted/g, "")
    .replace(/charged/g, "")
    .replace(/\d+/g, "");
}

// -------------------------------------
// Ignore patterns
// -------------------------------------
function isTierVariant(name) {
  const n = normalise(name);

  return (
    /\(\s*tier\s*\d+/i.test(n) ||
    /\+\s*\d+/.test(n) ||
    /\(\d+\)/.test(n) ||
    /\bcast\s*\d+\b/.test(n) ||
    (/\b\d+\b/.test(n) &&
      (n.includes("ring") ||
        n.includes("gloves") ||
        n.includes("boots") ||
        n.includes("sword") ||
        n.includes("quiver") ||
        n.includes("amulet")))
  );
}

function isDoseVariant(name) {
  const n = normalise(name);

  return (
    /\(\d+\)/.test(n) ||
    /\(\d+\s*dose/.test(n) ||
    /\bflask\b/.test(n) ||
    /\bpotion\b/.test(n) ||
    /\bbrew\b/.test(n)
  );
}

function isPerkVariant(name) {
  const n = normalise(name);

  return /\d+$/.test(n);
}

function isCosmeticVariant(name) {
  const n = normalise(name);

  return (
    n.includes("(red)") ||
    n.includes("(blue)") ||
    n.includes("(green)") ||
    n.includes("(yellow)") ||
    n.includes("(orange)") ||
    n.includes("(purple)") ||
    n.includes("(black)") ||
    n.includes("(melee)") ||
    n.includes("(ranged)") ||
    n.includes("(magic)") ||
    n.includes("(c)")
  );
}

function isStackVariant(name, id) {
  const n = normalise(name);
  const x = normalise(id);

  return (
    n.includes("(stack") ||
    n.includes("(noted") ||
    x.endsWith("stack") ||
    x.endsWith("noted") ||
    x.endsWith("1k") ||
    x.endsWith("10k") ||
    x.endsWith("100") ||
    x.endsWith("500") ||
    x.endsWith("1000")
  );
}

function shouldIgnore(name, id) {
  return (
    isTierVariant(name) ||
    isDoseVariant(name) ||
    isPerkVariant(name) ||
    isCosmeticVariant(name) ||
    isStackVariant(name, id)
  );
}

// -------------------------------------
// Occurrence lines
// -------------------------------------
const occurrenceMap = new Map();

(function scan() {
  const regex = /"([^"]+)"/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const value = normalise(match[1]);

    if (!occurrenceMap.has(value)) {
      occurrenceMap.set(value, []);
    }

    occurrenceMap.get(value).push(lineNumberFromIndex(match.index));
  }
})();

function findLine(value) {
  const key = normalise(value);
  const arr = occurrenceMap.get(key);

  if (!arr || !arr.length) return "?";

  return arr.shift();
}

// -------------------------------------
// Gather entries
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
// Fuzzy duplicate map
// -------------------------------------
const groups = new Map();

for (const e of entries) {
  const name = e.name || "";
  const id = e.id || "";

  if (!name || !id) continue;
  if (shouldIgnore(name, id)) continue;

  const key = softNormalise(name);

  if (!key || key.length < 5) continue;

  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({
    name,
    id,
    line: findLine(id),
  });
}

const fuzzy = [...groups.entries()]
  .filter(([, rows]) => rows.length > 1)
  .sort((a, b) => a[0].localeCompare(b[0]));

// -------------------------------------
// Output
// -------------------------------------
console.log("Summary");
console.log("-------");
console.log(`Entries scanned        : ${entries.length}`);
console.log(`Likely duplicate groups: ${fuzzy.length}`);
console.log("");

if (!fuzzy.length) {
  console.log("No likely fuzzy duplicates found.");
  process.exit(0);
}

console.log("Likely fuzzy duplicates");
console.log("-----------------------");

for (const [key, rows] of fuzzy) {
  console.log(key);

  for (const row of rows) {
    console.log(`  - ${row.name} | id=${row.id} | line ${row.line}`);
  }

  console.log("");
}

process.exit(1);
