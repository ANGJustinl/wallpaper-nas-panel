# Wallpaper Engine Workshop NAS Panel

## Services

- `web`: React + Vite frontend, built to static assets and served by nginx.
- `api`: Node + TypeScript API for workshop search, task queueing, settings, and login state.
- `worker`: dedicated steamcmd-backed downloader worker that consumes queued tasks from the shared SQLite database.

## Docker Compose

1. Copy `.env.example` to `.env` and adjust ports or defaults if needed.
2. From `apps`, run:

```bash
docker compose up --build
```

3. Open `http://localhost:8080` by default.

The local image names are:

- `wallpaper-nas-panel-web:local`
- `wallpaper-nas-panel-api:local`
- `wallpaper-nas-panel-worker:local`

Published GHCR images can be selected by setting `PANEL_WEB_IMAGE`, `PANEL_API_IMAGE`, and `PANEL_WORKER_IMAGE` in `.env`.

## Image-Only Deployment

Use `docker-compose.images.yml` when deploying from published images without the source tree:

```bash
mkdir -p ~/wallpaper-nas-panel
cd ~/wallpaper-nas-panel
curl -fsSL \
  -o docker-compose.yml \
  https://raw.githubusercontent.com/ANGJustinl/wallpaper-nas-panel/main/apps/docker-compose.images.yml
```

Create `.env`:

```env
PANEL_WEB_PORT=8080
PANEL_API_PORT=3001
PANEL_DEFAULT_STEAM_ACCOUNT=nas-panel-operator
PANEL_DEFAULT_DOWNLOAD_ROOT=/downloads/431960
PANEL_DEFAULT_METADATA_LANGUAGE=en-US
PANEL_DEFAULT_REQUEST_INTERVAL_MS=1250
PANEL_DEFAULT_AUTO_GENERATE_NFO=true
PANEL_DEFAULT_PROXY_ENABLED=false
PANEL_DEFAULT_PROXY_URL=http://127.0.0.1:7890
```

Start or update:

```bash
docker compose pull
docker compose up -d
```

The default image-only compose file uses:

- `ghcr.io/angjustinl/wallpaper-nas-panel-web:latest`
- `ghcr.io/angjustinl/wallpaper-nas-panel-api:latest`
- `ghcr.io/angjustinl/wallpaper-nas-panel-worker:latest`

Override `PANEL_WEB_IMAGE`, `PANEL_API_IMAGE`, and `PANEL_WORKER_IMAGE` for forked or private packages.

## Deployment Verification

After rebuilding or moving the stack to a NAS, run the smoke check from the repository root:

```bash
./scripts/verify-deploy.sh
```

It verifies that `web`, `api`, and `worker` are running, the web UI is served, API health is OK, worker state is readable, `steamcmd` runtime is available, and the content library endpoint responds.

Useful overrides:

```bash
PANEL_WEB_PORT=8080 PANEL_API_PORT=3001 ./scripts/verify-deploy.sh
API_URL=http://127.0.0.1:3001 WEB_URL=http://127.0.0.1:8080 ./scripts/verify-deploy.sh
REQUIRE_STEAMCMD_AVAILABLE=false ./scripts/verify-deploy.sh
REQUIRE_SUCCESSFUL_TASK=true REQUIRE_LIBRARY_NONEMPTY=true ./scripts/verify-deploy.sh
REQUIRE_LIBRARY_NONEMPTY=true REQUIRE_NFO=true ./scripts/verify-deploy.sh
REQUIRE_LIBRARY_NONEMPTY=true REQUIRE_JELLYFIN_SIDECARS=true ./scripts/verify-deploy.sh
```

## Volumes

- `panel-db`: shared SQLite database.
- `panel-downloads`: synchronized downloader output exposed to the UI as `downloadRoot`.
- `steam-home`: Steam login session and workshop cache shared with the worker.
- `steamcmd-install`: SteamCMD installation volume shared between API runtime checks and the worker.

## Notes

- The API and worker are intentionally split. The API enqueues tasks; the worker claims and executes them.
- The worker uses the `cm2network/steamcmd` base image and runs `steamcmd.sh` from `/home/steam/steamcmd/steamcmd.sh`.
- Successful workshop downloads are synchronized into `downloadRoot/<workshopItemId>` so the configured output directory reflects real files instead of metadata only.
- When `autoGenerateNfo` is enabled, successful downloads and existing library items receive `workshop.nfo`; video items can also receive Jellyfin-friendly `movie.nfo`, `poster.jpg`, and `folder.jpg`.
