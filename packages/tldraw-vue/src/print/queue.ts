export interface PrintQueueItemContext {
	index: number
	total: number
	signal?: AbortSignal
	isCancelled(): boolean
}

export class PrintQueue {
	private running = false
	private shouldCancel = false

	get isRunning() {
		return this.running
	}

	get isCancelled() {
		return this.shouldCancel
	}

	cancel() {
		this.shouldCancel = true
	}

	async run<T>(
		items: readonly T[],
		worker: (item: T, context: PrintQueueItemContext) => Promise<void>,
		signal?: AbortSignal
	) {
		if (this.running) throw new Error('Print queue is already running.')

		this.running = true
		this.shouldCancel = false

		try {
			for (let index = 0; index < items.length; index++) {
				throwIfPrintCancelled(this.shouldCancel, signal)
				await worker(items[index], {
					index,
					total: items.length,
					signal,
					isCancelled: () => this.shouldCancel,
				})
			}
		} finally {
			this.running = false
		}
	}
}

export function throwIfPrintCancelled(shouldCancel: boolean, signal?: AbortSignal) {
	if (shouldCancel || signal?.aborted) {
		throw new PrintCancelledError()
	}
}

export class PrintCancelledError extends Error {
	constructor() {
		super('Print job was cancelled.')
		this.name = 'PrintCancelledError'
	}
}
