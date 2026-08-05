# Vue 3 refactor boundaries

The refactor replaces the rendering workspace while preserving the existing
domain layer.

## Preserved contracts

- `store/src/DataStore.ts` remains the state and action authority.
- `store/src/GanttDataTree.ts` remains the task hierarchy implementation.
- `ITask`, `ILink`, `IResource`, `IAssignment`, `IConfig`, `IApi`, and
  `TMethodsConfig` keep their current shapes and names.
- Action names such as `add-task`, `update-task`, `move-task`, and `add-link`
  are unchanged.
- `provider/src/RestDataProvider.ts` keeps the existing REST routes and payloads.

## Migration stages

1. Establish the community-core and provider test baseline. Completed with 26
   store/provider tests.
2. Add the Vue 3 workspace and bind it to the existing store/event bus.
   Completed without changing `store/src` or `provider/src`.
3. Verify the Vue public API and rendering contract. Completed with three Vue
   tests, Vue type checking, linting, and production builds.
4. Verify the real browser layout at desktop and compact mobile widths. The
   demo is exercised at 1440 x 900 and 390 x 844 viewports.
5. Remove the superseded Svelte renderer and Svelte site after the Vue and
   contract suites pass.

## Commands

- `yarn start` builds the domain packages and starts the Vue demo.
- `yarn test` runs the community store/provider and Vue migration suites.
- `yarn lint` checks the preserved core and the new Vue workspace.
- `yarn --cwd vue typecheck` validates the Vue package declarations.
- `yarn build` creates the store, provider, Vue library, and Vue demo builds.

The upstream checkout includes tests for PRO modules that are not present in
this source package (`store/src/pro`). Those tests remain available through
`yarn test:upstream`; the default `yarn test` runs the included community core,
provider, and Vue 3 compatibility suites.
