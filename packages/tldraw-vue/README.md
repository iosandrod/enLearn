# tldraw-vue-phase-one

Vue wrapper around the tldraw editor core.

## Install

```sh
npm install tldraw-vue-phase-one
```

Pro features are published separately:

```sh
npm install tldraw-vue-phase-one-pro
```

## Usage

```ts
import { createApp } from 'vue'
import TldrawVue from 'tldraw-vue-phase-one'
import 'tldraw-vue-phase-one/style.css'

createApp({
	template: '<TldrawVue />',
	components: { TldrawVue },
}).mount('#app')
```

The component fills its parent container, so make sure the parent has an explicit width and height.

```vue
<script setup lang="ts">
import TldrawVue, { defineVueEditorPlugin } from 'tldraw-vue-phase-one'
import 'tldraw-vue-phase-one/style.css'

const historyPlugin = defineVueEditorPlugin({
	id: 'history',
	commands: [
		{
			id: 'history.undo',
			label: 'Undo',
			isEnabled: ({ editor }) => editor.getCanUndo(),
			run: ({ editor }) => editor.undo(),
		},
	],
	shortcuts: [
		{ command: 'history.undo', key: 'z', accel: true },
	],
})

const plugins = [historyPlugin]
</script>

<template>
	<div style="width: 100vw; height: 100vh">
		<TldrawVue :plugins="plugins" />
	</div>
</template>
```

## Exports

- `TldrawVue`: the Vue component.
- `createVueEditor`: lower-level editor factory.
- `getDefaultVueEditorExtensions`: default basic shape and toolbar extension set.
- `createVueEditorExtensionRegistry`: helper for custom extensions.
- `defineVueEditorPlugin`: typed plugin definition helper.
- `createVueEditorPluginRegistry`: plugin validation and aggregation helper.
- `VueEditorPluginHost`: command, shortcut, and lifecycle host.

See `USAGE_API.md` for the complete API and `PLUGIN_DEVELOPMENT_PLAN.md` for the staged package extraction plan.
