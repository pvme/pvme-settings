# Icon contribution function

A separate Node 22+ HTTP function for **pvmebackend**, **europe-west1**. It uploads selected icons to the existing PVME image store and creates one GitHub PR editing `pvme/pvme-settings/emojis/emojis_v2.json`. It never writes directly to master or changes guide-editor.

## Public endpoint

No sign-in is required. The Discord or GitHub username is contributor-provided, escaped and explicitly marked **not verified** in the PR. This deliberately simple public endpoint has no strong spam prevention. CORS only restricts browser origins; it is not authentication.

`GET /config` reports availability. `POST /submit` accepts `{ contributor, items }`; each item contains `{ name, id, category, id_aliases, png }` and optional `preset_type`. `preset_slot` is required only for the catalogue's inventory type (`item`); Familiar and Relic entries do not have a slot. The response contains `{ url }` for the catalogue PR.

Validation limits: 900,000 bytes per request; 1–10 icons; 64 KiB per PNG; exact 38×34 dimensions; valid PNG decoding/CRC with both visible and transparent pixels. Re-encoding discards image metadata. Names, IDs, aliases, categories and preset metadata are validated. Source screenshots, original crops and unexpected fields are rejected. Duplicate names and IDs/aliases are checked within the batch and against the latest catalogue both before and after uploading. The PR changes only the catalogue file and preserves existing formatting. CI also checks cross-entry aliases and safely handles contributor-controlled validator output.

There is no database or persistent submission state. Retrying a request may upload again or open another PR. After an uncertain failure, check the repository before retrying. Failed submissions can leave uploaded images or a contribution branch; no undocumented cleanup endpoint is assumed. Changes merged after the final catalogue snapshot still need the normal PR validation/review before merging.

## Remaining setup

Only image-store integration and GitHub App access are needed. Keep credentials in Secret Manager and public settings in `config.example.yaml`.

### 1. Confirm the image store

Catalogue filenames resolve as `https://img.pvme.io/images/<filename>`. A PNG committed to GitHub does not appear there automatically.

The existing Discord bot's `src/interactions/pvme/Upload.ts`, inspected locally, posts multipart field `file` to `https://${image_upload_domain}/upload`, with the configured authorization header, and follows a redirect to the final image URL. The upload host is configuration, not a known public constant. No live upload was attempted.

Ask the image-store operator for the **exact HTTPS `/upload` URL**, confirmation that it redirects directly to a durable `https://img.pvme.io/images/<filename>.png`, and an upload credential for this service. Confirm PNG bytes are preserved and images do not expire during PR review. Store the credential as `emoji-pr-image-upload-token` in Secret Manager. Set `IMAGE_UPLOAD_URL` to the confirmed URL and `IMAGE_STORE_CONFIRMED=true` only once that contract is confirmed.

`storage.mjs` implements that redirect contract: it sends the authorization header verbatim, never forwards the credential to the redirected host, and fetches the public PNG to verify its bytes before referencing the filename in the catalogue. If the real uploader has a different contract, adapt the module and its mock tests from the operator's documentation. Do not invent an endpoint or filename.

### 2. Confirm GitHub App permissions

The App must be installed on **pvme/pvme-settings** with **Contents: read/write** and **Pull requests: read/write**. The implementation adapts JWT signing, repository installation discovery, scoped installation tokens and GCP/Secret Manager patterns from [guide-editor/guide-pr](https://github.com/pvme/guide-editor/tree/main/cloud-functions/guide-pr). Its source mentions App ID `3553040`, but its access to this repository has not been confirmed. No App ID is assumed here; the runtime verifies the repository installation, permissions and suspension status before writing.

Set `GITHUB_APP_ID` to the confirmed ID. Keep its private key in Secret Manager and bind it as `GITHUB_APP_PRIVATE_KEY`. Use a dedicated runtime service account with secretAccessor on just the key and image-upload credential. Never place credentials in the frontend, YAML or chat.

`npm --prefix docs/cloud-functions/emoji-pr run preflight` verifies App access/permissions and reads the catalogue, creating no uploads, refs, commits or PRs. Run it with the key injected from Secret Manager. An authorized maintainer can do this locally in PowerShell without printing the key:

```powershell
$env:GITHUB_APP_ID = '<confirmed App ID>'
$env:GITHUB_APP_PRIVATE_KEY = (gcloud secrets versions access latest --project=pvmebackend --secret='<confirmed private-key secret>') -join "`n"
try { npm --prefix docs/cloud-functions/emoji-pr run preflight }
finally { Remove-Item Env:GITHUB_APP_PRIVATE_KEY }
```

### Deployment reference — not executed

Copy `config.example.yaml` outside the source directory and fill in its public values. When the integration checks pass, set `LIVE_ENABLED=true`. A maintainer can deploy this separate function with the following pattern, substituting confirmed service-account and secret names:

```text
gcloud functions deploy submitEmojis --gen2 --project=pvmebackend --region=europe-west1 --runtime=nodejs22 --source=docs/cloud-functions/emoji-pr --entry-point=submitEmojis --trigger-http --allow-unauthenticated --service-account=emoji-pr@pvmebackend.iam.gserviceaccount.com --memory=256Mi --timeout=300s --max-instances=2 --concurrency=1 --env-vars-file=<local-public-config.yaml> --set-secrets=GITHUB_APP_PRIVATE_KEY=<confirmed-key-secret>:latest,IMAGE_UPLOAD_TOKEN=emoji-pr-image-upload-token:latest
```

Then put the function base URL in `docs/js/contribution/config.mjs`. It remains empty in this change, so local extraction/downloads work while live submission is visibly unavailable. Avoid logging request bodies or credentials.

## Local verification

From repository root: `npm ci`, `npm ci --prefix docs/cloud-functions/emoji-pr`, then `npm test`. Tests inject mock GitHub and upload clients; no external writes occur. `python -m unittest discover -s tests -p 'test_*.py'` checks the alias validator (requires pydantic). `npm run dev` serves the site at `http://127.0.0.1:8787`; `npm --prefix docs/cloud-functions/emoji-pr start` starts the HTTP function, disabled by default.

The Functions Framework CloudEvents dependency uses uuid; an override to compatible CommonJS uuid 11.1.1+ avoids its older buffer-bounds advisory. Verify framework startup when updating it.
