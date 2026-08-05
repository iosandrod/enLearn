import { vi } from "vitest";

class ResizeObserverMock {
	constructor(callback) {
		this.callback = callback;
	}

	observe(target) {
		this.callback([
			{
				target,
				contentRect: {
					width: target.offsetWidth,
					height: target.offsetHeight,
				},
			},
		]);
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
}));
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
