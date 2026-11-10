import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PNG } from '../docs/cloud-functions/emoji-pr/node_modules/pngjs/lib/png.js';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { submitDiscord, verifyGoogleCaller, discordTarget } from '../docs/cloud-functions/emoji-pr/discord.mjs';
import { appendEntries, validateBatch } from '../docs/cloud-functions/emoji-pr/catalogue.mjs';
import { createHandler } from '../docs/cloud-functions/emoji-pr/index.mjs';
const deny = () => { throw new Error('Network forbidden in bot integration tests'); };
globalThis.fetch = deny; net.Socket.prototype.connect = deny; http.request = deny; https.request = deny;
const env = { BOT_AUDIENCE: 'https://example.invalid/function', BOT_CALLER_EMAIL: 'bot@example.iam.gserviceaccount.com', GITHUB_REPOSITORY: 'pvme/pvme-settings', BOT_ENABLED: 'true', BOT_APPLICATION_ID: '100000000000000001', BOT_COMMAND_GUILD_ID: '100000000000000002', BOT_EMOJI_GUILDS: '{"1":"100000000000000003"}' };
const body = () => ({ item: { name: 'New item', id: 'new-item', category: 'Items', id_aliases: ['alias'] }, emoji_id: '1234567890123456789', emoji_server: 1, guild_id: '100000000000000003', submitter: { id: '100000000000000004', username: 'user*name', guildId: env.BOT_COMMAND_GUILD_ID, applicationId: env.BOT_APPLICATION_ID } });
const text = () => JSON.stringify({ servers: [{ server: '1', url: 'unused invite' }], categories: [{ name: 'Items', emojis: [{ name: 'Old item', id: 'old', emoji_id: 'KEEP_EXACT' }] }] }, null, 2).replace('"KEEP_EXACT"', '987654321098765432');
function githubHarness(snapshots = [text()], repo = env.GITHUB_REPOSITORY) {
  const writes = []; let reads = 0;
  const github = async (path, { method = 'GET', body: value } = {}) => {
    if (method === 'GET') {
      if (path.endsWith('/git/ref/heads/master')) return { object: { sha: 'base' + Math.min(reads++, snapshots.length - 1) } };
      if (path.includes('/git/commits/')) return { tree: { sha: 'tree-' + path.split('/commits/')[1] } };
      if (path.includes('/contents/')) return { encoding: 'base64', content: Buffer.from(snapshots[Number(path.split('?ref=base')[1])]).toString('base64') };
    }
    writes.push({ path, value });
    if (path.endsWith('/git/trees')) return { sha: 'tree-new' };
    if (path.endsWith('/git/commits')) return { sha: 'new-commit' };
    if (path.endsWith('/git/refs')) return {};
    if (path.endsWith('/pulls')) return { html_url: `https://github.com/${repo}/pull/123` };
    throw new Error('Unexpected GitHub operation: ' + path);
  };
  return { github, writes };
}

test('Discord append keeps exact numeric snowflakes, optional omissions, category placement and unrelated text', () => {
  const b = body(); const result = appendEntries(text(), [{ ...b.item, emoji_id: b.emoji_id, emoji_server: 1, preset_type: 'familiar' }]);
  assert.match(result, /"emoji_id": 1234567890123456789/); assert.match(result, /"emoji_id": 987654321098765432/);
  const parsed = JSON.parse(result); const entry = parsed.categories[0].emojis[1];
  assert.equal(typeof entry.emoji_id, 'number'); assert.equal(entry.emoji_server, 1); assert.equal(entry.category, undefined); assert.equal(entry.image, undefined); assert.equal(entry.preset_slot, undefined);
  assert.deepEqual(parsed.servers, JSON.parse(text()).servers);
  const publicItem = { ...b.item, image_url: 'https://img.pvme.io/images/icon.png' };
  assert.throws(() => validateBatch([b.item], JSON.parse(text())), /PNG URL/);
  assert.equal(validateBatch([publicItem], JSON.parse(text()))[0].image_filename, 'icon.png');
  assert.equal(JSON.parse(appendEntries(text(), [publicItem])).categories[0].emojis[1].image, 'icon.png');
  assert.throws(() => validateBatch([{ ...publicItem, emoji_id: b.emoji_id }], JSON.parse(text())), /Unexpected/);
});

test('bot PR reuses App workflow, current tree, master base, exact entry and verified submitter', async () => {
  const concurrent = text().replace('Old item', 'Unrelated concurrent rename');
  const h = githubHarness([text(), concurrent]);
  const result = await submitDiscord(body(), { env, github: h.github });
  assert.match(result.url, /\/pull\/123$/);
  const tree = h.writes.find(write => write.path.endsWith('/git/trees')).value;
  assert.equal(tree.base_tree, 'tree-base1'); assert.equal(tree.tree.length, 1); assert.equal(tree.tree[0].path, 'emojis/emojis_v2.json'); assert.match(tree.tree[0].content, /Unrelated concurrent rename/);
  const pr = h.writes.find(write => write.path.endsWith('/pulls')).value;
  assert.equal(pr.base, 'master'); assert.match(pr.head, /^discord-emojis\//); assert.match(pr.body, /Bot-verified Discord submitter/); assert.match(pr.body, /user\\\*name/);
  assert.ok(h.writes.every(write => write.value.ref !== 'refs/heads/master'));
});

test('GitHub failures propagate without automatic retries or recovery lookups', async () => {
  for (const step of ['/git/trees', '/git/commits', '/git/refs', '/pulls']) {
    const h = githubHarness(); let attempts = 0;
    const github = async (path, options = {}) => { if (options.method === 'POST' && path.endsWith(step)) { attempts++; throw new Error('GitHub unavailable'); } return h.github(path, options); };
    await assert.rejects(submitDiscord(body(), { env, github }), /GitHub unavailable/);
    assert.equal(attempts, 1);
  }
});

test('duplicates introduced during validation abort before writes; exact duplicate Discord IDs also reject', async () => {
  for (const changed of [text().replace('"id": "old"', '"id": "alias"'), text().replace('987654321098765432', '1234567890123456789')]) {
    const h = githubHarness([text(), changed]);
    await assert.rejects(submitDiscord(body(), { env, github: h.github }), /already exists/); assert.equal(h.writes.length, 0);
  }
});

test('server rejects unknown destinations, spoofed app/command guild, arbitrary fields and invalid metadata', async () => {
  for (const mutate of [b => { b.guild_id = '100000000000000099'; }, b => { b.submitter.applicationId = 'other'; }, b => { b.submitter.guildId = 'other'; }, b => { b.repo = 'attacker/repo'; }, b => { b.emoji_id = 123; }, b => { b.item.preset_type = 'relic'; b.item.preset_slot = 1; }, b => { b.item.id_aliases = Array(11).fill('x'); }, b => { b.item.category = 'missing'; }]) {
    const b = body(); mutate(b); const h = githubHarness();
    await assert.rejects(submitDiscord(b, { env, github: h.github })); assert.equal(h.writes.length, 0);
  }
});

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const now = Math.floor(Date.now() / 1000);
const claims = { iss: 'https://accounts.google.com', aud: env.BOT_AUDIENCE, email: env.BOT_CALLER_EMAIL, email_verified: true, iat: now, exp: now + 3600 };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function bearer(value = claims) {
  const input = encode({ alg: 'RS256', kid: 'test' }) + '.' + encode(value);
  return 'Bearer ' + input + '.' + crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
}
const certificates = async () => ({ ok: true, json: async () => ({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test', use: 'sig', alg: 'RS256' }] }) });
function request(path = '/bot/submit', bodyValue = body(), authorization = bearer()) {
  return { path, method: path.endsWith('/catalogue') ? 'GET' : 'POST', body: bodyValue, get: name => name === 'authorization' ? authorization : name === 'content-type' ? 'application/json' : 'https://public.invalid' };
}
function response() { return { code: 200, headers: {}, set(name, value) { this.headers[name] = value; }, type(value) { this.contentType = value; return this; }, send(value) { this.value = value; return this; }, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } }; }

test('configured bot routes reject unauthorised callers before App access and ignore browser Origin', async () => {
  let appCalls = 0;
  const handler = createHandler({ env, request: certificates, getGithub: () => { appCalls++; throw new Error('must not call'); } });
  for (const authorization of ['', 'Bearer invalid.token.value', bearer({ ...claims, email: 'other@example.iam.gserviceaccount.com' })]) {
    const res = response(); await handler(request('/bot/submit', body(), authorization), res);
    assert.equal(res.code, 401); assert.equal(appCalls, 0);
  }
});

test('Google caller rejects validly encoded bad signatures, tampered payloads and invalid claims; outages return 503', async () => {
  await verifyGoogleCaller(bearer(), env, certificates);
  for (const change of [{ aud: 'other' }, { iss: 'other' }, { email: 'other' }, { exp: now - 1 }, { email_verified: false }, { iat: now + 120 }]) await assert.rejects(verifyGoogleCaller(bearer({ ...claims, ...change }), env, certificates), error => error.status === 401);
  const parts = bearer().slice(7).split('.'); const signature = Buffer.from(parts[2], 'base64url'); signature[0] ^= 1;
  const wrongSignature = 'Bearer ' + parts[0] + '.' + parts[1] + '.' + signature.toString('base64url');
  const tampered = 'Bearer ' + parts[0] + '.' + encode({ ...claims, exp: now + 3500 }) + '.' + parts[2];
  let keyReads = 0; const readKeys = async () => { keyReads++; return certificates(); };
  for (const token of [wrongSignature, tampered]) await assert.rejects(verifyGoogleCaller(token, env, readKeys), error => error.status === 401);
  assert.equal(keyReads, 1); // Both signatures are rejected while sharing the cached public key.
  for (const unavailable of [async () => { throw new Error('private provider detail'); }, async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({}) })]) await assert.rejects(verifyGoogleCaller(bearer(), env, unavailable), error => error.status === 503);
});

test('complete hosted-image/preset metadata is validated and appended through the authenticated handler', async () => {
  const image = new PNG({ width: 2, height: 1 }); image.data = Buffer.from([255, 0, 0, 255, 0, 0, 0, 0]);
  const bytes = PNG.sync.write(image); const b = body();
  b.item.image_url = 'https://img.pvme.io/images/icon.png'; b.item.preset_type = 'item'; b.item.preset_slot = 13;
  const h = githubHarness(); let images = 0;
  const handler = createHandler({ env, getGithub: async () => h.github, request: async (url, options) => {
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return certificates();
    assert.equal(url, b.item.image_url); assert.equal(options.redirect, 'error'); images++; return new Response(bytes);
  } });
  const res = response(); await handler(request('/bot/submit', b), res);
  assert.equal(res.code, 201); assert.equal(images, 1);
  const entry = JSON.parse(h.writes.find(write => write.path.endsWith('/git/trees')).value.tree[0].content).categories[0].emojis[1];
  assert.equal(entry.image, 'icon.png'); assert.equal(entry.preset_type, 'item'); assert.equal(entry.preset_slot, 13); assert.deepEqual(entry.id_aliases, ['alias']);
});


test('private repository routing fails closed and staging never calls production', async () => {
  for (const repo of [undefined, '', 'other/pvme-settings']) assert.throws(() => discordTarget({ ...env, GITHUB_REPOSITORY: repo }), /GITHUB_REPOSITORY/);
  const h = githubHarness([text()], 'rsnx222/pvme-settings'); const paths = [];
  const github = (path, options) => { paths.push(path); return h.github(path, options); };
  const res = response();
  await createHandler({ env: { ...env, GITHUB_REPOSITORY: 'rsnx222/pvme-settings' }, request: certificates, getGithub: async target => { assert.equal(target.repo, 'rsnx222/pvme-settings'); return github; } })(request(), res);
  assert.equal(res.code, 201); assert.equal(res.value.url, 'https://github.com/rsnx222/pvme-settings/pull/123');
  assert.ok(paths.length > 0); assert.ok(paths.every(path => path.startsWith('/repos/rsnx222/pvme-settings/')));
  assert.equal(h.writes.find(write => write.path.endsWith('/pulls')).value.base, 'master');
});


test('actual legacy string-valued catalogue ID is rejected exactly before writes', async () => {
  const legacyText = readFileSync(new URL('../emojis/emojis_v2.json', import.meta.url), 'utf8');
  const catalogue = JSON.parse(legacyText);
  const legacy = catalogue.categories.flatMap(category => category.emojis).find(icon => typeof icon.emoji_id === 'string');
  assert.ok(legacy); const b = body(); b.emoji_id = legacy.emoji_id;
  b.item = { name: 'Legacy snowflake audit regression', id: 'legacy_snowflake_audit_regression', category: catalogue.categories[0].name, id_aliases: [] };
  const h = githubHarness([legacyText]);
  await assert.rejects(submitDiscord(b, { env, github: h.github }), /Discord emoji ID already exists/);
  assert.equal(h.writes.length, 0);
});

test('bot catalogue HTTP response preserves exact numeric and quoted snowflakes as original JSON', async () => {
  const source = text().replace('987654321098765432', '1569731936992108644').replace('\"emojis\": [', '\"emojis\": [{\"name\":\"Legacy\",\"id\":\"legacy\",\"emoji_id\":\"854475441946230855\",\"emoji_server\":1},'); const h = githubHarness([source]);
  const res = response(); await createHandler({ env, request: certificates, getGithub: async () => h.github })(request('/bot/catalogue'), res);
  assert.equal(res.code, 200); assert.equal(res.contentType, 'application/json'); assert.equal(res.value, source);
  assert.match(res.value, /1569731936992108644/); assert.equal(h.writes.length, 0);
});

test('invalid bot mapping fails clearly and infrastructure errors use sanitised operational logging', async () => {
  const logs = []; const originalError = console.error; console.error = (...args) => logs.push(args);
  try {
    let appCalls = 0;
    for (const mapping of ['null', '[]', '{}', '{"1":"not-a-guild"}', '{"0":"100000000000000003"}', 'invalid JSON']) {
      const res = response(); await createHandler({ env: { ...env, BOT_EMOJI_GUILDS: mapping }, request: certificates, getGithub: () => { appCalls++; } })(request(), res);
      assert.equal(res.code, 503); assert.equal(appCalls, 0); assert.match(res.value.error, /BOT_EMOJI_GUILDS/);
    }
    const res = response(); await createHandler({ env, request: async () => { throw new Error('Bearer PRIVATE_PROVIDER_SECRET'); }, getGithub: () => { appCalls++; } })(request(), res);
    assert.equal(res.code, 503); assert.equal(appCalls, 0); assert.ok(logs.length > 0); assert.match(res.value.error, /temporarily unavailable/);
    assert.doesNotMatch(JSON.stringify(logs), /PRIVATE_PROVIDER_SECRET|Bearer/);
  } finally { console.error = originalError; }
});

test('public web submission keeps its normal PR and cannot supply Discord-specific fields', async () => {
  const image = new PNG({ width: 2, height: 1 }); image.data = Buffer.from([255, 0, 0, 255, 0, 0, 0, 0]); const bytes = PNG.sync.write(image);
  const publicEnv = { LIVE_ENABLED: 'true', GITHUB_APP_ID: 'placeholder', GITHUB_APP_PRIVATE_KEY: 'placeholder', ALLOWED_ORIGINS: 'https://public.invalid', GITHUB_STAGING_REPOSITORY: 'rsnx222/pvme-settings', GITHUB_PRODUCTION_REPOSITORY: 'pvme/pvme-settings', PRODUCTION_ORIGIN: 'https://public.invalid' };
  const item = { ...body().item, image_url: 'https://img.pvme.io/images/icon.png' };
  for (const extra of [{}, { emoji_id: body().emoji_id }, { emoji_server: 1 }]) {
    const h = githubHarness(); const handler = createHandler({ env: publicEnv, getGithub: async target => { assert.equal(target.repo, 'pvme/pvme-settings'); return h.github; }, request: async () => new Response(bytes) });
    const res = response(); await handler(request('/submit', { contributor: 'web-user', items: [{ ...item, ...extra }] }, ''), res);
    assert.equal(res.code, Object.keys(extra).length ? 400 : 201);
    if (Object.keys(extra).length) assert.equal(h.writes.length, 0);
    else { const pr = h.writes.find(write => write.path.endsWith('/pulls')).value; assert.match(pr.head, /^icon-contributions\//); assert.match(pr.body, /not verified/); assert.equal(pr.title, 'Add 1 contributed icon'); }
  }
});


function keyResponse(key = publicKey, kid = 'test', control = 'public, max-age=3600', age = '0') {
  return { ok: true, headers: new Headers({ 'Cache-Control': control, Age: age }), json: async () => ({ keys: [{ ...key.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' }] }) };
}
function signedBy(key, kid = 'test') {
  const input = encode({ alg: 'RS256', kid }) + '.' + encode(claims);
  return 'Bearer ' + input + '.' + crypto.sign('RSA-SHA256', Buffer.from(input), key).toString('base64url');
}
function unknownBearer(kid) { return 'Bearer ' + encode({ alg: 'RS256', kid }) + '.' + encode(claims) + '.AAAA'; }

test('invalid known-key signatures share cached keys but every token is still verified', async () => {
  let reads = 0; const getKeys = async () => { reads++; return keyResponse(); };
  const wrong = bearer().slice(7).split('.'); const signature = Buffer.from(wrong[2], 'base64url'); signature[0] ^= 1; wrong[2] = signature.toString('base64url');
  const invalid = 'Bearer ' + wrong.join('.');
  for (let i = 0; i < 8; i++) await assert.rejects(verifyGoogleCaller(invalid, env, getKeys), error => error.status === 401);
  await verifyGoogleCaller(bearer(), env, getKeys);
  await assert.rejects(verifyGoogleCaller(invalid, env, getKeys), error => error.status === 401);
  await assert.rejects(verifyGoogleCaller(bearer({ ...claims, exp: now - 1 }), env, getKeys), error => error.status === 401);
  assert.equal(reads, 1);
});

test('simultaneous verification attempts share one in-flight key fetch', async () => {
  let release, reads = 0; const gate = new Promise(resolve => { release = resolve; });
  const getKeys = async () => { reads++; await gate; return keyResponse(); };
  const results = Promise.allSettled([verifyGoogleCaller(bearer(), env, getKeys), verifyGoogleCaller(bearer(), env, getKeys), verifyGoogleCaller(unknownBearer('unknown'), env, getKeys)]);
  assert.equal(reads, 1); release();
  const settled = await results;
  assert.deepEqual(settled.map(value => value.status), ['fulfilled', 'fulfilled', 'rejected']);
  assert.equal(settled[2].reason.status, 401); assert.equal(reads, 1);
});

test('unknown kids have bounded refreshes and a rotated Google key is accepted after cooldown', async () => {
  const clock = Date.now; let time = clock(); Date.now = () => time;
  const rotated = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  let reads = 0, rotation = false;
  const getKeys = async () => { reads++; return rotation ? keyResponse(rotated.publicKey, 'rotated') : keyResponse(); };
  try {
    await verifyGoogleCaller(bearer(), env, getKeys);
    for (let i = 0; i < 50; i++) await assert.rejects(verifyGoogleCaller(unknownBearer('arbitrary-' + i), env, getKeys), error => error.status === 401);
    assert.equal(reads, 1); rotation = true;
    await assert.rejects(verifyGoogleCaller(signedBy(rotated.privateKey, 'rotated'), env, getKeys), error => error.status === 401);
    time += 60_001;
    await verifyGoogleCaller(signedBy(rotated.privateKey, 'rotated'), env, getKeys);
    assert.equal(reads, 2);
    await assert.rejects(verifyGoogleCaller(bearer(), env, getKeys), error => error.status === 401);
    for (let i = 0; i < 50; i++) await assert.rejects(verifyGoogleCaller(unknownBearer('more-' + i), env, getKeys), error => error.status === 401);
    assert.equal(reads, 2);
  } finally { Date.now = clock; }
});

test('Cache-Control and Age expire keys; failed refreshes never use stale keys and have bounded retries', async () => {
  const clock = Date.now; let time = clock(); Date.now = () => time;
  let reads = 0, unavailable = false;
  const getKeys = async () => { reads++; if (unavailable) throw new Error('private provider detail'); return keyResponse(publicKey, 'test', 'max-age=5', '3'); };
  try {
    await verifyGoogleCaller(bearer(), env, getKeys);
    time += 1_999; await verifyGoogleCaller(bearer(), env, getKeys); assert.equal(reads, 1);
    time += 2; unavailable = true;
    await assert.rejects(verifyGoogleCaller(bearer(), env, getKeys), error => error.status === 503);
    assert.equal(reads, 2);
    for (let i = 0; i < 10; i++) await assert.rejects(verifyGoogleCaller(bearer(), env, getKeys), error => error.status === 503);
    assert.equal(reads, 2);
    time += 60_001; unavailable = false;
    await verifyGoogleCaller(bearer(), env, getKeys); assert.equal(reads, 3);
  } finally { Date.now = clock; }
});

test('non-cacheable responses are not reused; missing cache headers use a short fallback', async () => {
  const clock = Date.now; let time = clock(); Date.now = () => time;
  try {
    for (const control of ['no-store, max-age=3600', 'no-cache, max-age=3600', 'max-age=0']) {
      let reads = 0; const getKeys = async () => { reads++; return keyResponse(publicKey, 'test', control); };
      await verifyGoogleCaller(bearer(), env, getKeys);
      await assert.rejects(verifyGoogleCaller(bearer(), env, getKeys), error => error.status === 503);
      assert.equal(reads, 1); time += 60_001;
      await verifyGoogleCaller(bearer(), env, getKeys); assert.equal(reads, 2);
    }
    let reads = 0; const fallback = async () => { reads++; return certificates(); };
    await verifyGoogleCaller(bearer(), env, fallback); await verifyGoogleCaller(bearer(), env, fallback); assert.equal(reads, 1);
    time += 60_001; await verifyGoogleCaller(bearer(), env, fallback); assert.equal(reads, 2);
  } finally { Date.now = clock; }
});
