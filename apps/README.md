# Wallpaper Engine Workshop NAS Panel

## Services

- `web`: React + Vite frontend, built to static assets and served by nginx.
- `api`: Node + TypeScript API for workshop search, task queueing, settings, and login state.
- `worker`: dedicated steamcmd-backed downloader worker that consumes queued tasks from the shared SQLite database.

## Docker Compose

1. Copy `.env.example` to `.env` and adjust ports or defaults if needed.
2. From `C:\Users\77139\Downloads\apps`, run:

```bash
docker compose up --build
```

3. Open `http://localhost:8080` by default.

## Volumes

- `panel-db`: shared SQLite database.
- `panel-downloads`: synchronized downloader output exposed to the UI as `downloadRoot`.
- `steam-home`: Steam login session and workshop cache shared with the worker.
- `steamcmd-install`: SteamCMD installation volume shared between API runtime checks and the worker.

## Notes

- The API and worker are intentionally split. The API enqueues tasks; the worker claims and executes them.
- The worker uses the `cm2network/steamcmd` base image and runs `steamcmd.sh` from `/home/steam/steamcmd/steamcmd.sh`.
- Successful workshop downloads are synchronized into `downloadRoot/<workshopItemId>` so the configured output directory reflects real files instead of metadata only.
