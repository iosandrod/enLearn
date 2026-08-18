import { vi } from "vitest";

class ResizeObserverMock {
	callback: ResizeObserverCallback;

	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
	}

	observe(target: HTMLElement) {
		this.callback([
			{
				target,
				contentRect: {
					width: target.offsetWidth,
					height: target.offsetHeight,
				},
			} as unknown as ResizeObserverEntry,
		], this as unknown as ResizeObserver);
	}
	unobserve() {}
	disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
	beginPath: vi.fn(),
	lineTo: vi.fn(),
	moveTo: vi.fn(),
	stroke: vi.fn(),
	strokeStyle: "",
	translate: vi.fn(),
})) as unknown as HTMLCanvasElement["getContext"];
HTMLCanvasElement.prototype.toDataURL = vi.fn(
	() => "data:image/png;base64,test"
);

Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
	configurable: true,
	get() {
		return 480;
	},
});

Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
	configurable: true,
	get() {
		return 960;
	},
});
