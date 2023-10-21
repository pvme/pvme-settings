import { rawGithubJSONRequest } from './github.js';
import { populateServers } from './servers.js';
import { populateEmojis, selectSearchEmoji } from './emojis.js';


async function populateTables() {
  const emojisJSON = await rawGithubJSONRequest('https://raw.githubusercontent.com/pvme/pvme-settings/master/emojis/emojis.json');
  
  const emojiServerTableData = getEmojiServerTableData(emojisJSON)

  populateEmojis(emojiServerTableData.emojis);
  populateServers(emojiServerTableData.servers);
}

function getEmojiServerTableData(emojisJSON) {
  const allEmojiCategories = [...emojisJSON.categories, {
    name: 'Uncategorized',
    emojis: emojisJSON.uncategorized
  }];

  const emojis = [];
  const servers = {};

  for (const server of emojisJSON.servers) {
    servers[server.server] = {
      url: server.url,
      emojis: []
    }
  }
  for (const category of allEmojiCategories) {
    for (const emoji of category.emojis) {
      emojis.push({...emoji, ...{category: category.name}});
      
      if (emoji.server in servers) {
        // this check is for any emojis that are not stored in a server
        servers[emoji.server].emojis.push(`<img title="${emoji.emoji_name}" class="disc-emoji" src="https://cdn.discordapp.com/emojis/${emoji.emoji_id}.webp?v=1">`);
      }
    }
  }

  return {
    emojis: emojis,
    servers: servers
  };
}

function selectTabOnPageLoad() {
  /* Select tab when loading page with pvme.io/pvme-settings#emojis. */
  const selectedTab = window.location.hash;
  if (selectedTab) {
    $(selectedTab).tab('show');
    if (selectedTab === '#emojis') selectSearchEmoji();
  } else {
    selectSearchEmoji(); // emojis is default tab
  }
}

$(document).ready(() => {
  populateTables();
  selectTabOnPageLoad();

  // Update the URL with the active tab ID
  $('.nav-link').click(function() {
    history.pushState(null, null, `#${$(this).attr('id')}`);   
  });

  // Automatically select search box when clicking emoji tab
  $('#emojis').click(() => {
    selectSearchEmoji();
  });
});
