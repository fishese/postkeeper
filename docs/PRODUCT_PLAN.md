# Product Plan

## 1. Product vision

PostKeeper is a local-first personal library for saving, organizing, searching, and reading web content offline. It is inspired by read-it-later applications such as Readeck but is designed around these priorities:

1. A complete local copy of saved text and images.
2. No developer-operated content service.
3. Optional encrypted synchronization through storage chosen by the user.
4. Reliable capture of pages that are visible only in an authenticated browser session.
5. A data model that can grow beyond undifferentiated articles.

"Local-first" means each supported client can continue reading and organizing already downloaded content without a network connection. A Google Drive account or self-hosted server is an optional synchronization transport, not the primary runtime database.

## 2. Initial target platforms

### First-class platforms

- PC web/PWA client.
- Desktop Chrome, Chromium, Edge, Brave, and Firefox extensions where their extension APIs are compatible.
- Android web/PWA client.
- Extension-capable Chromium browsers on Android.
- Firefox for Android.

### Platform fallback

An Android wrapper with a dedicated capture browser remains part of the design. It is the fallback when a browser does not support extensions, when extension APIs cannot retrieve required assets, or when a shared URL requires a logged-in session.

### Future platform

- iPhone and iPad client.
- Safari Web Extension packaged with the iOS client.

## 3. Primary user workflows

### 3.1 Save from an extension-capable browser

1. The user opens a page and signs in normally if required.
2. The user selects **Save to PostKeeper**.
3. The extension extracts the rendered document, metadata, and relevant asset URLs.
4. The extension retrieves images using the active browser session where browser permissions permit it.
5. The extension transfers a versioned capture package to an open PostKeeper tab, opening the PWA if necessary.
6. PostKeeper validates, sanitizes, and stores the package locally.
7. PostKeeper reports complete, partial, or failed capture status.
8. Synchronization occurs later when a configured provider is available.

The same conceptual workflow applies to desktop Chromium, supported Android Chromium browsers, desktop Firefox, and Firefox Android. Browser-specific adapters may be required.

### 3.2 Save a URL through Android sharing

1. The installed PostKeeper PWA or Android wrapper appears in the Android share sheet.
2. A shared URL is added to the PostKeeper inbox immediately.
3. If a trusted capture mechanism can retrieve the content, capture begins.
4. Otherwise, the item remains a pending link with actions to:
   - open it in an extension-capable browser;
   - open it in the PostKeeper capture browser;
   - capture it later on another synchronized device; or
   - retain it as a bookmark only.

A shared URL alone does not contain the originating browser's cookies or rendered page.

### 3.3 Capture through the Android capture browser

1. The user opens a pending URL in PostKeeper's capture browser.
2. The user signs in to the site if necessary.
3. The capture browser retains its own isolated session for that site.
4. The user saves the current rendered page.
5. The capture uses the same versioned package format and sanitization pipeline as an extension capture.

This browser profile must not be silently shared with other apps and must have a clear **Clear browsing data** control.

### 3.4 Read and organize

The user can:

- browse an inbox and category views;
- assign one article to multiple categories;
- search title, author, source, URL, and extracted text;
- mark content read/unread, favorite, or archived;
- open a safe reader view offline;
- open or copy the original URL;
- inspect capture status and retry incomplete captures.

### 3.5 Synchronize another device

1. The user configures the same provider on a second device.
2. The user supplies or transfers the library recovery key.
3. The device downloads encrypted operations and content blobs.
4. The device validates hashes, decrypts locally, and builds its local index.
5. Both devices can subsequently make offline changes and converge during later synchronization.

## 4. Initial release requirements

### 4.1 Library and reader

- Store metadata, extracted HTML, original capture information, and downloaded images locally.
- Provide inbox, all items, unread, favorites, archive, and category screens.
- Support flat user-created categories initially.
- Permit many-to-many article/category membership.
- Provide full-text search with a rebuildable local index.
- Detect likely duplicates using canonical URL and content hashes.
- Preserve an immutable capture snapshot; recapture creates a new version.
- Work offline for all locally available content.

### 4.2 Capture

- Provide a Chrome/Chromium-compatible extension.
- Do not restrict that build to desktop; test it on at least one named extension-capable Android Chromium browser before declaring Android support.
- Provide a Firefox extension and explicitly test Firefox Android compatibility.
- Capture rendered content from authenticated pages without copying reusable credentials into PostKeeper.
- Capture relevant article images, including authenticated assets where permissions allow.
- Retain a non-executable raw DOM snapshot for possible future reprocessing.
- Create a safe reader snapshot for normal display.
- Report missing images, blocked resources, unsupported frames, and extraction failures.
- Never claim pixel-perfect archival of video, canvas, expiring media, or inaccessible cross-origin frames.

### 4.3 Sharing and export

- Copy and open the original URL.
- Provide print-optimized output suitable for **Print / Save as PDF**.
- Preserve headings, links, images, and sensible page breaks in print output.
- Permit importing and exporting a portable PostKeeper backup.

Self-contained HTML export may follow after PDF/print. Public hosted sharing links are outside the initial scope.

### 4.4 Synchronization

- The application works without any synchronization provider.
- Initial provider: direct Google Drive API or a provider selected in the decision log before the sync milestone begins.
- Planned second provider: self-hosted PostKeeper sync API or a compatible file/object server.
- Remote representations are encrypted before upload.
- A live browser database is never synchronized as a single file.
- Content blobs are immutable and verified by hash.
- Metadata changes use versioned operations and retained deletion tombstones.

### 4.5 Web application hosting

- Build output must be deployable to static hosting such as GitHub Pages.
- The static host receives no user library data.
- The app must support a stable base path or custom domain.
- No client secret may be embedded in the web build.
- Service-worker caching must not prevent users from receiving application updates.

## 5. Explicit non-goals for the initial build

- Circumventing paywalls, DRM, anti-bot controls, or website access restrictions.
- Storing website usernames or passwords in the PWA.
- Pixel-perfect preservation of every interactive website.
- Public PostKeeper-hosted article links.
- Collaborative libraries or multi-user permissions.
- Automatic AI summaries or classification.
- Native iOS packaging.
- EPUB/MOBI output.
- Structured restaurant, shopping, travel, map, or gallery interfaces.
- Annotation and highlighting.

## 6. Future-ready category model

The initial interface displays ordinary list/card views, but storage must leave room for category templates.

Planned concepts:

- **Category** — name, optional parent, view template, and view configuration.
- **Field definition** — stable field ID, label, type, validation, and indexing preference.
- **Category item data** — values attached to an article's membership in a category.

Planned field types:

- text;
- long text;
- number and currency;
- date/time;
- boolean;
- single and multiple choice;
- URL;
- image;
- location with country, region, city, address, and optional coordinates.

Example future templates:

- **Restaurants:** restaurant name, cuisine, location, rating, visit status.
- **Shopping:** image, description, vendor, price, product link, purchase status.
- **Travel:** country, region, city, coordinates, trip, visit status.
- **Recipes:** cuisine, preparation time, ingredients, rating.

Values belong to the article/category membership rather than to the article globally. This permits the same saved page to participate in different structured categories.

## 7. Future opportunities

- EPUB generation directly from normalized reader content.
- MOBI conversion only if still required by a target device or service.
- OPDS feed or e-reader delivery.
- Highlights, annotations, and notes stored separately from immutable snapshots.
- Automatic categorization rules based on domain or URL patterns.
- Saved searches and smart categories.
- Reprocessing old raw captures with improved extractors.
- Version comparison when a page is recaptured.
- Import from browser bookmarks and other read-it-later exports.
- Local OCR for image-heavy content.
- Optional screenshot fallback.
- Backup verification and recovery checks.

## 8. Initial release acceptance criteria

The initial release is acceptable when all of the following are demonstrated:

1. A user can install or open the PWA, save an imported capture, organize it, close the browser, reopen it, and read it offline.
2. A desktop extension captures a public article and a locally hosted authenticated test article with their images.
3. The Chrome-compatible build has a recorded result on at least one extension-capable Android Chromium browser.
4. The Firefox build has a recorded result on Firefox Android.
5. Captured scripts, forms, and event handlers cannot execute in the reader.
6. Missing assets produce a visible partial-capture warning.
7. Print/PDF output includes the article's main headings, links, and locally stored images.
8. Two clients can independently change metadata while offline and converge through the selected sync provider.
9. A new client can restore the library using synchronized data and the recovery key.
10. Clearing the static host's application cache does not destroy the only copy of a synchronized library.
