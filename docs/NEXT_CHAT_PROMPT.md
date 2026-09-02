# Next Chat Prompt

Checkpoint: 2026-09-03. Canonical progress remains in `STATUS.md`.

## Where this session stopped

- Milestones 0–3 are complete. Milestone 4 is **In progress**; Milestone 5 has not started.
- Release `66a2466` is live at `https://keep.fishese.cc/`. [Actions run 33659560481](https://github.com/fishese/postkeeper/actions/runs/33659560481) passed. Reader image isolation and Drive exact-match pagination are fixed, tested, and deployed.
- Latest local validation: 81 unit/jsdom tests in 26 files plus format/lint/typecheck/build; 18 Chromium/Firefox browser tests. Corrected-source Chromium extension runtime (2 tests) and Firefox 155.0 runtime passed in the preceding session.
- Deployed image decoding and offline reload pass in desktop Chrome 152.0.7977.65 and Android emulator Chrome 149.0.7827.5. Empty reader sandbox retained. Physical Android extension rows remain historical and require stronger image assertions at release hardening.
- Prior real Drive run: 18 operations uploaded; wrong key rejected; interrupted download left metadata empty; retry restored 18 operations and two blobs. It stopped on the now-fixed image issue before live convergence, interrupted-upload retry, encrypted-object read-back, or revocation.
- Current blocker is user-held key entry. Restarting the emulator cleared session-only key/token state, not the local fixture. No Drive API calls or key creation occurred in the final session.

## User action before resuming live acceptance

The emulator is open and fitted to the screen. In PostKeeper, select **Connect Google Drive**, enter the existing saved key in **Restore or unlock with a recovery key**, select **Verify and restore**, and check **I saved the recovery key**. Load Google sign-in first if that button is shown. Leave the app tab open. Do not generate a replacement key and do not paste the key into chat.

## Environment and test boundaries

- Repository/workspace: `D:\Projects\PostKeeper`; branch `main`; GitHub `fishese/postkeeper`; GitHub Pages at `https://keep.fishese.cc/`.
- SDK: `C:\Users\Selena\AppData\Local\Android\Sdk`. AVD `Pixel_10_Pro_emu`, serial `emulator-5580`, Android 17, Chrome 149.0.7827.5. Last window size 564 × 1186.
- Use the emulator, not the phone. Persistent emulator changes and temporary PostKeeper-scoped emulator Chrome debugging were explicitly approved. No forwarding rule remains; allocate a fresh loopback port only if testing resumes, and remove that exact rule in cleanup.
- The existing fixture library and its saved recovery key must be preserved. Prior permission to dispose of stale data is not a reason to erase this active test library.
- `scripts/test-live-drive.mjs` requires a connected source app, its displayed valid key, and the user-confirmed checkbox. Start with **All items** selected and only the one harmless fixture present.
- Run `node scripts/test-live-drive.mjs http://127.0.0.1:PORT --allow-live-drive --revoke-at-end` after prerequisites pass. The user approved actual consent revocation at the end; it has not happened yet and requires reconnection afterward.
- The disposable desktop client receives the existing app-scoped token through an in-memory GIS callback relay. Drive calls are real; this does not prove a second independent OAuth consent flow. No keys/tokens in files, logs, screenshots, traces, or chat. The runner closes its desktop profile and restores network access; its caller removes ADB forwarding.
- User approved publishing/deploying the corrections delivered as `66a2466`. For any new corrective public release, clearly identify its scope and follow the hosting approval requirements. Do not alter OAuth scopes/audience, add a backend, or delete remote objects as a test shortcut.

## Copy-ready prompt

```text
Continue PostKeeper in D:\Projects\PostKeeper until the next logical stop.

Before changing anything, read completely and treat as source of truth: README.md, docs/PRODUCT_PLAN.md, docs/TECHNICAL_ARCHITECTURE.md, docs/IMPLEMENTATION_ROADMAP.md, docs/DECISIONS.md, and docs/STATUS.md. Also read docs/NEXT_CHAT_PROMPT.md and docs/GOOGLE_DRIVE_SETUP.md. Follow all AGENTS.md and filesystem restrictions.

Resume only Milestone 4 acceptance. The reader-image and Drive-pagination fixes are deployed as 66a2466. The emulator preserved its one fixture but lost its session-only key/token on restart. First check whether I have reconnected Drive, restored/unlocked with my existing saved key, and confirmed the checkbox. If not, ask me to do that directly in the app; never ask for the key in chat or generate a replacement.

Use only the approved Android Studio emulator, not my phone. Finish real two-client offline convergence, interrupted-upload retry, encrypted remote-object read-back, and the already-approved final consent-revocation check. Use the opt-in live runner and retain its documented token-relay limitation. Preserve the active library, keep secrets out of output, and remove temporary ADB forwarding afterward.

Fix in-scope defects and run relevant regression tests. Do not mark Milestone 4 complete without all acceptance evidence. Stop at milestone completion or a genuine user-input blocker; do not start Milestone 5. Update the documentation and provide another copy-ready continuation prompt.
```
