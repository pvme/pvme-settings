// Authenticated /bot routes. Public /submit cannot accept Discord-specific fields.
import crypto from 'node:crypto';
import { fail, MAX_BODY, validateBatch, appendEntries } from './catalogue.mjs';
import { latest, REPO, BASE, PATH } from './github.mjs';
import { validatePublicIcon } from './public-image.mjs';
import { createCataloguePr, safeMarkdown } from './submission.mjs';

export function discordTarget(env) {
  // Bot target is explicit server configuration, never a request body or browser Origin.
  if (![REPO, 'rsnx222/pvme-settings'].includes(env.GITHUB_REPOSITORY)) fail(503, 'Set GITHUB_REPOSITORY explicitly to the approved production or staging repository.');
  return { repo: env.GITHUB_REPOSITORY, base: BASE, path: PATH };
}
const snowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));

// One bounded key set per HTTP client (normally the process-wide fetch).
// Never retain caller tokens or signature-verification results.
const googleKeyCaches = new WeakMap();
const KEY_REFRESH_INTERVAL = 60_000;
const MAX_KEY_AGE = 3_600_000;
function keyLifetime(response) {
  const control = response.headers?.get('cache-control') || '';
  const age = response.headers?.get('age') || '0';
  if (/(?:^|,)\s*(?:no-store|no-cache)(?:\s|,|=|$)/i.test(control) || !/^\d+$/.test(age)) return 0;
  const maxAge = control.match(/(?:^|,)\s*max-age\s*=\s*"?(\d+)"?(?:\s|,|$)/i);
  if (!maxAge) return /max-age/i.test(control) ? 0 : KEY_REFRESH_INTERVAL;
  return Math.min(MAX_KEY_AGE, Math.max(0, Number(maxAge[1]) - Number(age)) * 1000);
}
async function googleVerificationKey(kid, request) {
  let cache = googleKeyCaches.get(request);
  if (!cache) { cache = { keys: new Map(), expires: 0, refreshAfter: 0, pending: null, failed: false }; googleKeyCaches.set(request, cache); }
  const now = Date.now();
  if (now < cache.expires && cache.keys.has(kid)) return cache.keys.get(kid);
  if (!cache.pending) {
    if (now < cache.refreshAfter && !(!cache.failed && cache.keys.has(kid) && now >= cache.expires)) {
      if (!cache.failed && now < cache.expires) fail(401, 'Unknown Google signing key.');
      fail(503, 'Google identity verification is temporarily unavailable.');
    }
    // Unknown kids and failed fetches are limited to once a minute.
    // A known key can revalidate sooner when Google gives it a shorter lifetime.
    cache.refreshAfter = now + KEY_REFRESH_INTERVAL;
    cache.pending = (async () => {
      try {
        const response = await request('https://www.googleapis.com/oauth2/v3/certs', { redirect: 'error', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error();
        const expires = Date.now() + keyLifetime(response);
        const jwks = (await response.json()).keys;
        if (!Array.isArray(jwks)) throw new Error();
        const keys = new Map();
        for (const jwk of jwks) {
          if (!jwk || typeof jwk.kid !== 'string' || jwk.kty !== 'RSA' || jwk.use !== 'sig' || jwk.alg !== 'RS256') continue;
          if (keys.has(jwk.kid)) throw new Error();
          keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' }));
        }
        if (!keys.size) throw new Error();
        cache.keys = expires > Date.now() ? keys : new Map();
        cache.expires = expires; cache.failed = false;
        return keys;
      } catch {
        cache.failed = true; // Do not extend freshness or use expired keys after an outage.
        fail(503, 'Google identity verification is temporarily unavailable.');
      }
    })().finally(() => { cache.pending = null; });
  }
  const keys = await cache.pending;
  const key = keys.get(kid);
  if (!key) fail(401, 'Unknown Google signing key.');
  return key;
}

// The website deployment is public: signature and caller verification are mandatory here.
export async function verifyGoogleCaller(header, env, request = fetch) {
  if (!env.BOT_AUDIENCE || !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(env.BOT_CALLER_EMAIL || '')) fail(503, 'Bot caller authentication is not configured.');
  let pieces, head;
  try {
    if (typeof header !== 'string' || header.length > 8192 || !/^Bearer [A-Za-z0-9_.-]+$/.test(header)) throw new Error();
    pieces = header.slice(7).split('.');
    if (pieces.length !== 3) throw new Error();
    head = JSON.parse(Buffer.from(pieces[0], 'base64url'));
    const claims = JSON.parse(Buffer.from(pieces[1], 'base64url'));
    const now = Math.floor(Date.now() / 1000);
    if (head.alg !== 'RS256' || typeof head.kid !== 'string' || !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) || claims.aud !== env.BOT_AUDIENCE || claims.email !== env.BOT_CALLER_EMAIL || claims.email_verified !== true || !Number.isInteger(claims.exp) || claims.exp <= now || !Number.isInteger(claims.iat) || claims.iat > now + 60 || claims.exp - claims.iat > 3660) throw new Error();
  } catch { fail(401, 'A valid ID token for the authorised bot service account is required.'); }
  const key = await googleVerificationKey(head.kid, request);
  if (!crypto.verify('RSA-SHA256', Buffer.from(pieces[0] + '.' + pieces[1]), key, Buffer.from(pieces[2], 'base64url'))) fail(401, 'Invalid caller signature.');
}

function emojiGuilds(env) {
  let mapping;
  try { mapping = JSON.parse(env.BOT_EMOJI_GUILDS); } catch { fail(503, 'BOT_EMOJI_GUILDS must be a JSON object mapping server numbers to guild IDs.'); }
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping) || !Object.keys(mapping).length || Object.entries(mapping).some(([number, guild]) => !/^[1-9]\d*$/.test(number) || !Number.isSafeInteger(Number(number)) || !snowflake(guild))) fail(503, 'BOT_EMOJI_GUILDS must map positive server numbers to Discord guild IDs.');
  return mapping;
}

export function validateDiscordEnvelope(body, env) {
  if (!exactKeys(body, ['item', 'emoji_id', 'emoji_server', 'guild_id', 'submitter']) || !snowflake(body.emoji_id) || !Number.isSafeInteger(body.emoji_server) || body.emoji_server < 1 || !snowflake(body.guild_id)) fail(400, 'Invalid Discord submission.');
  const mapping = emojiGuilds(env);
  if (mapping[String(body.emoji_server)] !== body.guild_id) fail(403, 'Emoji server is not authorised.');
  const actor = body.submitter;
  if (!exactKeys(actor, ['id', 'username', 'guildId', 'applicationId']) || !snowflake(actor.id) || actor.applicationId !== env.BOT_APPLICATION_ID || actor.guildId !== env.BOT_COMMAND_GUILD_ID || typeof actor.username !== 'string' || !actor.username.trim() || actor.username.length > 80 || /[\x00-\x1f\x7f]/.test(actor.username)) fail(400, 'Invalid bot-verified Discord submitter.');
}

export async function submitDiscord(body, { env, github, request = fetch }) {
  const target = discordTarget(env);
  validateDiscordEnvelope(body, env);
  const source = await latest(github, target);
  const items = validateBatch([body.item], JSON.parse(source.text), { allowMissingImage: true });
  if (!JSON.parse(source.text).servers.some(server => server.server === String(body.emoji_server))) fail(400, 'Unknown catalogue emoji server number.');
  if (body.item.image_url !== undefined) await validatePublicIcon(body.item.image_url, request);
  const current = await latest(github, target);
  validateBatch([body.item], JSON.parse(current.text), { allowMissingImage: true });
  // JSON numbers cannot be round-tripped through JS Number for Discord snowflakes.
  if ([...current.text.matchAll(/"emoji_id"\s*:\s*(?:"(\d+)"|(\d+))/g)].some(match => (match[1] ?? match[2]) === body.emoji_id)) fail(409, 'Discord emoji ID already exists.');
  if (!JSON.parse(current.text).servers.some(server => server.server === String(body.emoji_server))) fail(409, 'Destination removed from catalogue.');
  const text = appendEntries(current.text, [{ ...items[0], emoji_id: body.emoji_id, emoji_server: body.emoji_server }]);
  return createCataloguePr(github, target, current, text, {
    prefix: 'discord-emojis', message: 'Add 1 contributed Discord emoji', title: 'Add 1 contributed Discord emoji',
    body: `Bot-verified Discord submitter: **${safeMarkdown(body.submitter.username)}** (user ID: ${body.submitter.id})\n` +
      `Application: ${body.submitter.applicationId}; command guild: ${body.submitter.guildId}\n` +
      `Emoji: ${body.emoji_id}; PvME server: ${body.emoji_server}; destination guild: ${body.guild_id}\n\n` +
      `- ${safeMarkdown(body.item.name)} — ${safeMarkdown(body.item.id)}\n\n` +
      `Review artwork, metadata and possible concurrent contributions before merging. ` +
      (body.item.image_url === undefined ? 'No hosted PvME image was supplied. Discord upload does not create one.' : 'The separately hosted PvME PNG was validated.')
  });
}

export async function handleDiscord(req, res, { env, request, getGithub }) {
  if (env.BOT_ENABLED !== 'true') fail(503, 'Bot catalogue integration is disabled.');
  await verifyGoogleCaller(req.get('authorization'), env, request);
  if (!snowflake(env.BOT_APPLICATION_ID) || !snowflake(env.BOT_COMMAND_GUILD_ID)) fail(503, 'Bot identity configuration is missing.');
  emojiGuilds(env);
  const target = discordTarget(env);
  const path = req.path.replace(/\/$/, '');
  if (req.method === 'GET' && path === '/bot/catalogue') {
    const source = await latest(await getGithub(target), target);
    JSON.parse(source.text); // Validate JSON, but send the original digits and formatting.
    return res.type('application/json').send(source.text);
  }
  if (req.method !== 'POST' || path !== '/bot/submit') fail(404, 'Route not found.');
  if (!/^application\/json(?:;|$)/i.test(req.get('content-type') || '')) fail(415, 'Send JSON.');
  if ((req.rawBody?.length || Buffer.byteLength(JSON.stringify(req.body || {}))) > MAX_BODY) fail(413, 'Submission is too large.');
  validateDiscordEnvelope(req.body, env);
  return res.status(201).json(await submitDiscord(req.body, { env, github: await getGithub(target), request }));
}
