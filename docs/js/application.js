import { rawGithubJSONRequest } from './github.js';
import { populateServers } from './servers.js';
import { populateEmojis, selectSearchEmoji } from './emojis.js';

async function populateTables() {
  const emojisJSON = await rawGithubJSONRequest(
    'https://raw.githubusercontent.com/pvme/pvme-settings/master/emojis/emojis_v2.json'
  );

  const emojiServerTableData = getEmojiServerTableData(emojisJSON);

  populateEmojis(emojiServerTableData.emojis);
  populateServers(emojiServerTableData.servers);
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

  const tabButton = document.getElementById(tab);
  if (tabButton) {
    const bsTab = new bootstrap.Tab(tabButton);
    bsTab.show();
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
  await populateTables();

  restoreStateFromURL();
  setupTabListeners();
  setupSearchListener();
});
