# Extension compatibility matrix

Last updated: 2026-09-11

Every required Milestone 3 runtime row has a recorded end-to-end pass. Package validation alone is not treated as runtime evidence.

## 2026-09-11 published 0.1.5 follow-up

Extension **0.1.5** is published from source `1ac36e2b5bbd227134862883e69fe2aceef96bcc`. Chromium's toolbar action captures the rendered source before leaving its active tab, then opens a full extension page tied to that draft by a random, ten-minute `storage.session` reference. Save grants the needed hosts and replaces the extension page with the importing PostKeeper PWA. The reference keeps the source URL out of the extension-page URL and the action-page path performs no active/current-window discovery. This covers Kiwi 137's observed failure to inject into the original Reddit tab after the extension page became active.

The pre-captured draft identifies the reader image origins before Save, so the click requests only the configured PWA and those origins. This permits CDN-hosted article images without permanent all-sites access. Asset requests have a five-second per-item timeout and a 30-second total budget. The inspected Reddit page's `shreddit-post` placed a community icon and blurred duplicate before the intended media and also included an advertisement elsewhere. Reddit image-post extraction now uses the exact post's declared `content-href` and appends up to 100 comments already loaded and expanded in `shreddit-comment` elements. Author, timestamp, permalink, nesting depth and sanitized comment body are retained; hidden/collapsed replies are skipped and nothing is expanded. This is covered by a DOM regression based on the supplied page. PostKeeper has no request-blocking API or permission (`declarativeNetRequest` and `webRequest` are absent), so Kiwi's “Chrome is blocking ads” label does not describe a PostKeeper feature.

The Firefox manifest already declared Android support, and 0.1.5 retains `browser_specific_settings.gecko_android.strict_min_version: 142.0`; the bundle targets the lower Firefox desktop minimum, 140. An unsigned ZIP cannot serve as a normal Firefox Android installer. Upload the ZIP to AMO, keep Android compatibility enabled from the manifest, and install Mozilla's signed/listed result. Build-time transformations replace Mozilla Readability's two detached-document `innerHTML` assignments with DOM clone/DOMParser operations while retaining dependency **0.6.0**. Packaged Firefox lint is **0 errors, 0 warnings, 0 notices**.

| Local candidate                 | Bytes   | SHA-256                                                            |
| ------------------------------- | ------- | ------------------------------------------------------------------ |
| `postkeeper-chromium-0.1.5.zip` | 124,767 | `1c081b045c188985d7b801ae336a74b094d08de9d71a8098215e4167d264ee83` |
| `postkeeper-firefox-0.1.5.zip`  | 124,876 | `4b72993a9b72dde6f9a6d12e96e0734edebf78530c37060295c0541f67cbd6ae` |

Evidence: `npm run validate` passes formatting, lint, all type checks, **129 tests / 31 files**, and production builds. Packaged Chromium passes **4/4**, including public, authenticated, standalone-picker, and pre-captured exact-source action-page capture through durable PWA import and queue acknowledgement. Firefox lint is **0 errors / 0 warnings / 0 notices**; the Firefox ZIP manifest, Android minimum and absence of unsafe `innerHTML` assignments were inspected directly. Firefox **155.0.1** passes the disposable-profile runtime with public/authenticated capture, decoded image import, secret filtering, capability-fragment cleanup and queue acknowledgement. Restricted runs discarded the disposable content context; the required host-access run passed after the user's normal Firefox was closed. Actual Reddit capture on Firefox and Android installation still need manual acceptance. Historical 0.1.4 Android runtime evidence remains below.

Publication: [extension-v0.1.5](https://github.com/fishese/postkeeper/releases/tag/extension-v0.1.5) targets source `1ac36e2b5bbd227134862883e69fe2aceef96bcc` and includes both browser-qualified ZIPs plus `SHA256SUMS.txt`. Pages run **34508243000** passed. The live guide exposes the 0.1.5 links, and fresh anonymous downloads matched both local byte counts and SHA-256 hashes.

Wireless phone evidence: the user authorized a scoped check while a LINE call remained ongoing. ADB found Kiwi **137.0.7337.0**, its newly loaded `postkeeper-0.1.5.zip`, and a current PostKeeper action page holding the exact Reddit source token. That page displayed “Could not find an active window,” confirming the error occurred when the old flow tried to inject after moving to the extension page. Kiwi was never foregrounded; only Kiwi package state, matching PostKeeper/Reddit targets and PostKeeper page text were read. LINE and the call were not inspected or touched. The revised ZIP has not yet been manually installed or accepted on Kiwi or Firefox.

Local packages:

- `apps/extension/build/chromium/postkeeper-0.1.5.zip`
- `apps/extension/build/firefox/postkeeper-0.1.5.zip`

## 2026-09-09 published follow-up

Hotfix **0.1.4** removes the remaining mobile active-window dependency after the user chooses a source page: background capture now retrieves that exact tab ID directly. It also adds the specific-post/social-preview media fallback shared with native capture. The packaged Chromium standalone-tab flow passes. Source `7bb7107864233307eb75e49c7045b5fa5360797a` is published at [extension-v0.1.4](https://github.com/fishese/postkeeper/releases/tag/extension-v0.1.4); fresh anonymous downloads through the live guide matched the packaged files.

When a mobile browser opens the popup as a separate tab or `tabs.query({active:true,currentWindow:true})` fails, an explicit page picker now selects the original HTTP(S) tab. Save requests the chosen page host and configured PWA host synchronously; no broad persistent content script or website button is introduced. Desktop active-tab behavior and saved PWA destinations are preserved. Live responsive/lazy image sources survive extraction, and downloads prioritize reading-copy images. A semantic fallback recovers substantial article text when Readability chooses only a short teaser.

Packaged Chromium runtime: **3 passed**, including public recapture, authenticated capture and a popup opened as its own active tab → explicit source selection → durable PWA import/queue acknowledgement. The suite now owns ports **4280/4281** to avoid collisions with the PWA test server. Unit coverage also injects the exact missing-window failure and checks synchronous scoped permissions. Firefox **155.0** public/authenticated runtime, decoded images, secret filtering, fragment cleanup and acknowledgement pass. Firefox lint has 0 errors, 0 notices and 2 accepted Readability warnings. These checks reproduce the failure mode; they do not claim a new physical Android browser pass.

## Installation and distribution

Current preview: **0.1.5**, source `1ac36e2b5bbd227134862883e69fe2aceef96bcc`, [GitHub release](https://github.com/fishese/postkeeper/releases/tag/extension-v0.1.5). It adds Firefox Android packaging, warning-free AMO lint, Reddit primary-image/comment capture and Kiwi-compatible exact-source handoff. Manual Android acceptance remains separate.

| Download                        | Bytes   | SHA-256                                                            |
| ------------------------------- | ------- | ------------------------------------------------------------------ |
| `postkeeper-chromium-0.1.4.zip` | 117,902 | `120273e9959ad7755ea571aafd9b67582bae77dbade18184af547d25dc00658e` |
| `postkeeper-firefox-0.1.4.zip`  | 118,001 | `145d95d5395f4f923f79964da9c837e22e925d0a9fa259ea0d277d703ab00ce9` |

The production default, saved-destination preservation, temporary unsigned Firefox installation, and separate APK storage boundaries introduced in 0.1.1 continue to apply. Previous 0.1.1 artifacts and evidence below are retained for reproducibility.

The public [extension installation guide](https://keep.fishese.cc/extensions.html), linked from Add link, Settings → About and extension connection settings, describes the preview downloads. Extension **0.1.5** defaults to `https://keep.fishese.cc/`; saved custom destinations remain unchanged. Both generated targets use the same default and continue to request only the configured PWA host permission from the user's Save gesture.

Build and package with:

```text
npm run build --workspace=@postkeeper/extension
npm run package:chromium --workspace=@postkeeper/extension
npm run package:firefox --workspace=@postkeeper/extension
```

Outputs are `apps/extension/build/chromium/postkeeper-0.1.5.zip` and `apps/extension/build/firefox/postkeeper-0.1.5.zip`. The versioned GitHub preview release is `extension-v0.1.5`; published assets use the names `postkeeper-chromium-0.1.5.zip` and `postkeeper-firefox-0.1.5.zip` plus `SHA256SUMS.txt`. Chromium desktop uses an extracted folder and Developer mode → Load unpacked. The Firefox ZIP is unsigned and supports only temporary desktop installation through `about:debugging`; it disappears on restart. Mozilla signing/store publication and a supported public Android extension installer are not part of this follow-up. Historical Android runtime compatibility does not imply that a public phone installer has been published.

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
