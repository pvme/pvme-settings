import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

function value(line) {
  const match = line.match(/^\s*CONTRIBUTION_ENDPOINT\s*=\s*(.*?)\s*$/);
  if (!match) return undefined;
  const raw = match[1];
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) return raw.slice(1, -1);
  return raw.replace(/\s+#.*$/, '');
}

// The ignored local .env makes `npm run dev` convenient. Explicit shell and
// CI values always win, so Pages can inject its own production endpoint.
export async function loadLocalContributionEndpoint(root) {
  if (process.env.CONTRIBUTION_ENDPOINT) return process.env.CONTRIBUTION_ENDPOINT;
  try {
    const endpoint = (await readFile(join(root, '.env'), 'utf8')).split(/\r?\n/).map(value).find(Boolean);
    if (endpoint) process.env.CONTRIBUTION_ENDPOINT = endpoint;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return process.env.CONTRIBUTION_ENDPOINT || '';
}
