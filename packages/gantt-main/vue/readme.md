# Vue 3 Gantt

This workspace is the Vue 3 rendering layer for the existing Gantt domain
packages. It uses the unchanged `@svar-ui/gantt-store` data structures,
actions, and public API, plus `@svar-ui/gantt-data-provider` for REST
integration.

```vue
<script setup>
import { Gantt, Willow } from "@svar-ui/vue-gantt";
import "@svar-ui/vue-gantt/style.css";

const tasks = [
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

Use `yarn start` at the repository root for the Vue demo, `yarn test` for
community-core and Vue compatibility tests, and `yarn build` for all required
packages and the Vue demo.
