import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test, vi } from "vitest";
import { DataStore } from "@svar-ui/gantt-store";

import * as publicApi from "../src/index";
import Gantt from "../src/components/Gantt.vue";

const tasks = [
	{
		id: 1,
		text: "Contract task",
		parent: 0,
		type: "task",
		start: new Date(2026, 7, 3),
		end: new Date(2026, 7, 5),
	},
];

describe("Vue Gantt compatibility", () => {
	test("keeps the component-level public exports", () => {
		for (const name of [
			"Gantt",
			"ContextMenu",
			"HeaderMenu",
			"Toolbar",
			"Tooltip",
			"Editor",
			"ResourceLoad",
			"Material",
			"Willow",
			"WillowDark",
		]) {
			expect(publicApi[name], name).toBeDefined();
		}
		expect(publicApi.version).toBe("2.7.1");
	});

	test("exposes the legacy Gantt API over the unchanged DataStore", async () => {
		const init = vi.fn();
		const onupdatetask = vi.fn();
		const wrapper = mount(Gantt, {
			props: {
				tasks,
				links: [],
				init,
				onupdatetask,
			},
		});

		await nextTick();
		expect(init).toHaveBeenCalledTimes(1);

		const api = init.mock.calls[0][0];
		for (const method of [
			"getState",
			"getReactiveState",
			"getStores",
			"exec",
			"setNext",
			"intercept",
			"on",
			"detach",
			"getTable",
			"getTask",
			"getResource",
			"serialize",
			"getHistory",
			"getCalendar",
			"getTaskResources",
			"getResourceTasks",
			"getTaskCalendar",
			"getResourceCalendar",
		]) {
			expect(api[method], method).toBeTypeOf("function");
		}

		expect(api.getStores().data).toBeInstanceOf(DataStore);
		expect(api.getTask(1).text).toBe("Contract task");

		await api.exec("update-task", {
			id: 1,
			task: { text: "Updated through API" },
		});
		await nextTick();
		expect(api.getTask(1).text).toBe("Updated through API");
		expect(onupdatetask).toHaveBeenCalledWith(
			expect.objectContaining({ id: 1 })
		);
		expect(wrapper.find(".wx-gantt").exists()).toBe(true);

		wrapper.unmount();
	});
});
