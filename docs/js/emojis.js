export function populateEmojis(emojis) {
  const table = $("#table-emojis tbody");

  emojis.forEach((emoji, index) => {
    const emojiID = `<:${emoji.emoji_name}:${emoji.emoji_id}>`

    table.append(`
      <tr>
        <td><img  title="${emoji.emoji_name}" class="disc-emoji" src="https://cdn.discordapp.com/emojis/${emoji.emoji_id}.webp?v=1">&nbsp;&nbsp;${emoji.name}</td>
        <td><code>${emojiID}</code></td>
        <td>${emoji.category}</td>
        <td>${emoji.server}<button type="button" id="copy-emoji-${index}" class="btn btn-primary btn-sm" data-bs-trigger="focus" data-bs-container="body" data-bs-toggle="popover" data-bs-placement="right" data-bs-content="Copied!" style="float:right;">Copy</button></td>
      </tr>
    `);

    // copy to clipboard
    document.querySelector(`#copy-emoji-${index}`).addEventListener('click', () => navigator.clipboard.writeText(emojiID), false)
  });

  const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'))
  popoverTriggerList.map(function (popoverTriggerEl) {
    return new bootstrap.Popover(popoverTriggerEl);
  });

  updateEmojiTableResultCount(emojis.length);
}

export function selectSearchEmoji() {
  $('#search-emojis').focus();
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

// events
$("#search-emojis").keyup(function () {
  searchEmojiTableRows();
}); 
