# Adopted dependencies

Only the dependencies below are intentionally adopted. Version ranges are pinned by `package-lock.json` after installation; maintenance was reviewed from the project release streams on 2026-08-21.

| Dependency              | License    | Maintenance status                        | Why it is used                                                              |
| ----------------------- | ---------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| React 19                | MIT        | Active, maintained by Meta                | Small declarative PWA shell required by the baseline.                       |
| Vite 7                  | MIT        | Active, maintained by Vite contributors   | Static development and production build, including configurable base paths. |
| vite-plugin-pwa 1       | MIT        | Active Workbox-compatible Vite plugin     | Generates the service worker and manifest without handwritten cache logic.  |
| TypeScript 5            | Apache-2.0 | Active, maintained by Microsoft           | Shared, strict source language.                                             |
| Vitest 3                | MIT        | Active, maintained by Vitest contributors | Fast unit tests for browser-storage and transfer protocol code.             |
| Playwright 1            | Apache-2.0 | Active, maintained by Microsoft           | Local Chrome and Firefox browser-level feasibility checks.                  |
| fake-indexeddb 6        | Apache-2.0 | Active                                    | Deterministic IndexedDB unit-test implementation; not shipped to users.     |
| ESLint 9 and Prettier 3 | MIT        | Active                                    | Baseline linting and formatting.                                            |

`@vitejs/plugin-react`, the TypeScript ESLint packages, React type packages, `globals`, and `@eslint/js` are direct build-tool peers. They share the same active-maintenance purpose and are not shipped in the PWA runtime.

## Milestone 2 additions

Maintenance and current package metadata were reviewed from the official npm and project sources on 2026-08-24.

| Dependency                 | License               | Maintenance status                              | Why it is used                                                      |
| -------------------------- | --------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| @mozilla/readability 0.6.0 | Apache-2.0            | Maintained by Mozilla; Firefox Reader View code | Deterministic main-content extraction from an inert document clone. |
| DOMPurify 3.4.14           | MPL-2.0 OR Apache-2.0 | Active security-maintained release              | DOM-based allowlist sanitization of every imported reader document. |
| jsdom 30                   | MIT                   | Active; test-only                               | Browser-equivalent DOM parser for sanitizer/extractor unit tests.   |

Capacitor and backend dependencies remain uninstalled until their milestones. No telemetry dependency is included.

## Milestone 3 additions

Maintenance and current package metadata were reviewed from the official project and npm sources on 2026-08-29.

| Dependency              | License    | Maintenance status                          | Why it is used                                                                                          |
| ----------------------- | ---------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| esbuild 0.28            | MIT        | Active, maintained by evanw                 | Produces shared Chromium MV3 and Firefox MV2 extension bundles.                                         |
| web-ext 10.6            | MPL-2.0    | Active, maintained by Mozilla               | Validates the generated Firefox manifest and packaged extension sources.                                |
| selenium-webdriver 4.48 | Apache-2.0 | Active, maintained by Selenium contributors | Drives the installed desktop Firefox and its temporary add-on for independent runtime regression tests. |

The extension reuses `@mozilla/readability`; it has no telemetry, remote backend, or runtime extension-framework dependency.

`web-ext` and `selenium-webdriver` are development-only. Their code is not included in a browser bundle. `web-ext`'s `addons-linter` dependency currently resolves `image-size@2.0.2`, for which npm reports two high-severity image-parser denial-of-service advisories and a transitive/meta finding. There is no patched `image-size` release as of 2026-08-29. PostKeeper invokes the tool only on repository-controlled generated extension files. Recheck the chain when Mozilla publishes an updated linter.

## Milestone 4 additions

Milestone 4 adds no third-party runtime dependency. The sync core uses the browser's standard Web Crypto APIs (HKDF, HMAC-SHA-256, AES-GCM, and cryptographically secure random values). Google authorization uses the official Google Identity Services browser script loaded from `https://accounts.google.com/gsi/client`, and the Drive provider calls the documented REST/CORS endpoints directly. Access tokens and unwrapped keys are held in memory only.
