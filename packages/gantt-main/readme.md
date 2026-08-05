# SVAR Vue 3 Gantt

This repository contains a Vue 3 and TypeScript Gantt component backed by the
existing SVAR domain packages. The migration preserves `DataStore`,
`GanttDataTree`, task/link/resource structures, action names, the public Gantt
API, and `RestDataProvider` wire contracts.

The superseded Svelte renderer and Svelte demo site have been removed.

## Workspace

- `vue/`: Vue 3 component library and demo
- `store/`: framework-independent Gantt state and scheduling domain
- `provider/`: REST data provider
- `locales/`: Gantt translations
- `docs/`: migration and compatibility notes

## Development

```sh
yarn install
yarn start
```

The development server prints its local URL after startup. The default demo
uses the Vue rendering layer.

## Validation

Run each migration gate independently:

```sh
yarn test
yarn lint
yarn --cwd vue typecheck
yarn build
```

`yarn test` covers the included community store, REST provider contracts, and
Vue public/rendering contracts. `yarn test:upstream` keeps the broader upstream
suite available; tests that import `store/src/pro` require PRO sources that are
not part of this package.

## Vue Usage

```vue
<script setup lang="ts">
import { Gantt, Willow, type ITask } from "@svar-ui/vue-gantt";
import "@svar-ui/vue-gantt/style.css";

const tasks: ITask[] = [
	{
		id: 1,
		text: "Project planning",
		parent: 0,
		type: "task",
		start: new Date(2026, 7, 3),
		end: new Date(2026, 7, 7),
	},
];
</script>

<template>
	<Willow>
		<Gantt :tasks="tasks" :links="[]" />
	</Willow>
</template>
```

See [`docs/vue3-refactor.md`](docs/vue3-refactor.md) for preserved contracts
and migration verification details.
