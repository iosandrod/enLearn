# Trigger Workflow Gateway

This is a small standalone gateway that lets external projects use Trigger.dev as a workflow engine without knowing Trigger.dev tokens or native API paths.

It is intentionally separate from the Trigger.dev source tree.

## Shape

```text
external project
  -> http://localhost:3030/workflows/:name/start
       gateway adds Authorization internally
  -> http://127.0.0.1:3031/api/v1/tasks/:taskId/trigger
       Trigger.dev webapp / engine
```

The gateway does not expose a generic proxy. Only workflow names configured in `WORKFLOWS` or `WORKFLOW_<NAME>_TASK_ID` can be triggered.

## Start

1. Run Trigger.dev internally on `3031`, for example:

```powershell
$env:PORT="3031"
$env:APP_ORIGIN="http://localhost:3031"
$env:TRIGGER_API_URL="http://localhost:3031"
$env:API_ONLY_MODE="1"
pnpm run dev --filter webapp
```

2. Give the gateway either a `TRIGGER_SECRET_KEY`, or a `DATABASE_URL` so it can find/create one automatically.

3. Configure and start the gateway:

```powershell
Copy-Item .env.example .env
# edit .env
npm run dev
```

or without a `.env` file:

```powershell
$env:GATEWAY_PORT="3030"
$env:TRIGGER_INTERNAL_URL="http://127.0.0.1:3031"
$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/triggerdotdev"
$env:TRIGGER_PROJECT_REF="proj_local_gateway"
$env:WORKFLOWS='{"approval":"approval-workflow"}'
npm run dev
```

For production-style startup, compile first and run the emitted JavaScript:

```powershell
npm run build
npm start
```

## External API

List configured workflows:

```http
GET /workflows
```

Start a workflow:

```http
POST /workflows/approval/start
Content-Type: application/json

{
  "payload": {
    "userId": "u1",
    "amount": 100
  },
  "idempotencyKey": "optional-key",
  "options": {
    "tags": ["source:external"]
  }
}
```

Check a run:

```http
GET /workflows/runs/run_123
```

The external project never receives or sends `TRIGGER_SECRET_KEY`.

## Automatic Bootstrap

When `DATABASE_URL` is set, the gateway will ensure these records exist on startup:

- a local admin user
- an activated organization
- one V3 / V2 project
- a `dev` and `prod` runtime environment

It then uses the selected environment's `apiKey` as the internal `TRIGGER_SECRET_KEY`. This keeps the Trigger.dev source tree unchanged: the original app can start normally on the internal port, while the gateway prepares the key it needs.

Useful variables:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/triggerdotdev
TRIGGER_PROJECT_REF=proj_local_gateway
BOOTSTRAP_USER_EMAIL=gateway@local.dev
BOOTSTRAP_ORG_TITLE=Workflow Engine
BOOTSTRAP_PROJECT_NAME=workflow-engine
BOOTSTRAP_ENVIRONMENT=dev
```

`REDIS_URL` is optional and currently used only by `/health` to show whether Redis is reachable. Trigger.dev stores the project and API keys in Postgres, not Redis.

## Database Bootstrap Script

The standalone TypeScript bootstrap also ensures the selected super-admin has a
Personal Access Token. It is idempotent: existing records and credentials are
decrypted/read instead of rotated.

```powershell
Copy-Item .env.bootstrap.example .env.bootstrap
# Set the Trigger.dev DATABASE_URL and its exact 32-byte ENCRYPTION_KEY.
pnpm run bootstrap -- --env-file .env.bootstrap
```

It can display masked values for diagnostics:

```env
TRIGGER_PROJECT_REF=proj_...
TRIGGER_SECRET_KEY=tr_dev_...
TRIGGER_ACCESS_TOKEN=tr_pat_...
```

The enLearn backend does not use `--output-env`: it now resolves these values
from the Trigger.dev database at runtime and caches them in memory. Console
secrets are masked by default. Use `--show-secrets` only in a trusted terminal,
and use `--dry-run` to run all checks and roll the transaction back.

When `--env-file` is omitted, the script checks `.env.bootstrap`, then the
adjacent `trigger.dev-main/.env`, and only then the gateway `.env`. The selected
file must contain the same `DATABASE_URL` and exact 32-byte `ENCRYPTION_KEY` used
by the running Trigger.dev webapp.

## Notes

- Keep `TRIGGER_INTERNAL_URL` bound to `127.0.0.1` or a private network.
- Keep the workflow whitelist narrow.
- Do not put this gateway on a public network without your own auth, firewall, VPN, or equivalent boundary.
