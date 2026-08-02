import type { NetworkPrinterConfig, PrintImageInput, PrinterAdapter } from '../types'

const DEFAULT_NETWORK_PRINT_BRIDGE_URL = '/api/print/image'

export class NetworkPrintAdapter implements PrinterAdapter {
	async printImage(input: PrintImageInput) {
		if (input.printer.type !== 'network') {
			throw new Error('NetworkPrintAdapter received a non-network printer config.')
		}

		const printer = input.printer
		const response = await fetch(printer.bridgeUrl ?? DEFAULT_NETWORK_PRINT_BRIDGE_URL, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(printer.requestInit?.headers ?? {}),
			},
			...omitRequestBodyOptions(printer.requestInit),
			body: JSON.stringify(createNetworkPrintPayload(input, printer)),
		})

		if (!response.ok) {
			throw new Error(`Network printer request failed with ${response.status}.`)
		}
	}
}

function createNetworkPrintPayload(input: PrintImageInput, printer: NetworkPrinterConfig) {
	return {
		printer: {
			type: printer.type,
			host: printer.host,
			port: printer.port ?? 9100,
			protocol: printer.protocol ?? 'escpos',
		},
		page: input.page,
		pageNo: input.pageNo,
		copyNo: input.copyNo,
		image: {
			dataUrl: input.dataUrl,
			width: input.width,
			height: input.height,
		},
		row: input.row,
	}
}

function omitRequestBodyOptions(requestInit: RequestInit | undefined): RequestInit {
	if (!requestInit) return {}
	const { body: _body, method: _method, headers: _headers, ...rest } = requestInit
	return rest
}
