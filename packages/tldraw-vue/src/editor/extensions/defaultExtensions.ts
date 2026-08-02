import type { VueEditorExtension } from '../vueEditorExtensions'
import { coreExtension } from './coreExtension'
import { frameExtension } from './frame/frameExtension'
import { tableExtension } from './table/tableExtension'

export function getDefaultVueEditorExtensions(): VueEditorExtension[] {
	return [coreExtension, frameExtension, tableExtension]
}
