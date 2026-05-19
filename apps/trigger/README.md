# @vessel/trigger

HTTP-triggered Azure Function (Node.js v4) that starts an Azure Container Apps
Job execution by injecting request payload into an env var (default: `JOB_PAYLOAD`).

## Behavior

- Requires request header `x-trigger-token`
- Requires request header `x-job-secret`
- Accepts JSON body from backend (schema TODO in code)
- Rejects triggers when active execution count reaches `AZURE_MAX_ACTIVE_EXECUTIONS`
- Updates/adds payload env var on the target job container (`JOB_PAYLOAD` by default)
- Starts a new Container Apps Job execution
- Calls backend callback once when container start is successful
- Returns `202 Accepted` on success

## Environment Variables

See `.env.example`:

- `TRIGGER_TOKEN`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`
- `AZURE_CONTAINERAPPS_JOB_NAME`
- `AZURE_CONTAINERAPPS_JOB_CONTAINER_NAME` (optional)
- `PAYLOAD_ENV_VAR_NAME` (optional, default `JOB_PAYLOAD`)
- `AZURE_MAX_ACTIVE_EXECUTIONS` (optional, default `5`)
- `TRIGGER_BACKEND_CALLBACK_URL`

Worker runtime env vars (`R2_*`, callback secrets, ffmpeg config, etc.) should be
configured directly on the ACA Job template as static env vars/secrets. Trigger
injects only per-job dynamic data (`JOB_PAYLOAD`).

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

After job execution start succeeds, the function sends a single callback request to
`TRIGGER_BACKEND_CALLBACK_URL` with:

- Header `x-trigger-token` (same configured trigger token)
- Header `x-job-secret` (forwarded from incoming request)
- JSON body:
  - `jobId`
  - `status` = `processing`
  - `containerGroup` (Container Apps job name)
  - `containerName`
  - `startedAt`

If callback fails (non-2xx or timeout), function returns failure.
