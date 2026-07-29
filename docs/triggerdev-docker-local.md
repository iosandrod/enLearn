# Trigger.dev Docker Local Runtime

This project uses a local self-hosted Trigger.dev v4 stack for workflow execution.

## Start Trigger.dev

```bash
pnpm triggerdev:up
```

To start Docker and automatically write the Trigger.dev project values into the repo `.env`:

```bash
pnpm triggerdev:up:bootstrap
```

On Windows you can run the same bootstrap through:

```bat
scripts\triggerdev-up-bootstrap.bat
```

If the project and development secret are already present in `.env`, the backend-only mode does not require a Trigger.dev login:

```bash
pnpm triggerdev:engine
```

On Windows:

```bat
scripts\triggerdev-engine-only.bat
```

Engine-only mode requires these runtime values to already exist:

```env
TRIGGER_API_URL=http://localhost:8030
TRIGGER_PROJECT_REF=proj_...
TRIGGER_SECRET_KEY=tr_dev_...
```

`TRIGGER_ACCESS_TOKEN` is optional for the backend runtime. It is only needed for management operations such as creating projects, reading environment keys, deploying tasks, or starting the local Trigger CLI worker.

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

The workflow backend reads Trigger.dev settings from the repo `.env` file:

```env
TRIGGER_API_URL=http://localhost:8030
TRIGGER_PROJECT_REF=<project-ref-from-triggerdev>
TRIGGER_SECRET_KEY=<dev-or-prod-secret-key-from-triggerdev>
```

These values can be resolved automatically after Docker is healthy:

```bash
pnpm triggerdev:bootstrap
```

The bootstrap script reuses a valid `TRIGGER_ACCESS_TOKEN` from `.env`, the current environment, or the Trigger.dev CLI profile. If none exists yet, it starts `trigger login --no-browser`; complete the printed login URL once, then the script continues and saves the token for future runs.

When `TRIGGER_SECRET_KEY` is set, `services/workflow-api` triggers `workflow.instance.run` through Trigger.dev. Without it, the service can only run through its explicit local fallback mode.

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
