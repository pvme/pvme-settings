// import { hello } from './github.js';


async function rawGithubGetRequest(url) {
  const res = await fetch(url, {
      method: 'GET'
  });
  
  if (!res.ok)
      throw new Error(await res.text());

  return res;
}

async function rawGithubJSONRequest(url) {
  const res = await rawGithubGetRequest(url);
  return await res.json();
}

function populateServers(servers) {
  const table = document.getElementById("table-servers");
  
  for (const [serverID, serverData] of Object.entries(servers)) {
    let newRow = table.insertRow(-1);
    newRow.insertCell(-1).innerHTML = serverID;
    newRow.insertCell(-1).innerHTML = serverData.emojis.join(' ');
    newRow.insertCell(-1).innerHTML = `<a class="btn btn-primary btn-sm" href="${serverData.url} align="center" role="button" target="_blank">Join</a>`;
  }
}

function populateEmojis(emojis) {
  const table = document.getElementById("table-emojis");
  var count = 1;
  for (const emoji of emojis) {
    count ++;
    let newRow = table.insertRow(-1);
    newRow.insertCell(-1).innerHTML = `<img  title="${emoji.emoji_name}" class="disc-emoji" src="https://cdn.discordapp.com/emojis/${emoji.emoji_id}.webp?v=1">&nbsp;&nbsp;${emoji.name}`;
    newRow.insertCell(-1).innerHTML = `<code><:${emoji.emoji_name}:${emoji.emoji_id}></code>`;
    // newRow.insertCell(-1).innerHTML = `${emoji.category}<button type="button" id="copyEmoji" class="btn btn-secondary btn-sm" data-bs-trigger="focus" data-bs-container="body" data-bs-toggle="popover" data-bs-placement="right" data-bs-content="Copied!" onclick="copyEmojiToClipboard(this)" style="float:right;">Copy</button>`;
    newRow.insertCell(-1).innerHTML = `${emoji.category}<button type="button" id="copy-emoji-${count}" class="btn btn-secondary btn-sm" data-bs-trigger="focus" data-bs-container="body" data-bs-toggle="popover" data-bs-placement="right" data-bs-content="Copied!" style="float:right;">Copy</button>`;
    
    document.querySelector(`#copy-emoji-${count}`).addEventListener('click', () => navigator.clipboard.writeText(`<:${emoji.emoji_name}:${emoji.emoji_id}>`), false)
  }

  const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'))
  popoverTriggerList.map(function (popoverTriggerEl) {
    return new bootstrap.Popover(popoverTriggerEl);
  });

  updateEmojiTableResultCount(emojis.length);
}

async function populateTables() {
  const emojisJSON = await rawGithubJSONRequest('https://raw.githubusercontent.com/pvme/pvme-settings/master/emojis/emojis.json');
  
  const allEmojiCategories = [...emojisJSON.categories, {
    name: 'Uncategorized',
    emojis: emojisJSON.uncategorized
  }];

  var emojis = [];
  var servers = {};

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

  populateEmojis(emojis);
  populateServers(servers);
}

function selectSearchEmoji() {
  const searchBox = document.getElementById('search-emojis');
  searchBox.focus();
  searchBox.select();  
}



function selectTabOnPageLoad() {
  /* Select tab when loading page with pvme.io/pvme-settings#emojis. */
  const selectedTab = window.location.hash;
  if (selectedTab) {
    $(selectedTab).tab('show');
    if (selectedTab === '#emojis') selectSearchEmoji();
  }
}

function updateEmojiTableResultCount(resultCount) {
  $("#count-emojis").text(`${resultCount} emojis`);
}

function searchEmojiTableRows() {
  const searchTerm = $("#search-emojis").val();
  const searchSplit = searchTerm.replace(/ /g, "'):containsi('");
    
  $.extend($.expr[":"], {
    containsi: function (elem, i, match, array) {
      return (
        (elem.textContent || elem.innerText || "")
          .toLowerCase()
          .indexOf((match[3] || "").toLowerCase()) >= 0
      );
    }
  });

  $("#table-emojis tbody tr")
    .not(":containsi('" + searchSplit + "')")
    .each(function (e) {
      $(this).attr("visible", "false");
    });

  $("#table-emojis tbody tr:containsi('" + searchSplit + "')").each(function () {
    $(this).attr("visible", "true");
  });
  
  const resultCount = $('#table-emojis tbody tr[visible="true"]').length;
  updateEmojiTableResultCount(resultCount);

  if (resultCount === 0) $(".no-result").show()
  else $(".no-result").hide();
}


$(document).ready(function () {
  
  populateTables();

  selectTabOnPageLoad();

  // Update the URL with the active tab ID
  $('.nav-link').click(function() {
    const id = $(this).attr('id')
    history.pushState(null, null, `#${id}`);   
  });
  
  // Automatically select search box when clicking emoji tab
  $('#emojis').click(function() {
    selectSearchEmoji();
  });

  $("#search-emojis").keyup(function () {
    searchEmojiTableRows();
  }); 
});