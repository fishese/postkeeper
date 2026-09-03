# Android preview and URL sharing

Milestone 6 introduced web package 0.6.0 and the thin Java/AndroidX shell chosen in D-025. The 0.6.1 follow-up adds the compact UI and localization resources in D-026; see [UI and localization](UI_AND_LOCALIZATION.md). The shared browser UI, extension capture format, backup format 1, and sync records remain compatible. The Android app has its own local library; it does not automatically see Chrome/PWA or extension storage.

## Build

Install Node/npm as in the existing project, Java 17 or newer, and Android SDK platform 36. This workspace uses Android Studio's JBR and SDK. `local.properties` is ignored; use Android Studio to generate it or set `sdk.dir` with forward slashes and an escaped drive colon. Never commit machine-specific paths or signing keys.

From the repository root in PowerShell:

```powershell
npm ci
npm run validate
npm run prepare:android
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
.\apps\android\gradlew.bat -p apps/android :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

`prepare:android` builds at `/assets/web/`, leaves the normal browser output intact, and bundles the shared credential-scrubbing capture extractor. It appends Android dependency notices to the bundled notices. Generated assets/builds are ignored and must be prepared again after web changes. AGP 8.13.0, Gradle 8.14.3 with distribution checksum, and AndroidX WebKit 1.14.0 are pinned. Runtime capabilities are checked independently of Android version.

The APK is `apps/android/app/build/outputs/apk/debug/app-debug.apk`, package `cc.fishese.postkeeper.debug`, launcher **PostKeeper Dev**. It is debug-signed and enables WebView inspection and loopback HTTP fixture capture. Keep it separate from real libraries. `:app:assembleRelease` creates an unsigned release APK (`cc.fishese.postkeeper`) with debugging disabled and HTTPS-only capture. A manual GitHub signing workflow is published; follow [Android signing setup](ANDROID_SIGNING.md) for its four repository secrets, recorded build, and APK download. Store distribution is not configured.

## Using the app

Share a page URL from Android to **PostKeeper Dev**, or choose **Add link** and enter **Page URL** in the app. A pending link appears in Inbox; the label explicitly says the content has not been captured. Open the item, choose **Open capture browser**, sign in directly on the website if needed, and press the native **Save page** button. The shared validator/sanitizer imports the standard capture package. A successful capture replaces the pending placeholder while preserving its organization. Missing images remain visible as partial-capture warnings.

The compact capture toolbar shows the current URL, **Save page**, a **Library** back icon and **Browser options**. The options menu contains **Back page**, **Clear this site**, and **Clear all browsing data**. Tap the address to see its full value. Per-site means the session associated with the starting URL's origin, including subsequent sign-in redirects. Distinct starting origins have independent sessions. Clearing requires native confirmation and removes cookies, cache, and website storage from only the relevant capture profiles. Saved articles/images and the device key remain intact.

Optional recovery-key convenience storage uses explicit native save/load/forget confirmations. The encrypted file is in Android's no-backup area and the AES-GCM wrapping key stays in Android Keystore. There is no biometric requirement; this protects the stored copy, not an unlocked app session or compromised OS. Keep a separate recovery copy. App uninstall/storage clearing loses the library and device convenience copy. System cloud/device-transfer backup is excluded.

Google sign-in/Drive is unavailable inside this embedded preview. Use the browser/PWA for existing encrypted Drive sync. Portable JSON export/import transfers saved records between libraries, with the same plaintext acknowledgement and staged validation as the PWA; it does not migrate keys, provider associations, or website sessions. Android uses the system document picker for export/import. Privacy, terms, and bundled notices open locally in a script-disabled viewer.

## Isolation and bounds

- The trusted library uses a named `postkeeper-library` WebView profile and bundled HTTPS assets. Only its exact document receives actionable, origin-allowlisted, main-frame native messages. Arbitrary app-origin documents cannot dispatch commands.
- Capture uses `capture-<SHA-256 of starting origin>` profiles. No native listener or JavaScript interface is installed there. Website navigation cannot load the privileged application origin, local files, content providers, or custom schemes; TLS errors are cancelled. Permissions/autofill are disabled. Saved readers retain their empty iframe sandbox.
- Capture reuses credential-scrubbed DOM and Readability extraction. Native image downloads use only that profile's cookies and only the current page origin. Redirected/cross-origin images are skipped with warnings. Native networking never accepts a website-selected arbitrary bridge action.
- Native shares: at most 20 queued items, 16 KiB text and 512-character title; links up to 8,192 characters, HTTP(S), no embedded credentials. Shares remain queued until durable library acknowledgement. Pending links are normal version-1 records and participate in backups and explicit sync.
- Capture: 2 million characters each for raw DOM and reader HTML, at most 128 images, 5 MiB per image, 10 MiB downloaded-image budget, 20 MiB package. Transfer uses 48 KiB string chunks; receiving code validates sizes, hashes, types, and references. Images are locally sanitized as usual.
- The capture result is temporary private cache/in-memory data, not a durable offline capture queue. If Android kills the app before import, retry from the preserved pending link. Native operations time out after five minutes. Large captures can take longer than useful interaction time; large-library and process-death fault injection remain release-hardening work.
- Print uses a separate script-disabled, network-blocked WebView and Android PrintManager. The preview limits printable HTML to 3.5 million characters. Android file export is bounded to 128 MiB; import retains all existing version-1 limits.

## PWA share target

The manifest declares URL/text/title sharing via POST. An installed controlling service worker reads a bounded 32 KiB body and redirects locally through a fragment, which the UI removes after durable receipt. Shared content is never placed in a request query to the static host. No server-side share endpoint is added.

Chromium service-worker POST receipt, oversize rejection, fragment cleanup, no outbound share request, and offline pending-link reload pass. Firefox manual URL entry and invalid-fragment rejection pass; its POST test returned a safe 400 due to request-body support differences. Installed Web Share Target is not claimed for Firefox. A real installed PWA/WebAPK Android Sharesheet entry was not tested; native Android sharing was. Browser support/installation can affect whether PostKeeper appears in the share menu.

## Recorded acceptance (2026-09-03)

Target: existing `Pixel_10_Pro_emu`, `emulator-5580`, Android 17 / API 37.1, Android System WebView 149.0.7827.163. Only the newly installed debug app contained task fixtures. Existing browser libraries, category edits, disconnected Drive association, and saved recovery key were not changed. No phone was used for M6.

The opt-in harness requires an explicit emulator serial and loopback debug endpoint:

```powershell
$env:POSTKEEPER_ADB='C:\Users\Selena\AppData\Local\Android\Sdk\platform-tools\adb.exe'
node scripts/m6-fixture-server.mjs --serve
# In a second terminal: reverse only fixture ports 4186 and 4187 to that emulator.
# Start PostKeeper Dev; forward a fresh localhost port to its own WebView DevTools socket.
node scripts/test-milestone6-emulator.mjs http://127.0.0.1:PORT emulator-5580 --allow-emulator-debugging
```

Use an empty disposable debug library for the full harness. It adds synthetic public/authenticated fixtures and clears only their capture profiles. Never run its destructive Keystore instrumentation against a debug app that contains a real saved key. The caller installs `:app:assembleDebugAndroidTest` and explicitly runs:

```powershell
& $env:POSTKEEPER_ADB -s emulator-5580 shell am instrument -w cc.fishese.postkeeper.debug.test/cc.fishese.postkeeper.KeyVaultInstrumentation
```

Results: native ACTION_SEND creates pending Inbox records; public/authenticated captures and authenticated images render; fixture password, CSRF token, and cookie are absent from stored records/raw DOM/blobs; page, embedded frame, and saved reader cannot see the native bridge; per-site clearing removes HttpOnly authentication and local storage; clear-all removes both tested profiles; saved articles/images survive clearing and reload. Android Keystore encryption, round-trip, ciphertext tamper rejection, and forgetting pass. Native JSON export saves an 8,588-byte fixture archive; selecting it in the system picker, staging it, and confirming idempotent import pass.

Two Android JVM security tests pass. Debug lint passes with 0 errors and 37 warnings: runtime feature guards across callbacks, intentional JavaScript enablement, untranslated toolbar text, and dependency-upgrade suggestions. Debug and unsigned release builds pass. Web validation and browser/extension evidence are in `STATUS.md`.

Native PDF preview showed the fixture with one Letter page, but the emulator saved a zero-byte PDF. This does not establish a cause or a fix for the earlier browser/emulator PDF issue. Wrapper PDF saving and physical-printer output remain unverified; prior M5 phone acceptance applies to Chrome/PWA, not the wrapper. No wrapper phone test, complex SSO/MFA flow, video, file upload, WebAPK installation, minimum-API device, or large-storage/process-death acceptance is claimed. Background sync is intentionally deferred. These limitations do not leave an M6 share/capture/isolation completion criterion pending.

After testing, remove only allocated ADB mappings, task UI dumps, exported fixture files, and fixture servers. Preserve the user's emulator/phone libraries. Notify the user before any later wireless-phone test, and use it only if emulator testing is stuck and a phone test is needed.
