# Next Chat Prompt

Checkpoint: 2026-09-03. Canonical progress is in `STATUS.md`.

## Current stop

**Milestones 0–6 are complete and published. Milestone 7 has not started.** M6 source/signing workflow commit `c32aae9` and SDK-runner path fix `f5d139c` are on `main`. Pages runs `33763974272` and `33764183745` succeeded; `https://keep.fishese.cc/` now serves M6, including its POST share-target manifest.

The user saved all four signing secrets and requested a GitHub APK build. **Run 33764185135 passed**, building and signing source `f5d139c142af738542d18216d9f09aad00047952`. All four secrets worked; no user-input blocker remains. The signing key/password values were never requested in chat or displayed.

## Required reading

Workspace `D:\Projects\PostKeeper`, branch `main`, repository `fishese/postkeeper`. Read completely: `README.md`, `docs/PRODUCT_PLAN.md`, `docs/TECHNICAL_ARCHITECTURE.md`, `docs/IMPLEMENTATION_ROADMAP.md`, `docs/DECISIONS.md`, `docs/STATUS.md`, this prompt, `docs/GOOGLE_DRIVE_SETUP.md`, `docs/BACKUP_FORMAT.md`, `docs/ANDROID_SETUP.md`, `docs/ANDROID_SIGNING.md`, and `docs/DEPENDENCIES.md`. Follow all AGENTS.md restrictions and preserve any user changes.

## Signed APK

- Successful run: https://github.com/fishese/postkeeper/actions/runs/33764185135
- Artifact: **postkeeper-signed-apk-2**, ID `9896865867`, retention through 2026-10-03. Contains `postkeeper-release.apk` and `SHA256SUMS.txt`.
- APK: **2,945,427 bytes**, version **0.6.0**, versionCode **6**, package `cc.fishese.postkeeper`, minimum API **28**, target API **36**, non-debuggable. Independent local v3 signature and checksum verification pass.
- SHA-256: `7caec7b6b86ddbd3f20eab5168b587fa493097a43d670a329fb053da82aacb48`.
- Local generated copy: `apps/android/app/build/outputs/apk/github-33764185135/postkeeper-signed-apk-2/postkeeper-release.apk`. Ignored build output may be removed by future build cleanup; preserve separately if needed.
- Rebuild via Actions → **Build signed Android APK** → Run workflow → `main`. Signing secrets are repository Secrets (not Variables): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Check names only when needed; never retrieve/display values or replace the signing identity casually.
- Build and signing run on separate runners. The first run `33763991596` failed before signing because `sdkmanager` was not on PATH; `f5d139c` fixes the installed path in both jobs. No further workflow fix or secret change was needed. No Play Store or GitHub Release publication is configured.
- Android Studio's user-generated `.idea` metadata and `apps/android/app/release` output were preserved locally and excluded by new ignore rules. Signing keystores, APKs, and IDE caches were not committed.

## M6 acceptance and implementation

D-025 selects a thin Java/AndroidX WebKit shell around shared web UI 0.6.0. The trusted library uses a separate named profile; only the exact main document accepts origin-allowlisted native messages. Each starting capture origin uses an independent profile. Website pages, embedded frames, and saved readers have no native bridge. An explicit native Save action reuses extension credential scrubbing/Readability and standard validation/sanitization. Same-origin authenticated images pass; cross-origin/redirected images remain partial.

Pending links use existing version-1 article/snapshot records with a visible placeholder/warning, preserving backup/sync compatibility and organization on capture. PWA sharing handles bounded POST bodies locally in its controlling worker, then removes the receipt fragment. Native URL shares remain queued until durable acknowledgement. Device key convenience storage uses native consent and Android Keystore AES-GCM outside backups.

- Full local and GitHub web validation: **106 tests / 30 files**, formatting, ESLint, typechecking, web/extension builds.
- Desktop browser matrix: **27 passed, 1 intentional Firefox POST-share skip**; packaged Chromium extension tests **2 passed**. Chrome 152.0.7977.65 / Playwright Firefox 153.0.
- Native matrix: `Pixel_10_Pro_emu`, `emulator-5580`, Android 17 / API 37.1, WebView **149.0.7827.163**. Native ACTION_SEND and actual Android resolver create pending Inbox items; public/authenticated captures/images pass; password/CSRF/cookie markers absent from saved data; page/frame/reader lack native privileges; site/all clearing removes sessions from both tested profiles while preserving library/images and reloads.
- Two JVM URL/profile tests and device Keystore encryption/round-trip/tamper/forget checks pass. Debug and unsigned release builds pass; Android lint **0 errors, 37 reviewed warnings**. GitHub builds and signs the release separately.
- Native JSON picker export saved **8,588 bytes**; native selection, staging, and idempotent import passed. Bundled privacy opens in a script-disabled local viewer. Earlier M4 Drive and M5 Chrome/PWA phone PDF acceptance remain recorded in `STATUS.md`.

## Preserved state and limitations

Use the emulator unless stuck and a phone test is needed. **Tell the user before wireless-ADB phone use.** No phone was used for M6; the GitHub signing session accessed no device at all. No installation of the signed release was performed. Do not install/reset/reconnect things merely to repeat completed checks.

Preserve existing browser/PWA library, categories, disconnected Drive association, and saved recovery key. Do not initialize a replacement library or request its key in chat. The previously installed **PostKeeper Dev** emulator package (`cc.fishese.postkeeper.debug`) contains only harmless M6 fixtures; the release APK uses a separate package/library. Synthetic key instrumentation was uninstalled after its disposable key was deleted. Do not run it on any app containing a real saved key.

Temporary M6 fixture servers, mappings, device UI dump, exported device JSON/PDF were cleaned. All existing libraries remain. Allocate fresh loopback mappings if a later authorized test needs them.

Wrapper Google sign-in/Drive remains unavailable; use browser/PWA Drive and portable backups between independent libraries. Native PDF preview opened but the emulator saved zero bytes; wrapper PDF saving is unverified. M5's successful six-page Samsung phone PDF applies to Chrome/PWA, not the wrapper. Signing does not resolve these limitations.

Firefox manual/fragment receipt works; its POST-body path returned safe 400. Installed Firefox Web Share Target and a real PWA/WebAPK Android Sharesheet entry are not claimed. Capture is transient until import; process death may require retry from the pending link. Large-storage/process-death stress, minimum-API/physical wrapper devices, complex SSO/MFA, video/uploads, and cross-origin image retrieval are unverified or unsupported. Background sync and store distribution are deferred.

Do not start M7/self-hosted provider or resolve O-006 without a new explicit user request.

## Copy-ready continuation prompt

```text
Continue PostKeeper in D:\Projects\PostKeeper. Completely read docs/NEXT_CHAT_PROMPT.md, its listed source-of-truth documents, and docs/STATUS.md. Follow all AGENTS.md restrictions and preserve user changes.

Milestones 0–6 are complete and published. M6 is c32aae9 with GitHub SDK-path fix f5d139c. Signed APK run 33764185135 passed; artifact postkeeper-signed-apk-2 contains verified PostKeeper 0.6.0 (versionCode 6, package cc.fishese.postkeeper). No secret setup or signing blocker remains. Do not repeat builds or acceptance without a concrete reason, and do not start Milestone 7 until I explicitly request it.

Use the emulator unless stuck and a phone test is needed; notify me before wireless-ADB phone use. Preserve existing libraries, categories, Drive associations, recovery keys, and release signing identity. No Drive reconnection is needed. The release app and PostKeeper Dev use separate local libraries. Wrapper PDF saving and native Google Drive remain limited as documented. Update status and the continuation prompt after any new requested work.
```
