import { createPresetIconContribution, MAX_ICONS } from './iconContribution.mjs';
import { fuzzyMatches, loadAtlas, visualMatches } from './matching.mjs';
import { contributionEndpoint } from './config.mjs';
import { selectedPayload, sendBatch } from './client.mjs';

const $ = id => document.getElementById(id);
const cleaner = createPresetIconContribution(new URL('../../images/icon-cleanup', import.meta.url).href);
const steps = ['upload', 'details', 'submit'];
const state = { cards: [], catalogue: [], categories: [], image: null, crop: null, scanController: null, detectedSlots: [], ready: false, submitting: false, step: 'upload', activeIndex: 0, attemptedAdvance: false, atlas: null, successUrl: null };
const status = text => { $('contribution-status').textContent = text; };

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function generatedId(name, currentCard) {
  const base = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'icon';
  const taken = new Set(state.catalogue.flatMap(icon => [icon.id, ...(icon.id_aliases || [])]).concat(state.cards.filter(card => card !== currentCard).map(card => card.id)).map(value => value.toLowerCase()));
  let candidate = base, suffix = 2;
  while (taken.has(candidate.toLowerCase())) { const tail = `_${suffix++}`; candidate = base.slice(0, 64 - tail.length) + tail; }
  return candidate;
}
function validId(id) { return /^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,63}$/.test(id); }
function region() { return state.crop; }
function setRegion(box) { state.crop = box; draw(); }
function includedCards() { return state.cards.filter(card => card.selected); }

export function slotsInsideCrop(slots, box) {
  return slots.filter(slot => slot.x >= box.x && slot.y >= box.y && slot.x + 38 <= box.x + box.w && slot.y + 34 <= box.y + box.h);
}
function draw() {
  if (!state.image) return;
  const canvas = $('screenshot-preview'), ctx = canvas.getContext('2d');
  ctx.drawImage(state.image, 0, 0);
  const box = region() || { x: 0, y: 0, w: state.image.width, h: state.image.height };
  const included = new Set(slotsInsideCrop(state.detectedSlots, box));
  for (const slot of state.detectedSlots) {
    ctx.strokeStyle = included.has(slot) ? '#8bc6a0' : 'rgba(180, 190, 210, .6)';
    ctx.lineWidth = included.has(slot) ? 2 : 1;
    ctx.strokeRect(slot.x + .5, slot.y + .5, 37, 33);
  }
  ctx.strokeStyle = '#aa8dff'; ctx.lineWidth = 2; ctx.strokeRect(box.x, box.y, box.w, box.h);
  const count = state.detectedSlots.length, selected = included.size;
  $('detected-slot-count').textContent = count ? `${selected} of ${count} detected slots included` : 'No item slots detected yet.';
}
async function readScreenshot(file) {
  if (!file || file.type !== 'image/png' || file.size > 6 * 1024 * 1024) throw new Error('Choose an original PNG smaller than 6 MB. JPEG, WebP and resized images are not supported.');
  const header = new DataView(await file.slice(0, 24).arrayBuffer());
  if (header.byteLength < 24 || header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a) throw new Error('This file is not a PNG.');
  if (header.getUint32(16) > 2048 || header.getUint32(20) > 2048) throw new Error('Crop the original screenshot to at most 2048 pixels on each side before uploading. Do not resize it.');
  const url = URL.createObjectURL(file);
  try { const image = new Image(); image.src = url; await image.decode(); return image; }
  finally { URL.revokeObjectURL(url); }
}
async function openFile(file) {
  if (state.submitting) return;
  const revision = state.fileRevision = (state.fileRevision || 0) + 1;
  state.scanController?.abort();
  try {
    const image = await readScreenshot(file);
    if (state.fileRevision !== revision) return;
    state.image = image; state.detectedSlots = []; state.cards = []; state.activeIndex = 0; state.step = 'upload'; state.attemptedAdvance = false; state.successUrl = null;
    $('icon-thumbnails').replaceChildren(); $('icon-editor').replaceChildren();
    const canvas = $('screenshot-preview'); canvas.width = image.width; canvas.height = image.height;
    $('crop-controls').hidden = false; setRegion({ x: 0, y: 0, w: image.width, h: image.height });
    showStep(); status('Finding item slots in this screenshot…'); identifySlots(image, revision);
  } catch (error) { status(error.message); }
}
async function identifySlots(image, revision) {
  const controller = new AbortController(); state.scanController = controller;
  try {
    const slots = await cleaner.extract(image, controller.signal);
    if (state.fileRevision !== revision || controller.signal.aborted) return;
    state.detectedSlots = slots; draw(); replaceCards(slotsInsideCrop(slots, region()));
    status(slots.length ? `Prepared ${slots.length} detected icon${slots.length === 1 ? '' : 's'} for review.` : 'No item slots were detected. Check the screenshot requirements.');
  } catch (error) {
    if (error.name === 'AbortError' || state.fileRevision !== revision) return;
    state.detectedSlots = []; replaceCards([]); draw(); status('No item slots were detected. Check the screenshot requirements.');
  }
}
function replaceCards(icons) {
  state.cards = icons.slice(0, MAX_ICONS).map((icon, index) => ({ ...icon, selected: index < 10, name: '', id: '', idManual: false, category: '', id_aliases: [], preset_type: 'item', preset_slot: undefined, preview: 'cleaned', touched: {}, visual: null, showMoreVisual: false, showMoreNames: false, moreDetailsOpen: false }));
  state.activeIndex = 0; state.attemptedAdvance = false;
  state.cards.forEach(queueVisualMatches); renderReview(); updateFooter();
}

function cardIssue(card) {
  if (!card.name.trim()) return ['name', 'Add a name.'];
  if (!validId(card.id)) return ['id', 'Use 1–64 letters, digits, underscores or hyphens.'];
  if (!card.category) return ['category', 'Choose a category.'];
  if (card.id_aliases.length > 10 || card.id_aliases.some(id => !validId(id))) return ['aliases', 'Each alias needs a valid ID.'];
  if (card.preset_type === 'item' && !Number.isInteger(card.preset_slot)) return ['slot', 'Choose an inventory slot.'];
  return null;
}
function selectionProblem(cards = includedCards()) {
  if (!cards.length) return 'Include at least one icon.';
  if (cards.length > 10) return 'Include no more than 10 icons in one suggestion.';
  return cards.map(cardIssue).find(Boolean)?.[1] || '';
}
function readyCount() { return includedCards().filter(card => !cardIssue(card)).length; }
function nameMatches(card) { return fuzzyMatches([card.name, card.id, ...card.id_aliases], state.catalogue); }
function possibleDuplicate(card) { return nameMatches(card).length || card.visual?.length; }
function cardStatus(card) {
  if (!card.selected) return ['excluded', 'Excluded'];
  if (cardIssue(card)) return ['needs-details', 'Needs details'];
  if (possibleDuplicate(card)) return ['possible-duplicate', 'Possible duplicate'];
  return ['ready', 'Ready'];
}
function focusCard(index) { state.activeIndex = index; renderReview(); updateFooter(); }
function renderThumbnails() {
  const list = $('icon-thumbnails'); list.replaceChildren();
  state.cards.forEach((card, index) => {
    const [kind, label] = cardStatus(card);
    const tile = element('article', '', `icon-thumb ${index === state.activeIndex ? 'active' : ''}`);
    const select = element('button', '', 'icon-thumb-select'); select.type = 'button'; select.setAttribute('aria-pressed', String(index === state.activeIndex));
    const image = element('img'); image.src = card.icon; image.alt = ''; image.width = 48; image.height = 43; image.className = 'icon-preview';
    const copy = element('span', '', 'icon-thumb-copy'); copy.append(element('strong', card.name.trim() || 'Unnamed'), element('span', label, `status-dot ${kind}`));
    const inclusion = element('input'); inclusion.type = 'checkbox'; inclusion.checked = card.selected; inclusion.className = 'form-check-input'; inclusion.setAttribute('aria-label', `Include ${card.name || `icon ${index + 1}`} in suggestion`);
    inclusion.addEventListener('change', () => { card.selected = inclusion.checked; renderReview(); updateFooter(); });
    select.append(image, copy); select.addEventListener('click', () => focusCard(index)); tile.append(select, inclusion); list.append(tile);
  });
}
function field(container, label, control, error, key, card) {
  const wrapper = element('label', '', 'editor-field'); wrapper.append(element('span', label, 'field-label'), control);
  if (error && (state.attemptedAdvance || card.touched[key])) wrapper.append(element('span', error, 'field-error'));
  container.append(wrapper); return wrapper;
}
function fieldError(card, key) { const issue = cardIssue(card); return issue?.[0] === key ? issue[1] : ''; }
function updateEditorAfterChange(card, duplicatePanel) {
  renderThumbnails(); updateFooter(); if (duplicatePanel?.isConnected) renderDuplicates(card, duplicatePanel);
}
function renderEditor() {
  const root = $('icon-editor'); root.replaceChildren(); const card = state.cards[state.activeIndex];
  if (!card) { root.append(element('div', 'Choose an icon to review.', 'editor-empty')); return; }
  const header = element('div', '', 'editor-heading');
  const heading = element('div'); heading.append(element('div', `Icon ${state.activeIndex + 1}`, 'eyebrow'), element('h3', card.name || 'Unnamed icon', 'h5 mb-0'));
  const exclude = element('button', card.selected ? 'Exclude' : 'Include', 'btn btn-sm btn-outline-secondary'); exclude.type = 'button'; exclude.addEventListener('click', () => { card.selected = !card.selected; renderReview(); updateFooter(); }); header.append(heading, exclude); root.append(header);
  const hero = element('div', '', 'editor-hero');
  const art = element('img'); art.src = card.preview === 'original' ? card.original : card.icon; art.alt = card.preview === 'original' ? 'Original slot' : 'Cleaned transparent icon'; art.className = 'editor-art icon-preview'; art.width = 190; art.height = 170;
  const comparison = element('div', '', 'comparison-toggle');
  for (const [label, value] of [['Cleaned', 'cleaned'], ['Original', 'original']]) { const button = element('button', label, `btn btn-sm ${card.preview === value ? 'btn-primary' : 'btn-outline-secondary'}`); button.type = 'button'; button.addEventListener('click', () => { card.preview = value; renderEditor(); }); comparison.append(button); }
  const download = element('a', 'Download PNG', 'btn btn-sm btn-link'); download.href = card.icon; download.download = `icon-${state.activeIndex + 1}.png`;
  hero.append(art, element('div', card.preview === 'original' ? 'Original slot' : 'Transparent PNG', 'small text-muted'), comparison, download); root.append(hero);
  const essentials = element('div', '', 'editor-essentials');
  const name = element('input'); name.className = 'form-control'; name.maxLength = 100; name.autocomplete = 'off'; name.value = card.name; name.placeholder = 'e.g. Ectoplasm';
  const id = element('input'); id.className = 'form-control form-control-sm'; id.maxLength = 64; id.autocomplete = 'off'; id.value = card.id; id.placeholder = 'unique_id';
  const duplicates = element('section', '', 'duplicate-review');
  name.addEventListener('input', () => { card.name = name.value; card.touched.name = true; if (!card.idManual) { card.id = generatedId(card.name, card); id.value = card.id; } updateEditorAfterChange(card, duplicates); });
  name.addEventListener('blur', () => { card.touched.name = true; renderEditor(); }); field(essentials, 'Name', name, fieldError(card, 'name'), 'name', card);
  const type = element('select'); type.className = 'form-select'; [['Item', 'item'], ['Relic', 'relic'], ['Familiar', 'familiar'], ['No type', '']].forEach(([label, value]) => type.append(new Option(label, value))); type.value = card.preset_type;
  type.addEventListener('change', () => { card.preset_type = type.value; if (type.value !== 'item') card.preset_slot = undefined; renderEditor(); updateFooter(); });
  field(essentials, 'Type of icon', type, '', 'type', card); root.append(essentials);
  const idRow = element('div', '', 'editor-id-row'); id.addEventListener('input', () => { card.id = id.value; card.idManual = true; card.touched.id = true; updateEditorAfterChange(card, duplicates); }); id.addEventListener('blur', () => { card.touched.id = true; renderEditor(); }); field(idRow, 'Unique ID', id, fieldError(card, 'id'), 'id', card); root.append(idRow);
  root.append(duplicates); renderDuplicates(card, duplicates);
  const more = element('details', '', 'editor-more'); more.open = card.moreDetailsOpen; more.addEventListener('toggle', () => { card.moreDetailsOpen = more.open; }); more.append(element('summary', 'More details'));
  const detailGrid = element('div', '', 'detail-grid');
  const category = element('select'); category.className = 'form-select form-select-sm'; category.append(new Option('Choose category', '')); state.categories.forEach(value => category.append(new Option(value, value))); category.value = card.category;
  category.addEventListener('change', () => { card.category = category.value; card.touched.category = true; card.moreDetailsOpen = true; renderEditor(); updateFooter(); }); field(detailGrid, 'Category', category, fieldError(card, 'category'), 'category', card);
  const aliases = element('input'); aliases.className = 'form-control form-control-sm'; aliases.maxLength = 650; aliases.autocomplete = 'off'; aliases.value = card.id_aliases.join(', '); aliases.placeholder = 'comma-separated aliases';
  aliases.addEventListener('input', () => { card.id_aliases = aliases.value.split(',').map(value => value.trim()).filter(Boolean); card.touched.aliases = true; updateEditorAfterChange(card, duplicates); }); aliases.addEventListener('blur', () => { card.touched.aliases = true; renderEditor(); }); field(detailGrid, 'Aliases', aliases, fieldError(card, 'aliases'), 'aliases', card);
  if (card.preset_type === 'item') {
    const slot = element('select'); slot.className = 'form-select form-select-sm'; slot.append(new Option('Choose inventory slot', ''));
    ['Inventory', 'Helm', 'Body', 'Legs', 'Main-hand weapon', 'Off-hand weapon', 'Gloves', 'Boots', 'Aura', 'Ammo', 'Necklace', 'Ring', 'Cape', 'Pocket'].forEach((label, index) => slot.append(new Option(`${index}: ${label}`, index)));
    slot.value = Number.isInteger(card.preset_slot) ? card.preset_slot : ''; slot.addEventListener('change', () => { card.preset_slot = slot.value === '' ? undefined : Number(slot.value); card.touched.slot = true; card.moreDetailsOpen = true; renderEditor(); updateFooter(); }); field(detailGrid, 'Inventory slot', slot, fieldError(card, 'slot'), 'slot', card);
  }
  more.append(detailGrid); root.append(more);
}
function matchingIcon(entry) { return entry.icon || state.catalogue.find(icon => icon.id === entry.id); }
function iconImage(icon) { const image = element('img'); image.width = 28; image.height = 28; image.alt = ''; image.loading = 'lazy'; image.className = 'match-image icon-preview'; image.src = icon.image ? `https://img.pvme.io/images/${encodeURIComponent(icon.image)}` : `https://cdn.discordapp.com/emojis/${encodeURIComponent(icon.emoji_id)}.png`; return image; }
function inspectMatch(icon) { bootstrap.Modal.getInstance($('contribution-modal'))?.hide(); new bootstrap.Tab($('emojis')).show(); $('search-emojis').value = icon.id; $('search-emojis').dispatchEvent(new Event('input', { bubbles: true })); }
function matchGroup(title, kind, entries, showMore, onMore) {
  const section = element('div', '', 'match-group'); section.append(element('div', title, 'match-title'));
  const visible = entries.slice(0, showMore ? 5 : 3);
  if (!visible.length) section.append(element('p', kind === 'visual' ? 'No close artwork match found.' : 'No similar name or ID found.', 'small text-muted mb-0'));
  for (const entry of visible) { const icon = matchingIcon(entry); if (!icon) continue; const row = element('div', '', 'match-card'); row.append(iconImage(icon)); const copy = element('span', '', 'match-copy'); copy.append(element('strong', icon.name), element('span', icon.id)); const inspect = element('button', 'Inspect', 'btn btn-sm btn-link'); inspect.type = 'button'; inspect.addEventListener('click', () => inspectMatch(icon)); row.append(copy, inspect); section.append(row); }
  if (entries.length > 3 && !showMore) { const more = element('button', 'Show more', 'btn btn-sm btn-link'); more.type = 'button'; more.addEventListener('click', onMore); section.append(more); }
  return section;
}
function renderDuplicates(card, root) {
  root.replaceChildren(); const heading = element('div', '', 'duplicate-heading'); heading.append(element('h4', 'Possible duplicates', 'h6 mb-0'), element('span', 'A match does not prevent a different variant.', 'small text-muted')); root.append(heading);
  root.append(matchGroup('Image matches', 'visual', card.visual || [], card.showMoreVisual, () => { card.showMoreVisual = true; renderDuplicates(card, root); }));
  root.append(matchGroup('Name and ID matches', 'name', nameMatches(card), card.showMoreNames, () => { card.showMoreNames = true; renderDuplicates(card, root); }));
  if (card.visual === null) root.append(element('p', 'Checking similar artwork…', 'small text-muted mb-0'));
}
function queueVisualMatches(card) { state.atlas.then(entries => visualMatches(card.icon, entries)).then(matches => { card.visual = matches; renderThumbnails(); if (state.cards[state.activeIndex] === card) renderEditor(); }).catch(() => { card.visual = []; if (state.cards[state.activeIndex] === card) renderEditor(); }); }
function renderReview() { $('review-summary').textContent = `${readyCount()} of ${includedCards().length} ready`; renderThumbnails(); renderEditor(); }
function renderSubmission() {
  const root = $('submission-summary'); root.replaceChildren(); const included = includedCards(); root.append(element('h3', 'Review your suggestion', 'h5'), element('p', `${included.length} icon${included.length === 1 ? '' : 's'} will be included.`, 'text-muted mb-2'));
  const list = element('div', '', 'submission-icons'); included.forEach(card => { const row = element('div', '', 'submission-icon'); const image = element('img'); image.src = card.icon; image.alt = ''; image.width = 38; image.height = 34; image.className = 'icon-preview'; row.append(image, element('span', card.name)); list.append(row); }); root.append(list);
  $('submission-form').hidden = !!state.successUrl; const success = $('submission-success'); success.hidden = !state.successUrl;
  if (state.successUrl) { const link = element('a', 'View pull request'); link.href = state.successUrl; link.target = '_blank'; link.rel = 'noopener'; success.replaceChildren('Suggestion submitted. ', link); }
}
function updateFooter() {
  const included = includedCards(), problem = selectionProblem(included), ready = readyCount(); const primary = $('footer-primary'), back = $('footer-back'), next = $('footer-next-incomplete');
  back.hidden = state.step === 'upload' || !!state.successUrl; next.hidden = state.step !== 'details' || !included.some(card => cardIssue(card));
  if (state.step === 'upload') { $('footer-progress').textContent = state.cards.length ? `${included.length} icon${included.length === 1 ? '' : 's'} selected` : 'Upload a screenshot to begin'; primary.textContent = 'Review icons'; primary.hidden = false; primary.disabled = !state.cards.length; }
  else if (state.step === 'details') { $('footer-progress').textContent = `${ready} of ${included.length} ready`; primary.textContent = 'Continue to submit'; primary.hidden = false; primary.disabled = !included.length; }
  else if (state.successUrl) { $('footer-progress').textContent = 'Submitted'; primary.hidden = true; }
  else { $('footer-progress').textContent = `${included.length} icon${included.length === 1 ? '' : 's'} included`; primary.textContent = 'Send suggestion'; primary.hidden = false; const contributor = $('contributor-name').value.trim(); primary.disabled = !state.ready || state.submitting || !!problem || contributor.length < 2 || contributor.length > 80; }
}
function nextIncomplete() { const start = state.activeIndex; for (let offset = 1; offset <= state.cards.length; offset++) { const index = (start + offset) % state.cards.length; if (state.cards[index].selected && cardIssue(state.cards[index])) { focusCard(index); return; } } }
function showStep() {
  steps.forEach((name, index) => { $(`contribution-step-${name}`).hidden = state.step !== name; const marker = $(`wizard-step-${name}`); marker.classList.toggle('active', state.step === name); marker.classList.toggle('complete', index < steps.indexOf(state.step)); });
  if (state.step === 'details') renderReview(); if (state.step === 'submit') renderSubmission(); updateFooter();
}
async function connectSubmission() {
  if (!contributionEndpoint) return;
  try { const response = await fetch(contributionEndpoint.replace(/\/$/, '') + '/config', { credentials: 'omit' }); if (!response.ok) throw new Error(); const config = await response.json(); if (!config.enabled) throw new Error(); state.ready = true; $('submission-availability').textContent = 'Your username is shown in the pull request as contributor-provided.'; updateFooter(); }
  catch { $('submission-availability').textContent = 'Suggestions are unavailable right now. You can still download cleaned PNGs.'; }
}
async function submit() {
  try { const payload = selectedPayload(state.cards, $('contributor-name').value); if (!state.ready) throw new Error('Suggestions are unavailable right now.'); $('contribution-workspace').disabled = true; state.submitting = true; updateFooter(); status('Sending your suggestion…'); const result = await sendBatch(contributionEndpoint, payload); state.successUrl = result.url; status(''); renderSubmission(); updateFooter(); }
  catch (error) { status(error.message); }
  finally { $('contribution-workspace').disabled = false; state.submitting = false; updateFooter(); }
}

export async function initContributions(catalogue, assets = {}) {
  state.categories = catalogue.categories.map(category => category.name); state.catalogue = catalogue.categories.flatMap(category => category.emojis); state.assets = assets; $('screenshot-file').disabled = false; $('contribute').disabled = false;
  $('screenshot-file').addEventListener('change', event => { if (event.target.files[0]) openFile(event.target.files[0]); event.target.value = ''; });
  document.addEventListener('paste', event => { if (!$('contribution-modal').classList.contains('show')) return; const file = [...event.clipboardData.items].find(item => item.kind === 'file')?.getAsFile(); if (file) { event.preventDefault(); openFile(file); } });
  const canvas = $('screenshot-preview'); let start;
  const point = event => { const rect = canvas.getBoundingClientRect(); return { x: Math.max(0, Math.min(canvas.width, Math.round((event.clientX - rect.left) * canvas.width / rect.width))), y: Math.max(0, Math.min(canvas.height, Math.round((event.clientY - rect.top) * canvas.height / rect.height))) }; };
  canvas.addEventListener('pointerdown', event => { start = point(event); canvas.setPointerCapture?.(event.pointerId); });
  canvas.addEventListener('pointermove', event => { if (!start) return; const end = point(event); setRegion({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) }); });
  canvas.addEventListener('pointerup', () => { if (!start) return; start = null; const box = region(); if (box.w < 38 || box.h < 34) setRegion({ x: 0, y: 0, w: state.image.width, h: state.image.height }); replaceCards(slotsInsideCrop(state.detectedSlots, region())); status(`Prepared ${state.cards.length} detected icon${state.cards.length === 1 ? '' : 's'} from the selected area.`); });
  canvas.addEventListener('pointercancel', () => { start = null; });
  $('reset-crop').addEventListener('click', () => { setRegion({ x: 0, y: 0, w: state.image.width, h: state.image.height }); replaceCards(state.detectedSlots); status(`Prepared all ${state.cards.length} detected icon${state.cards.length === 1 ? '' : 's'}.`); });
  $('footer-back').addEventListener('click', () => { state.step = state.step === 'submit' ? 'details' : 'upload'; showStep(); }); $('next-incomplete').addEventListener('click', nextIncomplete); $('footer-next-incomplete').addEventListener('click', nextIncomplete);
  $('footer-primary').addEventListener('click', () => { if (state.step === 'upload') { state.step = 'details'; showStep(); return; } if (state.step === 'details') { state.attemptedAdvance = true; const problem = selectionProblem(); if (problem) { renderReview(); updateFooter(); status(problem); return; } state.step = 'submit'; showStep(); return; } submit(); });
  $('contributor-name').addEventListener('input', updateFooter);
  let activated = false;
  const activate = () => { if (activated) return; activated = true; state.atlas = loadAtlas(state.catalogue, state.assets).then(entries => { $('visual-coverage').textContent = `Visual index: ${new Set(entries.map(entry => entry.id)).size}/${state.catalogue.length} icons.`; return entries; }); state.atlas.catch(() => { $('visual-coverage').textContent = 'Visual index unavailable.'; }); connectSubmission(); };
  $('contribution-modal').addEventListener('show.bs.modal', () => { bootstrap.Tab.getOrCreateInstance($('emojis')).show(); activate(); }); $('contribution-modal').addEventListener('hidden.bs.modal', () => state.scanController?.abort()); showStep();
}
