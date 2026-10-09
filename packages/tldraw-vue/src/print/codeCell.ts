import { create as createQrCode } from 'qrcode'
import { createBarcodeSvgDataUrl } from '@/editor/extensions/barcode/barcodeSvg'

export type PrintCodeCellType = 'qrCode' | 'barCode'

/** Read the code renderer from the different column schema formats used by grids. */
export function getPrintCodeCellType(column: Record<string, unknown>): PrintCodeCellType | undefined {
	const candidates = [
		column.type,
		column.cellType,
		column.component,
		column.renderer,
		column.render,
		asRecord(column.props)?.type,
		asRecord(column.params)?.type,
	]
	for (const candidate of candidates) {
		const value = String(candidate ?? '').replace(/[._-]/g, '').toLowerCase()
		if (value === 'qrcode') return 'qrCode'
		if (value === 'barcode') return 'barCode'
	}
	return undefined
}

export function getPrintCodeCellValue(row: Record<string, unknown>, field?: string) {
	if (!field) return ''
	return field.split('.').reduce<unknown>((value, key) => asRecord(value)?.[key], row)
}

export function createPrintQrDataUrl(value: unknown) {
	const text = stringifyCodeValue(value) || ' '
	try {
		const qr = createQrCode(text, { errorCorrectionLevel: 'M' })
		const size = qr.modules.size
		let path = ''
		for (let y = 0; y < size; y += 1) {
			for (let x = 0; x < size; x += 1) {
				if (qr.modules.get(y, x)) path += `M${x},${y}h1v1h-1z`
			}
		}
		const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
		return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
	} catch {
		return ''
	}
}

export function createPrintBarcodeDataUrl(value: unknown) {
	try {
		return createBarcodeSvgDataUrl({
			text: stringifyCodeValue(value) || ' ',
			format: 'code128',
			barColor: '#000000',
			background: '#ffffff',
			includeText: true,
			padding: 2,
			w: 240,
			h: 72,
			showBorder: false,
		} as never)
	} catch {
		return ''
	}
}

export function createPrintCodeDataUrl(type: PrintCodeCellType, value: unknown) {
	return type === 'qrCode' ? createPrintQrDataUrl(value) : createPrintBarcodeDataUrl(value)
}

export function stringifyCodeValue(value: unknown) {
	if (value === null || value === undefined) return ''
	if (typeof value === 'object') {
		try { return JSON.stringify(value) } catch { return String(value) }
	}
	return String(value)
}

function asRecord(value: unknown): Record<string, any> | undefined {
	return value && typeof value === 'object' ? value as Record<string, any> : undefined
}
