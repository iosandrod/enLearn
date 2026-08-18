<script setup lang="ts">
import { Grid } from "@svar-ui/vue-grid";
import { locateID } from "@svar-ui/lib-dom";

const props = defineProps<{
	columns: any[];
	data: Record<string, any>[];
	onaction?: (id: string | number, action: string) => void;
	onedit: (id: string | number, column: string | number, value: unknown) => void;
	sizes?: Record<string, number>;
	oninit?: (api: any) => void;
}>();

function onClick(e) {
	const id = locateID(e);
	const action = e.target.dataset.action;
	if (action) e.preventDefault();
	if (id && action && props.onaction) props.onaction(id, action);
}

function init(tApi) {
	if (props.oninit) props.oninit(tApi);
	tApi.on("update-cell", ev => {
		const { id, column, value } = ev;
		props.onedit(id, column, value);
	});
}
</script>

<template>
	<div class="wx-table" @click="onClick">
		<Grid
			:init="init"
			:columns="columns"
			:data="data"
			:select="false"
			:columnStyle="(col: any) =>
				`wx-editor-cell wx-text-${col.align} ${col.id === 'delete' ? 'wx-action' : ''}`"
			:sizes="sizes || {}"
		/>
	</div>
</template>

<style scoped>
.wx-table :deep(.wx-editor-cell),
.wx-table :deep(.wx-editor > .wx-value) {
	display: flex;
	align-items: center;
	background: inherit;
}
.wx-table :deep(.wx-text-center) {
	justify-content: center;
}
.wx-table :deep(.wx-cell:not(:last-child)) {
	border-right-color: transparent;
}
</style>
