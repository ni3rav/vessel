# @vessel/worker — Audio Transcoding Worker

A stateless Node.js + FFmpeg worker that transcodes an audio file into HLS-segmented
AAC variants (64k / 128k / 192k / 256k) for adaptive bitrate streaming.

---

## How It Works

1. Reads a JSON job payload from **stdin** (or `JOB_PAYLOAD` env var)
2. Downloads the source audio file to a temp directory
3. Validates the file with `ffprobe` (audio stream + duration check)
4. Transcodes to 4 AAC/HLS bitrate variants with `ffmpeg`
5. Generates a master HLS playlist
6. Writes a JSON result to **stdout**
7. Cleans up all temp files
8. Exits `0` on success, `1` on failure

---

## Output Structure

```
/data/output/{audioId}/
  master.m3u8          ← master playlist (adaptive bitrate)
  64k/
    playlist.m3u8
    segment_000.ts
    segment_001.ts
    ...
  128k/
    playlist.m3u8
    segment_000.ts
    ...
  192k/
    playlist.m3u8
    ...
  256k/
    playlist.m3u8
    ...
```

---

## Example Job Payload

```json
{
  "id": "01HXYZ1234ABCDEF",
  "key": "uploads/user_abc/01HXYZ1234ABCDEF.mp3",
  "filename": "my-podcast-episode.mp3",
  "userid": "user_abc"
}
```

All four fields are mandatory. The worker constructs the download URL internally as
`SOURCE_BASE_URL/key`.

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
  "key": "uploads/user_abc/test-001.mp3",
  "filename": "test.mp3",
  "userid": "user_abc"
}' | OUTPUT_DIR=./output TEMP_DIR=./temp SOURCE_BASE_URL=https://pub-xxxx.r2.dev node dist/index.js
```

### Result (stdout)

```json
{
  "id": "test-001",
  "key": "uploads/user_abc/test-001.mp3",
  "filename": "test.mp3",
  "userid": "user_abc",
  "success": true,
  "outputDir": "./output/test-001",
  "variants": [
    { "bitrate": "64k",  "bitrateKbps": 64,  "outputDir": "...", "playlist": "...", "segments": [...] },
    { "bitrate": "128k", "bitrateKbps": 128, "outputDir": "...", "playlist": "...", "segments": [...] },
    { "bitrate": "192k", "bitrateKbps": 192, "outputDir": "...", "playlist": "...", "segments": [...] },
    { "bitrate": "256k", "bitrateKbps": 256, "outputDir": "...", "playlist": "...", "segments": [...] }
  ],
  "masterPlaylist": "./output/test-001/master.m3u8",
  "durationSeconds": 183.4
}
```

---

## Docker

### Build

```bash
docker build -t vessel-worker ./apps/worker
```

### Run

```bash
docker run --rm \
  -v $(pwd)/output:/data/output \
  -e SOURCE_BASE_URL=https://pub-xxxx.r2.dev \
  -e LOG_LEVEL=debug \
  vessel-worker <<'EOF'
{
  "id": "test-001",
  "key": "uploads/user_abc/test-001.mp3",
  "filename": "test.mp3",
  "userid": "user_abc"
}
EOF
```

### Using `JOB_PAYLOAD` env var (alternative to stdin)

```bash
docker run --rm \
  -v $(pwd)/output:/data/output \
  -e SOURCE_BASE_URL=https://pub-xxxx.r2.dev \
  -e JOB_PAYLOAD='{"id":"test-001","key":"uploads/user_abc/test-001.mp3","filename":"test.mp3","userid":"user_abc"}' \
  vessel-worker
```

---

## Environment Variables

| Variable               | Default        | Description                              |
| ---------------------- | -------------- | ---------------------------------------- |
| `OUTPUT_DIR`           | `/data/output` | Root directory for HLS output            |
| `TEMP_DIR`             | `/data/temp`   | Temp directory for source file download  |
| `FFMPEG_PATH`          | `ffmpeg`       | Path to the `ffmpeg` binary              |
| `FFPROBE_PATH`         | `ffprobe`      | Path to the `ffprobe` binary             |
| `HLS_SEGMENT_DURATION` | `6`            | HLS segment duration in seconds          |
| `LOG_LEVEL`            | `info`         | `debug` \| `info` \| `warn` \| `error`  |
| `SOURCE_BASE_URL`      | —              | Base URL of the R2 public bucket         |
| `JOB_PAYLOAD`          | —              | JSON job payload (alternative to stdin)  |

---

## Accepted Audio Formats

Any format `ffmpeg` can decode as audio (MP3, WAV, AAC, FLAC, OGG, M4A, etc.).
The source is validated with `ffprobe` before transcoding begins.

---

## Adding Cloud Storage (Later)

The worker currently writes output to the local filesystem. To add R2 (or Azure Blob)
uploads, add a post-processing step in `src/job.ts` after `generateMasterPlaylist()`
using the `@vessel/r2` package. The rest of the pipeline is unchanged.
