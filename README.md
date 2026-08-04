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
backend resolves the project ref, environment secret, and admin PAT from the
Trigger.dev database and keeps them in an in-process cache.

Start Redis before starting the workflow service. The default connection is
`redis://127.0.0.1:6379`; override it with `REDIS_URL`.

Start or reuse the local Trigger.dev webapp first, then start the workflow service:

```bash
cd C:\Users\11516\Desktop\project\trigger.dev-main
pnpm run dev --filter webapp

cd C:\Users\11516\Desktop\project\enLearn
pnpm workflow-api:dev
```

Or start the API gateway and all backend microservices together:

```bash
pnpm services:dev
```

The local Trigger.dev stack requires Redis 6 or newer. The legacy Windows
Redis 3 service is not compatible with Trigger.dev's Lua queue scripts.

Only the endpoint belongs in the enLearn `.env`:

```env
TRIGGER_API_URL=http://localhost:3030
```

By default the backend reads `DATABASE_URL` and `ENCRYPTION_KEY` from the
adjacent `../trigger.dev-main/.env`. Set `TRIGGER_ENV_FILE` when that file lives
elsewhere. On first use it creates/reuses the `enlearn-workflow-local` project,
its runtime key, a Trigger.dev super-admin, and that admin's PAT. None of
`TRIGGER_PROJECT_REF`, `TRIGGER_SECRET_KEY`, or `TRIGGER_ACCESS_TOKEN` is written
to the enLearn env file.

`DATABASE_URL` and the fixed 32-byte `ENCRYPTION_KEY` remain Trigger.dev
infrastructure settings. The encryption key is required to decrypt the PAT
stored in Trigger.dev PostgreSQL; it is not one of the dynamic credentials.

Run `pnpm --dir api workflow:trigger:credentials` to verify database resolution
and the in-process cache without printing complete secrets.
