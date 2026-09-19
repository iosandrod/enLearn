import type { VueEditorExtension } from '../vueEditorExtensions'
import { barcodeExtension } from './barcode/barcodeExtension'
import { coreExtension } from './coreExtension'
import { frameExtension } from './frame/frameExtension'
import { materialExtension } from './material/materialExtension'
import { qrExtension } from './qr/qrExtension'
import { tableExtension } from './table/tableExtension'

export function getDefaultVueEditorExtensions(): VueEditorExtension[] {
	return [coreExtension, frameExtension, tableExtension, materialExtension, qrExtension, barcodeExtension]
}
