# VPS deployment

Public URL: https://pfotenzeit.187.124.16.6.sslip.io
Repository: https://github.com/patabrava/pfotenzeit

The static app runs in its own Nginx container on the existing VPS. Traefik routes HTTPS and obtains the Let's Encrypt certificate. Saves remain in the player's browser (IndexedDB); no server database is needed.

From the repository checkout on the VPS:

```sh
RELEASE=$(git rev-parse --short HEAD) docker compose -f deploy/compose.yaml up -d --build
docker compose -f deploy/compose.yaml ps
curl --fail https://pfotenzeit.187.124.16.6.sslip.io/healthz
```

Set `PFOTENZEIT_DOMAIN` to override the hostname; DNS must point to the VPS. The Compose configuration expects the existing Traefik Docker provider, `websecure` entry point, and `letsencrypt` certificate resolver. It publishes no host port.

Keep previous release images to allow rollback by selecting the old `RELEASE` and running `docker compose -f deploy/compose.yaml up -d --no-build`.
