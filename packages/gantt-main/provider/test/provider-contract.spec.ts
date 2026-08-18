import { describe, expect, test } from "vitest";

import { RestDataProvider } from "../src/index";

class RecordingProvider extends RestDataProvider {
	requests: Array<{ url: string; method: string; data?: any }> = [];

	async sendBatch<T>(url: string, method: string, data?: any): Promise<T> {
		this.requests.push({ url, method, data });
		return { id: 99 } as T;
	}
}

describe("REST provider contract", () => {
	test("keeps action names and task routes stable", async () => {
		const provider = new RecordingProvider("/api");
		const handlers = provider.getHandlers() as Record<string, any>;

		expect(Object.keys(handlers).sort()).toEqual(
			[
				"add-assignment",
				"add-link",
				"add-task",
				"copy-task",
				"delete-assignment",
				"delete-link",
				"delete-task",
				"move-task",
				"update-assignment",
				"update-link",
				"update-task",
			].sort()
		);

		await handlers["add-task"].handler({
			task: { id: 1, text: "Task", parent: 0 },
			mode: "after",
			target: 2,
		});
		await handlers["update-task"].handler({
			id: 1,
			task: { text: "Updated", data: [{ id: 2 }] },
		});

		expect(provider.requests).toEqual([
			{
				url: "tasks",
				method: "POST",
				data: {
					task: { id: 1, text: "Task", parent: 0 },
					mode: "after",
					target: 2,
				},
			},
			{
				url: "tasks/1",
				method: "PUT",
				data: { text: "Updated" },
			},
		]);
	});

	test("keeps date parsing and wire formatting stable", () => {
		const provider = new RecordingProvider("/api");
		const [task] = provider.parseDates([
			{
				id: 1,
				start: "2026-08-03T00:00:00.000Z" as any,
				end: "2026-08-05T00:00:00.000Z" as any,
			},
		]);

		expect(task.start).toBeInstanceOf(Date);
		expect(task.end).toBeInstanceOf(Date);
		expect(provider.formatDate(new Date(2026, 7, 3, 9, 8, 7))).toBe(
			"2026-08-03 09:08:07"
		);
	});
});
