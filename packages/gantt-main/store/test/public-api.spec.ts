import { describe, expect, test, vi } from "vitest";

import {
	DataStore,
	defaultColumns,
	defaultEditorItems,
	defaultMenuOptions,
	defaultTaskTypes,
	defaultToolbarButtons,
	getDefaultColumns,
	normalizeZoom,
} from "../src/index";
import { writable } from "./stubs/writable";

describe("public store contract", () => {
	test("keeps the established public helpers and classes", () => {
		expect(DataStore.name).toBe("DataStore");
		expect(defaultColumns).toBeInstanceOf(Array);
		expect(defaultEditorItems).toBeInstanceOf(Array);
		expect(defaultMenuOptions).toBeInstanceOf(Array);
		expect(defaultTaskTypes).toBeInstanceOf(Array);
		expect(defaultToolbarButtons).toBeInstanceOf(Array);
		expect(getDefaultColumns()).toHaveLength(4);
		expect(normalizeZoom).toBeTypeOf("function");
	});

	test("keeps task actions, serialization, and store access compatible", () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const store = new DataStore(writable);
		store.init({
			tasks: [
				{
					id: 1,
					text: "Original",
					parent: 0,
					type: "task",
					start: new Date(2026, 7, 3),
					end: new Date(2026, 7, 5),
				},
			],
			links: [],
			columns: getDefaultColumns(),
			scales: [
				{ unit: "month", step: 1, format: () => "month" },
				{ unit: "day", step: 1, format: () => "day" },
			],
			cellWidth: 100,
			cellHeight: 38,
			scaleHeight: 36,
		});

		store.in.exec("update-task", {
			id: 1,
			task: { text: "Updated" },
		});
		vi.advanceTimersByTime(1);

		expect(store.getTask(1).text).toBe("Updated");
		expect(store.getTaskCalendar(store.getTask(1))).toBeUndefined();
		expect(store.serialize({ data: "tasks" })).toMatchObject([
			{ id: 1, text: "Updated", parent: 0, type: "task" },
		]);
		expect(store.getState().tasks.constructor.name).toBe("GanttDataTree");
		vi.useRealTimers();
	});
});
