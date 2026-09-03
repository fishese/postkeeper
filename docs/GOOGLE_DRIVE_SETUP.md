# Google Drive Sync Setup

PostKeeper uses Google Identity Services in the browser and stores encrypted sync objects in Google Drive's hidden application-data folder. It requests only:

```text
https://www.googleapis.com/auth/drive.appdata
```

The browser client ID is public configuration. Never add an OAuth client secret to this repository or static build.

## Google Cloud configuration

1. Use the permanent production origin `https://keep.fishese.cc` recorded by D-019.
2. Create or select a Google Cloud project and enable the Google Drive API.
3. Configure Google Auth Platform branding, audience, and contact information.
4. Create an OAuth 2.0 client with application type **Web application**.
5. Under **Authorized JavaScript origins**, add `https://keep.fishese.cc`, `http://localhost`, and `http://localhost:4173`. Add `http://localhost:5173` only if using Vite's development server on that port. Use origins without paths or trailing slashes. This GIS token-popup flow does not require a redirect URI; do not invent a callback route.
6. Copy the client ID, not the client secret, into `VITE_GOOGLE_CLIENT_ID` in root `.env.local`. Vite loads that file for local builds. The GitHub Pages workflow reads the public repository variable `GDRIVEWEBID` instead. Restart/rebuild after changing configuration.

If the OAuth audience is **External / Testing**, add each Google account used in the smoke test as a test user. Configure only the `drive.appdata` scope for this app. Because the client is reused from an older app, PostKeeper explicitly disables combining previously granted scopes into its new token; it does not request full Drive access.

The current official setup references are Google's [web client-ID guide](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid), [Drive JavaScript quickstart](https://developers.google.com/workspace/drive/api/quickstart/js), and [application-data folder guide](https://developers.google.com/workspace/drive/api/guides/appdata).

## OAuth publication and policy URLs

The user reports that adding their Google account as a test user resolved the access block and subsequently changed the OAuth audience to published (In production). These are user-reported configuration and authorization results, not the remaining two-client sync/restore acceptance tests or confirmation of Google brand verification.

The following static pages are included in the GitHub Pages deployment. Confirm that they are reachable before submitting their URLs to Google:

| Google Auth Platform field        | Value                                          |
| --------------------------------- | ---------------------------------------------- |
| App name                          | PostKeeper                                     |
| Application home page             | `https://keep.fishese.cc/`                     |
| Application privacy policy link   | `https://keep.fishese.cc/privacy.html`         |
| Application terms of service link | `https://keep.fishese.cc/terms.html`           |
| Authorized domain                 | `fishese.cc`                                   |
| Authorized JavaScript origin      | `https://keep.fishese.cc`                      |
| Public policy contact             | `https://github.com/fishese/postkeeper/issues` |

Google's separate user-support email and developer-contact fields still require an address selected in Cloud Console; using the issue tracker on the policy pages does not replace those fields. Do not put secrets in any public field.

`drive.appdata` is [non-sensitive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), so it does not require sensitive/restricted-scope review. That is not a guarantee of no verification: [brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification) can apply to public display names/logos and can fall back from automated checks to manual review. Check the project's Branding and Verification Center status before moving the Audience to In production. Verify domain ownership when required and review/remove any obsolete scopes from the repurposed app's configuration. Do not change unrelated OAuth clients without checking their use.

These pages are implementation-aligned drafts, not a legal compliance certification. The maintainer should review their accuracy, effective dates, operator/contact details, and any jurisdiction-specific requirements with qualified legal advice as appropriate. Do not state “we store no data”: the app stores local data, optional Drive ciphertext, and technical/support information is processed by providers. Future data-handling changes require corresponding policy updates and any required consent. Publishing the policy pages does not itself change the OAuth audience; the maintainer reported making that separate change after deployment.

## Local smoke test

1. Build or serve PostKeeper with `VITE_GOOGLE_CLIENT_ID` set.
2. Open the matching authorized `localhost` origin.
3. Import a development fixture and make an offline metadata change.
4. Select **Load Google sign-in**, then **Connect Google Drive**. The separate connection action preserves the browser's user gesture for the OAuth popup. Confirm that the consent screen requests only PostKeeper's application-data access.
5. Create and copy the recovery key. Confirm the saved-key checkbox before selecting **Sync now**.
6. Revoke access or wait for token expiry. Confirm that sync changes to reconnect-required while local reading and editing continue to work.
7. In a clean browser profile, connect the same Google account, enter the recovery key, and restore. Confirm metadata and offline reader content.
8. Make independent offline edits in both profiles, sync each, then sync the first profile again. Confirm convergence.
9. Use Google Drive API inspection, not the Drive UI, to confirm that app-data file bodies contain no plaintext article title, URL, body, local blob hash, or raw master key.

Use harmless fixtures for localhost testing. Store real production data only at the permanent HTTPS origin once deployed; browser-local data is origin-scoped. Reusing an OAuth client does not migrate an older app's data format. Identify obsolete app-owned objects before deleting anything; no old Drive data has been deleted as part of setup.

## Opt-in emulator live acceptance runner

### Current checkpoint (2026-09-03)

Milestone 4 acceptance is complete. After the user reconnected and unlocked the existing library, the live runner rejected a wrong key, safely retried an interrupted download, restored 23 operations and two blobs, made independent offline edits on emulator/desktop, retried an interrupted upload, and converged on 37 operations. Both clients decoded the fixture image offline. The runner read back 19 newly created objects as version-1 AES-GCM envelopes and audited 20 upload attempts. Inspection covered those new objects; it did not scan unrelated or historical Drive files. The desktop client's GIS callback used the emulator's app-scoped token in memory, so this does not claim a second independent OAuth consent flow.

The approved real consent revocation also passed: Google returned HTTP 401, sync showed reconnect-required, and local reading/editing continued. The emulator preserves the fixture, its acceptance category edits, and the existing library/key association. It is intentionally disconnected. When sync is next wanted, select **Load Google sign-in** if shown, then **Connect Google Drive**. If the tab has restarted, enter the existing saved key directly in **Restore or unlock with a recovery key**, select **Verify and restore**, and confirm **I saved the recovery key**. Do not initialize a replacement library or send the key in chat.

The runner's asynchronous category-checkbox wait was corrected after the first attempt; the full subsequent run passed. That acceptance used `66a2466`; the public site now contains M5 commit `dec19b6`, with successful Pages run `33756881944`. The disposable desktop browser was closed, emulator network access restored, and its temporary forwarding removed. M5's Chrome/PWA native six-page PDF save passed on Samsung SM-S9280 / Android 16 / Chrome 152.0.7977.64, without reconnecting Drive or changing the emulator library/key. Phone fixtures and temporary connections were removed.

M6 is published as `c32aae9` (Pages run `33763974272` passed). Its Android wrapper uses a separate library with embedded Google sign-in disabled. Its Android Keystore convenience copy is optional key storage; it does not enable native Drive sync. Continue using the browser/PWA for Drive and portable backups to move saved records between libraries. M6 used only the emulator's newly installed debug app with synthetic fixtures; no real Drive calls, library-key access, or phone testing occurred. Preserve the existing disconnected browser library and key. See `STATUS.md`, `ANDROID_SETUP.md`, and `NEXT_CHAT_PROMPT.md`.

### Runner safety and use

`scripts/test-live-drive.mjs` is an explicitly opt-in live test, not a CI test. It requires approval to attach Chrome debugging to a signed-in Android emulator. The debugging endpoint exposes the browser session, so use only a trusted loopback connection, inspect only PostKeeper, and remove the ADB forwarding rule afterward. Never attach to the user's phone without permission.

Prepare the emulator at `https://keep.fishese.cc/` with only the development fixture and a connected Google Drive account. Before first upload, the user must save the displayed recovery key and check its confirmation box. The runner refuses to confirm that box on the source client's behalf. Do not overwrite an existing remote library; inspect the initial recovery lookup first and stop if a different library already exists.

After explicit authorization, supply the temporary loopback endpoint:

```powershell
node scripts/test-live-drive.mjs http://127.0.0.1:PORT --allow-live-drive
```

The runner uploads only encrypted fixture objects, opens a disposable desktop Chrome profile, rejects a wrong recovery key, interrupts and retries transfers, and checks independent offline edits and convergence. Only the clean desktop client's GIS callback is supplied by the harness using the emulator's already-authorized app-scoped token in memory; Drive REST calls and storage are real. This tests two isolated clients, not a second independent OAuth consent flow. Tokens and recovery keys are not written to files, traces, screenshots, or ordinary output. The runner reads back only object IDs created during its run to inspect their encrypted envelopes.

The optional `--revoke-at-end` flag uses the emulator's real **Disconnect Google Drive** action, then checks a real Google 401 and continued local usability on the desktop client. Use that flag only with authorization for the consent-revocation test: the app must reconnect afterward. The fixture library remains in Drive; no remote object is deleted automatically. Keep the saved recovery key. The runner restores network access, closes its disposable desktop browser, and detaches from the emulator in `finally`; the caller must separately remove the exact temporary ADB forwarding rule, including after a failure.
