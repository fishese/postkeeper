# Implementation Roadmap

## 1. Execution policy

Build PostKeeper one milestone at a time. The next implementation task is always the first incomplete milestone in [STATUS.md](STATUS.md).

For every milestone:

1. Read all planning documents before changing architecture.
2. Confirm the milestone's explicit scope and exclusions.
3. Inspect the existing worktree and preserve unrelated user changes.
4. Add or update tests alongside implementation.
5. Run the milestone's relevant checks.
6. Update `STATUS.md` with evidence, limitations, and the next milestone.
7. Stop before implementing the next milestone unless the user explicitly requests it.

Architectural changes require an entry in [DECISIONS.md](DECISIONS.md) explaining the reason and consequences.

## 2. Milestone 0 — Foundation and feasibility

### Scope

- Initialize version control if the user requests it; do not assume permission to publish remotely.
- Establish an npm-workspaces TypeScript monorepo or document a justified alternative.
- Create the PWA shell and shared packages needed by Milestone 1.
- Configure formatting, linting, type checking, unit tests, and browser-level tests.
- Establish static-host build output compatible with a project subpath.
- Add architecture decision records for dependencies actually chosen.
- Create local page fixtures representing:
  - a public article;
  - a cookie-authenticated article;
  - JavaScript-rendered content;
  - lazy-loaded images;
  - images on a separate origin;
  - hostile HTML with scripts and event handlers;
  - a long printable article.
- Run small feasibility spikes for:
  - IndexedDB records;
  - OPFS blob storage plus fallback;
  - service-worker update behavior;
  - extension-to-PWA message transfer in desktop Chromium and Firefox.

### Explicit exclusions

- No production extension UI.
- No Google Drive OAuth.
- No synchronization engine.
- No Android wrapper.
- No polished product UI.

### Completion criteria

- A static development build loads under both `/` and a configured project base path.
- Automated checks run with one documented command per check category.
- Storage and transfer spikes have recorded results, including browser versions.
- Dependency licenses and maintenance status are documented.
- `STATUS.md` records the selected baseline and any changes to the proposed stack.

## 3. Milestone 1 — Local-first PWA library

### Scope

- Local article metadata repository.
- Local immutable blob repository with IndexedDB fallback.
- Inbox, all items, unread, favorites, archive, and categories.
- Create, rename, reorder, and delete flat categories.
- Many-to-many article/category membership.
- Import a trusted development fixture through an internal test path.
- Safe reader component using already-sanitized fixture content.
- Local search index with rebuild operation.
- Offline application shell.
- Storage persistence request and visible storage status.

### Explicit exclusions

- No arbitrary capture-package import yet.
- No browser extension.
- No sync.
- No Android wrapper.
- No category-specific layouts.

### Completion criteria

- Local data survives browser restart.
- Fixture articles and images remain readable offline.
- Category and state changes persist.
- Search returns fixture content and can be rebuilt from authoritative local data.
- Unit tests cover repository transactions and category membership.
- Browser tests cover add, organize, restart, search, and read workflows.

## 4. Milestone 2 — Capture format and secure import

### Scope

- Versioned capture-package schema and validation.
- Chunked package receiver interface.
- Hash verification and content-addressed blob import.
- Readability extraction pipeline for fixture DOM.
- HTML sanitization and URL/asset rewriting.
- Complete, partial, and failed capture states.
- Inactive raw DOM snapshot retention.
- Snapshot versioning and recapture behavior.
- Import-size and media-type limits.

### Completion criteria

- Public, authenticated, lazy-image, and hostile fixtures import deterministically.
- Hostile fixture scripts and handlers cannot execute.
- Missing assets produce visible warnings.
- Duplicate blobs are stored once.
- Invalid packages cannot partially mutate the active library.

## 5. Milestone 3 — Browser extensions

### Scope

- Shared extension capture implementation.
- Chromium Manifest V3 build.
- Firefox-compatible build.
- Explicit save action and category selection or inbox default.
- Metadata, reader content, raw DOM, and relevant image capture.
- Temporary bounded extension queue.
- Secure extension-to-PWA handoff and acknowledgement.
- Permission UX and incomplete-capture reporting.
- Compatibility tests for:
  - desktop Chromium;
  - desktop Firefox;
  - one user-selected extension-capable Android Chromium browser;
  - Firefox Android.

### Completion criteria

- Public and authenticated fixture pages capture on desktop Chromium and Firefox.
- Tested Android browsers have recorded pass/fail capability matrices.
- Authentication cookies or passwords do not appear in capture packages or logs.
- The extension retains a package until the PWA acknowledges durable import.
- The PWA origin allowlist and transfer replay protections are tested.

## 6. Milestone 4 — Encrypted sync core and Google Drive

### Scope

- Device identity and ordered operation log.
- Deterministic conflict rules with unit tests.
- Tombstones and immutable snapshot/blob synchronization.
- Versioned encrypted envelopes.
- Library recovery-key creation and verification.
- Provider-neutral object-store interface.
- Google Identity Services integration.
- Google Drive provider using the approved scope/layout.
- Visible local/pending/synced/error/conflict state.
- Restore onto a clean second client.

### Completion criteria

- Two clients make independent offline edits and converge.
- Interrupted upload/download resumes or safely repeats.
- A wrong recovery key cannot import data.
- Drive never receives plaintext article bodies, titles, URLs, or encryption keys.
- Token expiry or revoked consent leaves local data usable.
- A clean client restores metadata and selected content from Drive.

### Required review

Use a stronger review pass for cryptography, conflict resolution, and OAuth. A smaller implementation model may build bounded tickets, but this milestone must not ship without focused security review.

## 7. Milestone 5 — Sharing, PDF/print, and backup

### Scope

- Open and copy original URL.
- Print stylesheet and **Print / Save as PDF** action.
- Portable library backup export.
- Staged, validated backup import.
- Local diagnostics export with redaction.

### Completion criteria

- Long fixture prints with headings, links, images, and reasonable page breaks.
- Backup round-trip preserves metadata, categories, snapshots, and images.
- OAuth tokens, website session data, and transient logs are absent from backups.
- Corrupt backups fail without modifying the active library.

## 8. Milestone 6 — Android PWA integration and wrapper

### Scope

- PWA share target for URLs where supported.
- Pending-link workflow.
- Thin Android wrapper using the shared web UI.
- Native Android share target.
- Platform-secure key convenience storage.
- Isolated authenticated capture browser.
- Standard capture-package bridge from the capture browser.
- Clear per-site/all browsing-data controls.
- Optional improved background sync within platform rules.

### Completion criteria

- Sharing a URL from Android creates an inbox item.
- A public fixture and authenticated fixture can be saved through the capture browser.
- Website JavaScript cannot access privileged native APIs.
- Clearing capture-browser data removes its site sessions without deleting the PostKeeper library.
- Existing PWA and extension workflows remain compatible.

## 9. Milestone 7 — Self-hosted sync provider

### Scope

- Document and implement the minimal opaque-object sync protocol.
- HTTPS, authentication, CORS, listing, conditional writes, quotas, and error behavior.
- Self-hosted server package or a documented adapter to an approved compatible service.
- Provider-switch and restore testing.

### Completion criteria

- The server cannot decrypt library contents.
- Drive and server providers pass the same sync contract tests.
- Switching providers does not require changing the local domain model.
- Server loss does not prevent use of already downloaded local content.

## 10. Milestone 8 — Release hardening

### Scope

- Accessibility and responsive-layout audit.
- Cross-browser regression matrix.
- Storage pressure and quota behavior.
- Service-worker update and rollback behavior.
- Capture and sync fault injection.
- Recovery drills.
- Privacy and security review.
- Deployment documentation.

### Completion criteria

- All initial-release acceptance criteria in `PRODUCT_PLAN.md` are demonstrated.
- Known limitations are documented in user-facing language.
- No unresolved critical security or data-loss defect remains.
- A release can be reproduced from a clean checkout using documented commands.

## 11. Smaller-model work-unit guidance

Each implementation chat should target one milestone or, for Milestones 3, 4, and 6, one clearly named sub-ticket. Good work units have:

- one concrete outcome;
- explicit files or package boundaries;
- five or fewer primary acceptance checks;
- no simultaneous architecture migration;
- a required test command;
- a stop condition.

Suggested split for complex milestones:

- Milestone 3: capture logic, handoff protocol, Chromium packaging, Firefox packaging, Android compatibility.
- Milestone 4: operation model, encryption envelope, provider contract, Drive OAuth/provider, two-client integration.
- Milestone 6: PWA share target, wrapper shell, native share target, capture browser, platform security review.
