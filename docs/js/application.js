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
  for (const emoji of emojis) {
    let newRow = table.insertRow(-1);
    newRow.insertCell(-1).innerHTML = `<img  title="${emoji.emoji_name}" class="disc-emoji" src="https://cdn.discordapp.com/emojis/${emoji.emoji_id}.webp?v=1">&nbsp;&nbsp;${emoji.name}`;
    newRow.insertCell(-1).innerHTML = `<code><:${emoji.emoji_name}:${emoji.emoji_id}></code>`;
    newRow.insertCell(-1).innerHTML = `${emoji.category}<button type="button" id="copyEmoji" class="btn btn-secondary btn-sm" data-bs-trigger="focus" data-bs-container="body" data-bs-toggle="popover" data-bs-placement="right" data-bs-content="Copied!" onclick="copyEmojiToClipboard(this)" style="float:right;">Copy</button>`;
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

function copyEmojiToClipboard(button) {
  /* Copy emoji ID from table row of the pressed button. */
  const row = button.parentNode.parentNode;
  const emojiID = row.cells[2].innerText

  navigator.clipboard.writeText(emojiID);
}

function selectSearchEmoji() {
  const searchBox = document.getElementById('search-emojis');
  searchBox.focus();
  searchBox.select();  
}

function updateEmojiTableResultCount(resultCount) {
  $(".counter").text(`${resultCount} emojis`);
}

function selectTabOnPageLoad() {
  /* Select tab when loading page with pvme.io/pvme-settings#emojis. */
  const selectedTab = window.location.hash;
  if (selectedTab) {
    $(selectedTab).tab('show');

    if (selectedTab === '#emojis') selectSearchEmoji();
  }
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
    var searchTerm = $("#search-emojis").val();
    var searchSplit = searchTerm.replace(/ /g, "'):containsi('");
    
    console.log(searchSplit);
    $.extend($.expr[":"], {
      containsi: function (elem, i, match, array) {
        return (
          (elem.textContent || elem.innerText || "")
            .toLowerCase()
            .indexOf((match[3] || "").toLowerCase()) >= 0
        );
      }
    });

    $(".results tbody tr")
      .not(":containsi('" + searchSplit + "')")
      .each(function (e) {
        $(this).attr("visible", "false");
      });

    $(".results tbody tr:containsi('" + searchSplit + "')").each(function () {
      $(this).attr("visible", "true");
    });
    

    const resultCount = $('.results tbody tr[visible="true"]').length;
    updateEmojiTableResultCount(resultCount);
    // $(".counter").text(jobCount + " emojis");

    if (resultCount == "0") {
      $(".no-result").show();
    } else {
      $(".no-result").hide();
    }
  }); 
});