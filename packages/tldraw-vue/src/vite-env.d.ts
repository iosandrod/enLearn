/// <reference types="vite/client" />

declare module 'qrcode' {
	export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

	export interface QrCode {
		modules: {
			size: number
			get(row: number, col: number): boolean
		}
	}

	export function create(
		text: string,
		options?: {
			errorCorrectionLevel?: QrErrorCorrectionLevel
		}
	): QrCode
}
