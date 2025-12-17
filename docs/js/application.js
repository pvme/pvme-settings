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

  // Initialise servers
  for (const server of emojisJSON.servers) {
    servers[server.server] = {
      url: server.url,
      emojis: []
    };
  }

  // Flatten categories → emojis
  for (const category of emojisJSON.categories) {
    for (const emoji of category.emojis) {
      emojis.push({
        ...emoji,
        category: category.name
      });

      // Only Discord-hosted emojis appear in the Servers tab
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

function selectTabOnPageLoad() {
  const selectedTab = window.location.hash;

  if (selectedTab) {
    $(selectedTab).tab('show');
    if (selectedTab === '#emojis') selectSearchEmoji();
  } else {
    selectSearchEmoji();
  }
}

$(document).ready(() => {
  populateTables();
  selectTabOnPageLoad();

  // Update URL when switching tabs
  $('.nav-link').click(function () {
    history.pushState(null, null, `#${$(this).attr('id')}`);
  });

  // Focus search when clicking emoji tab
  $('#emojis').click(() => {
    selectSearchEmoji();
  });
});
