# EnLearn Manufacturing MES Mobile

Hippy + Vue 3 mobile runtime for EnLearn low-code pages.

The Web designer remains in `frontend/`. This project consumes the same page
Schema and service protocol, but renders it with a mobile-native material
registry. It intentionally does not import VXE, Monaco, or the desktop runtime.

## Current scope

- Hippy native and Web preview entry points
- Shared EnLearn page Schema types through type-only imports
- Mobile material registry
- Initial text, container, section, form, toolbar, button-group, detail,
  stat-card, and virtualized grid materials
- Grid row and center-column virtualization, fixed header, fixed left/right
  columns, local sorting, row selection, and row actions
- Data source loading through the existing `/api/service` gateway
- Event/directive support for navigation, messages, data refresh, and service
  invocation
- Sales order page as the default authenticated entry
- Mobile sign-in and account-set selection before protected pages load
- Automatic return to sign-in when the token or active account becomes invalid
- Dynamic permission-aware navigation loaded from `admin.listNavigationRoutes`
- Container, section, tabs, form, virtual grid, detail, stat, tree, modal,
  drawer, and nested overlay rendering
- User-and-account-scoped page/data cache with TTL and bounded eviction
- Opt-in offline form write queue with stable request ids, retry backoff, and
  automatic replay after reconnect
- Native capability bridge contracts for barcode/QR scan, camera, gallery,
  file selection, signed upload, and push-token registration

## Environment

Copy `.env.example` to `.env.local` when the defaults do not fit your setup.
The file is ignored by Git.

```env
ENLEARN_API_BASE_URL=http://127.0.0.1:3002/api
ENLEARN_MOBILE_PAGE_CODE=sales-orders
ENLEARN_MOBILE_ACCESS_TOKEN=
ENLEARN_MOBILE_ACCOUNT_ID=
```

Build-time environment variables are also accepted. Native hosts can pass the
same values as Hippy initialization props: `apiBaseUrl`, `pageCode`,
`accessToken`, and `accountId`.

## Commands

```bash
pnpm --dir mobile-app typecheck
pnpm --dir mobile-app web:dev
pnpm --dir mobile-app web:build
pnpm --dir mobile-app hippy:dev
pnpm --dir mobile-app hippy:build
```

`web:dev` opens the Hippy Web Renderer preview on `http://localhost:3100` and
starts the native debug bundle server on port `38989`.

The built-in 1,000-row virtual-table demo is available at
`http://localhost:3100/?path=/demo/table` and does not require authentication.

`hippy:build` creates vendor and application bundles in `dist/android` and
`dist/ios`. A native Hippy host still needs to embed those bundles. The host
must expose the `EnLearnMES` bridge methods documented below.

## Runtime boundary

Only import shared files with `import type` from
`packages/lowcode-framework/src/types/lowcode.ts`. Importing the desktop
package at runtime would also pull VXE and browser-only materials into the
mobile bundle.

Grid blocks use the virtual table by default. The mobile-only settings below
can tune its fixed-height viewport; use `mobileDisplay: 'card'` to retain the
compact card-list presentation for a specific grid.

```ts
schema: {
  grid: {
    height: 420,
    rowHeight: 48,
    headerHeight: 44,
    overscanRowCount: 6,
    overscanColumnCount: 2,
    columns: [],
  },
}
```

## Offline writes

Read caching is automatic after a successful online load. Form writes remain
online-only unless their data source explicitly opts in:

```json
{
  "key": "workOrders",
  "serviceName": "admin",
  "serviceMethod": "listItems",
  "saveMethod": "saveItem",
  "tableName": "work_orders",
  "offlineWrite": true
}
```

Queued writes are scoped by both authenticated user and account set. They are
cleared on sign-out, expire after seven days, and replay with a stable
`X-Request-Id`. The API gateway deduplicates CRUD writes for ten minutes. Do
not enable offline writes for operations that cannot tolerate delayed replay or
whose conflict policy has not been defined.

## Native host contract

The Hippy host module name is `EnLearnMES`. It should implement promise-based
methods with JSON-serializable inputs and outputs:

| Method | Result |
| --- | --- |
| `scanCode(options)` | `{ value, format?, metadata? }` |
| `capturePhoto(options)` | `{ uri, name?, mimeType?, size?, width?, height? }` |
| `pickImage(options)` | Same asset shape as `capturePhoto` |
| `pickFile(options)` | Same asset shape as `capturePhoto` |
| `uploadFile(options)` | `{ status, message? }`; upload the local URI to the signed URL |
| `getPushToken(options)` | `{ token, provider?, appVersion?, deviceId? }` |

Camera, gallery, file access, barcode scanning, notifications, and network
state require the corresponding Android/iOS permissions. Keep secrets and
storage credentials out of the bundle; uploads use short-lived URLs returned by
the existing `files` service.
