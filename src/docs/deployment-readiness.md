# Deployment readiness

## Controlled UAT host

Netlify is the selected low-configuration UAT host. The committed `netlify.toml` runs `npm run verify` and publishes `dist/`. Vite copies `public/_redirects` and `public/_headers` to `dist/`: route-specific fallbacks cover BrowserRouter paths while missing static assets retain normal host behavior; `index.html` is revalidated and hashed `/assets/*` files are cacheable indefinitely.

The Vite base is the root-domain default (`/`). For subdirectory hosting, set Vite's `base` to the deployed subdirectory before building and configure the host to serve the same path. Do not use absolute localhost URLs.

## Clean-UAT initialization

1. Download a Settings backup of current test data.
2. In Settings, reset transactional data (or all application data when a fully clean run is required).
3. Confirm seeded master data, especially equipment categories and prefixes.
4. Create one clean scenario: Equipment → Assignment → Rental → Release → DEUR → Billing → Return → Close.
5. Download a post-UAT backup.
6. If rollback is required, restore the pre-UAT backup and verify its schema, application identifier, and record counts.

## Release checklist

Before deployment: review `git status` and branch, download a backup, run `npm.cmd run verify`, regenerate `dist/`, and confirm the Netlify build/publish settings.

After deployment: load `/`, directly load and refresh `/equipment`, confirm generated JS/CSS assets load, create/update an equipment record and refresh, download a backup, reject an invalid restore file, verify restore/reset preserves sign-in, inspect the browser console for uncaught errors, and verify a separate browser profile has independent LocalStorage.

Rollback: republish the previous `dist/` artifact, restore the prior JSON backup where data rollback is required, then verify the backup identifier, schema version, and restored counts.

## LocalStorage warning

Before every deployment, download a Settings backup. Data is browser- and origin-specific; it is not shared between devices, can be cleared by browser policies, and is not a replacement for a server backup. Restore fully replaces application records and deliberately excludes authentication session data. Test current evergreen Chrome, Edge, Firefox, and Safari with LocalStorage enabled.
