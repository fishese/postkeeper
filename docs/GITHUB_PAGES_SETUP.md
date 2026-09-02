# GitHub Pages Setup

The selected repository is [fishese/postkeeper](https://github.com/fishese/postkeeper). The permanent origin is `https://keep.fishese.cc`, with a root (`/`) base path (D-019).

## Before publishing

D-020 records the user's publication approval and GPL-3.0-or-later license selection. Do not include `.env.local`, generated outputs, browser profiles, or test artifacts in future commits. The local environment file is ignored; `.env.example` documents the public client-ID key.

## Repository settings

1. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The previously configured `main`/root branch source does not build this Vite workspace.
2. Confirm **Settings → Secrets and variables → Actions → Variables → GDRIVEWEBID** contains the Google Web OAuth client ID. It maps to `VITE_GOOGLE_CLIENT_ID` during the build. No client secret is required or consumed. The legacy `GDRIVEWEBSECRET` variable was not read and is not used by this workflow.
3. Verify domain ownership with GitHub where possible. Set the Pages **Custom domain** to `keep.fishese.cc` **before** creating the DNS record.
4. At the DNS provider for `fishese.cc`, create:

   | Type  | Name | Target            |
   | ----- | ---- | ----------------- |
   | CNAME | keep | fishese.github.io |

   The target contains no protocol, slash, or repository name. Do not create a wildcard record.

5. Wait for GitHub's DNS check and certificate provisioning, then enable **Enforce HTTPS**. DNS/certificate propagation can take up to 24 hours.
6. The `main` push runs `.github/workflows/pages.yml`. It installs the lockfile, validates the workspace, and uploads **only `apps/web/dist`**. Subsequent `main` pushes or manual workflow dispatches redeploy. The initial [build and deployment](https://github.com/fishese/postkeeper/actions/runs/33630165694) succeeded on 2026-09-02.

Custom-workflow Pages deployments use the domain from repository settings; a `CNAME` file in the source/build is not required. See GitHub's [custom workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [custom domain guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

## OAuth and verification

Authorize `https://keep.fishese.cc` as a Google JavaScript origin (no trailing path). Follow [Google Drive Setup](GOOGLE_DRIVE_SETUP.md) for the local origins and live two-client acceptance test.

Before storing real content, confirm the HTTPS URL loads, JavaScript and the manifest resolve at `/`, the service worker controls the page after reload, and offline reopening works. Do not build a real library at `https://fishese.github.io/postkeeper/`; browser storage does not migrate automatically between origins.

The selected production domain does not need to be live to test OAuth on authorized localhost origins. Local builds read the root `.env.local`; `npm run build` produces the preview output and `npm run preview --workspace=@postkeeper/web -- --host localhost --port 4173 --strictPort` serves it.
