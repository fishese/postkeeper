# Interface and localization

The user-requested 0.6.1 redesign is a follow-up to M6. It does not start M7 or complete the M8 accessibility audit.

## Screen organization

- Library views and search lead the screen. Phones use a bottom navigation bar; wider screens use a sidebar. Below 900 px, opening an article switches to the reader with an explicit Back to library action.
- Add link opens a focused sheet. Incoming native/PWA/extension shares continue to be received while the sheet is closed.
- Settings contains encrypted sync, backup/diagnostics, storage/search maintenance, About, and deliberately separated developer fixtures. Panels stay mounted when closed, preserving in-memory sync state and staged imports.
- About includes **Download for Android**, pointing to the matching `v<web package version>` GitHub Release asset `postkeeper-release.apk`. Publish that asset whenever the web version changes. The direct versioned URL also supports GitHub prereleases; it does not require a logged-in Actions artifact download.
- About also links **Browser extension setup** to the static `extensions.html` guide. It opens in a separate tab, is available offline after the PWA caches it, and uses the shared `legal.css` document styles. APK 0.6.2 includes it in the existing script-disabled bundled-document viewer.
- Article actions use labeled icons with 44 px default web targets. Categories and the full original URL are under Article details. Explicit backup/key acknowledgements and native clearing confirmations remain required.
- The capture browser has a 48 dp native toolbar. Browser options contains Back page, Clear this site, and Clear all browsing data. Tap the address to inspect its full URL. Websites still have no native bridge.

## Styling

Edit `apps/web/src/styles.css` for shared colors, spacing, radii, touch targets and component classes. `:root` custom properties are the design tokens. Logical properties support a future RTL layout. No external font, icon CDN, UI framework, or new runtime dependency is required. `ui/Icon.tsx` contains local decorative SVG icons; their controls supply translated accessible names.

The isolated reader uses `reader.css`; printing uses `print.css`. Vite imports them as CSS strings into the existing sandboxed documents. Keep these sheets independent of the privileged app shell. Saved HTML remains sanitized, script-disabled and network-blocked; do not replace its iframe with inline HTML to simplify styling.

Android capture chrome uses `res/layout/capture_activity.xml` and named resources in `res/values/{colors,dimens,styles,strings}.xml`. Mirror shared palette changes there. Native controls deliberately remain outside website content. A JavaScript-powered toolbar inside the captured website would cross the security boundary.

## Adding a language later

English is the only shipping language; there is no nonfunctional language selector.

1. Add a catalog beside `apps/web/src/i18n/en.ts`, using its stable message IDs and the exported `Catalog` type. Missing entries fall back to English. Keep complete messages together, preserve named placeholders, and supply plural forms appropriate to the target locale (including `other`).
2. Register the reviewed catalog in `i18n/index.ts`, selecting its locale and direction. Keep selection to supported locales. The current exports intentionally select English; a future user preference can select the catalog at startup/reload without changing domain records. `main.tsx` sets document language/direction.
3. Use `t('message.id', { count, ... })` in UI code. IDs and required English placeholders are checked by TypeScript. Plural selection, numbers, dates and sizes use `Intl`; fallback messages use English plural rules. Interpolation returns plain text, never HTML. Use React text nodes or escaping in generated documents.
4. Add native translations in Android `values-<locale>/strings.xml`; retain `%1$s` placeholders. Android handles native resource fallback. For a translated Android build, select the corresponding supported web locale too; automatic native-to-web locale negotiation is future work.
5. Check the new locale on small screens with long labels and larger text, keyboard/screen-reader navigation, RTL where applicable, and native dialogs. Do not shrink tap targets to fit translations.

The catalog covers the primary shared React interface, accessible labels, notifications, and print guidance; native app dialogs and capture labels use Android string resources. User article content/category names are not translated. Stored capture-warning codes, technical errors originating in shared domain/provider libraries, developer feasibility probes, extension UI, and static legal/help documents retain their English text. These boundaries need review when shipping an actual second language; this work prepares localization, rather than claiming full multilingual support.

## Verification and limits

`npm run validate` covers formatting, lint, type checking, 109 tests and builds. `tests/browser/mobile-ui.spec.ts` checks 320/390 px layouts, 150% text, simulated RTL reflow, modal keyboard focus, offline reading/organization and APK-link placement. The full Chromium/Firefox browser suite passes 33 tests with one intentional Firefox POST-share skip. Screenshots are generated in ignored `apps/web/dist-ui-review`; they are visual evidence, not golden snapshot tests.

Native build/JVM/lint checks use the commands in `ANDROID_SETUP.md`. A toolbar-only instrumentation mode runs without accessing the library or key vault:

```powershell
adb -s EMULATOR_SERIAL shell am instrument -w -e captureUi true cc.fishese.postkeeper.debug.test/cc.fishese.postkeeper.KeyVaultInstrumentation
```

It opens example.com, checks laid-out touch targets, accessible labels and the address, and writes `cache/capture-ui-review.png` for inspection. Install the debug/test APKs first; pull that exact generated file using `run-as`, then remove it and the test package. **Omitting `-e captureUi true` invokes the older destructive synthetic Keystore test: never do that on an app containing a real key.**

The toolbar smoke passed on `Pixel_10_Pro_emu` / Android 17 API 37.1, using newly allocated serial `emulator-5554`. The full authenticated-capture/clearing matrix was not repeated; prior M6 security evidence still applies and its opt-in runner's new navigation/menu selectors were updated but not rerun. No phone, real Drive call, or release-package installation was used. Native PDF and wrapper Drive limitations remain as documented. A full screen-reader/device-font-scale audit, minimum-API device testing, and translated copy review remain future acceptance work.
