# Next Chat Prompt

Checkpoint: 2026-09-18. Canonical progress is in `STATUS.md`.

## Required reading

Workspace `D:\Projects\PostKeeper`, branch `main`, repository `fishese/postkeeper`. Read completely: `README.md`, `docs/PRODUCT_PLAN.md`, `docs/TECHNICAL_ARCHITECTURE.md`, `docs/IMPLEMENTATION_ROADMAP.md`, `docs/DECISIONS.md`, `docs/STATUS.md`, this prompt, `docs/GOOGLE_DRIVE_SETUP.md`, `docs/SELF_HOSTED_SYNC.md`, `docs/BACKUP_FORMAT.md`, `docs/ANDROID_SETUP.md`, `docs/ANDROID_SIGNING.md`, `docs/DEPENDENCIES.md`, `docs/UI_AND_LOCALIZATION.md`, and `docs/EXTENSION_COMPATIBILITY.md`. Follow all AGENTS.md restrictions and preserve unrelated changes.

## Current work

The user explicitly started Milestone 7 and plans to install PocketBase on a Synology DS720+ behind Tailscale. The first app/server implementation is complete locally but the milestone remains **In progress** until the user's NAS is available for live acceptance.

D-028 keeps the existing encrypted sync model and `SyncObjectStore` boundary. `packages/sync-http` implements a generic authenticated HTTPS opaque-object protocol and PocketBase password authorization against the shared `users` collection. The web/PWA can choose Google Drive or **Self-hosted PocketBase**; the Android wrapper uses PocketBase because embedded Google OAuth remains unavailable. Passwords and recovery keys are never saved. If **Remember this trusted device** is selected, a refreshable PocketBase token and master-key material are encrypted under a non-exportable WebCrypto key in a separate IndexedDB database and removed on disconnect. Production endpoints require HTTPS; loopback HTTP is test-only.

`servers/pocketbase` pins PocketBase 0.40.4 for Linux amd64 with the official SHA-256. Its migration and hooks reuse the closed shared `users` collection and provide private PostKeeper opaque objects, paginated prefix listing, ETag reads, immutable creates, atomic conditional updates, a 16 MiB object cap and configurable 2 GiB default user quota. New libraries use opaque per-library path namespaces; legacy recovery keys retain the prior root layout. Compose binds PocketBase to loopback and persists only `data/`, which is gitignored. The guide covers Synology Container Manager, backups and Tailscale Serve. Tailscale is deployment-only; no app SDK is needed. Nextcloud/WebDAV is deferred because portable CORS and atomic-write behavior is not trivial.

The current implementation adds delete-wins tombstones, idempotent namespaced sync, remembered-device recovery, automatic foreground synchronization, and a read-only preview before merging a nonempty local library with an existing remote library. Full validation passes 141 tests with one opt-in live test skipped, plus web/extension builds; focused Chromium self-hosted/CSP acceptance passes 3/3; Android asset preparation and unit tests pass. A live dashboard inspection of `https://pkb.iceimo.cc` confirmed PocketBase 0.40.4 and an empty shared `users` collection, but the new migrations/hooks and an ordinary user still need to be installed before live app acceptance. The currently deployed web app still uses the former `postkeeper_users` auth path, explaining its 404.

When the NAS is available, the next acceptance work is: deploy the included Container Manager project; create the user's account directly in PocketBase without placing credentials in chat; expose it through trusted HTTPS/Tailscale Serve; connect from web and Android; upload, restore to a clean test library, switch providers, exercise token expiry/quota/server-loss behavior, and verify NAS backup/restore. Preserve all real libraries, Drive associations, recovery keys and signing identity. Never request passwords, signing secrets or recovery keys in chat. No Drive reconnection is needed. Use the emulator for app testing and notify the user before any necessary wireless-phone test.

## Published baseline

The published app remains web/native **0.6.6**, Android versionCode **12**, source `aa3a88e9a2128c1f1a38a9c4a3698436ffa36b5a`, signed run `34470943767`. The published extension remains **0.1.5**, source `1ac36e2b5bbd227134862883e69fe2aceef96bcc`. Mozilla's signed Firefox XPI is **136,308 bytes**, SHA-256 `26d7d07bc89c303914fc6722644641804cf53188ed550479e2525edec414f304`, published in `extension-v0.1.5`; guide/About link updates are source `b2e442f`. Preserve prior release evidence and limitations in STATUS.md.

Milestone 8 has not started. Native PDF saving remains unverified after the earlier zero-byte emulator output. Extensions and browser/PWA libraries remain separate from the Android library. Firefox/Android and Kiwi final manual extension acceptance remains recorded in STATUS.md.

## Copy-ready continuation prompt

```text
Continue PostKeeper in D:\Projects\PostKeeper. Read docs/NEXT_CHAT_PROMPT.md and all listed source-of-truth documents completely, including docs/STATUS.md. Follow all AGENTS.md restrictions and preserve user data and unrelated changes.

Milestone 7 self-hosted sync is in progress. The generic HTTPS client and PocketBase 0.40.4 server adapter now use a shared `users` identity collection, opaque per-library namespaces, delete-wins tombstones, trusted-device encrypted credential/key retention, automatic foreground sync, and a previewed first merge. PocketBase is the supported DS720+ target; Tailscale is deployment-only and should provide a trusted private HTTPS URL. Nextcloud/WebDAV is deferred. The web/PWA can choose Drive or PocketBase; Android uses PocketBase. Passwords and recovery keys must never be persisted or requested in chat. The live `https://pkb.iceimo.cc` server still needs the repository migrations/hooks and an ordinary `users` record before acceptance; the old deployed web bundle's `postkeeper_users` request is the observed 404 cause.

The remaining M7 work requires the user's NAS: deploy, create the account directly, connect through HTTPS/Tailscale, test upload/clean restore/provider switching/token expiry/quota/server loss, and verify NAS backup/restore. Preserve all libraries, Drive associations, recovery keys and signing identity. No Drive reconnection is needed. Use the emulator, and notify me before any necessary wireless-phone test. Keep status and this prompt current.
```
