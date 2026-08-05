import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";

import App from "../demo/App.vue";

describe("Vue demo composition", () => {
	test("mounts the external toolbar and Gantt under one locale", async () => {
		const wrapper = mount(App, {
			attachTo: document.body,
		});

		await nextTick();
		expect(wrapper.find(".demo-toolbar").exists()).toBe(true);
		expect(wrapper.find(".wx-toolbar").exists()).toBe(true);
		expect(wrapper.find(".wx-gantt").exists()).toBe(true);
		expect(wrapper.find(".wx-scale").exists()).toBe(true);

		wrapper.unmount();
	});
});
