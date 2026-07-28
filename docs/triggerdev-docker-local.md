# Trigger.dev Docker Local Runtime

This project uses a local self-hosted Trigger.dev v4 stack for workflow execution.

## Start Trigger.dev

```bash
pnpm triggerdev:up
```

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
