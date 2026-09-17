# PVME Settings

This is a static HTML app for browsing and managing PVME Discord icons. The live version is available at [https://pvme.io/pvme-settings/](https://pvme.io/pvme-settings/).

It loads all icons from `emojis_v2.json`, allows you to search and filter them by name and category, shows which Discord servers each icon lives on, and lets you copy full, guide-ready Discord icon strings for easy paste into guides or messages.

## Developing locally

Use the repository development server so the generated catalogue snapshot and recognition atlas are available. `live-server` serves the unbuilt source and cannot provide those assets.

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Open `http://127.0.0.1:8787`. `.env` is ignored by Git and contains only the public staging URL, never a credential. The staging function accepts this local origin, targets only `rsnx222/pvme-settings`, and is suitable for testing the full modal flow.

## Icon contributions

The **Add icons** modal over the icon catalogue is a three-step wizard: upload or paste a PNG for automatic slot detection and cleanup, define the selected icons, then send the suggestion with a Discord or GitHub username. An optional drag crop updates the detected selection automatically. No login is required; the PR labels the supplied username as contributor-provided and unverified.

Use original, unscaled PNG screenshots at 100% interface scale with opaque matching bank, preset, inventory or GE slot backgrounds and intact 38×34 borders. Worn equipment and arbitrary screenshot styles/scales cannot be cleaned. Extraction is limited to 28 icons at a time (10 per PR). Brief guidance and expandable tips show the limits and index coverage.

Submission remains disabled until the GitHub App and public function are configured. Contributors download each prepared PNG, upload it through the existing PVME Discord bot, then paste the resulting `img.pvme.io` URL. See [function setup and limitations](cloud-functions/emoji-pr/README.md) and [source provenance](js/contribution/PROVENANCE.md).

The static build creates a local catalogue snapshot and matching recognition atlas together. `npm run build:site` writes the ignored `dist/` artifact with content-hashed assets; `npm run dev` rebuilds it before serving. The Pages workflow runs the same build on catalogue/generator changes and can be manually triggered to refresh image-host artwork.

From the repository root, `npm ci`, `npm ci --prefix docs/cloud-functions/emoji-pr`, `npm test`, and `npm run dev` run local tests and serve the site. External writes are mocked in tests.
