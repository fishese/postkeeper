# Next Chat Prompt

Checkpoint: 2026-09-05. Canonical progress is in `STATUS.md`.

## Required reading

Workspace `D:\Projects\PostKeeper`, branch `main`, repository `fishese/postkeeper`. Read completely: `README.md`, `docs/PRODUCT_PLAN.md`, `docs/TECHNICAL_ARCHITECTURE.md`, `docs/IMPLEMENTATION_ROADMAP.md`, `docs/DECISIONS.md`, `docs/STATUS.md`, this prompt, `docs/GOOGLE_DRIVE_SETUP.md`, `docs/BACKUP_FORMAT.md`, `docs/ANDROID_SETUP.md`, `docs/ANDROID_SIGNING.md`, `docs/DEPENDENCIES.md`, `docs/UI_AND_LOCALIZATION.md`, and `docs/EXTENSION_COMPATIBILITY.md`. Follow all AGENTS.md restrictions and preserve unrelated changes.

## Current follow-up

The bug review is **complete and published**, source **a837a4c13dd0d66499bfa73f4c1edc1a59c6abaa**, web/native **0.6.3**, Android versionCode **9**, and extension **0.1.2**. Signed build **33933029364** and Pages **33933028974** passed. Public releases: `https://github.com/fishese/postkeeper/releases/tag/v0.6.3` and `https://github.com/fishese/postkeeper/releases/tag/extension-v0.1.2`. No requested build/publication step remains; preserve previous releases.

Signed artifact **postkeeper-signed-apk-6**, ID **9959255082**; APK **2,982,531 bytes**, SHA-256 `f0df1a4605c6da7a6eebcd54db311b65812e4343e3e9e83393e5a42cd929fdd7`. Independent verification passed checksum, v3 signature, unchanged certificate, package/version, non-debuggable flag, API 28/36 and bundled guide versions. Fresh Chrome **152.0.7977.76** followed live About/guide links and anonymously verified all three public downloads. Local APK: `apps/android/app/build/outputs/apk/github-33933029364/postkeeper-signed-apk-6/postkeeper-release.apk`. Checksums and limits are in STATUS.md, ANDROID_SIGNING.md and EXTENSION_COMPATIBILITY.md.

Fixed popup failure handling, PWA path-boundary checks, duplicate bridge listeners, stale reader content on recapture, stale refresh results, concurrent capture deduplication, independent concurrent article flags, optional persistence failure handling, and empty category renames. Regression failures and final evidence are in STATUS.md. Local validation: **117 tests / 31 files**, format/lint/typecheck/build pass; Chromium/Firefox browser suite **35 passed, 1 intentional Firefox POST-share skip**; packaged Chromium extension **2 passed** including recapture into the same PWA; Firefox **155.0** runtime passes; Firefox lint **0 errors/0 notices/2 existing Readability warnings**.

The installation guide is `https://keep.fishese.cc/extensions.html`. Extensions default to `https://keep.fishese.cc/` and preserve saved custom destinations. Extensions save into browser/PWA storage, not directly into the APK's separate library; use native sharing/capture or portable backups. Firefox ZIPs are unsigned temporary desktop installs, not a public phone installer. About's APK URL derives from the web version; matching `v0.6.3/postkeeper-release.apk` and `extension-v0.1.2` ZIPs are published and verified.

## Preserved boundaries

Milestones 0–6, the compact mobile UI/i18n work, and extension installation/default follow-up are complete. **Do not start Milestone 7 or resolve O-006 without an explicit request.** M8 has not started. No schema, backup format, sync provider, or runtime dependency changed in this patch. Preserve CSS tokens, typed English resources and reader/capture isolation.

Use the emulator unless stuck and a phone test is necessary. **Notify the user before wireless-phone use.** Preserve libraries, categories, disconnected Drive associations, recovery keys and release signing identity. Do not run default Keystore instrumentation with a real key; `-e captureUi true` is the separate UI-only path. No device or real Drive test occurred in this patch. No Drive reconnection is needed.

Four GitHub signing secrets already work; never read/display their values or replace the signing key. Build signed Android APK is manually dispatched on main and separates build/sign runners. It uploads an artifact; public GitHub Release upload is a separate step. Independently verify checksum, package/version, non-debuggable release and unchanged signing certificate before publication. See ANDROID_SIGNING.md for prior releases.

Native PDF saving remains unverified after zero-byte emulator output; prior M5 six-page phone acceptance applies to Chrome/PWA only. Wrapper Google Drive is unavailable; browser/PWA Drive and portable backup remain supported. Full translated-copy, screen-reader, minimum-API and physical wrapper acceptance remain future work. The targeted bug review does not claim every possible async/native path has been exhaustively checked.

## Copy-ready continuation prompt

```text
Continue PostKeeper in D:\Projects\PostKeeper. Read docs/NEXT_CHAT_PROMPT.md and all listed source-of-truth documents completely, including docs/STATUS.md. Follow all AGENTS.md restrictions and preserve user data and unrelated changes.

The bug-fix release is complete: web/native 0.6.3 (Android versionCode 9) and extension 0.1.2, source a837a4c. GitHub signed run 33933029364 and Pages 33933028974 passed; public APK and extension downloads were independently verified through the live About/installation links. No requested build or publication step remains. Work only on my next explicit request, using the recorded evidence and limitations. Do not start Milestone 7. Use the emulator, and notify me before any necessary wireless-phone test. Preserve libraries and signing identity; never request signing secrets or recovery keys in chat. No Drive reconnection is needed. Keep status and the continuation prompt current after new work.
```
