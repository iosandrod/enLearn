import type { VueEditorExtension } from '../vueEditorExtensions'
import { barcodeExtension } from './barcode/barcodeExtension'
import { coreExtension } from './coreExtension'
import { echartsExtension } from './echarts/echartsExtension'
import { frameExtension } from './frame/frameExtension'
import { materialExtension } from './material/materialExtension'
import { qrExtension } from './qr/qrExtension'
import { resumeExtension } from './resume/resumeExtension'
import { tableExtension } from './table/tableExtension'

export function getDefaultVueEditorExtensions(): VueEditorExtension[] {
	return [coreExtension, frameExtension, tableExtension, materialExtension].concat(
		resumeExtension,
		qrExtension,
		barcodeExtension,
		echartsExtension
	)
}
