# Build from repository root context:
#   docker build -f apps/worker/Dockerfile -t vessel-worker:latest .

# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /repo

RUN corepack enable

# Copy workspace manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/r2/package.json packages/r2/package.json

# Install only dependencies needed by worker and its workspace deps
RUN pnpm install --frozen-lockfile --filter @vessel/worker...

# Copy sources and build worker (build script also builds @vessel/r2)
COPY apps/worker apps/worker
COPY packages/r2 packages/r2

# Typecheck and then bundle worker into a single runtime file
RUN pnpm --filter @vessel/r2 build
RUN pnpm --filter @vessel/worker exec tsc --noEmit
RUN pnpm dlx esbuild apps/worker/src/index.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --minify \
  --outfile=/prod/dist/index.js


# ─── Stage 2: Runner ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

# Install ffmpeg (includes ffprobe)
RUN apk add --no-cache ffmpeg

# Create a non-root user for Azure Container Apps security
RUN addgroup -S worker && adduser -S worker -G worker

# Create data directories and set ownership
RUN mkdir -p /data/output /data/temp && chown -R worker:worker /data

WORKDIR /app

# Copy only bundled worker output
COPY --from=builder /prod/dist ./dist

# Switch to non-root user
USER worker

# Environment variable defaults (override at runtime)
ENV OUTPUT_DIR=/data/output \
    TEMP_DIR=/data/temp \
    FFMPEG_PATH=ffmpeg \
    FFPROBE_PATH=ffprobe \
    HLS_SEGMENT_DURATION=6 \
    LOG_LEVEL=info \
    NODE_ENV=production

# Accept job payload via stdin
ENTRYPOINT ["node", "dist/index.js"]
