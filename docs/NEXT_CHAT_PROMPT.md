# Next Chat Prompt

Checkpoint: 2026-09-03. Canonical progress remains in `STATUS.md`.

## Current stop

**Milestones 0–5 are complete locally.** The user resumed Milestone 5 and authorized wireless-ADB phone testing. Native PDF acceptance passed on Samsung SM-S9280 / Android 16 (API 36) / Chrome 152.0.7977.64. No application fix was needed. Milestone 6 has not started; stop until the user requests it. Publication/deployment requires separate approval.

The public site `https://keep.fishese.cc/` still serves Milestone 4 release `66a2466` and **does not contain Milestone 5**. Do not describe the local completion as a public release.

## Required reading and preserved work

- Workspace `D:\Projects\PostKeeper`, branch `main`, repository `fishese/postkeeper`.
- Read completely: `README.md`, `docs/PRODUCT_PLAN.md`, `docs/TECHNICAL_ARCHITECTURE.md`, `docs/IMPLEMENTATION_ROADMAP.md`, `docs/DECISIONS.md`, `docs/STATUS.md`, this prompt, `docs/GOOGLE_DRIVE_SETUP.md`, and `docs/BACKUP_FORMAT.md`. Follow all AGENTS.md restrictions.
- Preserve all uncommitted changes. Original Milestone 4 changes to README, Drive setup, status, this prompt, and `scripts/test-live-drive.mjs` remain alongside the Milestone 5 code/tests/policies/docs.
- This phone session changed completion/handoff documentation only; it did not change application code, commit, push, deploy, add dependencies, migrate schemas, call Drive, or start Milestone 6. Temporary acceptance harness/evidence lives in ignored `test-results/`.

## Milestone 5 acceptance

- Web package 0.5.0: safe original-link open/copy, isolated printable documents, explicit plaintext portable backup export, complete in-memory staging and atomic additive import, and reviewed/redacted diagnostics. D-024 and `docs/BACKUP_FORMAT.md` describe the contract.
- Existing full validation: formatting, lint, typecheck, **104 tests/29 files**, web and both extension builds; **24 Chromium/Firefox browser tests**; **2 packaged Chromium extension tests**. The phone session additionally rebuilt the web app successfully, including TypeScript. Application code was unchanged, so broad regressions were not repeated.
- Backups: complete metadata/category/membership/snapshot/raw-DOM/image round trips; 15 corrupt variants; cancelled/forged stages; conflicting/concurrent edits; quota/write rollback; browser payload equality and offline images. Desktop tests exercise actual JSON downloads. Android JSON Download Manager delivery remains unverified.
- Desktop print: six-page A4 PDF, all pages rendered with Poppler and visually inspected.
- Physical phone print: the real app action opened Android Print Spooler, then Samsung My Files saved a **57,048-byte, six-page Letter PDF**. All six rendered pages pass for headings, complete lines, local image, source/link destinations, final text, margins, and page breaks. Normalized text checks confirm all 12 field headings and 48 body paragraphs; the external link is clickable. The printable document has a decoded local image, severed opener, and no active elements; the normal reader retains its empty sandbox.
- Local native-PDF evidence: `test-results/m5-phone-native.pdf`, SHA-256 `f81900bd18de796e5c8951e4ef76eca28b05d4f652250a61d7cdff78976c1b17`. Page renders: `test-results/m5-phone-page-1.png` through `-6.png`. These are ignored local evidence, not committed artifacts. No physical-printer result is claimed.

## Phone test isolation and cleanup

- Used a previously empty `http://127.0.0.1:4185` origin and a unique `postkeeper-m5-phone-<uuid>` database. A task-local print-only harness was used; the emulator-only corruption/backup runner was not run on the phone.
- Kept source and printable tabs open until native save finished. Samsung My Files saved the title-derived `/sdcard/A long printable fixture.pdf`; copied it locally and matched SHA-256 before removing the task phone copy.
- Deleted only the task database/OPFS/cache/worker on that dedicated origin, confirmed no databases remained, closed both task tabs, removed the task UI dump/PDF, and stopped the local preview.
- Removed exact phone forward `tcp:56153` and reverse `tcp:4185`; both lists were verified empty. The existing wireless ADB pairing/connection was not changed. Allocate fresh mappings if later testing is requested.
- Existing phone libraries and other tab contents were not inspected or changed. The emulator was not accessed. Sync associations and the saved recovery key remain untouched; no key entry or Google sign-in was needed.

## Earlier emulator limitation

SDK: `C:\Users\Selena\AppData\Local\Android\Sdk`. Preserve existing AVD `Pixel_10_Pro_emu`, serial `emulator-5580`, and its library/category edits/sync association. It is intentionally disconnected from Drive. The saved key must only be entered directly in the app if future sync work needs it; never request it in chat or initialize a replacement library.

Emulator Chrome 149.0.7827.5 and the in-place update to 152.0.7977.75 opened the correct six-page preview but native saving produced zero-byte PDFs with `onTrimMemory` native crashes. Its API 37.1 revision 6 x86_64 image has 16 KB pages and approximately 4 GB running RAM. A data-preserving reboot and one-page control reached preview, but the control save was never verified. The physical-phone pass does not establish a fix or cause for that emulator failure. Do not repeat emulator troubleshooting by default or relax the print sandbox.

## Copy-ready continuation prompt

```text
Continue PostKeeper in D:\Projects\PostKeeper. Read docs/NEXT_CHAT_PROMPT.md, every source-of-truth document it lists, and docs/STATUS.md completely. Follow all AGENTS.md restrictions and preserve all uncommitted changes.

Milestones 0–5 are complete locally. Milestone 5 native PDF acceptance passed on my Samsung SM-S9280 / Android 16 / Chrome 152.0.7977.64: a real six-page PDF saved successfully and every page was inspected. Existing desktop, backup, diagnostics, and security regression evidence remains applicable. Phone fixtures and temporary connections were cleaned up. The public site still serves Milestone 4 release 66a2466; Milestone 5 is unpublished.

Do not repeat completed phone acceptance or earlier emulator troubleshooting. Preserve phone/emulator data, category edits, sync association, and the saved recovery key. No Drive reconnection is needed. Publication requires separate approval. Milestone 6 has not started; wait for my explicit direction to publish Milestone 5 or begin Milestone 6.
```
