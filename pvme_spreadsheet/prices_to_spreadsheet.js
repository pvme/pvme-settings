const path = require("path");

const MAPPING_URL = "https://prices.runescape.wiki/api/v2/rs/mapping";
const LATEST_PRICES_URL = "https://prices.runescape.wiki/api/v2/rs/latest";
const USER_AGENT =
  "pvme-settings-price-scraper/1.0 (https://github.com/pvme/pvme-settings)";
const HEADER_ROW = ["Item name", "Item ID", "Sell price", "Buy price"];
const MINIMUM_ITEM_COUNT = 1000;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

async function getJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(
      `RuneScape Wiki API request failed for ${url}: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

function priceOrBlank(price) {
  return price === null || price === undefined ? "" : price;
}

function buildRows(mapping, latestPrices, updatedAt = new Date()) {
  if (!Array.isArray(mapping) || mapping.length < MINIMUM_ITEM_COUNT) {
    throw new Error("RuneScape Wiki mapping response contains too few items.");
  }

  if (!latestPrices || typeof latestPrices.data !== "object") {
    throw new Error("RuneScape Wiki latest-price response has no data object.");
  }

  const rows = mapping
    .filter((item) => item && item.name && Number.isInteger(item.id))
    .map((item) => {
      const price = latestPrices.data[item.id];
      return [
        item.name,
        item.id,
        priceOrBlank(price && price.low),
        priceOrBlank(price && price.high),
      ];
    })
    .sort((left, right) => left[0].localeCompare(right[0]));

  const outputRows = [
    ["%LAST_UPDATE%", Math.floor(updatedAt.getTime() / 1000)],
    ["%LAST_UPDATE_F%", formatUtc(updatedAt)],
    HEADER_ROW,
    ...rows,
  ];
  validateRows(mapping, outputRows);
  return outputRows;
}

function formatUtc(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getUTCDate())} ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} (UTC)`;
}

function validateRows(mapping, outputRows) {
  if (outputRows.length - 3 < MINIMUM_ITEM_COUNT) {
    throw new Error("Price output contains fewer than 1,000 item rows.");
  }

  if (
    !outputRows[0] ||
    outputRows[0][0] !== "%LAST_UPDATE%" ||
    !Number.isInteger(outputRows[0][1]) ||
    !outputRows[1] ||
    outputRows[1][0] !== "%LAST_UPDATE_F%" ||
    typeof outputRows[1][1] !== "string"
  ) {
    throw new Error("Price output is missing update metadata rows.");
  }

  const heartOfTheArcher = mapping.find(
    (item) => item && item.name === "Heart of the Archer",
  );
  if (heartOfTheArcher && heartOfTheArcher.id !== 51455) {
    throw new Error("Heart of the Archer did not resolve to item ID 51455.");
  }

  if (JSON.stringify(outputRows[2]) !== JSON.stringify([
    "Item name",
    "Item ID",
    "Sell price",
    "Buy price",
  ])) {
    throw new Error("Spreadsheet columns are not in the required order.");
  }
}

async function updateSpreadsheet(rows) {
  const { google } = require("googleapis");
  const config = require("./config.json");
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(__dirname, config.jwtpath),
    scopes: "https://www.googleapis.com/auth/spreadsheets",
  });
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.sheetId,
    range: config.sheet + "!A:D",
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.sheetId,
    range: config.sheet + "!A1",
    valueInputOption: "RAW",
    resource: {
      majorDimension: "ROWS",
      values: rows,
    },
  });
}

function parseOptions(arguments_) {
  const dryRun = arguments_.includes("--dry-run");
  const limitArgument = arguments_.find((argument) => argument.startsWith("--limit="));
  const limit = limitArgument ? Number(limitArgument.slice("--limit=".length)) : 5;

  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error("--limit must be a non-negative integer.");
  }

  return { dryRun, limit };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const [mapping, latestPrices] = await Promise.all([
    getJson(MAPPING_URL),
    getJson(LATEST_PRICES_URL),
  ]);
  const rows = buildRows(mapping, latestPrices, new Date());

  if (options.dryRun) {
    console.log(`Total row count: ${rows.length}`);
    console.log(`Preview (first ${options.limit} rows):`);
    console.log(rows.slice(0, options.limit));
    return;
  }

  await updateSpreadsheet(rows);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildRows, formatUtc, parseOptions, priceOrBlank };
