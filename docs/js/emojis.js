export function populateEmojis(emojis) {
  const table = $("#table-emojis tbody");
  table.empty();

  emojis.forEach((emoji) => {
    const imageUrl = getEmojiImageUrl(emoji);
    const aliasesText = emoji.id_aliases?.length
      ? emoji.id_aliases.join(', ')
      : '–';

    table.append(`
      <tr visible="true">
        <td>
          <div class="d-flex align-items-center gap-2">
            ${imageUrl ? `<img class="disc-emoji" src="${imageUrl}">` : ''}
            <span>${emoji.name}</span>
          </div>
        </td>

        <td ${copyCell(emoji.id)}>
          <code>${emoji.id}</code>
        </td>

        <td ${copyCell(aliasesText !== '–' ? aliasesText : null)}>
          <code>${aliasesText}</code>
        </td>

        <td>
          <div class="d-flex gap-2 flex-wrap">
            ${renderDiscordBadge(emoji)}
            ${renderPvmeImageBadge(emoji)}
          </div>
        </td>
      </tr>
    `);
  });

  enableCopyHandlers();
  enablePopovers();
  enableTooltips();
  updateEmojiTableResultCount(emojis.length);
}

export function selectSearchEmoji() {
  $('#search-emojis').focus();
}

/* ---------- badge renderers ---------- */

function renderDiscordBadge(emoji) {
  if (!emoji.emoji_id) return '';

  const copyValue = `<:${emoji.id}:${emoji.emoji_id}>`;

  return `
    <span
      class="badge badge-discord copyable"
      role="button"
      data-copy="${escapeAttr(copyValue)}"
      data-bs-toggle="popover"
      data-bs-trigger="hover"
      data-bs-placement="top"
      data-bs-content="Copy for use in guides"
    >
      ${emoji.emoji_id} (Server ${emoji.emoji_server})
    </span>
  `;
}

function renderPvmeImageBadge(emoji) {
  if (!emoji.image) return '';

  const imageUrl = `https://img.pvme.io/images/${emoji.image}`;

  return `
    <span
      class="badge badge-pvme copyable"
      role="button"
      data-copy="${imageUrl}"
      data-bs-toggle="popover"
      data-bs-trigger="hover"
      data-bs-placement="top"
      data-bs-content="Copy PvME Image URL"
    >
      PvME Image
    </span>
  `;
}

/* ---------- helpers ---------- */

function getEmojiImageUrl(emoji) {
  if (emoji.emoji_id) {
    return `https://cdn.discordapp.com/emojis/${emoji.emoji_id}.png`;
  }
  if (emoji.image) {
    return `https://img.pvme.io/images/${emoji.image}`;
  }
  return null;
}

function copyCell(value) {
  if (!value) return '';
  return `
    class="copyable"
    role="button"
    data-copy="${escapeAttr(value)}"
    data-bs-toggle="popover"
    data-bs-trigger="hover"
    data-bs-placement="top"
    data-bs-content="Copy"
  `;
}

function escapeAttr(value) {
  return value.replace(/"/g, '&quot;');
}

/* ---------- copy / popovers / tooltips ---------- */

function enableCopyHandlers() {
  document.querySelectorAll('[data-copy]').forEach(el => {
    el.addEventListener('click', () => {
      navigator.clipboard.writeText(el.dataset.copy);

      const popover = bootstrap.Popover.getInstance(el);
      if (popover) {
        popover.setContent({ '.popover-body': 'Copied!' });
        setTimeout(
          () => popover.setContent({ '.popover-body': 'Copy' }),
          800
        );
      }
    });
  });
}

function enablePopovers() {
  document
    .querySelectorAll('[data-bs-toggle="popover"]')
    .forEach(el => new bootstrap.Popover(el));
}

function enableTooltips() {
  document
    .querySelectorAll('[data-bs-toggle="tooltip"]')
    .forEach(el => new bootstrap.Tooltip(el));
}

/* ---------- search ---------- */

function updateEmojiTableResultCount(resultCount) {
  $("#count-emojis").text(`${resultCount} emojis`);
}

function searchEmojiTableRows() {
  const searchTerm = $("#search-emojis").val();
  const searchSplit = searchTerm.replace(/ /g, "'):containsi('");

  $.extend($.expr[":"], {
    containsi: function (elem, i, match) {
      return (
        (elem.textContent || elem.innerText || "")
          .toLowerCase()
          .includes((match[3] || "").toLowerCase())
      );
    }
  });

  $("#table-emojis tbody tr")
    .not(":containsi('" + searchSplit + "')")
    .attr("visible", "false");

  $("#table-emojis tbody tr:containsi('" + searchSplit + "')")
    .attr("visible", "true");

  updateEmojiTableResultCount(
    $('#table-emojis tbody tr[visible="true"]').length
  );
}

$("#search-emojis").keyup(searchEmojiTableRows);
