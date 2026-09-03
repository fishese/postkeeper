# Next Chat Prompt

Checkpoint: 2026-09-04. Canonical progress is in `STATUS.md`.

## Current scope

Milestones 0–6 are complete. **Do not start Milestone 7 or resolve O-006 without an explicit request.** The user separately requested a compact mobile redesign, reusable CSS, English localization resources, and an unobtrusive link from the web app to a GitHub-hosted signed APK.

That follow-up is implemented as **0.6.1**, Android versionCode **7** (not Milestone 7), under D-026. The follow-up is committed, deployed and published. No user-input blocker remains. The About link uses the matching `v0.6.1/postkeeper-release.apk` asset, not an expiring Actions artifact URL.

The subsequent user request for an extension installation page/download link and a production PWA default is also complete. Source **de27ff3**, Pages run **33789716332**, guide **https://keep.fishese.cc/extensions.html**, and GitHub prerelease **extension-v0.1.1** are published and anonymously verified. The extension does not transfer directly into the APK's separate library.

## Required reading

Workspace `D:\Projects\PostKeeper`, branch `main`, repository `fishese/postkeeper`. Read completely: `README.md`, `docs/PRODUCT_PLAN.md`, `docs/TECHNICAL_ARCHITECTURE.md`, `docs/IMPLEMENTATION_ROADMAP.md`, `docs/DECISIONS.md`, `docs/STATUS.md`, this prompt, `docs/GOOGLE_DRIVE_SETUP.md`, `docs/BACKUP_FORMAT.md`, `docs/ANDROID_SETUP.md`, `docs/ANDROID_SIGNING.md`, `docs/DEPENDENCIES.md`, `docs/UI_AND_LOCALIZATION.md`, and `docs/EXTENSION_COMPATIBILITY.md`. Follow every AGENTS.md restriction and preserve unrelated user changes.

## Interface follow-up

- Library-first layout, compact labeled icons, bottom navigation on phones, sidebar on desktop, full mobile reader with Back to library.
- Add link, categories and settings use native HTML dialog sheets. Settings panels remain mounted to retain in-memory sync/key and staged-import state.
- Settings contains sync, backup/diagnostics, storage/search maintenance, About and developer fixtures. About contains Browser extension setup, Download for Android, privacy/terms/source/license/notices.
- `apps/web/src/styles.css` holds design tokens/component rules. `reader.css` and `print.css` are imported into the existing isolated documents. No security privilege was added to reader or capture content.
- Typed English catalog in `apps/web/src/i18n`, named placeholders, Intl formatting/plurals, English fallback, document language/direction, logical CSS. English is the only shipping language. Follow the localization guide for the explicit remaining boundaries before adding another language.
- Native capture controls use XML layouts/styles/colors/dimensions and Android string resources. Browser options holds Back page and site/all data clearing; the address opens a full-address dialog. Clearing still requires confirmation.
- No storage schema, backup format, crypto/provider change, or new runtime dependency.

## Extension guide/default follow-up

- Fresh extension installs default to `https://keep.fishese.cc/`. Existing saved destinations stay unchanged; the guide explains how to switch an older localhost setup. Both manifests are **0.1.1**, independent of web/native version 0.6.1.
- `apps/web/extensions.html` is a standalone script-free page using `legal.css`, linked from About, policy navigation and extension settings. It is precached and works offline after the PWA loads. Future Android builds allow this exact document in the existing script-disabled viewer; the published APK was not replaced.
- Public release **https://github.com/fishese/postkeeper/releases/tag/extension-v0.1.1** has `postkeeper-chromium-0.1.1.zip` (113,791 bytes, SHA-256 `f67c1a866eb827f81950806455fe26455c613d0e37b5c7a3c166a02a9616d72e`) and `postkeeper-firefox-0.1.1.zip` (113,891 bytes, SHA-256 `f6d46738435c75fbde66faac7c3fbc47a1554b4f41d1e788fe7485d4bd024269`), plus `SHA256SUMS.txt`.
- Chromium desktop uses Developer mode → Load unpacked. Firefox ZIP is unsigned and temporary through `about:debugging`; Mozilla signing/store publication and a supported public Android extension installer are not complete and were not requested in this follow-up. Historical Android runtime passes are distinct from public distribution.
- Extensions import into the configured browser/PWA origin. APK storage is separate; use native sharing/capture or portable backup transfer. No cross-app bridge was added.
- Final validation: **112 tests / 31 files**, format/lint/typecheck/build pass; **8 Chromium/Firefox guide/policy tests**, **2 packaged Chromium handoff tests**, and unmodified Firefox **155.0** runtime pass. Firefox options UI checks the production default before explicitly saving localhost for fixtures. Restricted Selenium/Gradle failures were resolved with required host access. Android debug build, 2 JVM tests, lint 0 errors/17 existing warnings pass. No phone/emulator or real data/key/Drive operation occurred.
- Fresh Chrome **152.0.7977.65** followed the live About guide and anonymously verified both download hashes; screenshots in ignored `apps/web/dist-ui-review` were reviewed. No remaining requested-work blocker. Keep stable release URLs tied to actual published assets.

## Evidence and preserved state

Local validation: **109 tests / 31 files**, format, lint, typecheck and builds pass. Chromium/Firefox browser matrix: **33 passed, 1 intentional Firefox POST-share skip**. Final version-specific mobile/link rerun: **6 passed**. Packaged Chromium extension handoff: **2 passed** after stopping the owned preview server that occupied its test port. Mobile/desktop screenshots are in ignored `apps/web/dist-ui-review` and were visually inspected.

Android debug/unsigned release builds and two JVM tests pass; lint has **0 errors, 17 reviewed warnings**. Native toolbar-only instrumentation passed after a layout-timing correction, checking 48 dp controls, labels, address and screenshot. The existing Pixel_10_Pro_emu was started headlessly as emulator-5554, its debug app updated in place, and then stopped. The generated screenshot and installed instrumentation package were removed. No library/key reset or real Drive call occurred. No phone was used. The full M6 authenticated-capture/clearing matrix was not rerun; its navigation/menu selectors were adapted but need a disposable fixture context for a future full run.

Use the emulator unless stuck and a phone test is needed. **Tell the user before wireless-ADB phone use.** Preserve existing browser/PWA/native libraries, categories, disconnected Drive association, saved recovery keys and release signing identity. Do not run default Keystore instrumentation on an app with a real key; `-e captureUi true` is the separate UI-only path. Older M4/M5 opt-in acceptance runners may need updated UI selectors before reuse; do not reconnect Drive just to refresh old acceptance.

## Signing and limitations

The four repository signing secrets already work: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Check names only if necessary; never read/display values or change the signing identity. The manual Build signed Android APK workflow builds and signs on separate runners. Previous 0.6.0 run **33764185135** passed; its source was f5d139c. Current 0.6.1 signing run **33785611302** passed for `081389f5c48b442d163cab9dafa396848f574ded`; the UI commit is `ebac455`. Artifact **postkeeper-signed-apk-4**, ID `9905378918`, was independently verified and uploaded to **https://github.com/fishese/postkeeper/releases/tag/v0.6.1**. The APK is 2,978,363 bytes, versionCode 7, non-debuggable, minimum API 28 / target 36; SHA-256 `b5568b45e8f19b79f5783800ef4e6659bfbfaf1464e86d714811ed075aadf3a8`. Its certificate matches 0.6.0. Pages run **33785609975** passed. A fresh anonymous live-site download through Settings → About matched the checksum. Local copy: `apps/android/app/build/outputs/apk/github-33785611302/postkeeper-signed-apk-4/postkeeper-release.apk`. No signing values were retrieved or printed. The earlier run `33785440977` was cancelled to include a final print-table correction; six backup/print checks passed after that correction.

Package `cc.fishese.postkeeper` is separate from PostKeeper Dev (`cc.fishese.postkeeper.debug`). No Play Store submission is configured. Existing native PDF saving remains unverified after zero-byte emulator saves; M5's six-page phone result applies to Chrome/PWA only. Wrapper Google Drive remains unavailable; browser/PWA Drive and portable backups remain supported. Full translated-copy, screen-reader, minimum-API and physical wrapper acceptance are future work. M7 and M8 have not started.

## Copy-ready continuation prompt

```text
Continue PostKeeper in D:\Projects\PostKeeper. Read docs/NEXT_CHAT_PROMPT.md and all listed source-of-truth documents completely, including docs/STATUS.md and docs/UI_AND_LOCALIZATION.md. Follow all AGENTS.md restrictions and preserve user data and unrelated changes.

Milestones 0–6 are complete. The 0.6.1 compact UI/i18n and extension installation/default follow-ups are implemented and published. The guide is https://keep.fishese.cc/extensions.html; extension 0.1.1 defaults to that hosted PWA origin, preserves saved destinations, and has anonymously verified GitHub ZIP downloads. Firefox is still a temporary unsigned developer build; no public phone extension installer or direct extension-to-APK bridge is claimed. The separate signed APK remains at https://github.com/fishese/postkeeper/releases/tag/v0.6.1. Use the recorded evidence and work only on my next explicit request. Preserve the release signing identity; never request secret/key values in chat. Do not start Milestone 7 unless I explicitly request it.

Use the emulator, and notify me before any necessary wireless-phone test. Preserve existing libraries, categories, Drive associations and recovery keys. No Drive reconnection is needed. Keep status and the continuation prompt current after any new requested work. Do not repeat completed acceptance or reconnect Drive without a concrete reason.
```
