<script setup lang="ts">
import { computed } from "vue";
import { DatePicker, TimePicker } from "@svar-ui/vue-core";

const props = defineProps<{
	value: Date;
	time?: boolean;
	format?: string | ((value: Date) => string);
	onchange?: (event: { value: Date }) => void;
}>();

const restProps = computed(() => {
	const rest = { ...props };
	delete rest.value;
	delete rest.time;
	delete rest.format;
	delete rest.onchange;
	return rest;
});

function handleDateChange(ev) {
	const current = new Date(ev.value);
	current.setHours(props.value.getHours());
	current.setMinutes(props.value.getMinutes());

	props.onchange?.({ value: current });
}
</script>

<template>
	<div class="date-time-controll">
		<DatePicker
			v-bind="restProps"
			:value="value"
			:onchange="handleDateChange"
			:format="format"
			:buttons="['today']"
			:clear="false"
		/>
		<TimePicker v-if="time" :value="value" :onchange="onchange" :format="format" />
	</div>
</template>

<style scoped>
.date-time-controll {
	display: flex;
	gap: 12px;
}
</style>
