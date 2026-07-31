# Hikari Frontend

This repository keeps the Vue/Vite SPA as the active frontend.

## Run

```bash
pnpm dev
```

Run the Nest API:

```bash
pnpm api:dev
```

Run the Redis-backed domain microservices and workflow microservice in separate
terminals:

```bash
pnpm domain-service:dev
pnpm workflow-api:dev
```

The API defaults to `http://localhost:3002/api/service`. Send all service calls
through this single endpoint:

```json
{
  "serviceName": "payment",
  "serviceMethod": "listPlans",
  "postData": {}
}
```

## Build

```bash
pnpm build
```

The frontend app lives in `frontend/`. Shared content, public assets, and Supabase files stay at the repository root.

## Workflow Engine

`api/src/workflow-service` hosts the workflow microservice. It uses Redis for
gateway-to-service communication and Trigger.dev as the internal workflow
engine. enLearn users do not authenticate with Trigger.dev directly; the
backend stores the engine project ref and secret key in `.env`.

Start Redis before starting the workflow service. The default connection is
`redis://127.0.0.1:6379`; override it with `REDIS_URL`.

Start or reuse the local Trigger.dev webapp first, then bootstrap the engine values:

```bash
cd C:\Users\11516\Desktop\project\trigger.dev-main
pnpm run dev --filter webapp

cd C:\Users\11516\Desktop\project\enLearn
pnpm triggerdev:bootstrap
pnpm workflow-api:dev
```

`pnpm triggerdev:bootstrap` writes these values to `.env` if they are missing or stale:

```env
TRIGGER_API_URL=http://localhost:3030
TRIGGER_PROJECT_REF=proj_...
TRIGGER_SECRET_KEY=tr_dev_...
```

`TRIGGER_ACCESS_TOKEN` is only needed for the old CLI-login bootstrap path and is not required by the backend runtime.
