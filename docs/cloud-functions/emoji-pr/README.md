# Icon contribution function

A separate Node 22+ HTTP function for **pvmebackend**, **europe-west1**. It validates contributor-supplied public PVME image URLs and creates one GitHub PR editing the configured catalogue. It never writes directly to master or changes guide-editor.

## Public endpoint

No sign-in is required. The Discord or GitHub username is contributor-provided, escaped and explicitly marked **not verified** in the PR. This deliberately simple public endpoint has no strong spam prevention. CORS only restricts browser origins; it is not authentication.

`GET /config` reports availability. `POST /submit` accepts `{ contributor, items }`; each item contains `{ name, id, category, id_aliases, image_url }` and optional `preset_type`/`preset_slot`. The response contains `{ url }` for the catalogue PR.

Validation limits: 64 KiB per request; 1–10 icons; public URLs must be `https://img.pvme.io/images/<filename>.png`; each public PNG must be at most 64 KiB, no more than 4,096 pixels per side and 1,048,576 pixels total, valid with both visible and transparent pixels. Names, IDs, aliases, categories and preset metadata are validated. Source screenshots, cleaned PNG data, unexpected fields, arbitrary URLs, and redirects are rejected. Duplicate names and IDs/aliases are checked within the batch and again against the latest catalogue before the PR is committed. The PR changes only the catalogue file and preserves existing formatting. CI also checks cross-entry aliases and safely handles contributor-controlled validator output.

There is no database or persistent submission state. Retrying a request may open another PR. After an uncertain failure, check the repository before retrying. Changes merged after the final catalogue snapshot still need the normal PR validation/review before merging.

## Remaining setup

Contributors download each cleaned PNG, upload it through the existing PVME Discord bot, then paste the resulting public image URL in the final submission step. The function uses no image-store credential.

### Confirm GitHub App permissions

The App must be installed on **pvme/pvme-settings** with **Contents: read/write** and **Pull requests: read/write**. The implementation adapts JWT signing, repository installation discovery, scoped installation tokens and GCP/Secret Manager patterns from [guide-editor/guide-pr](https://github.com/pvme/guide-editor/tree/main/cloud-functions/guide-pr). Its source mentions App ID `3553040`, but its access to this repository has not been confirmed. No App ID is assumed here; the runtime verifies the repository installation, permissions and suspension status before writing.

Set `GITHUB_APP_ID` to the confirmed ID. Keep its private key in Secret Manager and bind it as `GITHUB_APP_PRIVATE_KEY`. One function routes local and fork-origin requests to the staging repository and `https://pvme.io` requests to `pvme/pvme-settings`; configure this through `GITHUB_STAGING_REPOSITORY`, `GITHUB_PRODUCTION_REPOSITORY`, and `PRODUCTION_ORIGIN`. Use a dedicated runtime service account with secretAccessor on just the private-key secret. Never place credentials in the frontend, YAML or chat.

`npm --prefix docs/cloud-functions/emoji-pr run preflight` verifies App access/permissions and reads the catalogue, creating no public-image reads, refs, commits or PRs. Run it with the key injected from Secret Manager. An authorized maintainer can do this locally in PowerShell without printing the key:

```powershell
$env:GITHUB_APP_ID = '<confirmed App ID>'
$env:GITHUB_REPOSITORY = 'rsnx222/pvme-settings'
$env:GITHUB_APP_PRIVATE_KEY = (gcloud secrets versions access latest --project=pvmebackend --secret='<confirmed private-key secret>') -join "`n"
try { npm --prefix docs/cloud-functions/emoji-pr run preflight }
finally { Remove-Item Env:GITHUB_APP_PRIVATE_KEY }
```

### Deployment reference — not executed

Copy `config.example.yaml` outside the source directory and fill in its public values. When the integration checks pass, set `LIVE_ENABLED=true`. A maintainer can deploy this separate function with the following pattern, substituting confirmed service-account and secret names:

```text
gcloud functions deploy submit-emojis --gen2 --project=pvmebackend --region=europe-west1 --runtime=nodejs22 --source=docs/cloud-functions/emoji-pr --entry-point=submitEmojis --trigger-http --allow-unauthenticated --service-account=emoji-pr@pvmebackend.iam.gserviceaccount.com --memory=256Mi --timeout=300s --max-instances=2 --concurrency=1 --env-vars-file=<local-public-config.yaml> --set-secrets=GITHUB_APP_PRIVATE_KEY=<confirmed-key-secret>:latest
```

Set the public function base URL as the Pages environment/repository variable `CONTRIBUTION_ENDPOINT`. The Pages workflow injects that value into its built HTML; it is intentionally public and must be the base URL only, never a credential. Leave it unset for local extraction/download testing. Avoid logging request bodies or credentials.

## One function, two repositories

The App preflight has verified access to both `rsnx222/pvme-settings` and `pvme/pvme-settings`. Deploy one function named `submit-emojis` with these public values:

```yaml
LIVE_ENABLED: "true"
GITHUB_APP_ID: "4981051"
GITHUB_BASE_BRANCH: "master"
GITHUB_STAGING_REPOSITORY: "rsnx222/pvme-settings"
GITHUB_PRODUCTION_REPOSITORY: "pvme/pvme-settings"
PRODUCTION_ORIGIN: "https://pvme.io"
ALLOWED_ORIGINS: "http://127.0.0.1:8787,https://rsnx222.github.io,https://pvme.io"
```

Local requests from `http://127.0.0.1:8787` or `http://localhost:8787` route to the staging repository. Requests from `https://pvme.io` route to the PVME repository. The function rejects other browser origins, including fork Pages sites. Set its URL as the `CONTRIBUTION_ENDPOINT` GitHub Actions variable on PVME Pages, then push the already-tested site changes. The Pages build injects it automatically. No source change or additional credential is needed at that point.

## Local verification

From repository root: `npm ci`, `npm ci --prefix docs/cloud-functions/emoji-pr`, then `npm test`. Tests inject mock GitHub and public-image responses; no external writes occur. `python -m unittest discover -s tests -p 'test_*.py'` checks the alias validator (requires pydantic). `npm run dev` serves the site at `http://127.0.0.1:8787`; `npm --prefix docs/cloud-functions/emoji-pr start` starts the HTTP function, disabled by default.

The Functions Framework CloudEvents dependency uses uuid; an override to compatible CommonJS uuid 11.1.1+ avoids its older buffer-bounds advisory. Verify framework startup when updating it.
