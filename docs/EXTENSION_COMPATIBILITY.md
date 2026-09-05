# Extension compatibility matrix

Last updated: 2026-09-05

Every required Milestone 3 runtime row has a recorded end-to-end pass. Package validation alone is not treated as runtime evidence.

## Installation and distribution

Current preview: **0.1.2**, source `a837a4c13dd0d66499bfa73f4c1edc1a59c6abaa`, [GitHub release](https://github.com/fishese/postkeeper/releases/tag/extension-v0.1.2). Fixes popup failure reporting, PWA path-boundary validation, and repeated bridge injection. Packaged Chromium public/recapture/authenticated handoff tests pass; Firefox **155.0** public/authenticated runtime passes. Firefox lint: 0 errors, 0 notices, 2 existing Readability warnings. No Android runtime rerun occurred in this patch; historical device evidence below remains separate.

| Download                        | Bytes   | SHA-256                                                            |
| ------------------------------- | ------- | ------------------------------------------------------------------ |
| `postkeeper-chromium-0.1.2.zip` | 114,474 | `4bfa5913107450320b51f3d2d2f395cc3885e8fe3df1c4397421732657e97a82` |
| `postkeeper-firefox-0.1.2.zip`  | 114,574 | `9e6eb72e9790ea64188f9bef67e23ed345f944ca996580522e526deb420589d0` |

The production default, saved-destination preservation, temporary unsigned Firefox installation, and separate APK storage boundaries introduced in 0.1.1 continue to apply. Previous 0.1.1 artifacts and evidence below are retained for reproducibility.

The public [extension installation guide](https://keep.fishese.cc/extensions.html), linked from Settings → About and extension connection settings, describes the preview downloads. Extension **0.1.1** defaults to `https://keep.fishese.cc/`; saved custom destinations remain unchanged. Both generated targets use the same default and continue to request only the configured PWA host permission from the user's Save gesture.

Build and package with:

```text
npm run build --workspace=@postkeeper/extension
npm run package:chromium --workspace=@postkeeper/extension
npm run package:firefox --workspace=@postkeeper/extension
```

Outputs are `apps/extension/build/chromium/postkeeper-0.1.1.zip` and `apps/extension/build/firefox/postkeeper-0.1.1.zip`. The versioned GitHub preview release is `extension-v0.1.1`; published assets use the names `postkeeper-chromium-0.1.1.zip` and `postkeeper-firefox-0.1.1.zip` plus `SHA256SUMS.txt`. Chromium desktop uses an extracted folder and Developer mode → Load unpacked. The Firefox ZIP is unsigned and supports only temporary desktop installation through `about:debugging`; it disappears on restart. Mozilla signing/store publication and a supported public Android extension installer are not part of this follow-up. Historical Android runtime compatibility does not imply that a public phone installer has been published.

Extensions transfer to the configured browser/PWA origin, not to the APK's separate WebView library. The APK uses native sharing and its isolated capture browser; portable backup export/import can move records between libraries. No extension-to-native bridge was added.

2026-09-04 follow-up: packaged Chromium public/authenticated handoff passes. Firefox **155.0** passes using the unmodified generated bundle: its options page first shows the production default, the test explicitly saves localhost, and both capture/import/decoded-image/credential-filtering/fragment-cleanup/queue-acknowledgement paths pass. The initial restricted execution could not expose a usable Firefox content window; the same disposable-profile runner passed with the browser's required host access. Firefox lint remains 0 errors and 2 accepted Readability warnings. No physical Android browser retest was performed.

## Historical Milestone 3 acceptance

Follow-up image audit (2026-09-02, deployed/rechecked 2026-09-03): the earlier visibility/blob-URL checks did not prove that images decoded. Live Chrome Android acceptance exposed blocked blob-image URLs in the opaque-origin reader. D-023 replaces them with allowlisted inline image data while preserving the empty sandbox. Stronger `complete`/`naturalWidth` assertions now pass in the local PWA matrix, packaged Chromium capture tests, and the installed Firefox 155.0 extension runtime. Deployed commit `66a2466` also passes actual image decoding before and after offline reload on desktop Chrome 152.0.7977.65 and emulator Chrome 149.0.7827.5. This emulator check tests the PWA reader, not Android extension installation/capture. The physical Android capture rows below remain historical results; release hardening must repeat the stronger image assertions on those browsers. The user's phone was not used during this session.

| Target                            | Version/build                                                                               | Public capture | Authenticated capture | Queue + PWA acknowledgement | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------- | -------------- | --------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playwright bundled Chromium       | Chrome for Testing 151.0.7922.34                                                            | Pass           | Pass                  | Pass                        | Automated package-runtime test passes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Firefox desktop                   | Mozilla Firefox 154.0.1 (build 20260824154132)                                              | Pass           | Pass                  | Pass                        | Selenium/Marionette test installs the exact generated directory as a temporary add-on and passes two consecutive captures, images, secret filtering, capability-fragment cleanup, and queue acknowledgement. The local PWA origin is preauthorized in the disposable profile because WebDriver events do not carry Firefox's extension permission-request activation token.                                                                                                                                                                               |
| Microsoft Edge Canary for Android | Microsoft Edge Canary 154.0.4249.0 (versionCode 424900023) on Android 16 / Samsung SM-S9280 | Pass           | Pass                  | Pass                        | The exact signed Chromium MV3 CRX passed through Edge's real developer CRX installer, toolbar popup, and optional-host prompt restricted to `127.0.0.1`. Public and cookie-authenticated captures imported with blob-backed images, no synthetic cookie/password probe reached the sandboxed reader, capability fragments were removed, an interrupted transfer remained queued and recovered after reopening the PWA, and fresh repeated capture ended with queue count 0. This exact build is the first supported minimum; no earlier build is claimed. |
| Firefox for Android               | Mozilla Firefox 154.0.1 (versionCode 2016180583) on Android 16 / Samsung SM-S9280           | Pass           | Pass                  | Pass                        | The exact generated Firefox bundle passed on a physical device. A real optional-host permission prompt was approved from the popup gesture; public and cookie-authenticated captures imported with blob-backed images, the synthetic cookie/password probes were absent from the sandboxed reader, the capability fragment was removed, and the extension IndexedDB queue count was 0 after acknowledgement.                                                                                                                                              |

## Automated evidence

- `npm run test:extension` builds both browser bundles and runs Chromium public/authenticated capture through durable PWA import and acknowledgement.
- `npm run test:extension:firefox-runtime` builds the PWA and both extension targets, then runs the installed desktop Firefox with a disposable profile through consecutive public/authenticated captures, image checks, credential-control filtering, capability-fragment cleanup, and queue acknowledgement.
- `npm run test:extension:firefox-lint` validates the generated Firefox package with Mozilla `web-ext`.
- `npm run package:firefox --workspace=@postkeeper/extension` produces the Firefox ZIP package.
- `scripts/inspect-firefox-android.mjs` scopes Firefox Remote Debugging Protocol inspection to PostKeeper's two localhost fixtures and the exact `postkeeper@local.invalid` add-on. It supplied the physical-device assertions for reader sanitization, blob URL rewriting, fragment cleanup, and the zero-entry extension queue.
- Edge Canary Android inspection used its package-specific DevTools endpoint and was scoped to `http://127.0.0.1:4173/`, `http://127.0.0.1:4174/`, and extension ID `hfiejgmacnhmlnlbfhplmgcgpacjmceb`. Edge's internal registry reported the extension enabled with the expected active/optional permissions and MV3 service worker.

Mozilla's linter reports two accepted warnings in the bundled `@mozilla/readability` implementation. Both are `innerHTML` assignments used while Readability parses a detached cloned document; PostKeeper does not assign that output to extension UI, and the PWA independently sanitizes all imported reader HTML.

## Physical/manual test checklist

For each pending browser/version:

1. Install the generated browser package without modifying its production manifest.
2. Configure the local or deployed PostKeeper HTTPS origin and approve only that origin.
3. Save the public fixture and confirm its local image renders offline.
4. Sign in to the harmless authenticated fixture, save it, and confirm readable content imports.
5. Inspect the capture/extension logs for the harmless cookie value and a synthetic password value; neither may appear.
6. Interrupt the first transfer before acknowledgement and confirm it remains queued.
7. reopen PostKeeper, complete import, and confirm the acknowledged queue entry is removed.
8. Record exact browser/app version, OS version, device model, and pass/fail notes in this matrix.
