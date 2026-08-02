import type { PrintImageInput, PrinterAdapter } from '../types'

export class BluetoothPrintAdapter implements PrinterAdapter {
	async printImage(_input: PrintImageInput) {
		throw new Error(
			'Bluetooth printing requires a platform-specific transport or vendor SDK adapter. Provide a custom bluetooth PrinterAdapter to PrintManager.'
		)
	}
}
