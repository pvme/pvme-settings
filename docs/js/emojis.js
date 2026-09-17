const PAGE_SIZE = 100;

const ITEM_TYPE_LABELS = {
  0: 'Inventory', 1: 'Helm', 2: 'Body', 3: 'Legs', 4: 'Main-hand weapon',
  5: 'Off-hand weapon', 6: 'Gloves', 7: 'Boots', 8: 'Aura', 9: 'Ammo',
  10: 'Necklace', 11: 'Ring', 12: 'Cape', 13: 'Pocket',
};

let allEmojis = [];
let matchingEmojis = [];
let renderedCount = 0;
let paginationObserver;

export function populateEmojis(emojis) {
  allEmojis = emojis;
  applyEmojiFilter();
}

export function selectSearchEmoji() {
  $('#search-emojis').focus();
}

export function refreshEmojiHeaderCount() {
  updateEmojiListStatus();
}

function emojiRow(emoji) {
  const aliasesText = emoji.id_aliases?.length ? emoji.id_aliases.join(', ') : '–';
  return `
    <tr>
      <td><div class="d-flex flex-column gap-1">
        <strong>${emoji.name}</strong>
        <div ${copyCell(emoji.id)}><small class="text-muted">ID:</small> <code>${emoji.id}</code></div>
        <div ${copyCell(aliasesText !== '–' ? aliasesText : null)}><small class="text-muted">Aliases: ${aliasesText}</small></div>
      </div></td>
      <td><div class="d-flex flex-column gap-1">${emoji.emoji_id ? `
        <img class="disc-emoji" src="https://cdn.discordapp.com/emojis/${emoji.emoji_id}.png" width="32" height="32">
        <div ${copyCell(`<:${emoji.id}:${emoji.emoji_id}>`)}><code>${emoji.emoji_id}</code></div>
        <small class="text-muted">Server ${emoji.emoji_server}</small>` : '–'}
      </div></td>
      <td><div class="d-flex flex-column gap-1">${emoji.image ? `
        <img src="https://img.pvme.io/images/${emoji.image}" width="32" height="32">
        <div ${copyCell(`https://img.pvme.io/images/${emoji.image}`)}><code>${emoji.image}</code></div>` : '–'}
      </div></td>
      <td><div class="d-flex flex-column gap-1">
        ${emoji.preset_slot != null ? `<small><strong>${ITEM_TYPE_LABELS[emoji.preset_slot] ?? `Slot ${emoji.preset_slot}`}</strong></small>` : ''}
        ${emoji.preset_type ? `<small class="text-muted">Type: ${emoji.preset_type}</small>` : ''}
      </div></td>
    </tr>`;
}

function applyEmojiFilter() {
  const terms = ($('#search-emojis').val() || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  matchingEmojis = terms.length
    ? allEmojis.filter(emoji => terms.every(term => searchableEmojiText(emoji).includes(term)))
    : allEmojis;
  renderedCount = 0;
  $('#table-emojis tbody').empty();
  renderNextEmojiPage();
}

function searchableEmojiText(emoji) {
  return [emoji.name, emoji.id, ...(emoji.id_aliases || []), emoji.emoji_id, emoji.emoji_server, emoji.image, emoji.preset_type]
    .filter(Boolean).join(' ').toLowerCase();
}

function renderNextEmojiPage() {
  if (renderedCount >= matchingEmojis.length) {
    updateEmojiListStatus();
    return;
  }
  const nextPage = matchingEmojis.slice(renderedCount, renderedCount + PAGE_SIZE);
  $('#table-emojis tbody').append(nextPage.map(emojiRow).join(''));
  renderedCount += nextPage.length;
  enhanceEmojiRows();
  updateEmojiListStatus();
}

function updateEmojiListStatus() {
  if (document.getElementById('nav-servers')?.classList.contains('active')) return;
  const remaining = matchingEmojis.length - renderedCount;
  $('#count-emojis').text(remaining ? `${matchingEmojis.length} icons · ${renderedCount} shown` : `${matchingEmojis.length} icons`);
  const controls = document.getElementById('emoji-pagination');
  const loadMore = document.getElementById('load-more-emojis');
  if (!controls || !loadMore) return;
  controls.hidden = remaining === 0;
  loadMore.textContent = `Load ${Math.min(PAGE_SIZE, remaining)} more (${remaining} remaining)`;
}

function setupPagination() {
  const loadMore = document.getElementById('load-more-emojis');
  const sentinel = document.getElementById('emoji-pagination-sentinel');
  if (!loadMore || !sentinel) return;
  loadMore.addEventListener('click', renderNextEmojiPage);
  if (!('IntersectionObserver' in window)) return;
  paginationObserver?.disconnect();
  paginationObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) renderNextEmojiPage();
  }, { rootMargin: '240px 0px' });
  paginationObserver.observe(sentinel);
}

function copyCell(value) {
  if (!value) return '';
  return `class="copyable" role="button" data-copy="${escapeAttr(value)}" data-bs-toggle="popover" data-bs-trigger="hover" data-bs-placement="top" data-bs-content="Copy"`;
}

function escapeAttr(value) {
  return value.replace(/"/g, '&quot;');
}

function enhanceEmojiRows() {
  document.querySelectorAll('#table-emojis [data-copy]:not([data-copy-ready])').forEach(el => {
    el.dataset.copyReady = '';
    el.addEventListener('click', () => {
      navigator.clipboard.writeText(el.dataset.copy);
      const popover = bootstrap.Popover.getInstance(el);
      if (popover) {
        popover.setContent({ '.popover-body': 'Copied!' });
        setTimeout(() => popover.setContent({ '.popover-body': 'Copy' }), 800);
      }
    });
  });
  document.querySelectorAll('#table-emojis [data-bs-toggle="popover"]:not([data-popover-ready])').forEach(el => {
    el.dataset.popoverReady = '';
    new bootstrap.Popover(el);
  });
}

document.addEventListener('DOMContentLoaded', setupPagination, { once: true });
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('search-emojis')?.addEventListener('input', applyEmojiFilter);
}, { once: true });
