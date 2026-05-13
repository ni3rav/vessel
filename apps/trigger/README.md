# @vessel/trigger

HTTP-triggered Azure Function (Node.js v4) that starts an Azure Container Instance
worker by injecting request payload into a container env var (default: `JOB_PAYLOAD`).

## Behavior

- Requires request header `x-trigger-token`
- Requires request header `x-job-secret`
- Accepts JSON body from backend (schema TODO in code)
- Rejects duplicate active runs if target container group state is `Running`/`Pending`
- Updates/adds payload env var on the target container
- Starts the container group
- Calls backend callback once when container start is successful
- Returns `202 Accepted` on success

## Environment Variables

See `.env.example`:

- `TRIGGER_TOKEN`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`
- `AZURE_CONTAINER_GROUP`
- `AZURE_CONTAINER_NAME` (optional)
- `PAYLOAD_ENV_VAR_NAME` (optional, default `JOB_PAYLOAD`)
- `TRIGGER_BACKEND_CALLBACK_URL`
- worker passthrough vars: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`, `SOURCE_BASE_URL`, `WORKER_CALLBACK_URL`, `WORKER_SECRET`, `OUTPUT_DIR`, `TEMP_DIR`, `FFMPEG_PATH`, `FFPROBE_PATH`, `HLS_SEGMENT_DURATION`, `LOG_LEVEL`
- `AZURE_IMAGE_REGISTRY_SERVER` (optional fallback)
- `AZURE_IMAGE_REGISTRY_USERNAME` (optional fallback)
- `AZURE_IMAGE_REGISTRY_PASSWORD` (optional fallback)

On each trigger call, these worker passthrough vars are upserted into the target
worker container environment, alongside `JOB_PAYLOAD`.

If your ACI group uses private image registry credentials, ARM `GET` may hide
the password. During `createOrUpdate`, set the fallback registry env vars above
so the trigger can re-send valid credentials.

## Run Locally

Requires Azure Functions Core Tools.

### Why `AzureWebJobsStorage` is required

Azure Functions runtime depends on a storage backend for host/runtime internals
(for example locks and host state), even for HTTP-triggered functions.
If `AzureWebJobsStorage` is missing, the app may start but host health will be
reported as unhealthy.

For local development, set:

```json
"AzureWebJobsStorage": "UseDevelopmentStorage=true"
```

and run Azurite in a separate terminal:

```bash
npx azurite --silent --location .azurite --debug .azurite/debug.log
```

```bash
pnpm --filter @vessel/trigger build
pnpm --filter @vessel/trigger start
```

## Example Request

```bash
curl -X POST "http://localhost:7071/api/trigger-worker" \
  -H "content-type: application/json" \
  -H "x-trigger-token: <your-secret>" \
  -H "x-job-secret: <per-job-secret-from-backend>" \
  -d '{
    "id": "job_123",
    "key": "uploads/user_abc/job_123.mp3",
    "filename": "episode.mp3",
    "userid": "user_abc"
  }'
```

## Callback Behavior

After ACI start succeeds, the function sends a single callback request to
`TRIGGER_BACKEND_CALLBACK_URL` with:

- Header `x-trigger-token` (same configured trigger token)
- Header `x-job-secret` (forwarded from incoming request)
- JSON body:
  - `jobId`
  - `status` = `processing`
  - `containerGroup`
  - `containerName`
  - `startedAt`

If callback fails (non-2xx or timeout), function returns failure.
