# Trigger.dev Docker Local Runtime

This project uses a local self-hosted Trigger.dev v4 stack for workflow execution.

Trigger.dev requires Redis 6 or newer. Do not point it at the old Redis 3
Windows service; its queue Lua scripts are incompatible.

## Start Trigger.dev

```bash
pnpm triggerdev:up
```

To start Docker and run the legacy CLI bootstrap:

```bash
pnpm triggerdev:up:bootstrap
```

On Windows you can run the same bootstrap through:

```bat
scripts\triggerdev-up-bootstrap.bat
```

The workflow backend no longer needs a bootstrap or Trigger.dev login. It
resolves its dynamic credentials directly from Trigger.dev PostgreSQL.

```bash
pnpm triggerdev:engine
```

On Windows:

```bat
scripts\triggerdev-engine-only.bat
```

The enLearn `.env` only needs the public endpoint:

```env
TRIGGER_API_URL=http://localhost:8030
```

The backend automatically creates/reuses its named Trigger.dev project,
environment key, super-admin, and admin PAT, then caches the three dynamic
credentials for five minutes. `TRIGGER_PROJECT_REF`, `TRIGGER_SECRET_KEY`, and
`TRIGGER_ACCESS_TOKEN` must not be copied into the enLearn env file.

The Trigger.dev webapp is available at:

```text
http://localhost:8030
```

Useful commands:

```bash
pnpm triggerdev:logs
pnpm triggerdev:down
```

## Connect the Workflow API

The workflow backend reads Trigger.dev infrastructure settings from the
Trigger.dev env file:

```env
TRIGGER_API_URL=http://localhost:8030
# Optional when auto-discovery cannot find ../trigger.dev-main/.env:
TRIGGER_ENV_FILE=E:\trigger.dev-main\.env
```

The referenced Trigger.dev env must contain its PostgreSQL `DATABASE_URL` and
the exact fixed 32-byte `ENCRYPTION_KEY`. Those are infrastructure settings,
not generated runtime credentials. `ENCRYPTION_KEY` is necessary because PATs
are encrypted at rest in the Trigger.dev database.

## Register Local Tasks During Development

After signing in to the local Trigger.dev webapp and creating/selecting a project:

```bash
pnpm workflow-api:trigger:dev
```

For a deployed worker image:

```bash
pnpm workflow-api:trigger:deploy
```

The Docker setup in `infra/triggerdev/docker-compose.yml` is based on the official Trigger.dev Docker Compose self-hosting guide. It runs webapp, supervisor, PostgreSQL, Redis, ClickHouse, registry, MinIO, Electric, and s2-lite on the local Docker engine.
