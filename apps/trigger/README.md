# @vessel/trigger

HTTP-triggered Azure Function (Node.js v4) that starts an Azure Container Instance
worker by injecting request payload into a container env var (default: `JOB_PAYLOAD`).

## Behavior

- Requires request header `x-trigger-token`
- Accepts JSON body from backend (schema TODO in code)
- Rejects duplicate active runs if target container group state is `Running`/`Pending`
- Updates/adds payload env var on the target container
- Starts the container group
- Returns `202 Accepted` on success

## Environment Variables

See `.env.example`:

- `TRIGGER_TOKEN`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`
- `AZURE_CONTAINER_GROUP`
- `AZURE_CONTAINER_NAME` (optional)
- `PAYLOAD_ENV_VAR_NAME` (optional, default `JOB_PAYLOAD`)

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
  -d '{
    "id": "job_123",
    "key": "uploads/user_abc/job_123.mp3",
    "filename": "episode.mp3",
    "userid": "user_abc"
  }'
```
