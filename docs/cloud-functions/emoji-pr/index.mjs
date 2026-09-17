import { fail, MAX_BODY } from './catalogue.mjs';
import { appClient } from './github.mjs';
import { storageConfigured, uploadIcon } from './storage.mjs';
import { validateEnvelope, submitBatch } from './submission.mjs';

export function configured(env) {
  return env.LIVE_ENABLED === 'true' && storageConfigured(env) &&
    ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'ALLOWED_ORIGIN'].every(key => !!env[key]);
}

export function createHandler({ env = process.env, request = fetch, getGithub = () => appClient(env, request),
  upload = bytes => uploadIcon(bytes, env, request) } = {}) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Vary', 'Origin');
    try {
      if (req.get('origin') !== env.ALLOWED_ORIGIN) fail(403, 'Origin not allowed.');
      res.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN);
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') return res.status(204).send('');
      const path = req.path.replace(/\/$/, '') || '/';
      if (req.method === 'GET' && path === '/config') return res.json({ enabled: !!configured(env),
        reason: configured(env) ? '' : 'Submission is not connected yet. Image-store integration and GitHub App access must be configured and verified.' });
      if (req.method !== 'POST' || path !== '/submit') fail(404, 'Route not found.');
      if (!configured(env)) fail(503, 'Submission is not connected yet. You can still prepare and download icons locally.');
      if (!/^application\/json(?:;|$)/i.test(req.get('content-type') || '')) fail(415, 'Send JSON.');
      if ((req.rawBody?.length || Buffer.byteLength(JSON.stringify(req.body || {}))) > MAX_BODY) fail(413, 'Submission is too large.');
      validateEnvelope(req.body);
      const github = await getGithub(); // Discovers repo access and checks installation permissions.
      const result = await submitBatch(req.body, { github, upload });
      return res.status(201).json(result);
    } catch (error) {
      const status = error.status || 500;
      // Do not log request bodies, PNGs or credentials.
      return res.status(status).json({ error: status >= 500 ? 'Submission could not finish. The service may need configuration; contact a maintainer before retrying.' : error.message });
    }
  };
}
export const submitEmojis = createHandler();
