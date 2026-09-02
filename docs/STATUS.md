# Project Status

Last updated: 2026-09-03

## Current state

- Product planning: complete for initial implementation.
- Application code: Milestone 4 implemented and undergoing acceptance; public development preview deployed at `https://keep.fishese.cc`.
- Repository scaffold: complete.
- OAuth audience: published (In production), as reported by the user; brand verification is not independently confirmed.
- Live acceptance: the user saved/confirmed the key. Android uploaded 18 operations; a clean desktop client rejected a wrong key, safely failed an interrupted download, and restored all 18 operations plus both content blobs on retry. A broken-image check stopped the run before convergence and revocation; the reader fix is validated locally, and the user has approved its publication with the Drive pagination fix.
- Live acceptance runner: opt-in `scripts/test-live-drive.mjs` uses the emulator's app-scoped token only in memory for the clean desktop client's GIS callback; Drive calls are real, but this is not an independent second OAuth consent test. The user approved a real consent-revocation test once sync/restore checks finish.
- Active milestone: Milestone 4 — Encrypted sync core and Google Drive.
- Next milestone: Milestone 4 — Encrypted sync core and Google Drive.

## Milestones

| Milestone                               | Status      | Evidence                                                                                                                                                                                                                         |
| --------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Foundation and feasibility           | Complete    | Static root/subpath builds, toolchain, fixtures, and Chromium/Firefox feasibility evidence recorded.                                                                                                                             |
| 1. Local-first PWA library              | Complete    | IndexedDB library, OPFS/IndexedDB blobs, views, search rebuild, trusted fixture import, and Chromium/Firefox workflow tests recorded.                                                                                            |
| 2. Capture format and secure import     | Complete    | Versioned validation/limits, chunk receiver, hash checks, Readability/DOMPurify processing, atomic metadata import, raw snapshots, recapture, warnings, and deterministic tests.                                                 |
| 3. Browser extensions                   | Complete    | Shared Chromium/Firefox builds, durable queue, secure handoff, desktop runtime passes, and physical Firefox Android 154.0.1 plus Edge Canary Android 154.0.4249.0 passes.                                                        |
| 4. Encrypted sync core and Google Drive | In progress | Encrypted operations/blobs, recovery, provider contract, GIS, and clean-client restore pass automated tests. D-019 fixes the production origin; the client ID is configured. Live Google OAuth/Drive acceptance remains pending. |
| 5. Sharing, PDF/print, and backup       | Not started | —                                                                                                                                                                                                                                |
| 6. Android PWA integration and wrapper  | Not started | —                                                                                                                                                                                                                                |
| 7. Self-hosted sync provider            | Not started | —                                                                                                                                                                                                                                |
| 8. Release hardening                    | Not started | —                                                                                                                                                                                                                                |

## Documentation completed

- Product plan.
- Technical architecture.
- Implementation roadmap.
- Decision log.
- Smaller-model build handoff.

## Instructions for implementation agents

1. Change only the first incomplete milestone unless the user explicitly changes scope.
2. Set that milestone to **In progress** before implementation.
3. Record important commands, test results, browser versions, and limitations in this file.
4. Set a milestone to **Complete** only when every listed completion criterion passes.
5. Do not mark later milestones in progress speculatively.

## Work log

2026-09-03 — The user approved publishing the validated reader and Drive pagination fixes, then requested continuation to the next logical stop, documentation updates, and a copy-ready next-chat prompt. Resumed the release workflow for the existing GitHub Pages origin. ADB initially reported no devices; the previously approved Android Studio emulator is being reopened from its saved state. The phone remains out of scope.

2026-09-02 — Live acceptance follow-up: with explicit emulator-debugging and saved-key approval, the production Android client uploaded 18 encrypted operations. A disposable desktop Chrome profile using an in-memory app-token relay rejected a wrong recovery key; an injected download interruption left the article list empty; retry restored 18 operations and two content blobs. The test then detected a broken fixture image on both source and restored clients (`complete=true`, `naturalWidth=0`, Chromium blocked-local-blob message), so convergence, remote-envelope read-back, and revocation were not claimed. The user approved the later real revocation test. No fixture data was deleted and the saved recovery key remains valid.

2026-09-02 — D-023 fixes reader presentation with allowlisted image data URLs while preserving the opaque-origin sandbox and no-script/no-network policy. A strengthened Chromium image-decoding test failed before the fix and passes afterward. `npm run validate` passes 81 tests across 26 files plus formatting, lint, type checks, and both web/extension builds. The full Chromium/Firefox PWA matrix passes 18 tests in 17.2s, including decoded images before and after offline reload. Both packaged Chromium capture tests pass in 3.5s; the desktop Firefox extension runtime passes on the now-installed Firefox 155.0 with decoded public/authenticated images. One Firefox startup exited before tests and passed on retry. A separate flaky feasibility check was fixed to await service-worker readiness before reloading. The reader and earlier Drive pagination fixes remain local pending explicit approval for the public update; Milestone 4 remains In progress.

2026-08-21 — Milestone 0 started. The workspace was confirmed to contain planning documents only; it is not a Git repository, so version control was not initialized.

2026-08-21 — Implemented npm workspaces with TypeScript: `apps/web`, `packages/domain`, `packages/local-store`, and `packages/test-fixtures`. The selected baseline is React 19, Vite 7, `vite-plugin-pwa`, Vitest, Playwright, IndexedDB, and OPFS with IndexedDB Blob fallback. Dependency license, maintenance, and rationale are recorded in `docs/DEPENDENCIES.md`; D-013 records the architecture decision. `workspace:*` was replaced with npm `file:` workspace links because the supplied npm 11.16.0 rejects `workspace:*`.

2026-08-21 — Added local fixtures for public, harmless cookie-authenticated, JavaScript-rendered, lazy-image, separate-origin-image, hostile HTML, and long printable content. They are test inputs only; no production capture or extension code was added.

2026-08-21 — Validation results:

- `npm run format` — pass.
- `npm run lint` — pass.
- `npm run typecheck` — pass.
- `npm run test` — pass (2 unit tests: IndexedDB transaction/read-back and bounded chunk/hash transfer).
- `npm run build` — pass at `/`; generated static PWA with a Workbox service worker (5 precached files, 200.92 KiB).
- `$env:POSTKEEPER_BASE_PATH='postkeeper'; npm run build` — pass; generated subpath-safe static output at `/postkeeper/`. The normal root build was then restored.
- `npx playwright test --project=chromium-local --reporter=list` — pass on Google Chrome 151.0.7922.169. It verifies IndexedDB, OPFS blob read-back where available (and reports fallback otherwise), bounded chunk sequencing/hash verification, and generated service-worker control after reload.
- `npx playwright test --project=firefox-playwright --reporter=list` — blocked inside the Codex sandbox. Playwright Firefox 153.0 (build 1538) launches but `browserContext.newPage` fails with `Cannot read properties of undefined (reading '_page')` after `Failed to launch tab subprocess`. The locally installed Firefox 154.0 also fails to connect through Playwright in that environment. No Firefox extension support is claimed.

2026-08-21 — Firefox feasibility resolved. The sandboxed run failed because Firefox could not launch its tab subprocess. The identical command was rerun outside the Codex sandbox:

`npx playwright test --project=firefox-playwright --reporter=list`

Result: pass on Playwright 1.62.1 bundled Firefox 153.0; 1 test passed in 2.7s (`tests/browser/feasibility.spec.ts`, 1.6s). Exact output:

```
ok 1 [firefox-playwright] › tests\browser\feasibility.spec.ts:3:1 › PWA shell runs storage and bounded-transfer probes (1.6s)
1 passed (2.7s)
```

This is an execution-environment restriction, not an application failure. Combined with the recorded Chrome pass, the IndexedDB, OPFS/fallback, service-worker, and bounded-transfer spikes satisfy the milestone. Milestone 0 is Complete. Next milestone: Milestone 1 — Local-first PWA library.

2026-08-22 — Recorded the unsandboxed Firefox result above and confirmed Milestone 0 Complete. Milestone 1 started. Scope is limited to the local-first PWA library; capture-package processing, extensions, sync, Android, and category-specific layouts remain excluded.

2026-08-23 — Milestone 1 implemented: domain IDs/views/search helpers; IndexedDB article/snapshot/category/membership/search records; content-addressed blobs in OPFS with IndexedDB fallback; trusted fixture import; sandboxed reader; rebuildable search; persistence request with visible storage status. Typecheck uses per-package `tsc --noEmit` because `composite` project references are incompatible with `noEmit`. `navigator.storage.persist()` is requested in the background with a 2s timeout so Firefox permission prompts cannot block opening the library.

2026-08-23 — Validation results:

- `npm run format` — pass.
- `npm run lint` — pass.
- `npm run typecheck` — pass.
- `npm run test` — pass (12 unit tests: domain views/search, library transactions/membership/reopen/search rebuild, plus existing storage and transfer probes).
- `npm run build` — pass; static PWA with Workbox service worker (5 precached files, 222.26 KiB).
- `npx playwright test --reporter=list` — pass, 4 tests, 9.8s, Playwright 1.62.1.

Exact Playwright output:

```
ok 1 [chromium-local] › tests\browser\feasibility.spec.ts:3:1 › PWA shell runs storage and bounded-transfer probes (543ms)
ok 4 [chromium-local] › tests\browser\library.spec.ts:5:1 › library add, organize, restart, search, and read workflows (1.2s)
ok 3 [firefox-playwright] › tests\browser\feasibility.spec.ts:3:1 › PWA shell runs storage and bounded-transfer probes (1.6s)
ok 2 [firefox-playwright] › tests\browser\library.spec.ts:5:1 › library add, organize, restart, search, and read workflows (3.0s)
4 passed (9.8s)
```

Browser versions:

- Chromium-local: Google Chrome 151.0.7922.170
- Firefox-playwright: Playwright bundled Firefox 153.0

Blob backend observed in Chrome (Playwright and Cursor browser): `blobs: opfs`. Storage status example after fixture import: `Storage: not persistent · 666 KB of 183102.7 MB · blobs: opfs`. Node unit tests use the IndexedDB blob fallback because OPFS is unavailable there.

Milestone 1 completion criteria:

- Local data survives reload (library browser test).
- Fixture article and image remain readable offline after service-worker control (library browser test).
- Category membership and favorite/read flags persist (unit + browser tests).
- Search returns fixture text and rebuild reports local document count (unit + browser tests).

Limitations:

- Capture-package import, extensions, sync, and Android remain out of scope.
- Persistent storage is requested but not guaranteed; Chrome reported `not persistent` in this environment.
- `persist()` is time-bounded so a browser prompt cannot freeze the shell.
- Trusted development fixture import is an internal test path only.

Milestone 1 is Complete. Next milestone: Milestone 2 — Capture format and secure import.

2026-08-24 — Milestone 1 verification repeated successfully: formatting, linting, type checking, 12 unit tests, and static production build all pass. Milestone 2 started.

2026-08-24 — Milestone 1 audit found and fixed an IndexedDB lifecycle defect: unmounting the library UI left its database connection open, which could block later schema upgrades or library deletion. `LibraryApp` now closes the opened library during effect cleanup, and a browser regression test deletes the database after navigating away from the library. `npm run validate` passes (format, lint, typecheck, 12 unit tests, production build). The sandboxed Firefox runner still cannot launch tab subprocesses, so the full browser command was rerun outside the sandbox: `npx playwright test --reporter=list` — pass, 6 tests in 6.6s across Google Chrome 151.0.7922.170 and Playwright Firefox 153.0. Milestone 1 remains Complete; Milestone 2 remains the active milestone.

2026-08-24 — Milestone 2 completed. Added a strict version-1 capture schema with normalized HTTP(S) URLs, bounded field/asset/transfer sizes, media allowlist, cross-realm byte validation, producer-hash rechecking, and an ordered hash-verified chunk receiver. Added `packages/capture-processing` with Mozilla Readability 0.6.0 and DOMPurify 3.4.14; processing uses inert DOM parsing, resolves document-relative URLs against the captured page before extraction, normalizes lazy images, removes executable/privileged content and remote resources, rewrites captured images to local placeholders, and reports missing assets. Local import verifies and processes the complete package before mutation, stores inactive raw DOM and sanitized reader blobs, deduplicates blobs by SHA-256, atomically commits article/snapshot/search metadata, preserves user flags on canonical-URL recapture, and creates immutable snapshot versions. The PWA exposes development capture-package paths and visible partial/failed warnings.

2026-08-24 — Milestone 2 validation: `npm run validate` passes (format, lint, typecheck, 23 unit tests, production PWA build with 5 precached entries / 297.72 KiB). Tests deterministically cover public, authenticated, lazy-image, hostile, extraction-failed, hash mismatch, no-mutation-on-invalid, duplicate-blob, raw snapshot, recapture, and chunk receipt cases. `npx playwright test --project=chromium-local --reporter=list` passes 4 tests in 4.6s, including local image display, visible missing-asset warnings, hostile-element removal, offline reading, and IndexedDB cleanup. A full pre-fix Chromium/Firefox run exposed incorrect relative-URL resolution in both engines; that defect was fixed. The post-fix unsandboxed Firefox rerun was unavailable because the external runner allowance was exhausted; Milestone 2 has no Firefox-specific completion criterion. Milestone 2 is Complete. Next milestone: Milestone 3 — Browser extensions.

2026-08-28 — D-016 resolved the Milestone 3 Android Chromium target: use the current Microsoft Edge Canary for Android build at the time of the first passing physical-device test, and record that exact build as the minimum supported version. Milestone 3 started; support remains unclaimed until its desktop and Android capability matrices pass.

2026-08-29 — Milestone 3 implementation added shared rendered-page capture, credential-scrubbed DOM snapshots, same-origin/capability-scoped PWA handoff, a bounded IndexedDB queue (5 packages / 50 MiB / 30-minute TTL), per-request replay nonces, chunk and payload hashes, and deletion only after durable-import acknowledgement. Chromium MV3 and Firefox MV2 builds share the capture code; Firefox declares no external data collection and D-017 sets minimum versions to desktop 140 / Android 142.

2026-08-29 — Packaged Chromium validation found and fixed three runtime defects: the PWA-origin permission request had lost the popup user gesture in the background worker; Chromium JSON messaging did not preserve `Uint8Array` chunks; and the worker re-queried the active tab after asynchronous popup work instead of using an explicit target tab ID. The reproducible Chromium runtime test uses Chrome for Testing 151.0.7922.34 and passes public plus cookie-authenticated fixtures, local-image rendering, credential-control removal, durable import, fragment cleanup, and queue acknowledgement.

2026-08-29 — Firefox `web-ext` 10.6.0 validation reports zero errors. Two accepted warnings originate in Mozilla Readability's detached-document `innerHTML` parsing; imported output is independently sanitized before storage/rendering. The generated Firefox ZIP is 95,506 bytes. Playwright Firefox 153 accepts the bundle as a temporary add-on through Mozilla RDP, but this environment deadlocks when Playwright and RDP simultaneously control the instance, so public/authenticated desktop runtime results are not claimed. Exact desktop/Android pass/fail rows and the Edge Canary minimum-build number remain pending in `docs/EXTENSION_COMPATIBILITY.md`; Milestone 3 remains In progress.

2026-08-29 — Installing Firefox's test-only `web-ext` tool makes npm report three high-severity audit findings through `addons-linter -> image-size@2.0.2` (two image-parser denial-of-service advisories plus the transitive/meta count). No patched `image-size` release exists as of this date. The tool processes repository-controlled generated extension files only and is never shipped in the PWA or extension runtime. Reassess when Mozilla updates `addons-linter`.

2026-08-29 — Current Milestone 3 validation: `npm run validate` passes (format, ESLint, type checks, 34 unit tests across 13 files, production PWA, Chromium extension, and Firefox extension builds). `npm run test:extension` passes two packaged Chromium tests in 3.4s. Firefox `web-ext lint` reports zero errors / zero notices / the two accepted Readability warnings, and Firefox packaging succeeds. The full PWA regression matrix passes 8 tests in 13.4s across Google Chrome 151.0.7922.170 and Playwright Firefox 153.0. Milestone 3 remains In progress only because its Firefox-extension runtime and two physical Android capability rows are not yet recorded.

2026-08-31 — Independent desktop Firefox runtime work found and fixed two cross-browser/repeated-capture defects. PWA host permissions used port-qualified match patterns, which Firefox does not grant; the extension now requests the valid protocol/hostname pattern while the bridge continues to enforce the exact configured PWA origin. Reusing an existing PostKeeper tab changed only its capability fragment and could leave the prior transfer listener active; a forced reload initially exposed a second race where bridge injection targeted the unloading document. Existing-tab transfers now register a tab-completion listener before reload and inject only after the new document completes.

2026-08-31 — Added a Selenium/Marionette regression command using the installed Mozilla Firefox 154.0.1 (build 20260824154132) and a disposable profile. `npm run test:extension:firefox-runtime` passes consecutive public and cookie-authenticated captures with local images, credential-control/secret filtering, durable import, capability-fragment cleanup, and queue acknowledgement. The test preauthorizes only the local PWA host because WebDriver-generated events do not carry Firefox's extension permission-request activation token. Current validation passes: format, ESLint, type checks, 38 unit tests across 14 files, production PWA and both extension builds; the Chromium runtime suite passes 2 tests; Firefox lint reports zero errors/notices and the two accepted Readability warnings.

2026-08-31 — Physical Firefox Android execution completed on Mozilla Firefox 154.0.1 (versionCode 2016180583), Android 16, Samsung SM-S9280. The first real popup tap exposed a Firefox user-activation defect: `permissions.request()` ran after asynchronous popup setup and Firefox rejected it. The popup now preloads its settings/active-tab context and invokes the permission request synchronously from the click handler; a jsdom regression test locks that ordering. After rebuilding and reinstalling the exact generated bundle, Firefox displayed the host prompt for only `127.0.0.1`, and both public and harmless cookie-authenticated captures passed. Remote inspection scoped to PostKeeper confirmed blob-backed images in both sandboxed readers, no synthetic cookie/password value or password input, a clean `http://127.0.0.1:4173/` URL after handoff, and an extension queue count of 0 after durable acknowledgement. Temporary ADB reverse mappings were removed and Firefox's USB remote-debugging switch was restored to off after the run.

2026-08-31 — Edge Canary Android remains the sole open Milestone 3 runtime row. ADB confirms `com.microsoft.emmx.canary` is not installed in Android user 0 on the connected phone, so no build number or support claim is recorded. Per D-016, the exact current Edge Canary build at its first passing physical-device test becomes the minimum supported version. Milestone 4 must not start until this row is resolved.

2026-08-31 — Final post-fix regression results: `npm run validate` passes formatting, ESLint, type checks, 39 unit/jsdom tests across 15 files, and production PWA/Chromium/Firefox builds. `npm run test:extension` passes both packaged Chromium capture tests in 3.1s. `npm run test:extension:firefox-runtime` passes the Firefox 154.0.1 public/authenticated runtime matrix, and `npm run test:extension:firefox-lint` reports zero errors, zero notices, and only the two accepted Readability warnings. The Chromium harness was updated to initialize its standalone popup document while the fixture tab is active, matching real toolbar-popup semantics with the new preloaded context.

2026-09-01 — Installed the current Microsoft Edge Canary 154.0.4249.0 (versionCode 424900023) on the physical Android 16 / Samsung SM-S9280 test device. A signed CRX3 built from the unchanged production Chromium manifest installed through Edge's real Developer options flow with extension ID `hfiejgmacnhmlnlbfhplmgcgpacjmceb`; Edge's internal registry reported MV3 version 0.1.0 enabled with active `activeTab`, `storage`, `tabs`, and `scripting` permissions plus optional HTTP/HTTPS host permissions. The real toolbar popup requested only `127.0.0.1` for the local test PWA.

2026-09-01 — The first consecutive Edge Android capture exposed a repeated-handoff race: fragment-only `tabs.update()` followed immediately by `tabs.reload()` could reload Edge's previously committed clean PWA URL, leaving the authenticated payload safely queued but unreachable. The PWA transfer listener now starts fresh sessions on valid capability `hashchange` events, and existing same-document PWA tabs no longer receive a redundant reload; true document navigations register their completion listener before `tabs.update()`. A jsdom regression covers sequential capabilities in one mounted PWA.

2026-09-01 — Edge Android physical acceptance passed after the fix. Public and harmless cookie-authenticated captures imported with blob-backed images; the synthetic cookie/password values and password control were absent; reader iframes retained empty sandbox and `no-referrer`; the PWA URL was clean; an interrupted queue entry survived the in-place extension update and completed after reopening the updated PWA; and a fresh repeated capture ended with extension queue count 0. Per D-016, Microsoft Edge Canary 154.0.4249.0 (versionCode 424900023) is now the first supported Android Chromium minimum, with no support claim for earlier builds.

2026-09-01 — Final Milestone 3 validation passes: `npm run validate` (format, ESLint, type checks, 40 tests across 15 files, production PWA and both extension builds); `npm run test:extension` (2 packaged Chromium runtime tests); `npm run test:extension:firefox-runtime` (consecutive public/authenticated Firefox 154.0.1 captures); `npm run test:extension:firefox-lint` (0 errors, 0 notices, the two accepted Readability warnings); and `npm run test:browser -- --reporter=list` (8 Chromium/Firefox PWA tests). Every row in `docs/EXTENSION_COMPATIBILITY.md` passes. Milestone 3 is Complete; Milestone 4 is next.

2026-09-02 — Milestone 4 implementation started. D-018 resolves O-003 in favor of Google Drive's hidden `appDataFolder` and the non-sensitive `drive.appdata` scope. The decision was checked against current official Google documentation: application data is app-only and hidden; GIS browser tokens are short-lived and reacquired from user interaction; Drive lists app data with `spaces=appDataFolder` and paginates with `nextPageToken`; 401 requires reauthorization, while 429 and 5xx responses use backoff.

2026-09-02 — Added `packages/sync-core`: cryptographically random device/library/recovery identities; monotonic per-device sequence logs; deterministic field-level last-write-wins with device-ID tie-breaking; operation-based memberships; tombstones; immutable snapshots with retained conflict variants; paginated provider contracts; immutable and conditional writes; and a retry-safe synchronization engine. Versioned envelopes derive independent encryption and identifier material with HKDF-SHA-256, encrypt every object with unique-nonce AES-GCM, bind library ID and remote path as authenticated data, wrap the random master key with a 256-bit recovery key, and hide local blob hashes behind HMAC identifiers.

2026-09-02 — Added `packages/sync-google-drive` and PWA integration. The Drive adapter creates and lists only hidden app-data files, handles pagination, multipart uploads, ETags, auth/retry/quota errors, and never logs bearer tokens. GIS requests only `drive.appdata`, holds the token in memory, and surfaces expiry/revocation as reconnect-required. IndexedDB schema version 2 persists device identity, projection, ordered operations, library association, and conflict operations. Sync uploads encrypted blobs before referencing operations, restores and hash-verifies missing blobs before applying metadata, rejects wrong recovery keys and cross-library restores, and rebuilds search after a validated clean-client restore. The UI exposes local, pending, synced, error, conflict, and reconnect-required states and requires explicit recovery-key confirmation before first upload.

2026-09-02 — The required conflict/crypto/OAuth audit found and fixed ambiguous provider-path identifiers, insufficient validation of an existing wrapped-key envelope, non-durable downloaded conflict variants, unsafe cross-library restore behavior, missing pre-apply relationship/blob checks, and a token-expiry margin that could immediately expire very short tokens. Automated coverage now includes two offline clients converging, clean metadata/content restore, wrong-key rejection, ciphertext/path substitution and tamper rejection, interrupted-write replay, pagination, Drive REST multipart/app-data behavior, token expiry/revocation, remote plaintext inspection, and recovery setup UI.

2026-09-02 — Current validation passes: `npm run validate` (format, ESLint, all package/app type checks, 66 tests across 22 files, production PWA and both extension builds); the included stateful Drive REST contract test passes; and the unsandboxed `npm run test:browser -- --reporter=list` passes 10 tests across Google Chrome and Playwright Firefox, including recovery-key confirmation. The sandbox-only Firefox `newPage` failure reproduced in a three-line Playwright program, persisted after reinstalling the exact browser, and disappeared outside the restricted Windows account; no application change was needed.

2026-09-02 — Milestone 4 remains **In progress** because a real Google account smoke test cannot run without user-owned external configuration: O-001 must select the permanent web origin, and a Google Cloud Web OAuth client ID must authorize that origin. `docs/GOOGLE_DRIVE_SETUP.md` records the exact configuration and acceptance checklist. Milestone 5 has not started.

2026-09-02 — The user supplied root `.env.local`, GitHub variable `GDRIVEWEBID`, the `fishese/postkeeper` repository, and `keep.fishese.cc`. D-019 resolves O-001. The user explicitly approved publication/deployment and GPL licensing; D-020 resolves O-007 with GPL-3.0-or-later. Git was initialized locally. GitHub Pages now uses Actions and the custom domain; DNS resolves `keep.fishese.cc` to `fishese.github.io`, and GitHub reports an approved certificate with HTTPS enforced. Initial source push/deployment verification is pending at this log entry.

2026-09-02 — OAuth/deployment audit fixed root `.env.local` not loading in the Vite workspace, missing environment/build-output Git ignores, loss of popup activation during asynchronous GIS loading, and failed-script retries that could hang. Google script loading is now explicitly initiated, retryable, and time-bounded; the subsequent connect click requests the token synchronously. Reused clients disable incremental scope aggregation. The old `GDRIVEWEBSECRET` variable's value was not read and is never used. No stale remote data has been deleted.

2026-09-02 — Pre-publication sync audit fixed missing blob uploads when unlocking an existing client, local edits being overwritten during network sync, non-atomic operation preparation across local connections, and storing a blob before checking its expected hash. IndexedDB preparation is transactional; applying remote state checks local projections and pending operations under the replacement transaction's lock, leaving new local edits intact with a retry message. Regression tests cover offline-capture unlock/restore, mid-sync edits, and concurrent preparation. A flaky tamper test now flips real ciphertext bits rather than unused base64 padding bits. `npm run validate` passes 73 tests across 24 files plus format/lint/typecheck/build; `npm run test:browser -- --reporter=list` passes 10 tests across Chromium/Firefox. The public build includes GPL/source/third-party notices and a development-preview warning. Milestone 4 remains In progress; Milestone 5 has not started.

2026-09-02 — Initial source commit `d050d7f` was published to `fishese/postkeeper`; GitHub Actions run `33630165694` passed validation, build, and deployment. HTTPS requests to `/`, the manifest, service worker, license, and third-party notices all return 200. The live browser imported/rendered a fixture and retained it after reload. A source scan confirmed `.env.local` and generated artifacts are untracked and the actual configured client ID appears only in the intended static bundle, not tracked source. GitHub's current Pages actions report Node 20 deprecation warnings but run successfully on its forced Node 24 runtime.

2026-09-02 — Live GIS loading exposed the original local-only application CSP blocking Google. D-021 adds only the documented Google Identity paths, Drive v3 metadata/upload paths, and OAuth revocation endpoint; the saved reader retains its separate no-script/no-network policy. A production-browser test with synthetic Google responses then found that native `fetch` was invoked with the provider instance as `this`; it is now bound to `globalThis`. The complete browser matrix passes **12 tests**, including GIS loading, an actual browser Drive request to a mocked endpoint, expired-token handling, local usability, and reader isolation. The CSP/provider correction requires a follow-up deployment. No Google account has yet been authorized, and no Drive objects have been created or deleted.

2026-09-02 — Corrective commit `2c442fb` deployed successfully in GitHub Actions run `33630807306`; its clean-run validation/build/deploy all passed. The HTTPS origin serves the updated CSP. An already-open PWA initially retained the old cached shell; closing and reopening the app after the worker update loaded the corrected version. The live GIS script then initialized successfully and displayed **Connect Google Drive**. Real account authorization remains a user step in their normal browser, followed by encrypted upload, clean-client restore, and convergence/expiry acceptance. Milestone 4 remains In progress. No Google account data was read, created, or deleted during deployment verification.

2026-09-02 — The user reports Google authorization now works after adding their account under OAuth test users. This is user-reported login/consent success; full Drive convergence, clean-client restore, and expiry acceptance have not yet been demonstrated. Milestone 4 remains In progress.

2026-09-02 — At the user's request, prepared public privacy and terms documents for later publication (D-022), with the public GitHub issue tracker as the contact channel. They accurately distinguish no maintainer library backend from plaintext local storage, encrypted Drive objects, provider technical logs, and public support submissions; describe revocation/deletion/history retention and lost-key limitations; and preserve GPL and mandatory legal rights. They are static, script-free documents with their own restrictive CSP, responsive styling, accessible structure, and no sign-in requirement. Homepage/sync links open a new tab to avoid discarding session keys. Dedicated precache entries and navigation exclusions prevent the service worker from replacing the policies with the app shell. `docs/GOOGLE_DRIVE_SETUP.md` now lists the future policy URLs and distinguishes non-sensitive scope status from possible brand/manual verification. No OAuth audience settings were changed and no source was committed, pushed, or deployed for this request.

2026-09-02 — Policy-page validation passes: `npm run validate` (format, lint, type checks, 75 unit tests across 25 files, PWA and both extension builds); full Chromium/Firefox matrix (18 browser tests including JavaScript-disabled documents, new-tab links, and offline policy navigation); and `/postkeeper/` build checks for both policy documents, stylesheet paths, and precache entries. The normal root build was restored. A local preview was served successfully. Legal text remains a maintainer-review draft, not a compliance certification; review its accuracy/dates and applicable legal requirements before public OAuth launch.

2026-09-02 — The user authorized publishing the policy pages and application links to the existing GitHub Pages site. Release commit `92578f4` deployed successfully in GitHub Actions run `33635433457`; clean-run validation, build, and deployment passed. Both `https://keep.fishese.cc/privacy.html` and `https://keep.fishese.cc/terms.html` return HTTPS 200 with the expected titles, public issue-tracker contact, no scripts, and a working stylesheet. Local validation also passed again (75 unit tests). The release includes only the prepared policy, navigation, build/test, and documentation changes. Google OAuth remains in Testing; this release does not change audience settings or complete milestone 4 acceptance.

2026-09-02 — The user subsequently reported publishing the OAuth audience and requested Android Studio emulator testing instead of using their phone. Launched the existing `Pixel_10_Pro_emu` (Android 17, Chrome 149.0.7827.5), initially read-only and then with persistent saved state after explicit approval; resized its window to fit the desktop. The user reports signing in, and emulator inspection confirms Chrome is at `https://keep.fishese.cc/`, but its native accessibility tree does not expose the app's connection state. A temporary ADB forwarding request for Chrome DevTools was rejected by safety review because it exposes the authenticated browser's debugging surface. No forwarding connection was established. Explicit approval for temporary emulator debugging has been requested; no attempt was made to bypass the rejection. The phone was not used.

2026-09-02 — Continued Milestone 4 audit while live acceptance awaited debugging approval. Exact-name Drive lookups omitted `nextPageToken` and only considered their first result page, potentially treating an existing encrypted object as missing and creating duplicates. The provider now exhausts exact-match pagination, chooses duplicate file IDs with a locale-independent ordering across pages, and rejects looping continuation tokens before creating an object. Three regression tests failed before the fix and pass afterward; Google's `files.list` reference confirms that populated `nextPageToken` requires further pages. `npm run validate` passes (format, lint, type checks, 78 tests across 25 files, PWA and both extension builds); the Chromium/Firefox browser suite passes all 18 tests in 16.2s. These changes remain local and are not deployed. Live encrypted upload, clean-client restore, convergence, and expiry acceptance remain pending; Milestone 4 is still In progress and Milestone 5 has not started.
