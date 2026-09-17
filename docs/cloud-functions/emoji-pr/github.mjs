import crypto from 'node:crypto';
import { fail } from './catalogue.mjs';
export const REPO = 'pvme/pvme-settings';
export const BASE = 'master';
export const PATH = 'emojis/emojis_v2.json';

export function repositoryConfig(env = {}, origin) {
  const mapped = env.GITHUB_STAGING_REPOSITORY || env.GITHUB_PRODUCTION_REPOSITORY || env.PRODUCTION_ORIGIN;
  if (mapped && (!env.GITHUB_STAGING_REPOSITORY || !env.GITHUB_PRODUCTION_REPOSITORY || !env.PRODUCTION_ORIGIN)) fail(503, 'GitHub repository routing configuration is incomplete.');
  const repo = mapped ? (origin === env.PRODUCTION_ORIGIN ? env.GITHUB_PRODUCTION_REPOSITORY : env.GITHUB_STAGING_REPOSITORY) : (env.GITHUB_REPOSITORY || REPO);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) fail(503, 'GitHub repository configuration is invalid.');
  const base = env.GITHUB_BASE_BRANCH || BASE;
  if (!/^[A-Za-z0-9._/-]+$/.test(base)) fail(503, 'GitHub base-branch configuration is invalid.');
  return { repo, base, path: PATH };
}

// Adapted from guide-editor/cloud-functions/guide-pr: RS256 JWT and a
// repository-scoped installation token. No contributor repository token needed.
export function githubClient(token, request = fetch) {
  return async (path, { method = 'GET', body } = {}) => {
    const res = await request('https://api.github.com' + path, { method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json', 'User-Agent': 'pvme-icon-contributions', 'X-GitHub-Api-Version': '2022-11-28' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error('GitHub request failed.'), { status: 502, githubStatus: res.status });
    return data;
  };
}

export async function appClient(env, request = fetch, target = repositoryConfig(env)) {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) fail(503, 'GitHub App is not configured.');
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iat: now - 60, exp: now + 540, iss: env.GITHUB_APP_ID });
  const jwt = unsigned + '.' + crypto.sign('RSA-SHA256', Buffer.from(unsigned), env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n')).toString('base64url');
  const app = githubClient(jwt, request);
  const installation = await app(`/repos/${target.repo}/installation`);
  if (installation.suspended_at || installation.permissions?.contents !== 'write' || installation.permissions?.pull_requests !== 'write') fail(503, 'The GitHub App needs access to pvme-settings with contents and pull_requests write permissions.');
  const result = await app(`/app/installations/${installation.id}/access_tokens`, { method: 'POST',
    body: { repositories: [target.repo.split('/')[1]], permissions: { contents: 'write', pull_requests: 'write' } } });
  if (!result.token) fail(503, 'Could not obtain the repository installation token.');
  return githubClient(result.token, request);
}

export async function latest(github, target = { repo: REPO, base: BASE, path: PATH }) {
  const ref = await github(`/repos/${target.repo}/git/ref/heads/${target.base}`);
  const commit = await github(`/repos/${target.repo}/git/commits/${ref.object.sha}`);
  const file = await github(`/repos/${target.repo}/contents/${target.path}?ref=${ref.object.sha}`);
  if (file.encoding !== 'base64' || !file.content) fail(502, 'Could not read the latest catalogue.');
  return { sha: ref.object.sha, tree: commit.tree.sha, text: Buffer.from(file.content, 'base64').toString('utf8') };
}
