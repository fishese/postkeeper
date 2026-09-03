# PostKeeper

PostKeeper is a planned local-first read-it-later and web-archive application for PC and Android. It will save readable page content and images for offline use, including pages the user can access only while signed in to a browser.

The application code may be hosted as a static Progressive Web App (PWA), but the user's library is not stored by the static host. Each device keeps local data and optionally synchronizes encrypted objects through Google Drive or a user-controlled sync server.

## Current status

Milestones 0 through 5 are complete locally. Real Google Drive acceptance passed clean-client recovery, wrong-key rejection, interrupted download/upload retries, independent offline edits and convergence on 37 operations, encrypted-object read-back, and consent revocation with continued local reading/editing. The development preview is deployed at [keep.fishese.cc](https://keep.fishese.cc), hosted by GitHub Pages from `fishese/postkeeper`. Sync acceptance used the Android emulator and a disposable desktop client with an in-memory app-token relay; it does not establish a second independent OAuth consent flow. Milestone 5 passed native PDF saving on Samsung SM-S9280 / Android 16 / Chrome 152.0.7977.64: all six saved pages were rendered and visually inspected. Desktop PDF, backup round-trip/corruption, and diagnostics checks also pass. Milestone 5 remains unpublished; the deployed site still contains Milestone 4. See the [current continuation prompt](docs/NEXT_CHAT_PROMPT.md).

Milestone 3 browser-extension support now passes its complete runtime matrix: packaged Chromium, desktop Firefox, Firefox Android 154.0.1, and Microsoft Edge Canary for Android 154.0.4249.0 (versionCode 424900023). Edge Canary 154.0.4249.0 is the first supported Android Chromium minimum; no earlier Edge build is claimed. See [Implementation Roadmap](docs/IMPLEMENTATION_ROADMAP.md), [Extension Compatibility](docs/EXTENSION_COMPATIBILITY.md), and [Project Status](docs/STATUS.md).

## Documentation

- [Product Plan](docs/PRODUCT_PLAN.md) — goals, workflows, scope, and acceptance criteria.
- [Technical Architecture](docs/TECHNICAL_ARCHITECTURE.md) — components, storage, capture, synchronization, and security boundaries.
- [Implementation Roadmap](docs/IMPLEMENTATION_ROADMAP.md) — ordered milestones and their completion criteria.
- [Decision Log](docs/DECISIONS.md) — accepted and unresolved product and technical decisions.
- [Current Continuation Prompt](docs/NEXT_CHAT_PROMPT.md) — the latest checkpoint, required user action, and copy-ready next-chat prompt.
- [Smaller-Model Handoff](docs/SMALLER_MODEL_HANDOFF.md) — original milestone templates; use the current continuation prompt when resuming this session.
- [Backup Format](docs/BACKUP_FORMAT.md) — portable format, import behavior, limits, printing, and diagnostics.
- [Project Status](docs/STATUS.md) — the canonical record of completed and active milestones.
- [Extension Compatibility](docs/EXTENSION_COMPATIBILITY.md) — tested browser versions and Milestone 3 runtime evidence.
- [Google Drive Setup](docs/GOOGLE_DRIVE_SETUP.md) — OAuth configuration and the remaining live-provider smoke test.
- [GitHub Pages Setup](docs/GITHUB_PAGES_SETUP.md) — deployment workflow, custom domain, and DNS configuration.
- [Privacy Policy](https://keep.fishese.cc/privacy.html) and [Terms of Service](https://keep.fishese.cc/terms.html) — public static pages; GitHub issues are the contact channel.

## Product summary

PostKeeper will provide:

- A static, installable web application usable on PC and Android.
- Offline article reading from device-local storage.
- Chrome/Chromium-compatible and Firefox browser extensions.
- Support for extension-capable Chromium browsers on Android.
- An Android share target for URLs and files.
- An optional authenticated capture browser as a fallback.
- Categories, search, read/unread state, favorites, and archives.
- Original-link sharing and print/PDF export.
- Encrypted synchronization through Google Drive or a self-hosted server.
- A versioned structure that can later support structured restaurant, shopping, and travel views, EPUB export, annotations, and other content types.

## Core privacy rule

The static web host serves application files only. It must never receive article contents, encryption keys, Google access tokens, browser cookies, or website credentials.

Website login credentials remain in the browser or the optional capture-browser profile. Browser extensions capture what the user can already access; they do not bypass paywalls, DRM, or access controls.

## License

PostKeeper is free software licensed under the GNU General Public License, version 3 or (at your option) any later version. See [LICENSE](LICENSE). It is provided without any warranty. Third-party dependencies retain their own licenses; bundled notices are provided with the web build.

This is a development preview, not an accepted initial release. Milestone 4 sync/recovery and Milestone 5 PDF/backup acceptance are complete locally; later milestones, including release hardening, remain unfinished. Use harmless test data for now.
