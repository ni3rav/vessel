# @vessel/worker — Audio Transcoding Worker

A stateless Node.js + FFmpeg worker that transcodes an audio file into HLS-segmented
AAC variants (64k / 128k / 192k / 256k) for adaptive bitrate streaming.

---

## How It Works

1. Reads a JSON job payload from **stdin** (or `JOB_PAYLOAD` env var)
2. Builds the source public URL using payload `key` and downloads it to a temp directory
3. Validates the file with `ffprobe` (audio stream + duration check)
4. Transcodes to 4 AAC/HLS bitrate variants with `ffmpeg`
5. Generates a master HLS playlist
6. Uploads all generated HLS files directly to R2
7. Sends callback to backend with `id` + `status` (`ready` or `failed`)
8. Writes a JSON result to **stdout**
9. Cleans up all local files
10. Exits `0` on success, `1` on failure

---

## R2 Output Structure

Presigned uploads land at **`uploads/<user>/<audioId>/<audioId>.<ext>`**.

The worker derives an **output prefix** from that source key (same as the directory holding the original file):

- **Current layout**: `uploads/<user>/<audioId>/<audioId>.<ext>` → prefix `uploads/<user>/<audioId>/`
- **Legacy layout**: `uploads/<user>/<audioId>.<ext>` → prefix `uploads/<user>/<audioId>/`

Artifacts under that prefix:

```
uploads/{user}/{audioId}/
  {audioId}.mp3                     # Original (uploaded from the client / presign path)
  master.m3u8
  64k/
    playlist.m3u8
    segment_000.ts
    segment_001.ts
    ...
  128k/
    playlist.m3u8
    segment_000.ts
    ...
```

Master playlist lines point at **`{bitrate}/playlist.m3u8`** relative to `{audioId}/`. Variant playlists reference segment filenames in the same folder (relative paths).

---

## Example Job Payload

```json
{
  "id": "01HXYZ1234ABCDEF",
  "key": "uploads/user_abc/a1b2c3d4/a1b2c3d4.mp3",
  "filename": "my-podcast-episode.mp3",
  "userid": "user_abc",
  "jobSecret": "generated-per-job-secret"
}
```

All five fields are mandatory. The worker treats payload `key` as the source-of-truth and resolves the HLS output prefix with `deriveOutputPrefixFromSourceKey` (see `src/key-utils.ts`).

---

## Running Locally

### Prerequisites

- Node.js 20+
- `ffmpeg` and `ffprobe` on your `PATH`

### Build

```bash
pnpm build --filter @vessel/worker
```

### Run

```bash
echo '{
  "id": "test-001",
  "key": "uploads/user_abc/a1b2c3d4/a1b2c3d4.mp3",
  "filename": "test.mp3",
  "userid": "user_abc",
  "jobSecret": "generated-per-job-secret"
}' | R2_ACCOUNT_ID=... \
R2_ACCESS_KEY_ID=... \
R2_SECRET_ACCESS_KEY=... \
R2_BUCKET=... \
R2_PUBLIC_BASE_URL=https://dev-media.hivecms.online \
WORKER_CALLBACK_URL=https://your-backend.example.com/api/internal/worker-callback \
WORKER_SECRET=replace-with-worker-secret \
node dist/index.js
```

### Result (stdout)

```json
{
  "id": "test-001",
  "key": "uploads/user_abc/a1b2c3d4/a1b2c3d4.mp3",
  "filename": "test.mp3",
  "userid": "user_abc",
  "success": true,
  "outputDir": "uploads/user_abc/a1b2c3d4",
  "variants": [
    { "bitrate": "64k",  "bitrateKbps": 64,  "outputDir": "...", "playlist": "...", "segments": [...] },
    { "bitrate": "128k", "bitrateKbps": 128, "outputDir": "...", "playlist": "...", "segments": [...] },
    { "bitrate": "192k", "bitrateKbps": 192, "outputDir": "...", "playlist": "...", "segments": [...] },
    { "bitrate": "256k", "bitrateKbps": 256, "outputDir": "...", "playlist": "...", "segments": [...] }
  ],
  "masterPlaylist": "uploads/user_abc/a1b2c3d4/master.m3u8",
  "durationSeconds": 183.4
}
```

### Callback body sent by worker

```json
{
  "id": "test-001",
  "status": "ready",
  "outputDir": "uploads/user_abc/a1b2c3d4",
  "masterPlaylist": "uploads/user_abc/a1b2c3d4/master.m3u8",
  "durationSeconds": 183.4,
  "error": null
}
```

---

## Docker

### Build

```bash
docker build -f apps/worker/Dockerfile -t vessel-worker .
```

Run this command from the repository root so workspace files like `packages/r2`
and root `pnpm` manifests are available to Docker during build.

### Run

```bash
docker run --rm \
  -e R2_ACCOUNT_ID=... \
  -e R2_ACCESS_KEY_ID=... \
  -e R2_SECRET_ACCESS_KEY=... \
  -e R2_BUCKET=... \
  -e R2_PUBLIC_BASE_URL=https://dev-media.hivecms.online \
  -e LOG_LEVEL=debug \
  vessel-worker <<'EOF'
{
  "id": "test-001",
  "key": "uploads/user_abc/a1b2c3d4/a1b2c3d4.mp3",
  "filename": "test.mp3",
  "userid": "user_abc"
}
EOF
```

### Using `JOB_PAYLOAD` env var (alternative to stdin)

```bash
docker run --rm \
  -e R2_ACCOUNT_ID=... \
  -e R2_ACCESS_KEY_ID=... \
  -e R2_SECRET_ACCESS_KEY=... \
  -e R2_BUCKET=... \
  -e R2_PUBLIC_BASE_URL=https://dev-media.hivecms.online \
  -e JOB_PAYLOAD='{"id":"test-001","key":"uploads/user_abc/a1b2c3d4/a1b2c3d4.mp3","filename":"test.mp3","userid":"user_abc"}' \
  vessel-worker
```

---

## Environment Variables

| Variable               | Default        | Description                                     |
| ---------------------- | -------------- | ----------------------------------------------- |
| `OUTPUT_DIR`           | `/data/output` | Local transient output directory                |
| `TEMP_DIR`             | `/data/temp`   | Local transient temp directory                  |
| `FFMPEG_PATH`          | `ffmpeg`       | Path to the `ffmpeg` binary                     |
| `FFPROBE_PATH`         | `ffprobe`      | Path to the `ffprobe` binary                    |
| `HLS_SEGMENT_DURATION` | `6`            | HLS segment duration in seconds                 |
| `LOG_LEVEL`            | `info`         | `debug` \| `info` \| `warn` \| `error`         |
| `R2_ACCOUNT_ID`        | —              | Cloudflare account ID                           |
| `R2_ACCESS_KEY_ID`     | —              | R2 access key ID                                |
| `R2_SECRET_ACCESS_KEY` | —              | R2 secret access key                            |
| `R2_BUCKET`            | —              | Bucket name for source + output objects         |
| `R2_PUBLIC_BASE_URL`   | —              | Public base URL used for source download by key |
| `WORKER_CALLBACK_URL`  | —              | Backend endpoint for worker status callback      |
| `WORKER_SECRET`        | —              | Shared secret sent as `x-worker-secret` header  |
| `JOB_PAYLOAD`          | —              | JSON job payload (alternative to stdin)         |

---

## Accepted Audio Formats

Only MP3 and WAV are accepted.
The source is validated with `ffprobe` before transcoding begins.

---

## R2 Upload Behavior

- Source download uses payload `key` and `R2_PUBLIC_BASE_URL`
- Output upload overwrites existing objects with the same key
- HLS uploads use **`{outputPrefix}/master.m3u8`**, **`{outputPrefix}/{bitrate}k/playlist.m3u8`**, and **`{outputPrefix}/{bitrate}k/segment_*.ts`** (segments sit next to the variant playlist).
