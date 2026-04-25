
// report-pouch-items.js
// Usage:
// node report-pouch-items.js
// or
// node report-pouch-items.js ../emojis_v2.json

const fs = require("fs");

const file = process.argv[2] || "../emojis_v2.json";

const json = JSON.parse(fs.readFileSync(file, "utf8"));
const rows = [];

// -------------------------------------
// Gather entries recursively
// -------------------------------------
function walk(node) {
  if (Array.isArray(node)) {
    for (const item of node) walk(item);
    return;
  }

  if (node && typeof node === "object") {
    if ("id" in node || "name" in node) {
      rows.push(node);
    }

    for (const value of Object.values(node)) {
      walk(value);
    }
  }
}

walk(json);

// -------------------------------------
// Filters
// -------------------------------------
function containsPouch(text) {
  return String(text || "").toLowerCase().includes("pouch");
}

function isExcluded(text) {
  const t = String(text || "").toLowerCase();
  return t.includes("grasping pouch") || t.includes("rune pouch");
}

function aliasesContain(list, fn) {
  return Array.isArray(list) && list.some(fn);
}

const matches = rows.filter((row) => {
  const hit =
    containsPouch(row.name) ||
    containsPouch(row.id) ||
    aliasesContain(row.id_aliases, containsPouch);

  if (!hit) return false;

  const excluded =
    isExcluded(row.name) ||
    isExcluded(row.id) ||
    aliasesContain(row.id_aliases, isExcluded);

  return !excluded;
});

// -------------------------------------
// Sort
// -------------------------------------
matches.sort((a, b) =>
  String(a.name || a.id || "").localeCompare(String(b.name || b.id || ""))
);

// -------------------------------------
// Output
// -------------------------------------
console.log(
  [
    "NAME".padEnd(35),
    "ID".padEnd(25),
    "PRESET_TYPE".padEnd(18),
    "SLOT".padEnd(6),
    "ALIASES",
  ].join(" | ")
);

console.log("-".repeat(140));

for (const row of matches) {
  console.log(
    [
      String(row.name || "").padEnd(35),
      String(row.id || "").padEnd(25),
      String(row.preset_type || "").padEnd(18),
      String(
        row.preset_slot === 0 || row.preset_slot
          ? row.preset_slot
          : ""
      ).padEnd(6),
      Array.isArray(row.id_aliases) ? row.id_aliases.join(", ") : "",
    ].join(" | ")
  );
}

console.log("");
console.log(`Total: ${matches.length}`);
