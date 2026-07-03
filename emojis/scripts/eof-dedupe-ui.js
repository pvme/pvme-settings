// eof-dedupe-ui.js
// Usage:
// node eof-dedupe-ui.js
// node eof-dedupe-ui.js ../emojis_v2.json --port=8787

const fs = require("fs");
const http = require("http");
const path = require("path");
const url = require("url");

const args = process.argv.slice(2);
const fileArg = args.find((arg) => !arg.startsWith("--")) || "../emojis_v2.json";
const portArg = args.find((arg) => arg.startsWith("--port="));
const port = portArg ? Number(portArg.split("=")[1]) : 8787;
const file = path.resolve(__dirname, fileArg);
const uiFile = path.resolve(__dirname, "eof-dedupe-ui.html");

let json = loadJson();
let uidNext = 1;
const uids = new WeakMap();

function loadJson() {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function saveJson() {
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}

function send(res, status, body, type = "application/json") {
  const data = type === "application/json" ? JSON.stringify(body) : body;

  res.writeHead(status, {
    "content-type": `${type}; charset=utf-8`,
    "cache-control": "no-store",
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function normalise(value) {
  return String(value || "").trim().toLowerCase();
}

function compact(value) {
  return normalise(value)
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function duplicateKey(entry) {
  const name = normalise(entry.name);
  const id = normalise(entry.id);
  const isEof = /\beof\b|essence of finality/i.test(name) || /^eof/i.test(id);

  let key = name;

  if (isEof) {
    key = key
      .replace(/essence of finality/g, "")
      .replace(/\beof\b/g, "")
      .replace(/\bamulet\b/g, "")
      .replace(/\bornament kit\b/g, "kit")
      .replace(/\bor\b/g, "")
      .replace(/\bunorn\b/g, "");
  }

  key = compact(key);

  if (!key) {
    key = id
      .replace(/^eof/, "")
      .replace(/unorn$/, "")
      .replace(/u$/, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  return key || "eof";
}

function assignUid(entry) {
  if (!uids.has(entry)) uids.set(entry, String(uidNext++));
  return uids.get(entry);
}

function walkEntries(node, visitor, parent = null, key = null, trail = []) {
  if (Array.isArray(node)) {
    node.forEach((item, index) =>
      walkEntries(item, visitor, node, index, trail.concat(index))
    );
    return;
  }

  if (!node || typeof node !== "object") return;

  if ("id" in node || "emoji_id" in node || "image" in node) {
    visitor(node, parent, key, trail);
  }

  for (const [childKey, value] of Object.entries(node)) {
    walkEntries(value, visitor, node, childKey, trail.concat(childKey));
  }
}

function findCategoryName(trail) {
  const categoryIndex = findCategoryIndex(trail);
  if (categoryIndex === -1) return "";

  const category = json.categories && json.categories[categoryIndex];

  return category && category.name ? category.name : "";
}

function findCategoryIndex(trail) {
  const categoriesIndex = trail.indexOf("categories");
  if (categoriesIndex === -1) return -1;

  const categoryIndex = trail[categoriesIndex + 1];
  return Number.isInteger(categoryIndex) ? categoryIndex : -1;
}

function records() {
  const rows = [];

  walkEntries(json, (entry, parent, key, trail) => {
    rows.push({
      uid: assignUid(entry),
      entry,
      path: trail.join("."),
      category: findCategoryName(trail),
      categoryIndex: findCategoryIndex(trail),
      duplicateKey: duplicateKey(entry),
      parent,
      key,
    });
  });

  return rows;
}

function categoryList() {
  return (json.categories || []).map((category, index) => ({
    index,
    name: category.name || `Category ${index}`,
  }));
}

function fieldList() {
  const fields = new Set([
    "name",
    "id",
    "emoji_id",
    "emoji_server",
    "image",
    "preset_type",
    "preset_slot",
    "id_aliases",
    "eof_spec",
  ]);

  for (const row of records()) {
    for (const key of Object.keys(row.entry)) fields.add(key);
  }

  return [...fields];
}

function publicRow({ uid, entry, path: entryPath, category, categoryIndex, duplicateKey }) {
  return {
    uid,
    entry,
    path: entryPath,
    category,
    categoryIndex,
    duplicateKey,
  };
}

function publicRows(rows) {
  return rows.map(publicRow);
}

function publicState(message = "") {
  const rowCount = records().length;

  return {
    file,
    count: rowCount,
    savedAt: new Date().toISOString(),
    message,
    categories: categoryList(),
    fields: fieldList(),
  };
}

function duplicateGroups() {
  const rows = records();
  const grouped = rows.reduce((acc, row) => {
    const key = row.duplicateKey;
    if (!key || key.length < 3) return acc;
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(row);
    return acc;
  }, new Map());

  return [...grouped.entries()]
    .filter(([, groupRows]) => groupRows.length > 1)
    .sort((a, b) => {
      if (b[1].length !== a[1].length) return b[1].length - a[1].length;
      return a[0].localeCompare(b[0]);
    });
}

function publicGroups(offset = 0, limit = 25) {
  const groups = duplicateGroups();
  const selected = groups.slice(offset, offset + limit);
  const rowMap = new Map();

  for (const [, groupRows] of selected) {
    for (const row of groupRows) rowMap.set(row.uid, row);
  }

  return {
    file,
    count: records().length,
    savedAt: new Date().toISOString(),
    categories: categoryList(),
    fields: fieldList(),
    offset,
    limit,
    totalGroups: groups.length,
    rows: publicRows([...rowMap.values()]),
    groups: selected.map(([, groupRows]) => groupRows.map((row) => row.uid)),
  };
}

function findRecord(uid) {
  return records().find((record) => record.uid === String(uid));
}

function collectSearchValues(value, out = []) {
  if (value === null || value === undefined) return out;

  if (Array.isArray(value)) {
    for (const item of value) collectSearchValues(item, out);
    return out;
  }

  if (typeof value === "object") {
    for (const child of Object.values(value)) collectSearchValues(child, out);
    return out;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    out.push(String(value));
  }

  return out;
}

function searchText(row) {
  return [
    ...collectSearchValues(row.entry),
    row.category,
    row.path,
  ]
    .filter(Boolean)
    .join(" ");
}

function queryTokens(q) {
  return normalise(q)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function tokenMatches(token, text, packed) {
  if (token === "eof") {
    return text.includes("eof") || packed.includes("essenceoffinality");
  }

  return text.includes(token) || packed.includes(token);
}

function searchRows(q, limit = 60) {
  const tokens = queryTokens(q);
  if (!tokens.length) return [];

  return records()
    .map((row) => {
      const text = normalise(searchText(row));
      const packed = compact(text);
      if (!tokens.every((token) => tokenMatches(token, text, packed))) return null;

      let score = 0;
      const name = normalise(row.entry.name);
      const id = normalise(row.entry.id);

      for (const token of tokens) {
        if (id === token) score += 20;
        if (name.includes(token)) score += 8;
        if (id.includes(token)) score += 6;
        if (text.includes(token)) score += 2;
      }

      return { row, score };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.row.entry.name || a.row.entry.id || "").localeCompare(
        String(b.row.entry.name || b.row.entry.id || "")
      );
    })
    .slice(0, limit)
    .map(({ row }) => row);
}

function publicSearch(q, limit = 60) {
  const rows = searchRows(q, limit);

  return {
    file,
    count: records().length,
    savedAt: new Date().toISOString(),
    categories: categoryList(),
    fields: fieldList(),
    query: q,
    rows: publicRows(rows),
    groups: rows.length ? [rows.map((row) => row.uid)] : [],
  };
}

function setEntry(uid, nextEntry) {
  const record = findRecord(uid);
  if (!record) throw new Error("Emoji not found");
  if (!nextEntry || typeof nextEntry !== "object" || Array.isArray(nextEntry)) {
    throw new Error("Entry must be a JSON object");
  }

  const cleanEntry = {};
  for (const [key, value] of Object.entries(nextEntry)) {
    if (value === "" || value === null) continue;
    if (Array.isArray(value) && !value.length) continue;
    cleanEntry[key] = value;
  }

  for (const key of Object.keys(record.entry)) delete record.entry[key];
  Object.assign(record.entry, cleanEntry);
  saveJson();
}

function deleteEntry(uid) {
  const record = findRecord(uid);
  if (!record) throw new Error("Emoji not found");

  if (Array.isArray(record.parent)) {
    record.parent.splice(record.key, 1);
  } else if (record.parent && record.key !== null) {
    delete record.parent[record.key];
  } else {
    throw new Error("Cannot delete root entry");
  }

  saveJson();
}

function moveEntry(uid, categoryIndex) {
  const record = findRecord(uid);
  if (!record) throw new Error("Emoji not found");

  const target = json.categories && json.categories[categoryIndex];
  if (!target) throw new Error("Target category not found");
  if (!Array.isArray(target.emojis)) target.emojis = [];

  if (Array.isArray(record.parent)) {
    record.parent.splice(record.key, 1);
  } else {
    throw new Error("Emoji is not in a movable array");
  }

  target.emojis.push(record.entry);
  saveJson();
}

function mergeEntries(targetUid, sourceUids) {
  const target = findRecord(targetUid);
  if (!target) throw new Error("Target emoji not found");

  const aliases = new Set(Array.isArray(target.entry.id_aliases) ? target.entry.id_aliases : []);

  for (const sourceUid of sourceUids) {
    const source = findRecord(sourceUid);
    if (!source || source.uid === target.uid) continue;

    for (const [key, value] of Object.entries(source.entry)) {
      if (key === "id_aliases") {
        if (Array.isArray(value)) value.forEach((alias) => aliases.add(alias));
      } else if (key === "id") {
        if (value && value !== target.entry.id) aliases.add(value);
      } else if (key !== "name") {
        const current = target.entry[key];
        if (
          (current === undefined || current === null || current === "") &&
          value !== undefined &&
          value !== null &&
          value !== ""
        ) {
          target.entry[key] = value;
        }
      }
    }

    deleteEntry(source.uid);
  }

  const nextAliases = [...aliases].filter(Boolean);
  if (nextAliases.length) target.entry.id_aliases = nextAliases;
  saveJson();
}

async function handleApi(req, res, pathname) {
  try {
    if (req.method === "GET" && pathname === "/api/state") {
      send(res, 200, publicState());
      return;
    }

    if (req.method === "GET" && pathname === "/api/groups") {
      const parsed = url.parse(req.url, true);
      send(
        res,
        200,
        publicGroups(
          Number(parsed.query.offset || 0),
          Math.min(Number(parsed.query.limit || 25), 100)
        )
      );
      return;
    }

    if (req.method === "GET" && pathname === "/api/search") {
      const parsed = url.parse(req.url, true);
      send(
        res,
        200,
        publicSearch(
          String(parsed.query.q || ""),
          Math.min(Number(parsed.query.limit || 60), 200)
        )
      );
      return;
    }

    if (req.method === "PUT" && pathname.startsWith("/api/emoji/")) {
      const uid = pathname.split("/").pop();
      const body = await readBody(req);
      setEntry(uid, body.entry);
      send(res, 200, publicState("Saved"));
      return;
    }

    if (req.method === "DELETE" && pathname.startsWith("/api/emoji/")) {
      const uid = pathname.split("/").pop();
      deleteEntry(uid);
      send(res, 200, publicState("Deleted"));
      return;
    }

    if (req.method === "POST" && pathname.startsWith("/api/move/")) {
      const uid = pathname.split("/").pop();
      const body = await readBody(req);
      moveEntry(uid, Number(body.categoryIndex));
      send(res, 200, publicState("Moved"));
      return;
    }

    if (req.method === "POST" && pathname === "/api/merge") {
      const body = await readBody(req);
      mergeEntries(body.targetUid, body.sourceUids || []);
      send(res, 200, publicState("Merged"));
      return;
    }

    send(res, 404, { error: "Not found" });
  } catch (err) {
    send(res, 400, { error: err.message });
  }
}

const server = http.createServer((req, res) => {
  const { pathname } = url.parse(req.url);

  if (pathname === "/") {
    send(res, 200, fs.readFileSync(uiFile, "utf8"), "text/html");
    return;
  }

  if (pathname.startsWith("/api/")) {
    handleApi(req, res, pathname);
    return;
  }

  send(res, 404, "Not found", "text/plain");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Emoji dedupe UI: http://127.0.0.1:${port}/`);
  console.log(`Editing: ${file}`);
});
