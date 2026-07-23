# Hikari Nuxt

This repository keeps the Nuxt 3 app as the active frontend.

## Run

```bash
pnpm dev
```

Run the Nest API:

```bash
pnpm api:dev
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

The Nuxt app lives in `nuxt-app/`. Shared content, public assets, and Supabase files stay at the repository root.
