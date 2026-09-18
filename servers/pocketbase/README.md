# PostKeeper PocketBase adapter

This package turns a dedicated PocketBase instance into PostKeeper's authenticated opaque-object store. PocketBase sees object paths, encrypted byte counts, account identifiers, timestamps, and access logs. Article titles, URLs, text, images, categories, and the library recovery key are encrypted by the client before upload.

The adapter is pinned to PocketBase 0.40.4. PocketBase has not reached 1.0 and its project warns that upgrades can require manual migration work. Back up `pb_data` before changing versions and review PocketBase's changelog.

The included image accepts browser requests from the published web app and PostKeeper's fixed Android app-assets origin. If you host your own PostKeeper web build at another origin, add that exact HTTPS origin to PocketBase's `--origins` option rather than using a wildcard.

## Synology DS720+

The DS720+ uses a 64-bit Intel processor, matching PocketBase's Linux `amd64` build. In Synology Container Manager, create a project from this directory's `compose.yaml`. The Dockerfile downloads the official PocketBase archive and verifies its published SHA-256 before installing it. The host port binds only to loopback so a reverse proxy or Tailscale Serve can terminate HTTPS.

After the container starts:

1. Open the PocketBase superuser setup URL shown in the container log from a trusted device.
2. In the PocketBase dashboard, open the `postkeeper_users` collection and create your user. Public registration is disabled.
3. Keep `pb_data` on persistent NAS storage and include it in NAS backups.
4. Enable PocketBase rate limiting. Configure SMTP only if you want PocketBase password-reset email.
5. Expose the service through HTTPS. Do not expose port 8090 directly to the internet.

## Tailscale

Tailscale does not change PostKeeper's sync protocol. The app needs a browser-trusted HTTPS URL because it is loaded from `https://keep.fishese.cc`; an HTTP NAS URL would be blocked as mixed content.

When Tailscale runs on the NAS host, proxy PocketBase privately with:

```sh
tailscale serve --bg 8090
```

Tailscale prints the resulting `https://<machine>.<tailnet>.ts.net/` URL. Use that full URL in PostKeeper's **Self-hosted PocketBase** settings. Keep every PostKeeper device signed in to the tailnet and allow it through the tailnet access rules. Tailscale Serve supplies the trusted certificate; PocketBase authentication remains required as a second boundary.

If Synology's Tailscale package cannot reach a container's loopback mapping in your DSM configuration, route a Synology reverse-proxy HTTPS hostname to the container instead. The PostKeeper endpoint remains the HTTPS origin; no app change is required.

## Local validation

With PocketBase available at `http://127.0.0.1:8090`:

```sh
./pocketbase serve --http=127.0.0.1:8090 --dir=./pb_data --origins=http://127.0.0.1:4173
```

Plain HTTP is accepted by the PostKeeper client only for `localhost`, `127.0.0.1`, and `[::1]` test endpoints. Production endpoints must use HTTPS.

## Protocol

Authenticated routes are under `/api/postkeeper/v1/`:

- `GET objects?prefix=&cursor=` lists metadata in path order.
- `GET object?path=` returns opaque bytes with an ETag.
- `PUT object?path=` with `If-None-Match: *` creates an immutable object or reports the existing one.
- `PUT object?path=` with `If-Match: <etag>` performs an atomic conditional update.

The adapter caps each encrypted object at 16 MiB and defaults each user to 2 GiB. Set `POSTKEEPER_MAX_USER_BYTES` to another positive byte count if needed. Server or NAS loss never prevents PostKeeper from opening content already present in a device's local library.

Nextcloud/WebDAV is not included because browser CORS behavior and atomic conditional writes vary by deployment. A future adapter can implement this same protocol without changing PostKeeper's local model or encrypted sync format.
