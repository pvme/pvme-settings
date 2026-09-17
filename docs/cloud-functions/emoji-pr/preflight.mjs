import { appClient, latest, REPO } from './github.mjs';
import { storageConfigured } from './storage.mjs';
try {
  const github = await appClient(process.env);
  const source = await latest(github);
  const catalogue = JSON.parse(source.text);
  console.log(`Verified GitHub App installation access to ${REPO}, contents/pull_requests write permissions, and catalogue read (${catalogue.categories.length} categories).`);
  console.log(`Image upload contract configured: ${storageConfigured(process.env)}. This check does not upload or confirm image retention.`);
  console.log('No branches, commits, uploads or PRs created.');
} catch {
  console.error('Preflight failed. Check Secret Manager bindings, the App repository installation and contents/pull_requests write permissions.');
  process.exitCode = 1;
}
