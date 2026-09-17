export function imageUrlError(value) {
  try {
    const url = new URL(value);
    if (url.origin === 'https://img.pvme.io' && /^\/images\/[A-Za-z0-9_-]+\.png$/.test(url.pathname) && !url.search && !url.hash) return '';
  } catch { /* Use the shared message below. */ }
  return 'Paste the public img.pvme.io PNG URL from the PVME Discord bot.';
}

export function selectedPayload(cards, contributor) {
  const selected = cards.filter(card => card.selected);
  if (!selected.length || selected.length > 10) throw new Error('Select between 1 and 10 icons.');
  if (contributor.trim().length < 2 || contributor.length > 80) throw new Error('Enter your Discord or GitHub username (2–80 characters).');
  return { contributor: contributor.trim(), items: selected.map(card => {
    if (!card.name.trim() || !/^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,63}$/.test(card.id) || !card.category) throw new Error('Each selected icon needs a name, valid ID and category.');
    const imageError = imageUrlError(card.image_url);
    if (imageError) throw new Error(imageError);
    const item = { name: card.name.trim(), id: card.id, category: card.category,
      id_aliases: card.id_aliases, image_url: card.image_url.trim() };
    if (card.preset_type) {
      item.preset_type = card.preset_type;
      if (card.itemKind === 'worn') {
        if (!Number.isInteger(card.preset_slot)) throw new Error('Choose a worn item slot for each worn item.');
        item.preset_slot = card.preset_slot;
      }
    }
    return item;
  }) };
}

export async function sendBatch(endpoint, payload, request = fetch) {
  const response = await request(endpoint.replace(/\/$/, '') + '/submit', {
    method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Submission failed. Contact a maintainer before retrying.');
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+$/.test(result.url)) throw new Error('The service did not return a valid catalogue PR link.');
  return result;
}
