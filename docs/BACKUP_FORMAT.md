# Portable backups and printing

Milestone 5 introduced application version 0.5.0 and backup format version 1. Milestone 6 uses application version 0.6.0 with the same backup format. Pending links are ordinary article/snapshot records marked `pending-link`; backups preserve their placeholder state and organization. Android capture snapshots use `android-capture-browser`.

## Export and restore

Select **I choose a plaintext backup containing my saved content**, then **Export portable backup**. This deliberately downloads readable JSON. The file includes private saved content and should be stored privately. Version 1 does not offer encrypted portable backups; Google Drive synchronization remains independently encrypted.

The export reads article, category, membership, and snapshot records in one IndexedDB transaction, then reads only their referenced immutable blobs. It includes every stored snapshot, including inactive raw DOM, and preserves IDs, timestamps, categories, membership, flags, warnings, manifests, and bytes. It is a consistent metadata snapshot, not an operation-log or browser-profile backup. Device IDs, sync association, operation history, conflicts held only in the sync log, keys, OAuth tokens, browser cookies/session storage, search caches, unreferenced blobs, and transient logs are not exported. Saved article text, URLs, images, and raw DOM are private content and are intentionally included; this is not content anonymization.

Choose a file under **Choose PostKeeper backup**. The application validates the entire archive in an isolated in-memory stage and displays counts before enabling **Import validated backup**. Cancel discards the stage. Closing/reloading the app also discards it; incomplete stages do not persist.

Import adds records without replacing existing records. Identical IDs and values can be imported again. Any conflicting article, category, snapshot, membership, or blob descriptor aborts the entire transaction, including concurrent edits made after staging. Restore an older conflicting version in an empty browser library. Import never changes the active sync association, device identity, operation log, recovery key, or Google authorization. Newly imported records become ordinary local changes for a later explicit sync.

All imported metadata, bytes, and rebuilt search records commit in one IndexedDB transaction, including on OPFS-capable devices. This intentionally uses the existing IndexedDB blob fallback so quota or write failure cannot leave partially written OPFS files. Existing OPFS blobs remain untouched. A browser crash before commit leaves the old state; after commit, the imported records are durable under IndexedDB's browser durability guarantees.

## Version 1 envelope

```text
format: "postkeeper-backup"
formatVersion: 1
applicationVersion: producing web package version
createdAt: timestamp
protection: "plaintext"
payload:
  articles: Article[]
  categories: Category[]
  memberships: CategoryMembership[]
  snapshots: Snapshot[]
  blobs: [{ id: sha256, mediaType, byteLength, base64 }]
sha256: checksum of canonical JSON of all the fields above except sha256
```

Canonical JSON uses the existing sync-core canonical serializer (recursively sorted object keys, ordered arrays). Every blob is separately rehashed against its SHA-256 ID. The importer checks versions, exact field sets/types, bounded strings and arrays, safe article URLs, canonical base64, byte lengths, media allowlists, uniqueness, references, snapshot ownership, reader content hashes, and absence of unreferenced blobs. Checksums detect corruption; they do not authenticate who created a plaintext archive. Restored HTML is independently sanitized at presentation time and raw DOM remains inactive.

Limits: 128 MiB UTF-8 file; 64 MiB decoded blobs; 10 MiB per blob; 10,000 articles/categories; 50,000 snapshots/memberships/blobs; 1,000 assets per snapshot. Whole-file in-memory staging uses additional memory beyond file size. Large-library streaming/encrypted formats and quota stress work remain release-hardening/future work; oversized files fail explicitly rather than exporting incomplete libraries.

## Printing

**Print / Save as PDF** opens a separate printable document and invokes the browser print dialog after local images have finished decoding. It retains headings, source metadata, printable link destinations, local images, tables, and page-break rules. If a popup is blocked, allow this app's print window and retry. The printable tab also supports the browser's menu/Share → Print action. Keep the source and print tabs open until the browser finishes saving, then close the print tab. No article is uploaded for printing.

Saved HTML is re-sanitized with a strict tag/attribute allowlist; metadata is escaped. The printable window inherits the launcher iframe's sandbox (`allow-same-origin allow-modals allow-popups`, with no scripts, forms, or popup escape), receives a no-script/no-network CSP, and has its opener severed before content is written. The same-origin capability lets trusted app code populate the script-free document and invoke printing; captured code cannot execute. The normal reader retains its original empty sandbox. Printing the entire app's oversized iframe clipped text in Chromium; the separate document avoids that failure.

Sandbox behavior follows the [HTML iframe documentation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe); the print API is documented in [Window.print](https://developer.mozilla.org/en-US/docs/Web/API/Window/print).

Native Android acceptance passed on 2026-09-03 using Samsung SM-S9280 / Android 16 / Chrome 152.0.7977.64. The actual Android Print Spooler and Samsung My Files save produced a 57,048-byte, six-page Letter PDF. All six pages were rendered with Poppler and visually inspected for headings, complete lines, local image, final text, links, and page breaks; extracted text and the clickable link annotation also passed. Desktop Chromium A4 PDF layout and Chromium/Firefox printable documents pass. The source and print tabs remained open until saving finished.

Known limitation: the API 37.1 emulator with Chrome 149.0.7827.5 and 152.0.7977.75 displayed the six-page preview but produced empty PDFs with native `onTrimMemory` crashes. A post-reboot plain control save was never verified. The phone pass does not resolve that emulator failure. Physical-printer output and browser Android JSON Download Manager delivery are not claimed. Milestone 5 is now public at release `dec19b6`.

Milestone 6's wrapper uses Android's system document picker rather than browser Download Manager. Actual native export saved an 8,588-byte fixture JSON; native file selection, staging, and confirmed idempotent import passed. This is separate from the earlier browser delivery limitation. Print uses the same sanitized document in a script-disabled, network-blocked native WebView. Its one-page preview opened, but the emulator saved a zero-byte PDF; wrapper PDF saving is unverified and the Chrome/PWA phone result is not generalized to it. Native printable HTML is limited to 3.5 million characters; native JSON export retains the 128 MiB file limit. See `ANDROID_SETUP.md` for isolation and device evidence.

## Diagnostics

**Review local diagnostics** constructs an explicit allowlist projection for inspection; **Export redacted diagnostics** downloads exactly that preview. It includes aggregate counts, origin storage usage/quota, browser family/version, processing versions, known capture-method/warning codes, and current sync status. Unknown codes become `other`; warning URL suffixes, article IDs, titles, URLs, bodies, raw user agents, credentials, and logs are excluded. Historical extension/source-browser versions were not retained by earlier snapshots and are reported as unavailable. The last successful sync checkpoint is a timestamp from the current app session, or null if unavailable after restart.
