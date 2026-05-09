# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build

COPY package.json tsconfig.json ./

# Install devDependencies (typescript, @types/node) for compilation
RUN npm install --include=dev

COPY src ./src

RUN npm run build


# ─── Stage 2: Runner ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Install ffmpeg (includes ffprobe)
RUN apk add --no-cache ffmpeg

# Create a non-root user for Azure Container Apps security
RUN addgroup -S worker && adduser -S worker -G worker

# Create data directories and set ownership
RUN mkdir -p /data/output /data/temp && chown -R worker:worker /data

WORKDIR /app

# Copy compiled output only — no devDependencies, no source
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/package.json ./package.json

# Switch to non-root user
USER worker

# Environment variable defaults (override at runtime)
ENV OUTPUT_DIR=/data/output \
    TEMP_DIR=/data/temp \
    FFMPEG_PATH=ffmpeg \
    FFPROBE_PATH=ffprobe \
    HLS_SEGMENT_DURATION=6 \
    LOG_LEVEL=info \
    SOURCE_BASE_URL="" \
    NODE_ENV=production

# Accept job payload via stdin
ENTRYPOINT ["node", "dist/index.js"]
