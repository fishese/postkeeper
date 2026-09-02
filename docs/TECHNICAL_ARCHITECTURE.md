# Technical Architecture

## 1. Architectural overview

```text
Static host (GitHub Pages or equivalent)
  | serves versioned HTML, CSS, JavaScript, icons, and service worker
  v
PostKeeper PWA on each device
  |-- UI and safe reader
  |-- local metadata store
  |-- local content/blob store
  |-- rebuildable search index
  |-- capture-package importer
  |-- encryption and sync engine
  `-- provider adapters
       |-- Google Drive API
       `-- self-hosted sync API

Capture producers
  |-- Chromium extension (desktop and compatible Android browsers)
  |-- Firefox extension (desktop and Android)
  |-- Android share target
  |-- Android capture browser
  `-- backup/import files
```

The PWA, extensions, Android wrapper, and future iOS wrapper use the same domain model and versioned capture-package format. Platform-specific behavior is isolated behind adapters.

## 2. Proposed baseline stack

These choices are the implementation baseline, subject to a short validation spike in Milestone 0:

- TypeScript throughout the PWA, shared packages, and browser extensions.
- React and Vite for the static PWA.
- A service worker generated through a maintained Workbox-compatible tool.
- IndexedDB for transactional application records.
- Origin Private File System (OPFS) for large immutable blobs where supported, with an IndexedDB blob fallback.
- A rebuildable client-side full-text index rather than treating the search index as authoritative data.
- Mozilla Readability for main-content extraction.
- DOMPurify or an equivalently maintained sanitizer for reader HTML.
- Web Crypto APIs for authenticated encryption and key wrapping.
- WebExtension APIs with browser-specific manifests/adapters.
- Capacitor or an equivalent thin native wrapper for Android platform integration.

Milestone 0 must validate build size, OPFS behavior, IndexedDB transactions, service-worker update behavior, and extension-to-PWA messaging on the selected browsers. A dependency must not be adopted solely because it appears in this plan; its license, maintenance status, and browser compatibility must be recorded.

## 3. Suggested repository structure

```text
apps/
  web/                    static PWA
  extension/              shared extension implementation and manifests
  android/                native wrapper when its milestone begins
packages/
  domain/                 entities, IDs, validation, operations
  capture-format/         capture package schema and migrations
  capture-processing/     extraction, sanitization, asset rewriting
  local-store/            metadata, blob, and search interfaces
  sync-core/              encrypted objects, operation log, conflicts
  sync-google-drive/      Drive provider
  sync-http/              self-hosted provider
  test-fixtures/          public/authenticated/lazy/hostile page fixtures
docs/                     product and engineering documentation
```

The Android package is not created until its milestone unless Milestone 0 needs a minimal feasibility spike. Avoid empty speculative packages.

## 4. Capture package

Every capture producer emits the same versioned package. The package is a transport format, not trusted application state.

Conceptual structure:

```text
CapturePackage
  formatVersion
  captureId
  capturedAt
  captureMethod
  sourceBrowser
  originalUrl
  canonicalUrl
  metadata
    title
    author
    siteName
    excerpt
    publishedAt
    language
  renderedDom
  extractedReaderHtml
  assets[]
    assetId
    sourceUrl
    mediaType
    byteLength
    sha256
    bytes or transfer reference
  warnings[]
  diagnostics
```

Rules:

- Treat every field as untrusted input.
- Enforce format version, total size, individual asset size, supported media types, and string-length limits.
- Do not accept filesystem paths from a producer.
- Resolve and normalize URLs before they enter the local model.
- Calculate hashes again in the receiving app; never trust producer-supplied hashes.
- Preserve the raw DOM only as inactive data.
- Sanitize the reader document again in the receiving app even if the extension already sanitized it.
- Record partial-capture warnings rather than silently discarding failures.

## 5. Extension capture pipeline

### 5.1 Page extraction

1. Run only after an explicit user action.
2. Clone the document before applying Readability or other destructive transforms.
3. Collect metadata from document properties, Open Graph fields, structured data, and canonical links.
4. Extract readable content from a clone.
5. Collect relevant image candidates from `src`, `srcset`, picture elements, and lazy-load attributes.
6. Resolve asset URLs against the document base URL.
7. Ask the background context to retrieve assets using available browser permissions and the active session.
8. Assemble a package and transfer it in bounded chunks.

CSS background images, canvas output, video, cross-origin frames, and expiring resources may require later adapters and must not block the basic reader capture.

### 5.2 Extension-to-PWA handoff

The default handoff is tab-based rather than native messaging:

1. The extension creates a one-time transfer ID and stores the pending package temporarily.
2. It locates or opens the configured PostKeeper origin.
3. A PostKeeper-specific content script on that origin establishes a message channel between the extension background and the PWA page.
4. The PWA proves knowledge of the one-time transfer ID.
5. The extension sends bounded chunks with sequence numbers and hashes.
6. The PWA verifies, persists, and acknowledges the complete package.
7. Only after acknowledgement does the extension delete its temporary copy.

Security requirements:

- Allowlist the exact PostKeeper origin.
- Never expose extension messaging to arbitrary pages.
- Include replay protection and transfer expiry.
- Do not put captured content in URL parameters.
- Do not use `window.postMessage` without strict origin and message validation.
- Keep temporary extension storage bounded and visible to the user when a transfer is pending.

### 5.3 Browser builds

Maintain shared capture logic with thin browser adapters:

- Chromium Manifest V3 build for desktop and compatible Android Chromium browsers.
- Firefox build with the manifest/background implementation supported by the selected Firefox desktop and Android minimum versions.
- Future Safari build generated from shared WebExtension sources plus a native container.

Support is capability-based. Do not reject a browser merely from its user-agent string. Detect required APIs and present a specific unsupported-capability message.

An Android Chromium browser is supported only after its exact name/version and the tested feature set are recorded. Official Chrome for Android is not an extension target, but compatible Chromium variants are allowed.

## 6. Android share target and capture browser

### Share target

The installed PWA should register for shared URLs where supported. The Android wrapper should register a native share target when introduced.

Incoming data is untrusted. Validate URL schemes and sizes. A shared URL initially creates an inbox record; it is not proof that the full page was archived.

### Capture browser

The wrapper's capture browser is an isolated WebView-based capability, not the primary reader:

- Separate website browsing storage from PostKeeper reader content.
- Retain sessions only on the device.
- Provide explicit per-site and global clearing controls.
- Do not expose native application bridges to arbitrary website JavaScript.
- Extract through a narrowly scoped, user-triggered native bridge.
- Convert the result to the standard capture package before importing it.
- Display the actual origin and TLS state to reduce phishing risk.

This path is retained even when Chromium and Firefox extensions work because it is the universal fallback.

## 7. Safe content rendering

Saved content is hostile until processed.

The reader must:

- remove scripts, forms, event-handler attributes, refresh directives, plugins, and unsafe embeds;
- remove or rewrite remote resource references;
- block network access from saved documents by default;
- serve images from local object URLs or safe application routes;
- use a restrictive Content Security Policy;
- render saved documents in a sandboxed, unprivileged frame or equivalent isolated component;
- ensure links require deliberate navigation and clearly indicate the destination;
- never render saved HTML in an Electron/Capacitor privileged context with native APIs enabled.

The inactive raw DOM is not shown directly. Future reprocessing reads it as data and produces a new sanitized snapshot version.

## 8. Local data model

### Core entities

#### Article

- stable sortable ID;
- original and canonical URL;
- title, author, site, excerpt, language, and publication date;
- saved and updated timestamps;
- read/unread, favorite, archive, and deletion state;
- current snapshot ID;
- capture status and warnings;
- schema version.

#### Snapshot

- stable ID and article ID;
- capture time and method;
- normalized reader document blob ID;
- inactive raw document blob ID;
- asset manifest;
- content hash;
- extractor and sanitizer versions;
- immutable after creation.

#### Blob

- SHA-256 content ID;
- media type and byte length;
- local storage location;
- encryption/sync status;
- reference count is derived or repairable.

#### Category

- stable ID;
- name and sort order;
- optional parent ID reserved for later;
- view template and configuration reserved for later;
- deletion state.

#### CategoryMembership

- article ID and category ID;
- structured custom field values;
- timestamps and operation metadata.

#### Operation

- operation ID, device ID, and device sequence;
- entity ID and operation type;
- versioned payload;
- logical and wall-clock timing data;
- integrity data;
- sync acknowledgement state.

### Search index

The search index contains title, author, source, URL, category, and normalized article text. It is device-local and rebuildable from authoritative records and decrypted snapshots. Never synchronize the index as authoritative state.

## 9. Synchronization architecture

### Principles

- Synchronize immutable blobs and small versioned operations.
- Never synchronize a live IndexedDB, SQLite, or OPFS database file.
- Encrypt before upload.
- Hash plaintext for local deduplication and use a keyed or encrypted remote identifier if exposing plaintext hashes would leak unacceptable correlation information.
- Verify downloaded data before importing it.
- Make interrupted uploads and downloads resumable or safely repeatable.
- Retain tombstones long enough for infrequently connected devices.

### Remote layout concept

```text
library-metadata/
devices/<device-id>/operations/<sequence>
blobs/<remote-blob-id>
checkpoints/<checkpoint-id>
device-state/<device-id>
```

Exact provider paths are adapter details. The sync core operates on an object-store interface resembling:

- list objects by prefix and continuation token;
- get object with version/etag;
- put immutable object;
- conditionally put mutable device state;
- report quota and retryable errors.

### Conflict rules

- Snapshot additions never overwrite existing snapshots.
- Scalar article metadata initially uses deterministic field-level last-write-wins with device ID as a tie-breaker.
- Category membership is operation-based so add/remove events can merge.
- Deletions create tombstones rather than immediate remote erasure.
- Unresolvable conflicts preserve both values and surface a review item.
- Conflict behavior must be covered by deterministic tests before a provider is connected.

### Google Drive provider

Per D-018, the browser client uses Google Identity Services and requests only `drive.appdata`. Every remote object is stored in the hidden `appDataFolder`.

A static PWA can synchronize while the user is present and authorized. It must not embed a client secret or attempt to persist a refresh token as if browser storage were a confidential backend.

The provider must handle token expiry, consent revocation, rate limits, pagination, transient failures, and quota errors. A sync error must never make the local library unusable.

### Self-hosted provider

A generic static file server is insufficient unless it supplies the necessary HTTPS, authentication, CORS, listing, conditional-write, and version behavior.

A minimal PostKeeper sync API should store opaque encrypted objects. It should not receive website credentials or need to parse article content.

## 10. Encryption and keys

Suggested key hierarchy:

1. Generate a random library master key locally.
2. Derive separate encryption and identifier keys through a standard key-derivation construction.
3. Encrypt each remote object with an authenticated encryption algorithm and a unique nonce.
4. Wrap the library master key with a key derived from a recovery passphrase or encode it in a high-entropy recovery key.
5. Store device-specific convenience copies only in platform-appropriate secure storage where available.

Requirements:

- Never invent custom cryptographic primitives.
- Version encrypted envelopes and key-derivation parameters.
- Include authenticated metadata needed to reject object substitution.
- Provide a recovery-key verification flow before first upload.
- Explain clearly that loss of every key copy makes encrypted sync data unrecoverable.

Cryptographic implementation requires a focused review before release.

## 11. Static PWA constraints

- GitHub Pages serves static files; backend-dependent OAuth flows and arbitrary server-side fetches are not available there.
- Browser storage is scoped to the exact origin. Changing hostname creates a new local store.
- A service worker must support both project subpaths and a future custom-domain root.
- A web app normally cannot fetch arbitrary page HTML due to cross-origin restrictions; extensions, the capture browser, or a user-controlled fetch service supply page content.
- Browser-only Google Drive authorization may require renewed user interaction.
- Background synchronization is best-effort and cannot be the only mechanism protecting data.
- The PWA should show local, pending-upload, synchronized, conflict, and error states distinctly.

## 12. Backups and portability

Provide a versioned PostKeeper export containing:

- metadata operations or a consistent metadata snapshot;
- article manifests;
- encrypted or plaintext blobs according to an explicit user choice;
- format and application version;
- checksums;
- no OAuth tokens or website session data.

Import must validate the complete archive before mutating the active library. Prefer importing into a staging namespace and committing only after verification.

## 13. Observability without telemetry

The initial build should not transmit analytics.

Provide local diagnostics that users can inspect and export deliberately:

- capture method and warning codes;
- extension and browser version;
- extractor/sanitizer versions;
- sync provider status and last successful checkpoint;
- counts and sizes, without article content in normal logs;
- redaction of URLs where they may contain tokens or personal information.

## 14. External references

- Readeck describes browser-assisted full-page submission and the risks of storing paywall credentials: <https://github.com/readeck/readeck/blob/main/README.md>
- GitHub Pages is static hosting: <https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages>
- Google Drive app-specific data: <https://developers.google.com/workspace/drive/api/guides/appdata>
- Google web authorization models: <https://developers.google.com/identity/oauth2/web/guides/choose-authorization-model>
- Firefox Android extension differences: <https://extensionworkshop.com/documentation/develop/differences-between-desktop-and-android-extensions/>
- Android share targets: <https://developer.android.com/develop/ui/compose/sharing/receive>
- PWA share targets: <https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target>
- Browser persistent storage: <https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria>
- Safari extensions and native-app communication: <https://developer.apple.com/safari/extensions/>
