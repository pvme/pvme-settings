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
  var table = document.getElementById("serverTable");
  
  for (const [serverID, serverData] of Object.entries(servers)) {
    let newRow = table.insertRow(-1);
    newRow.insertCell(-1).innerHTML = serverID;
    newRow.insertCell(-1).innerHTML = serverData.emojis.join(' ');
    newRow.insertCell(-1).innerHTML = `<a class="btn btn-primary btn-sm" href="${serverData.url} align="center" role="button" target="_blank">Join</a>`;
  }
}

function populateEmojis(emojis) {
  var table = document.getElementById("emojiTable");
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
  let searchBox = document.getElementById('searchEmoji');
  searchBox.focus();
  searchBox.select();  
}

function updateEmojiTableResultCount(resultCount) {
  $(".counter").text(resultCount + " emojis");
}


$(document).ready(function () {
  
  // populateRandom();
  populateTables();

  // Check for the active tab in the URL on page load
  var selectedTab = window.location.hash;
  if (selectedTab) {
    // console.log(selectedTab);
    // console.log(selectedTab);
    // Activate the tab based on the URL hash
    // $('.nav-link[href="' + hash + '"]').tab('show');
    // console.log(selectedTab);
    // selectSearchEmoji();
    
    $(selectedTab).tab('show');

    if (selectedTab === '#emojis') selectSearchEmoji();
  }

  // Update the URL with the active tab's ID
  $('.nav-link').click(function() {
    var id = $(this).attr('hash')
    console.log({id});
    
    history.pushState(null, null, '#' + $(this).attr('id'));
    // selectSearchEmoji();
    
  });

  
  // Automatically select search box when clicking emoji tab
  // $('#emojis').click( function() {
  //   console.log('hi0');
  // });

  // automatically select search

  $(".search").keyup(function () {
    var searchTerm = $(".search").val();
    // var listItem = $(".results tbody").children("tr");
    var searchSplit = searchTerm.replace(/ /g, "'):containsi('");

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
    $(".counter").text(jobCount + " emojis");

    if (jobCount == "0") {
      $(".no-result").show();
    } else {
      $(".no-result").hide();
    }
  }); 
});