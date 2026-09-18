# Self-hosted sync

PostKeeper can synchronize through a dedicated PocketBase instance while keeping the same encrypted object format used by Google Drive. The server stores opaque ciphertext plus account identifiers, object paths, sizes, timestamps, and access logs. It never receives the library recovery key or plaintext article content.

## Recommended deployment

PocketBase 0.40.4 is the first supported server. The included package under `servers/pocketbase` targets the DS720+'s Linux `amd64` processor and provides a pinned Docker image, schema migration, authenticated routes, conditional writes, and quotas. Follow [the PocketBase adapter guide](../servers/pocketbase/README.md) when the NAS is available.

Tailscale needs no app integration. Expose PocketBase at a browser-trusted HTTPS `*.ts.net` URL with Tailscale Serve, keep client devices on the tailnet, and enter that HTTPS URL in PostKeeper. The PocketBase account remains a second authentication boundary. Public web and PWA builds reject ordinary HTTP endpoints except local loopback test addresses.

## App setup

Open **Settings → Sync**, select **Self-hosted PocketBase**, and enter the server URL, account email, and password. PostKeeper stores the endpoint and email on the device. The password and access token remain in memory and are discarded on disconnect or page reload. Reconnect when the PocketBase token expires.

The Android wrapper supports self-hosted sync through the same HTTPS API. Google authorization remains browser/PWA only.

Keep the recovery key separately from the NAS and maintain backups of the PocketBase `pb_data` directory. Server loss does not remove content already downloaded to a device, but losing every device, server backup, and recovery key makes restoration impossible.

## Supported protocol

The client uses `/api/postkeeper/v1/` to list objects by prefix, read opaque bytes with ETags, create immutable objects, and perform atomic conditional updates. The included adapter limits one object to 16 MiB and defaults each account to 2 GiB. See the server guide for routes and quota configuration.

Nextcloud/WebDAV is not included in this milestone. Browser CORS and atomic conditional-write behavior differ across deployments, so it is not a trivial compatible target. Another server can be added later by implementing the same narrow protocol without changing PostKeeper's local data model or encrypted sync format.
