# Next Chat Prompt

Checkpoint: 2026-09-03. Canonical progress is in `STATUS.md`.

## Current stop

**Milestones 0–6 are complete locally.** Milestone 5 was committed/pushed to `main` as `dec19b63a96992c5a6644e9988bef742b0328b7d` (`dec19b6`) and deployed successfully by Pages run `33756881944`: https://github.com/fishese/postkeeper/actions/runs/33756881944. The public site `https://keep.fishese.cc/` contains M5. M6 web/native version 0.6.0 is local, uncommitted, and unpublished. **Milestone 7 has not started.** There is no remaining user-input blocker for M6.

## Required reading and preserved state

- Workspace `D:\Projects\PostKeeper`, branch `main`, repository `fishese/postkeeper`.
- Read completely: `README.md`, `docs/PRODUCT_PLAN.md`, `docs/TECHNICAL_ARCHITECTURE.md`, `docs/IMPLEMENTATION_ROADMAP.md`, `docs/DECISIONS.md`, `docs/STATUS.md`, this prompt, `docs/GOOGLE_DRIVE_SETUP.md`, `docs/BACKUP_FORMAT.md`, `docs/ANDROID_SETUP.md`, and `docs/DEPENDENCIES.md`. Follow all AGENTS.md restrictions.
- Preserve all local M6 source/tests/docs, including new `apps/android`, share/native bridge UI, pending-link domain/store code, service-worker handler/icons, build/fixture/emulator scripts, and Android notices. Generated builds/assets and `test-results` are ignored. M5 and earlier preserved work were included in `dec19b6`.
- Use the emulator unless stuck and a phone test is needed. Tell the user before wireless-ADB phone use. No phone was used during M6.
- Preserve the existing browser/PWA library, acceptance categories, disconnected Drive association, and saved recovery key. Do not initialize a replacement library, reconnect Drive, or request keys in chat. M6 used a separate newly installed debug app, with only harmless fixtures and a synthetic test key that was deleted after testing.

## Milestone 6 implementation and evidence

D-025 selects a thin Java/AndroidX WebKit shell, not a general plugin bridge. Bundled shared UI uses a named library profile. Each starting capture origin has an independent profile; only the trusted main app document accepts origin-allowlisted native messages. Website pages, embedded frames, and saved readers have no native bridge. Capture requires an explicit native Save action and reuses the extension's credential scrubber/Readability extractor plus standard package validation/sanitization. Same-origin authenticated images pass; missing/cross-origin images are visibly partial.

Pending links are ordinary version-1 records with a `pending-link` warning and placeholder snapshot. Native shares are queued until durable acknowledgement. PWA sharing handles bounded POST bodies in its controlling service worker and redirects via a local fragment. No shared-content server endpoint or schema migration was added. Native convenience key storage uses explicit confirmations and Android Keystore AES-GCM outside system backups.

- Full web validation: **106 tests / 30 files**, format, lint, typecheck, web and both extension builds.
- Full Chromium/Firefox browser matrix: **27 passed, 1 intentional Firefox POST-share skip**. Both packaged Chromium extension tests pass. Chrome 152.0.7977.65 / Playwright Firefox 153.0.
- Emulator: `Pixel_10_Pro_emu`, `emulator-5580`, Android 17 / API 37.1, Android System WebView **149.0.7827.163**.
- Native ACTION_SEND and real Android resolver selection create pending Inbox items. Public/authenticated captures and authenticated images pass. Fixture password/CSRF/cookie markers are absent from saved records/raw DOM/blobs. Native API absence is checked in page/frame/reader.
- Per-site clearing removes HttpOnly authentication and local storage. Clear-all removes both signed-in fixture profiles. Library records/images survive clearing, reload, and debug APK update.
- Two JVM URL/profile tests and real Android Keystore encryption/round-trip/tamper/forget instrumentation pass. Debug and unsigned release builds pass. Android Lint: **0 errors, 37 reviewed warnings** (feature guards across callbacks, intentional JS, localization, dependency suggestions).
- Native file picker export saved an **8,588-byte** fixture JSON; native selection, complete staging, and confirmed idempotent import pass. Current bundled privacy opens locally in a script-disabled viewer.

Build from repository root: `npm run prepare:android`, then use Java/SDK paths and Gradle commands in `docs/ANDROID_SETUP.md`. Debug APK: `apps/android/app/build/outputs/apk/debug/app-debug.apk`, package `cc.fishese.postkeeper.debug`, launcher **PostKeeper Dev**. This app remains installed on the emulator with harmless test records for review. It does not contain the user's browser library or recovery key. Do not rerun the destructive synthetic-key instrumentation on any app containing a real saved key.

## Limitations and scope boundary

- Embedded Google sign-in/Drive is unavailable in the wrapper. Use browser/PWA Drive and portable backups to move saved records between its independent libraries. A native device-key copy does not enable sync.
- Native PDF preview opened one Letter page; emulator Save as PDF produced an empty file. Wrapper PDF saving is unverified. M5's six-page Samsung phone acceptance applies to Chrome/PWA only. Do not repeat known emulator PDF troubleshooting or claim a wrapper phone pass.
- Firefox manual/fragment receipt works; its POST-body path returned safe HTTP 400. Installed Firefox Web Share Target is not claimed. Actual installed PWA/WebAPK Android Sharesheet registration was not exercised; native Android resolver sharing was.
- Capture results are transient until standard import; process death can require retry from the preserved pending link. Large storage/process-death stress, complex SSO/MFA, minimum-API/physical wrapper devices, video/uploads, and cross-origin/redirected image fetching are unverified or unsupported. Unsupported WebView features fail closed. No background sync, release signing, or store distribution is claimed.
- M7/self-hosted provider and O-006 remain untouched. Do not start M7 without a new explicit user request. M6 publication is a separate next action.

## Earlier evidence and cleanup

M4 real Drive acceptance remains valid: wrong-key rejection, interrupted transfers, clean recovery, 37-operation offline convergence, encrypted-object read-back, and consent revocation/local usability. The desktop client used an in-memory token relay; no second independent OAuth consent is claimed.

M5 phone PDF: `test-results/m5-phone-native.pdf`, 57,048 bytes, six Letter pages, SHA-256 `f81900bd18de796e5c8951e4ef76eca28b05d4f652250a61d7cdff78976c1b17`; all six rendered pages passed visual/text/link checks. Existing phone fixture connections/files were cleaned in that earlier session.

M6 local backup evidence: `test-results/m6-native-backup.json` (synthetic data only). The empty native PDF is failure evidence, not a usable export. Temporary M6 fixture server, per-emulator forwards/reverse mappings, UI dump, and exported emulator JSON/PDF are removed at the final checkpoint. Allocate fresh endpoints if testing again. Preserve the emulator itself and all existing libraries.

## Signed APK follow-up

The user subsequently requested a GitHub signed-APK build and instructions for saving required values. `.github/workflows/android-apk.yml` and `docs/ANDROID_SIGNING.md` are now prepared locally. Add the signing guide to required reading. Four **repository secrets** are required: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. No additional repository Variables are needed. The user enters values directly on GitHub; never request their contents in chat. No real keystore was accessed or secret uploaded by the agent.

The manual-main-only workflow builds without signing secrets, signs on a separate runner, verifies the APK, and uploads an artifact/checksum. Local YAML/shell syntax and actual alignment/signing/verification passed with a disposable test key that was deleted afterward. No real hosted signing run is claimed. Workflow/M6 publication and the user's secret setup are still needed; the public site remains M5. Do not start M7.

## Copy-ready continuation prompt

```text
Continue PostKeeper in D:\Projects\PostKeeper. Read docs/NEXT_CHAT_PROMPT.md, every source-of-truth document it lists, and docs/STATUS.md completely. Follow all AGENTS.md restrictions and preserve the local M6 work.

Milestones 0–6 are complete locally. M5 is committed/pushed/deployed as dec19b6; M6 version 0.6.0 is uncommitted and unpublished. Review the completed M6 diff and its recorded tests/limitations, then commit and push M6 to the existing repository and verify deployment. Do not start Milestone 7.

Use the emulator unless stuck and a phone test is needed; tell me before using wireless ADB on the phone. Preserve all existing browser libraries, categories, sync associations, and saved recovery keys. No Drive reconnection is needed. The new PostKeeper Dev emulator app contains only M6 synthetic fixtures. Native wrapper PDF saving remains unverified after an empty emulator save; the prior successful phone PDF test applies to Chrome/PWA. Do not repeat already completed acceptance without a concrete regression risk. Update status, evidence, and this continuation prompt at the next checkpoint.
```
