# Decision Log

This file distinguishes accepted decisions from questions that must be resolved before their related milestone begins.

## Accepted decisions

### D-021 — Google endpoints in the application shell CSP

Date: 2026-09-02
Status: accepted
Context: The first deployed OAuth smoke check exposed the original local-only shell Content Security Policy blocking the GIS script and Drive REST calls.
Decision: Permit the documented GIS script/style/connection/frame paths, the Drive v3 metadata/upload paths, and the OAuth revocation endpoint in the application shell only. Keep saved content in its empty-sandbox iframe with its independent `script-src 'none'` and `connect-src 'none'` policy.
Consequences: Optional Google authorization and encrypted transfers can work without allowing arbitrary third-party scripts or network destinations. Browser regression tests exercise the production CSP using synthetic GIS/Drive responses and verify that the reader remains network-isolated.
Supersedes: none

### D-020 — Public name, license, and initial publication

Date: 2026-09-02
Status: accepted
Context: The user explicitly approved publishing and deploying `fishese/postkeeper` and selected the GPL license.
Decision: Retain the PostKeeper name and license original project source under GPL-3.0-or-later (GNU GPL version 3 or any later version). Include the full license, public source link, and bundled third-party notices. Publish the current build as a development preview, not a completed release.
Consequences: Dependency licenses remain intact. Public deployment does not satisfy the unfinished live-provider acceptance criteria or advance Milestone 5. No user library, local environment file, recovery material, or OAuth credential is published.
Supersedes: O-007

### D-019 — Permanent custom-domain origin and repository

Date: 2026-09-02
Status: accepted
Context: The user selected `keep.fishese.cc` and confirmed that the repository is GitHub's `fishese/postkeeper`, not GitLab.
Decision: Use `https://keep.fishese.cc` as the permanent production origin, hosted at the domain root by GitHub Pages. Build with `POSTKEEPER_BASE_PATH=/`. Map the public GitHub repository variable `GDRIVEWEBID` to `VITE_GOOGLE_CLIENT_ID`; never use a client secret in the PWA.
Consequences: Configure the custom domain in Pages before adding the DNS CNAME, then enable HTTPS. Do not store real library data at the temporary `github.io` project origin. Root `.env.local` supplies local development configuration and must remain untracked. Publication still requires user authorization and resolution of O-007; selecting this origin does not mean the site is deployed.
Supersedes: O-001

### D-018 — Google Drive uses the application data folder

Date: 2026-09-01
Status: accepted
Context: Milestone 4 needs the narrowest practical Google Drive OAuth scope and an object layout that users or other Drive apps cannot accidentally edit. Google documents `appDataFolder` as a hidden, per-application store available through the non-sensitive `drive.appdata` scope. Browser-only Google Identity Services issues short-lived access tokens and does not require PostKeeper to hold a client secret or refresh token.
Decision: Store every Google Drive sync object in `appDataFolder` and request only `https://www.googleapis.com/auth/drive.appdata`. Use the GIS browser token model from an explicit user action. Treat token expiry or revocation as a reconnect-required sync state while leaving the local library fully usable.
Consequences: Synced objects are intentionally absent from the Drive UI and cannot be shared. Users must use PostKeeper recovery/export flows instead of manually inspecting or moving remote files. A user can delete the application data folder or uninstall the Drive app, so Drive remains a synchronization/recovery transport rather than the authoritative library. The provider must list with `spaces=appDataFolder`, create objects with `appDataFolder` as the parent, exhaust pagination, and safely retry immutable writes.
Supersedes: O-003

### D-017 — Firefox extension minimum versions

Date: 2026-08-29
Status: accepted
Context: Mozilla requires new extensions to declare built-in data-collection consent. Firefox desktop added that manifest key in version 140 and Firefox Android added it in version 142.
Decision: Declare that PostKeeper collects/transmits no data outside the local extension/PWA workflow, set Firefox desktop 140 and Firefox Android 142 as manifest minimums, and raise those floors if the compatibility matrix requires newer capabilities.
Consequences: Older Firefox releases cannot install the supported package. Both desktop and Android runtime matrices are still required before support is claimed.
Supersedes: none

### D-016 — Android Chromium extension target

Date: 2026-08-28
Status: accepted
Context: Milestone 3 requires one named extension-capable Android Chromium browser and a minimum tested version. Kiwi Browser is archived and is not an acceptable maintained target.
Decision: Target Microsoft Edge Canary for Android. Microsoft Edge Canary 154.0.4249.0 (versionCode 424900023), tested on Android 16 / Samsung SM-S9280, is the first supported minimum because it is the exact current build that passed the complete physical-device capability matrix. No earlier Edge build is supported or implied.
Consequences: The Chromium Manifest V3 build must use only capabilities verified on that Edge Canary build. Official Chrome for Android remains unsupported. Edge Canary is a preview channel, so every release-hardening cycle must repeat the compatibility matrix and may raise the minimum version.
Supersedes: O-002

### D-013 — Milestone 0 web baseline

Date: 2026-08-21
Status: accepted
Context: Milestone 0 requires a static PWA shell, a subpath-safe service worker, browser feasibility checks, and only the shared package boundaries needed immediately.
Decision: Use npm workspaces, TypeScript, React, Vite, `vite-plugin-pwa`, Vitest, and Playwright. The initial workspace contains `apps/web`, `packages/domain`, `packages/local-store`, and `packages/test-fixtures`; capture, sync, Android, and extension production packages are deferred. Use `file:` workspace links instead of `workspace:*` because the locally supplied npm 11.16.0 rejects the latter protocol. Use OPFS when available with an IndexedDB Blob fallback.
Consequences: Builds use `POSTKEEPER_BASE_PATH` to support a GitHub Pages project subpath or `/` at a custom domain. The worker uses generated Workbox behavior and prompts for updates. Dependency rationale is recorded in `docs/DEPENDENCIES.md`.
Supersedes: none

### D-014 — Local library storage

Date: 2026-08-22
Status: accepted
Context: Open decision O-004 required Milestone 0 to validate IndexedDB records plus OPFS blobs and fallback before Milestone 1 locked the library store.
Decision: Keep IndexedDB as the transactional store for article metadata, snapshots, categories, memberships, and the rebuildable search index. Store immutable content blobs in OPFS when `navigator.storage.getDirectory` is available, and in an IndexedDB Blob object store otherwise. Request persistent storage and surface the persisted/quota/blob-backend status in the PWA.
Consequences: Unit tests exercise the IndexedDB fallback. Browser tests record whichever blob backend the browser actually used. The search index is never authoritative and can be rebuilt from stored snapshots.
Supersedes: O-004

### D-015 — Inbox is uncategorized local items

Date: 2026-08-22
Status: accepted
Context: Milestone 1 requires inbox, all items, unread, favorites, archive, and category views without specifying inbox membership.
Decision: Inbox contains non-deleted, non-archived articles with no category membership. All items are non-deleted and non-archived. Unread and favorites are those same library items with the corresponding flags. Archive contains non-deleted archived articles, including favorited ones.
Consequences: Assigning a category removes an article from Inbox. This can change later if a dedicated inbox flag is needed.
Supersedes: none

### D-001 — Local-first application

Each client keeps a local working library. Remote storage is optional synchronization and recovery transport.

### D-002 — Static PWA is the common application UI

The main application is an installable static PWA suitable for GitHub Pages or equivalent hosting. The host serves code only and does not receive article content.

### D-003 — PC and Android are initial platforms

PC and Android are first-class targets. iOS is a planned later target.

### D-004 — Chrome-compatible extensions include Android-capable Chromium variants

The Chromium extension is not intentionally desktop-only. It will be tested on at least one user-selected Android Chromium browser with extension support. Official Chrome Android support is not assumed.

### D-005 — Firefox desktop and Android remain targets

The extension shares capture logic across browsers but may have Firefox-specific manifests and background implementation.

### D-006 — Capture browser remains in the architecture

The Android wrapper includes an isolated authenticated capture browser as a fallback, even if extension capture works on the user's primary Android browser.

### D-007 — Browser sessions are not centralized

Website credentials and cookies remain inside the user's browser profile or capture-browser profile. PostKeeper does not maintain a cross-site credential vault.

### D-008 — Articles may belong to multiple categories

Category membership is many-to-many. Category-specific custom values are scoped to the membership to support future structured views.

### D-009 — Initial sharing is original link plus print/PDF

Public hosted article links are excluded initially. Self-contained HTML export may follow.

### D-010 — Synchronization uses objects and operations

The application never synchronizes its live browser database as a single file. It synchronizes immutable content objects and versioned metadata operations.

### D-011 — Remote sync data is encrypted

Article content and sensitive metadata are encrypted before upload to Google Drive or a self-hosted provider.

### D-012 — EPUB is the preferred future e-reader format

EPUB will be generated from normalized reader content. MOBI is treated as an optional conversion target rather than a primary internal format.

## Open decisions

### O-001 — Permanent web origin

Resolved by D-019. The permanent origin is `https://keep.fishese.cc`, served at `/` from GitHub Pages for `fishese/postkeeper`. DNS, HTTPS, and deployment activation are separate setup tasks.

### O-002 — Android Chromium compatibility target

Resolved by D-016. Microsoft Edge Canary for Android is the target; 154.0.4249.0 (versionCode 424900023) is the exact first passing build and therefore the minimum supported version.

### O-003 — Google Drive layout and scope

Resolved by D-018. PostKeeper uses the hidden `appDataFolder` and requests only the non-sensitive `drive.appdata` scope.

### O-004 — PWA storage implementation

Resolved by D-014. IndexedDB holds transactional records; OPFS stores blobs when available, with IndexedDB Blob fallback.

### O-005 — Android wrapper framework

The proposed baseline is Capacitor or an equivalent thin wrapper around the shared PWA. Validate capture-browser isolation and platform bridge security before selecting it.

Decision deadline: before Milestone 6.

### O-006 — First self-hosted provider

Choose whether to build a minimal PostKeeper server or target an existing protocol such as WebDAV with a compatibility layer.

Decision deadline: before Milestone 7.

### O-007 — Product name and licensing

Resolved by D-020. PostKeeper uses GPL-3.0-or-later, and the user authorized the initial public source publication and deployment.

## Decision template

```text
### D-NNN — Short title

Date:
Status: accepted | superseded
Context:
Decision:
Consequences:
Supersedes:
```
