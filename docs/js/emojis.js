export function populateEmojis(emojis) {
  const ITEM_TYPE_LABELS = {
    0: 'Inventory',
    1: 'Helm',
    2: 'Body',
    3: 'Legs',
    4: 'Main-hand weapon',
    5: 'Off-hand weapon',
    6: 'Gloves',
    7: 'Boots',
    8: 'Aura',
    9: 'Ammo',
    10: 'Necklace',
    11: 'Ring',
    12: 'Cape',
    13: 'Pocket',
  };

  const table = $("#table-emojis tbody");
  table.empty();

  emojis.forEach((emoji) => {
    const aliasesText = emoji.id_aliases?.length
      ? emoji.id_aliases.join(', ')
      : '–';

  table.append(`
    <tr visible="true">
      <!-- Identity -->
      <td>
        <div class="d-flex flex-column gap-1">
          <strong>${emoji.name}</strong>

          <div ${copyCell(emoji.id)}>
            <small class="text-muted">ID:</small>
            <code>${emoji.id}</code>
          </div>

          <div ${copyCell(aliasesText !== '–' ? aliasesText : null)}>
            <small class="text-muted">Aliases: ${aliasesText}</small>
          </div>
        </div>
      </td>

      <!-- Discord Emoji -->
      <td>
        <div class="d-flex flex-column gap-1">
          ${emoji.emoji_id ? `
            <img
              class="disc-emoji"
              src="https://cdn.discordapp.com/emojis/${emoji.emoji_id}.png"
              width="32"
              height="32"
            >
            <div ${copyCell("<:" + emoji.id + ":" + emoji.emoji_id + ">")}>
              <code>${emoji.emoji_id}</code>
            </div>
            <small class="text-muted">Server ${emoji.emoji_server}</small>
          ` : '–'}
        </div>
      </td>

      <!-- PvME Image -->
      <td>
        <div class="d-flex flex-column gap-1">
          ${emoji.image ? `
            <img
              src="https://img.pvme.io/images/${emoji.image}"
              width="32"
              height="32"
            >
            <div ${copyCell("https://img.pvme.io/images/" + emoji.image)}>
              <code>${emoji.image}</code>
            </div>
          ` : '–'}
        </div>
      </td>

      <!-- Preset Data -->
      <td>
        <div class="d-flex flex-column gap-1">
          ${emoji.preset_slot != null ? `
            <small>
              <strong>
                ${ITEM_TYPE_LABELS[emoji.preset_slot] ?? `Slot ${emoji.preset_slot}`}
              </strong>
            </small>
          ` : ''}

          ${emoji.preset_type ? `
            <small class="text-muted">
              Type: ${emoji.preset_type}
            </small>
          ` : ''}
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
