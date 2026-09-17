// This public URL is injected by the static build. Never put credentials here.
export const contributionEndpoint = typeof globalThis.__PVME_CONTRIBUTION_ENDPOINT__ === 'string'
  ? globalThis.__PVME_CONTRIBUTION_ENDPOINT__
  : '';
