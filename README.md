# Vessel

Upload an MP3/WAV, get adaptive HLS back, play it from a small library UI.

Monorepo (`pnpm`): `apps/web` is the Next.js app + API, `apps/worker` is the FFmpeg job that runs on Azure Container Apps Jobs.

---

## How a track gets processed

1. **Client → R2**  
   Web asks the API for a presigned PUT, uploads the file straight to Cloudflare R2.

2. **Complete**  
   `POST /api/upload/complete` writes a row in Postgres (`processing`) and publishes a message to Azure Service Bus (`transcode-jobs`). We await that publish so Vercel doesn’t freeze the work after the response.

3. **KEDA / ACA Job**  
   Queue depth scales a one-shot worker container. The worker peeks one message, downloads the source from R2, transcodes with ffmpeg into 64/128/192/256k HLS, uploads the playlists + segments next to the original, then callbacks the web app and settles the message.

4. **Callback**  
   Worker hits `POST /api/internal/worker-callback` with `x-worker-secret` + per-job secret. Web flips the row to `ready` or `failed`.

5. **Library**  
   Frontend polls while status is `processing` (usually under ~5 minutes), then plays `master.m3u8` via hls.js. Quality can be switched in the player.

6. **Cleanup cron**  
   A secured cron route drops stale `uploading` / stuck `processing` / `failed` rows so the DB doesn’t fill with garbage. Deleting a track from the UI removes the DB row and the R2 objects (source + HLS).

```
browser ──presign──► R2
   │
   └──complete──► web API ──► Service Bus ──► ACA Job (worker)
                      ▲                         │
                      └──── worker-callback ────┘
                      │
                      └──► Postgres (status)
```

The old diagram is still in `vessel-pipeline.png` if you want a picture; the flow above is what the code actually does now (Service Bus + KEDA instead of spinning ACI from an Azure Function).

---

## Repo layout

| Path | What |
|------|------|
| `apps/web` | Next.js UI, Better Auth (GitHub), Elysia routes under `/api/*` |
| `apps/worker` | One-shot Node + ffmpeg container |
| `packages/r2` | Shared R2 helpers (presign, upload, delete, list) |
| `packages/database` | Drizzle bits shared where needed |

---

## Running locally

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
# fill in DB, R2, GitHub OAuth, Service Bus, WORKER_SECRET, CRON_SECRET
pnpm --filter @vessel/web dev
```

Worker is meant to run in Azure. For a quick local poke you can build the image and run it with the same env as production (`AZURE_SERVICE_BUS_*`, R2, `WORKER_CALLBACK_URL`, `WORKER_SECRET`). It will pull at most one message and exit.

---

## Deploy notes (how I run it)

- **Web** → Vercel  
- **Queue** → Azure Service Bus queue `transcode-jobs`  
- **Worker** → Azure Container Apps Job, event-driven off that queue (KEDA). Image from GHCR (`build-and-push-worker` workflow).  
- **DB** → Postgres (Neon in my setup)  
- **Objects** → R2 bucket, public base URL for playback  

Web and worker must share the same Service Bus connection/queue name and the same `WORKER_SECRET`.

---

## Statuses

`uploading` → `processing` → `ready` (or `failed`)

Library selection and playback are separate: browsing the list won’t interrupt whatever is already playing until you actually start another track (Enter / double-click / next-prev in the dock).
