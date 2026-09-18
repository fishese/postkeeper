# Self-hosted sync

PostKeeper can synchronize through a dedicated PocketBase instance while keeping the same encrypted object format used by Google Drive. The server stores opaque ciphertext plus account identifiers, object paths, sizes, timestamps, and access logs. It never receives the library recovery key or plaintext article content.

## Recommended deployment

PocketBase 0.40.4 is the first supported server. The included package under `servers/pocketbase` targets the DS720+'s Linux `amd64` processor and provides a pinned Docker image, schema migration, authenticated routes, conditional writes, and quotas. Follow [the PocketBase adapter guide](../servers/pocketbase/README.md) when the NAS is available.

Tailscale needs no app integration. Expose PocketBase at a browser-trusted HTTPS `*.ts.net` URL with Tailscale Serve, keep client devices on the tailnet, and enter that HTTPS URL in PostKeeper. The PocketBase account remains a second authentication boundary. Public web and PWA builds reject ordinary HTTP endpoints except local loopback test addresses.

## App setup

Open **Settings → Sync**, select **Self-hosted PocketBase**, and enter the server URL, account email, and password. Accounts are administrator-created in the shared `users` auth collection; public registration is disabled. With **Remember this trusted device** selected, PostKeeper encrypts the PocketBase token and master-key material under a non-exportable device key in a separate local IndexedDB database. The password and recovery key are not saved. The token is refreshed on startup and discarded, together with the device key, when the user disconnects. Browser-origin compromise can still use locally accessible credentials and content, so the normal PWA origin remains a security boundary.

New recovery keys contain an opaque library locator and store objects under `libraries/<library-id>/...`, allowing the same account identity to be reused by other applications and allowing later support for more than one PostKeeper library. Existing `pk1_` recovery keys and their original root object layout remain readable and writable without migration.

The Android wrapper supports self-hosted sync through the same HTTPS API. Google authorization remains browser/PWA only.

Keep the recovery key separately from the NAS and maintain backups of the PocketBase `pb_data` directory. Server loss does not remove content already downloaded to a device, but losing every device, server backup, and recovery key makes restoration impossible.

## Supported protocol

The client uses `/api/postkeeper/v1/` to list objects by prefix, read opaque bytes with ETags, create immutable objects, and perform atomic conditional updates. The included adapter limits one object to 16 MiB and defaults each account to 2 GiB. See the server guide for routes and quota configuration.

Nextcloud/WebDAV is not included in this milestone. Browser CORS and atomic conditional-write behavior differ across deployments, so it is not a trivial compatible target. Another server can be added later by implementing the same narrow protocol without changing PostKeeper's local data model or encrypted sync format.
