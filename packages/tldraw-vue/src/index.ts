import './styles.css'

export { default, default as TldrawVue } from './TldrawVue.vue'
export { createVueEditor, type CreateVueEditorOptions } from './editor/createVueEditor'
export { coreExtension } from './editor/extensions/coreExtension'
export { getDefaultVueEditorExtensions } from './editor/extensions/defaultExtensions'
export { frameExtension } from './editor/extensions/frame/frameExtension'
export type { VueFrameShape } from './editor/extensions/frame/vueFrameShape'
export { materialExtension } from './editor/extensions/material/materialExtension'
export type {
	VueMaterialSectionDefinition,
	VueMaterialSectionShape,
	VueMaterialSectionZone,
	VueMaterialShape,
} from './editor/extensions/material/vueMaterialShape'
export { qrExtension } from './editor/extensions/qr/qrExtension'
export type { VueQrErrorCorrectionLevel, VueQrShape } from './editor/extensions/qr/vueQrShape'
export { tableExtension } from './editor/extensions/table/tableExtension'
export type { VueTableColumn, VueTableRow, VueTableShape } from './editor/extensions/table/vueTableShape'
export type { CanvasTool, ResizeHandle, VueGeoShape } from './editor/interactions/types'
export type {
	VueTemplateLoadHandler,
	VueTemplateRecord,
	VueTemplateSaveHandler,
	VueTemplateWorkspaceConfig,
} from './editor/templateStore'
export { useEditor, editorKey } from './vue/editorContext'
export { useEditorValue } from './vue/useEditorValue'
export type { VueBoxShape } from './editor/vueBoxShape'
export type {
	VueArrowShape,
	VueDrawShape,
	VueImageShape,
	VueLineShape,
	VuePoint,
	VueTextShape,
} from './editor/vueDefaultShapes'
export {
	createVueEditorExtensionRegistry,
	getToolbarPlacementGroup,
	isPrimaryToolbarPlacement,
	type VueEditorExtension,
	type VueEditorExtensionRegistry,
	type VueShapeCreateCompleteContext,
	type VueShapeCreateContext,
	type VueShapeCreateDefinition,
	type VueToolbarPlacement,
	type VueToolbarSelection,
	type VueToolbarToolDefinition,
} from './editor/vueEditorExtensions'
export {
	createVueEditorPluginRegistry,
	defineVueEditorPlugin,
	matchesVueEditorShortcut,
	VueEditorPluginHost,
	type VueEditorCommandContext,
	type VueEditorCommandDefinition,
	type VueEditorCommandResult,
	type VueEditorPlugin,
	type VueEditorPluginContext,
	type VueEditorPluginHostOptions,
	type VueEditorPluginRegistry,
	type VueEditorShortcutDefinition,
} from './editor/vuePlugins'
export { historyValidationPlugin } from './plugins/historyValidationPlugin'
export * from './print'
export * from '@tldraw/editor'
