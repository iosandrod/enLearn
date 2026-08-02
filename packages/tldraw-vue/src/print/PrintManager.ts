import type { Editor } from '@tldraw/editor'
import { BrowserPrintAdapter } from './adapters/BrowserPrintAdapter'
import { BluetoothPrintAdapter } from './adapters/BluetoothPrintAdapter'
import { NetworkPrintAdapter } from './adapters/NetworkPrintAdapter'
import { PrintCancelledError, PrintQueue, throwIfPrintCancelled } from './queue'
import { PrintRenderer } from './renderer'
import { resolvePrintDataSource } from './dataSource'
import type {
	PrintImageInput,
	PrintJobCallbacks,
	PrintJobConfig,
	PrintManagerOptions,
	PrintPageRenderResult,
	PrinterAdapter,
	PrinterConfig,
} from './types'

export class PrintManager {
	private readonly renderer: PrintRenderer
	private readonly queue = new PrintQueue()
	private readonly adapters: Partial<Record<PrinterConfig['type'], PrinterAdapter>>

	constructor(
		editor: Editor,
		options: PrintManagerOptions = {}
	) {
		this.renderer = new PrintRenderer(editor)
		this.adapters = {
			browser: new BrowserPrintAdapter(),
			network: new NetworkPrintAdapter(),
			bluetooth: new BluetoothPrintAdapter(),
			...options.adapters,
		}
	}

	cancel() {
		this.queue.cancel()
	}

	async renderPages(config: PrintJobConfig, callbacks: PrintJobCallbacks = {}) {
		const resolvedConfig = await this.resolveConfig(config)
		validatePrintJobConfig(resolvedConfig)
		const jobs = this.renderer.createRenderJobs(resolvedConfig)
		validatePrintRenderJobs(resolvedConfig, jobs.length)
		const renderedPages: PrintPageRenderResult[] = []

		await this.queue.run(
			jobs,
			async (job, { index, total, signal, isCancelled }) => {
				throwIfPrintCancelled(isCancelled(), signal)
				const page = await this.renderer.renderPage(resolvedConfig, job.row, index, total, {
					materialGridPlan: job.materialGridPlan,
					materialGridPageIndex: job.materialGridPageIndex,
				})
				callbacks.onPageRendered?.(page)
				renderedPages.push(page)
			},
			resolvedConfig.signal
		)

		return renderedPages
	}

	async print(config: PrintJobConfig, callbacks: PrintJobCallbacks = {}) {
		const resolvedConfig = await this.resolveConfig(config)
		validatePrintJobConfig(resolvedConfig)
		const jobs = this.renderer.createRenderJobs(resolvedConfig)
		validatePrintRenderJobs(resolvedConfig, jobs.length)

		const adapter = this.getAdapter(resolvedConfig.printer)
		const copies = Math.max(1, Math.floor(resolvedConfig.page.copies ?? 1))
		const totalPrints = jobs.length * copies
		let printed = 0

		callbacks.onStart?.(totalPrints)

		try {
			await adapter.connect?.()

			if (adapter.printImages) {
				const inputs: PrintImageInput[] = []
				await this.queue.run(
					jobs,
					async (job, { index, total, signal, isCancelled }) => {
						throwIfPrintCancelled(isCancelled(), signal)
						const page = await this.renderer.renderPage(config, job.row, index, total, {
							materialGridPlan: job.materialGridPlan,
							materialGridPageIndex: job.materialGridPageIndex,
						})
						callbacks.onPageRendered?.(page)

						for (let copyIndex = 0; copyIndex < copies; copyIndex++) {
							throwIfPrintCancelled(isCancelled(), signal)
							inputs.push({
								dataUrl: page.dataUrl,
								width: page.width,
								height: page.height,
								pageNo: page.pageNo,
								copyNo: copyIndex + 1,
								row: page.row,
								page: resolvedConfig.page,
								printer: resolvedConfig.printer,
							})
						}
					},
					resolvedConfig.signal
				)

				throwIfPrintCancelled(this.queue.isCancelled, resolvedConfig.signal)
				await adapter.printImages(inputs)
				for (const input of inputs) {
					printed++
					const progress = {
						current: printed,
						total: totalPrints,
						pageNo: input.pageNo,
						copyNo: input.copyNo,
					}
					callbacks.onPagePrinted?.(progress)
					callbacks.onProgress?.(progress)
				}
			} else {
				await this.queue.run(
					jobs,
					async (job, { index, total, signal, isCancelled }) => {
						throwIfPrintCancelled(isCancelled(), signal)
						const page = await this.renderer.renderPage(config, job.row, index, total, {
							materialGridPlan: job.materialGridPlan,
							materialGridPageIndex: job.materialGridPageIndex,
						})
						callbacks.onPageRendered?.(page)

						for (let copyIndex = 0; copyIndex < copies; copyIndex++) {
							throwIfPrintCancelled(isCancelled(), signal)
							await adapter.printImage({
								dataUrl: page.dataUrl,
								width: page.width,
								height: page.height,
								pageNo: page.pageNo,
								copyNo: copyIndex + 1,
								row: page.row,
								page: resolvedConfig.page,
								printer: resolvedConfig.printer,
							})

							printed++
							const progress = {
								current: printed,
								total: totalPrints,
								pageNo: page.pageNo,
								copyNo: copyIndex + 1,
							}
							callbacks.onPagePrinted?.(progress)
							callbacks.onProgress?.(progress)
						}
					},
					resolvedConfig.signal
				)
			}

			callbacks.onComplete?.()
		} catch (error) {
			if (error instanceof PrintCancelledError) {
				callbacks.onCancel?.()
				return
			}

			callbacks.onError?.(error)
			throw error
		} finally {
			await adapter.disconnect?.()
		}
	}

	private getAdapter(printer: PrinterConfig) {
		const adapter = this.adapters[printer.type]
		if (!adapter) throw new Error(`No printer adapter registered for "${printer.type}".`)
		return adapter
	}

	private async resolveConfig(config: PrintJobConfig): Promise<PrintJobConfig> {
		const data = await resolvePrintDataSource(config.dataSource, { signal: config.signal })
		return data ? { ...config, data } : config
	}
}

function validatePrintJobConfig(config: PrintJobConfig) {
	if (config.page.widthMm <= 0 || config.page.heightMm <= 0) {
		throw new Error('Print page widthMm and heightMm must be greater than zero.')
	}
}

function validatePrintRenderJobs(config: PrintJobConfig, jobCount: number) {
	if (jobCount > 0) return
	if (config.template?.materialGrid || config.template?.materialGrids) {
		throw new Error('Material grid print job did not match any material node.')
	}
	throw new Error('Print job data must contain at least one row.')
}
