import { populateServers } from './servers.js';
import { populateEmojis, selectSearchEmoji } from './emojis.js';
import { initContributions } from './contribution/ui.mjs';

async function populateTables() {
  const configuredManifest = window.__PVME_ASSET_MANIFEST__;
  const manifestPath = !configuredManifest || configuredManifest === '__PVME_ASSET_MANIFEST_PATH__'
    ? 'recognition-fallback.manifest.json' : configuredManifest;
  const manifestURL = new URL(manifestPath, window.location.href);
  const manifestResponse = await fetch(manifestURL);
  if (!manifestResponse.ok) throw new Error('The deployed asset manifest could not load.');
  const manifest = await manifestResponse.json();
  const catalogueResponse = await fetch(new URL(manifest.catalogue, manifestURL));
  if (!catalogueResponse.ok) throw new Error('The deployed catalogue snapshot could not load.');
  const emojisJSON = await catalogueResponse.json();
  const assets = { recognition: new URL(manifest.recognition, manifestURL).href, catalogueHash: manifest.catalogueHash };

  const emojiServerTableData = getEmojiServerTableData(emojisJSON);

  populateEmojis(emojiServerTableData.emojis);
  populateServers(emojiServerTableData.servers);
  await initContributions(emojisJSON, assets);
}

function getEmojiServerTableData(emojisJSON) {
  const emojis = [];
  const servers = {};

  for (const server of emojisJSON.servers) {
    servers[server.server] = {
      url: server.url,
      emojis: []
    };
  }

  for (const category of emojisJSON.categories) {
    for (const emoji of category.emojis) {
      emojis.push({
        ...emoji,
        category: category.name
      });

      if (emoji.emoji_id && emoji.emoji_server in servers) {
        servers[emoji.emoji_server].emojis.push(
          `<img
            title="${emoji.name}"
            class="disc-emoji"
            src="https://cdn.discordapp.com/emojis/${emoji.emoji_id}.webp?v=1"
          >`
        );
      }
    }
  }

  return { emojis, servers };
}

function parseHash() {
  const hash = window.location.hash.replace("#", "");

  if (!hash) return { tab: "emojis", query: "" };

  const [tab, params] = hash.split("?");
  const searchParams = new URLSearchParams(params || "");

  return {
    tab: tab || "emojis",
    query: searchParams.get("q") || ""
  };
}

function updateHash(tab, query) {
  const newHash = `#${tab}${query ? `?q=${encodeURIComponent(query)}` : ""}`;
  history.replaceState(null, "", newHash);
}

function restoreStateFromURL() {
  const { tab, query } = parseHash();

  const tabButton = document.getElementById(tab === "contribute" ? "emojis" : tab);
  if (tabButton) {
    const bsTab = new bootstrap.Tab(tabButton);
    bsTab.show();
  }

  if (tab === "contribute") {
    history.replaceState(null, "", "#emojis");
    bootstrap.Modal.getOrCreateInstance(document.getElementById("contribution-modal")).show();
  }

  const searchInput = document.getElementById("search-emojis");

  if (query && searchInput) {
    searchInput.value = query;
  }

  if (tab === "emojis") {
    selectSearchEmoji();
  }
}

function setupTabListeners() {
  const tabButtons = document.querySelectorAll(".nav-link");

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const { query } = parseHash();
      updateHash(btn.id, query);

      if (btn.id === "emojis") {
        selectSearchEmoji();
      }
    });
  });
}

function setupSearchListener() {
  const searchInput = document.getElementById("search-emojis");

  if (!searchInput) return;

  searchInput.addEventListener("input", () => {
    const { tab } = parseHash();
    updateHash(tab, searchInput.value);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  try { await populateTables(); }
  catch { document.getElementById('contribution-status').textContent = 'The catalogue could not load. Refresh the page before preparing contributions.'; }

  restoreStateFromURL();
  setupTabListeners();
  setupSearchListener();
});
