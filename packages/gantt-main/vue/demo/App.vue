<script setup lang="ts">
import { ref } from "vue";
import { Globals, Locale } from "@svar-ui/vue-core";
import { en as coreEn } from "@svar-ui/core-locales";
import { en } from "@svar-ui/gantt-locales";
import { Gantt, Toolbar, Willow } from "../src/index";

const api = ref(null);
const words = { ...coreEn, ...en };

const tasks = [
	{
		id: 1,
		text: "Vue 3 migration",
		type: "summary",
		open: true,
		parent: 0,
		start: new Date(2026, 7, 3),
		end: new Date(2026, 7, 15),
		progress: 45,
	},
	{
		id: 2,
		text: "Preserve store contracts",
		type: "task",
		parent: 1,
		start: new Date(2026, 7, 3),
		end: new Date(2026, 7, 7),
		progress: 100,
	},
	{
		id: 3,
		text: "Port the rendering layer",
		type: "task",
		parent: 1,
		start: new Date(2026, 7, 7),
		end: new Date(2026, 7, 12),
		progress: 55,
	},
	{
		id: 4,
		text: "Regression verification",
		type: "task",
		parent: 1,
		start: new Date(2026, 7, 12),
		end: new Date(2026, 7, 15),
		progress: 0,
	},
];

const links = [
	{ id: 1, source: 2, target: 3, type: "e2s" },
	{ id: 2, source: 3, target: 4, type: "e2s" },
];

const scales = [
	{ unit: "month", step: 1, format: "%F %Y" },
	{ unit: "day", step: 1, format: "%j" },
];
</script>

<template>
	<Locale :words="words">
		<Globals>
			<Willow>
				<div class="demo-shell">
					<header class="demo-toolbar">
						<strong>Vue 3 Gantt</strong>
						<Toolbar :api="api" />
					</header>
					<main>
						<Gantt
							:tasks="tasks"
							:links="links"
							:scales="scales"
							:init="value => (api = value)"
						/>
					</main>
				</div>
			</Willow>
		</Globals>
	</Locale>
</template>

<style>
html,
body,
#app {
	width: 100%;
	height: 100%;
	margin: 0;
}

* {
	box-sizing: border-box;
}

.demo-shell {
	display: flex;
	flex-direction: column;
	width: 100%;
	height: 100%;
	min-width: 320px;
	background: var(--wx-background);
}

.demo-toolbar {
	display: flex;
	align-items: center;
	min-height: 48px;
	padding: 0 16px;
	border-bottom: var(--wx-border);
}

.demo-toolbar strong {
	flex: 0 0 auto;
	margin-right: 16px;
	font: var(--wx-font-weight-md) var(--wx-font-size) var(--wx-font-family);
	color: var(--wx-color-font);
}

.demo-toolbar .wx-toolbar {
	min-width: 0;
	overflow: hidden;
}

main {
	min-height: 0;
	flex: 1 1 auto;
}
</style>
