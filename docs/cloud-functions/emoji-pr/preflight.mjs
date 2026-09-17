import { appClient, latest, REPO } from './github.mjs';
try {
  const github = await appClient(process.env);
  const source = await latest(github, { repo: process.env.GITHUB_REPOSITORY || REPO, base: process.env.GITHUB_BASE_BRANCH || 'master', path: 'emojis/emojis_v2.json' });
  const catalogue = JSON.parse(source.text);
  console.log(`Verified GitHub App installation access to ${process.env.GITHUB_REPOSITORY || REPO}, contents/pull_requests write permissions, and catalogue read (${catalogue.categories.length} categories).`);
  console.log('No branches, commits, public-image reads or PRs created.');
} catch {
  console.error('Preflight failed. Check Secret Manager bindings, the App repository installation and contents/pull_requests write permissions.');
  process.exitCode = 1;
}
