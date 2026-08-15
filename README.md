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

Run the Redis-backed domain service in a separate terminal:

```bash
pnpm domain-service:dev
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

Workflow actions are handled inside the API gateway and call the workflow
domain services directly. Trigger.dev remains the internal execution engine;
enLearn users do not authenticate with Trigger.dev directly. The backend
resolves the project ref, environment secret, and admin PAT from the Trigger.dev
database and keeps them in an in-process cache.

Start or reuse the local Trigger.dev webapp first, then start the API gateway.
The API dev script also starts the enLearn Trigger.dev worker, so workflow tasks
can run without a second worker terminal:

```bash
cd C:\Users\11516\Desktop\project\trigger.dev-main
pnpm run dev --filter webapp

cd C:\Users\11516\Desktop\project\enLearn
pnpm api:dev
```

Run only the API gateway, without the worker, when you are not testing workflow
execution:

```bash
pnpm --dir api dev:api-only
```

Or start the API gateway and domain service together:

```bash
pnpm services:dev
```

The local Trigger.dev stack requires Redis 6 or newer. The legacy Windows
Redis 3 service is not compatible with Trigger.dev's Lua queue scripts.

Configure the endpoint and runtime project credentials in enLearn or in the
adjacent Trigger.dev env file:

```env
TRIGGER_API_URL=http://localhost:3030
TRIGGER_PROJECT_REF=proj_...
TRIGGER_SECRET_KEY=tr_dev_...
# Optional, for PAT-only status endpoints:
TRIGGER_ACCESS_TOKEN=tr_pat_...
```

Set `TRIGGER_ENV_FILE` when the Trigger.dev env file lives elsewhere. The
backend uses Trigger.dev's API/SDK only and does not connect to Trigger.dev's
PostgreSQL database. Run `pnpm --dir api workflow:trigger:credentials` to verify
environment resolution and the in-process cache without printing secrets.
