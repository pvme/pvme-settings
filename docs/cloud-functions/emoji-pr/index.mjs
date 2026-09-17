import { fail, MAX_BODY } from './catalogue.mjs';
import { appClient, repositoryConfig } from './github.mjs';
import { validateEnvelope, submitBatch } from './submission.mjs';

export function configured(env) {
  return env.LIVE_ENABLED === 'true' &&
    ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'ALLOWED_ORIGINS'].every(key => !!env[key]) &&
    (!!env.GITHUB_REPOSITORY || ['GITHUB_STAGING_REPOSITORY', 'GITHUB_PRODUCTION_REPOSITORY', 'PRODUCTION_ORIGIN'].every(key => !!env[key]));
}

function allowedOrigins(env) { return new Set((env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)); }

export function createHandler({ env = process.env, request = fetch, getGithub = target => appClient(env, request, target) } = {}) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Vary', 'Origin');
    try {
      const origin = req.get('origin');
      if (!allowedOrigins(env).has(origin)) fail(403, 'Origin not allowed.');
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') return res.status(204).send('');
      const path = req.path.replace(/\/$/, '') || '/';
      if (req.method === 'GET' && path === '/config') return res.json({ enabled: !!configured(env),
        reason: configured(env) ? '' : 'Submission is not connected yet. GitHub App access and the public function configuration must be verified.' });
      if (req.method !== 'POST' || path !== '/submit') fail(404, 'Route not found.');
      if (!configured(env)) fail(503, 'Submission is not connected yet. You can still prepare and download icons locally.');
      if (!/^application\/json(?:;|$)/i.test(req.get('content-type') || '')) fail(415, 'Send JSON.');
      if ((req.rawBody?.length || Buffer.byteLength(JSON.stringify(req.body || {}))) > MAX_BODY) fail(413, 'Submission is too large.');
      validateEnvelope(req.body);
      const target = repositoryConfig(env, origin);
      const github = await getGithub(target); // Discovers repo access and checks installation permissions.
      const result = await submitBatch(req.body, { github, request, target });
      return res.status(201).json(result);
    } catch (error) {
      const status = error.status || 500;
      // Do not log request bodies, PNGs or credentials.
      if (status >= 500 && status !== 503) console.error('Icon submission failed', { status, message: error.message });
      return res.status(status).json({ error: status >= 500 ? 'Submission could not finish. The service may need configuration; contact a maintainer before retrying.' : error.message });
    }
  };
}
export const submitEmojis = createHandler();
