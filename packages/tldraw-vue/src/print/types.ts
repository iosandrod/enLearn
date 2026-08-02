import type { TLShapeId } from '@tldraw/editor'

export type PrintDataRow = Record<string, unknown>

export type PrintDataSourceConfig =
	| { type: 'none' }
	| { type: 'inline'; rows: readonly PrintDataRow[] }
	| { type: 'json'; value: string | unknown; dataPath?: string }
	| { type: 'csv'; value: string; delimiter?: string; header?: boolean }
	| {
			type: 'http'
			url: string
			method?: 'GET' | 'POST' | 'PUT' | 'PATCH'
			headers?: Record<string, string>
			body?: unknown
			dataPath?: string
			requestInit?: RequestInit
	  }
	| ({ type: string } & Record<string, unknown>)

export interface PrintDataSourceResolveContext {
	signal?: AbortSignal
}

export interface PrintDataSourceProvider<Config extends PrintDataSourceConfig = PrintDataSourceConfig> {
	type: Config['type']
	resolve(config: Config, context: PrintDataSourceResolveContext): Promise<readonly PrintDataRow[]> | readonly PrintDataRow[]
}

export interface PrintBounds {
	x: number
	y: number
	w: number
	h: number
}

export interface PrintTemplateConfig {
	shapeIds?: TLShapeId[]
	pageBounds?: PrintBounds
	pxPerMm?: number
	materialGrid?: PrintMaterialGridConfig | PrintMaterialGridInstance
	materialGrids?: PrintMaterialGridCollection
}

export type PrintMaterialGridCollection =
	| readonly PrintMaterialGridConfig[]
	| Record<string, PrintMaterialGridConfig | PrintMaterialGridInstance>

export interface PrintMaterialGridConfig {
	materialId?: TLShapeId
	grid?: PrintMaterialGridInstance
	data?: readonly PrintDataRow[]
	columns?: readonly PrintMaterialGridColumn[]
	headerHeight?: number
	minRowHeight?: number
	fontSize?: number
	lineHeight?: number
	cellPaddingX?: number
	cellPaddingY?: number
	emptyText?: string
}

export type PrintMaterialGridInstance = object

export interface PrintMaterialGridColumn {
	field?: string
	property?: string
	prop?: string
	key?: string
	title?: string
	label?: string
	name?: string
	width?: number | string
	minWidth?: number | string
	renderWidth?: number
	resizeWidth?: number
	visible?: boolean
	type?: string
	formatter?: unknown
}

export interface PrintPageConfig {
	widthMm: number
	heightMm: number
	dpi?: number
	copies?: number
	background?: boolean
	marginMm?: number
}

export interface PrintExportConfig {
	format?: 'png' | 'jpeg' | 'webp'
	pixelRatio?: number
	padding?: number | 'auto'
	quality?: number
}

export type ExpressionMissingValue =
	| 'empty'
	| 'keep'
	| ((expression: string, context: PrintExpressionContext) => string)

export interface PrintExpressionContext {
	row: PrintDataRow
	index: number
	pageNo: number
	total: number
}

export interface PrintExpressionConfig {
	missingValue?: ExpressionMissingValue
	resolvers?: Record<string, (context: PrintExpressionContext) => unknown>
}

export interface BrowserPrinterConfig {
	type: 'browser'
	title?: string
}

export interface BluetoothPrinterConfig {
	type: 'bluetooth'
	deviceId?: string
	protocol?: 'escpos' | 'tspl' | 'zpl' | 'sdk'
}

export interface NetworkPrinterConfig {
	type: 'network'
	host: string
	port?: number
	protocol?: 'escpos' | 'tspl' | 'zpl' | 'http'
	bridgeUrl?: string
	requestInit?: RequestInit
}

export type PrinterConfig = BrowserPrinterConfig | BluetoothPrinterConfig | NetworkPrinterConfig

export interface PrintJobConfig {
	template?: PrintTemplateConfig
	data?: PrintDataRow[]
	dataSource?: PrintDataSourceConfig
	page: PrintPageConfig
	export?: PrintExportConfig
	expression?: PrintExpressionConfig
	printer: PrinterConfig
	signal?: AbortSignal
}

export interface PrintImageInput {
	dataUrl: string
	width: number
	height: number
	pageNo: number
	copyNo: number
	row: PrintDataRow
	page: PrintPageConfig
	printer: PrinterConfig
}

export interface PrinterAdapter {
	connect?(): Promise<void>
	printImage(input: PrintImageInput): Promise<void>
	printImages?(inputs: PrintImageInput[]): Promise<void>
	disconnect?(): Promise<void>
}

export interface PrintPageRenderResult {
	dataUrl: string
	width: number
	height: number
	pageNo: number
	index: number
	row: PrintDataRow
}

export interface PrintProgress {
	current: number
	total: number
	pageNo: number
	copyNo: number
}

export interface PrintJobCallbacks {
	onStart?(total: number): void
	onPageRendered?(page: PrintPageRenderResult): void
	onPagePrinted?(progress: PrintProgress): void
	onProgress?(progress: PrintProgress): void
	onError?(error: unknown, pageNo?: number): void
	onComplete?(): void
	onCancel?(): void
}

export interface PrintManagerOptions {
	adapters?: Partial<Record<PrinterConfig['type'], PrinterAdapter>>
}
