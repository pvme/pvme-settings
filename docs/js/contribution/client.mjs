export function selectedPayload(cards, contributor) {
  const selected = cards.filter(card => card.selected);
  if (!selected.length || selected.length > 10) throw new Error('Select between 1 and 10 icons.');
  if (contributor.trim().length < 2 || contributor.length > 80) throw new Error('Enter your Discord or GitHub username (2–80 characters).');
  return { contributor: contributor.trim(), items: selected.map(card => {
    if (!card.name.trim() || !/^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,63}$/.test(card.id) || !card.category) throw new Error('Each selected icon needs a name, valid ID and category.');
    const item = { name: card.name.trim(), id: card.id, category: card.category,
      id_aliases: card.id_aliases, png: card.icon };
    if (card.preset_type) {
      item.preset_type = card.preset_type;
      if (card.preset_type === 'item') {
        if (!Number.isInteger(card.preset_slot)) throw new Error('Choose an inventory slot for each inventory item.');
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
  if (!/^https:\/\/github\.com\/pvme\/pvme-settings\/pull\/\d+$/.test(result.url)) throw new Error('The service did not return a valid catalogue PR link.');
  return result;
}
