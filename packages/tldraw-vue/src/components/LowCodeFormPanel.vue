<script setup lang="ts">
import LowCodeForm from '@enlearn/lowcode-framework/components/low-code-form'
import { useLowCodeHost } from '@enlearn/lowcode-framework/core/host'
import {
	$$formDesigner,
	createLowCodeFormSchemaFromDesignerResult,
	type FormDesignerResult,
} from '@enlearn/lowcode-framework/visual-editor/components/form-designer/form-designer.service'
import {
	createFormDesignerFieldsFromSchema,
	mergeRuntimeFormSchema,
} from '@enlearn/lowcode-framework/lowcode/block-materials/runtime-form-designer'
import {
	colorOptions,
	dashOptions,
	fillOptions,
	geoOptions,
	sizeOptions,
} from '@/editor/shapeProps/options'
import { baseProps } from '@/editor/shapeProps/base'
import { vueBoxPropertyRegistry } from '@/editor/shapeProps/vueBox'
import type {
	LowCodeField,
	LowCodeFormSchema,
	LowCodeOption,
} from '@enlearn/lowcode-framework/types/lowcode'
import { isShapeId, type Editor, type TLShape, type TLShapePartial } from '@tldraw/editor'
import { computed, onMounted, ref, watch } from 'vue'
import {
	getVueMaterialSectionHeightModel,
	getVueMaterialVisibilityModel,
	getVueMaterialSections,
	normalizeVueMaterialSections,
	updateVueMaterialShapeLayout,
	type VueMaterialShape,
} from '@/editor/extensions/material/vueMaterialShape'
import { getEditorPrintDataSource } from '@/editor/workspaceDataSource'
import {
	getMaterialDataSourceFieldOptions,
	getMaterialDataSourceFieldOptionsKey,
} from '@/editor/materialDataSourceFields'
import {
	getVueResumeSectionDefinition,
	normalizeVueResumeSections,
} from '@/editor/extensions/resume/vueResumeShape'
import type { VueTemplateWorkspaceConfig } from '@/editor/templateStore'
import type { PrintDataSourceConfig } from '@/print/types'
import { useEditorValue } from '@/vue/useEditorValue'
import { DEFAULT_PX_PER_MM } from '@/editor/interactions/WorkspaceBoundsManager'

type ShapeFormModel = Record<string, unknown>

type ShapeFormDescriptor = {
	title: string
	formCode: string
	schema: LowCodeFormSchema
	toModel(shape: TLShape): ShapeFormModel
	apply(editor: Editor, shape: TLShape, model: ShapeFormModel): void
}

const props = withDefaults(
	defineProps<{
		editor: Editor
		workspaceRevision?: number
		getWorkspaceTemplateConfig?: () => VueTemplateWorkspaceConfig | undefined
		applyWorkspaceTemplateConfig?: (config: VueTemplateWorkspaceConfig) => void
	}>(),
	{
		workspaceRevision: 0,
	}
)

const formModel = ref<ShapeFormModel>({})
let skipNextMultiModelChange = false
let previousMultiFormModel: ShapeFormModel = {}
const formDefinitions = ref<Record<string, LowCodeFormSchema>>({})
const formDefinitionsLoading = ref(true)
const formDefinitionError = ref('')
const formDefinitionIds = ref<Record<string, string>>({})
const imageSourceError = ref('')
const designingForm = ref(false)
const designFormMessage = ref('')
const host = useLowCodeHost()
const editorPrintDataSource = getEditorPrintDataSource(props.editor)
const imageSourceCache = new Map<string, { src: string }>()
const imageSourceRequests = new Map<string, Promise<{ src: string }>>()

const selectedShapeIds = useEditorValue('lowcode form selected shape ids', () =>
	props.editor.getSelectedShapeIds()
)
const selectedShape = useEditorValue('lowcode form selected shape', () => {
	const ids = props.editor.getSelectedShapeIds()
	if (ids.length !== 1) return null
	return props.editor.getShape(ids[0]) ?? null
})
const selectedShapes = computed(() =>
	selectedShapeIds.value
		.map((id) => props.editor.getShape(id))
		.filter((shape): shape is TLShape => Boolean(shape))
)
const multiSelectedShapeType = computed(() => {
	if (selectedShapes.value.length < 2) return null
	const type = selectedShapes.value[0].type
	return selectedShapes.value.every((shape) => shape.type === type) ? type : null
})
const workspaceCamera = useEditorValue('lowcode form workspace camera', () => props.editor.getCamera())
const uploadedImageShapeKeys = useEditorValue('uploaded image shape keys', () =>
	props.editor.getCurrentPageShapes()
		.filter((shape) => shape.type === 'vue-image')
		.map((shape) => {
			const shapeProps = getProps(shape)
			const persistedFileId = readImageFileId(shapeProps.fileId)
			const legacyFileId = readImageFileId(shapeProps.src)
			return `${shape.id}:${persistedFileId || (isFileObjectId(legacyFileId) ? legacyFileId : '')}`
		})
		.join('|')
)

const isCanvasFormActive = computed(() => selectedShapeIds.value.length === 0)
const isMultiShapeFormActive = computed(() => multiSelectedShapeType.value !== null)
const activeDescriptor = computed(() =>
	selectedShape.value
		? getShapeFormDescriptor(selectedShape.value.type)
		: multiSelectedShapeType.value
			? getShapeFormDescriptor(multiSelectedShapeType.value)
			: null
)
const activeFormCode = computed(() =>
	isCanvasFormActive.value ? workspaceFormDescriptor.formCode : activeDescriptor.value?.formCode ?? null
)
const materialDataSourceFieldOptions = computed(() =>
	getMaterialDataSourceFieldOptions(editorPrintDataSource.value)
)
const activeSchema = computed(() => {
	const code = activeFormCode.value
	const schema = code ? formDefinitions.value[code] ?? null : null
	if (!schema || activeFormCode.value !== propertyFormCode('vue-material')) return schema

	return {
		...schema,
		fields: schema.fields.map((field) =>
			field.field === 'dataSourceField'
				? {
					...field,
					component: 'vxe-select',
					options: materialDataSourceFieldOptions.value,
					props: { ...(field.props ?? {}), clearable: false },
				}
				: field
		),
	}
})
const imagePropertySchema = computed(() =>
	formDefinitions.value[propertyFormCode('vue-image')] ?? null
)
const panelTitle = computed(() => {
	if (isCanvasFormActive.value) return workspaceFormDescriptor.title
	if (isMultiShapeFormActive.value) return `${activeDescriptor.value?.title ?? '节点'} · 批量属性`
	if (selectedShapeIds.value.length > 1) return '多选属性'
	return activeDescriptor.value?.title ?? '未知节点'
})
const panelSubtitle = computed(() => {
	if (isCanvasFormActive.value) {
		return selectedShapeIds.value.length > 1
			? `当前画布 · 已选择 ${selectedShapeIds.value.length} 个节点`
			: '当前画布 · 未选中节点'
	}
	const shape = selectedShape.value
	if (!shape) {
		return selectedShapeIds.value.length > 1
			? `已选择 ${selectedShapeIds.value.length} 个节点`
			: '请选择单个节点'
	}
	return `${getShapeTypeLabel(shape.type)} · ${shape.id}`
})
const emptyMessage = computed(() => {
	if (selectedShapeIds.value.length > 1 && !isMultiShapeFormActive.value) {
		return '当前选择的节点类型不同，无法批量编辑属性'
	}
	if (!activeDescriptor.value && !isCanvasFormActive.value) return '当前节点类型暂未配置表单'
	if (!formDefinitionsLoading.value && !formDefinitionError.value && !activeSchema.value) {
		return `未找到属性表单：${activeFormCode.value ?? '未知表单'}`
	}
	return ''
})
const formKey = computed(() => {
	let key = 'empty'
	if (isCanvasFormActive.value) key = 'workspace'
	const shape = selectedShape.value
	if (shape) key = `${shape.id}:${shape.type}`
	else if (isMultiShapeFormActive.value) {
		key = `multi:${multiSelectedShapeType.value}:${selectedShapeIds.value.join(',')}`
	}
	if (activeFormCode.value === propertyFormCode('vue-material')) {
		return `${key}:data-source:${getMaterialDataSourceFieldOptionsKey(materialDataSourceFieldOptions.value)}`
	}
	return key
})

const designSchema = computed(() => {
	const code = activeFormCode.value
	return code ? formDefinitions.value[code] ?? null : null
})
const canDesignForm = computed(() => {
	const code = activeFormCode.value
	return Boolean(
		code &&
		designSchema.value &&
		formDefinitionIds.value[code] &&
		!formDefinitionsLoading.value &&
		!designingForm.value &&
		!props.editor.getIsReadonly(),
	)
})

async function handleDesignForm() {
	const code = activeFormCode.value
	const originalSchema = designSchema.value
	const id = code ? formDefinitionIds.value[code] : ''
	if (!code || !originalSchema || !id || designingForm.value) return

	designingForm.value = true
	designFormMessage.value = '正在打开表单设计器…'
	try {
		const saved = await new Promise<boolean>((resolve, reject) => {
			let obj={
				title: `设计表单 - ${panelTitle.value}`,
				mode: 'edit',
				fields: createFormDesignerFieldsFromSchema(originalSchema),
				layout: originalSchema.layout,
				columns: originalSchema.columns,
				serviceApi: host.getServiceApi(),
				onCancel: () => resolve(false),
				onConfirm: async (result: FormDesignerResult) => {
					try {
						const designedSchema = createLowCodeFormSchemaFromDesignerResult(result)
						const schema = mergeRuntimeFormSchema(originalSchema, designedSchema, result.fields)
						await host.getServiceApi().invoke('lowcode', 'saveItem', {
							resource: 'lowcode_form_definitions',
							id,
							data: { schema },
						})
						await loadPropertyFormDefinitions()
						resolve(true)
					} catch (error) {
						reject(error)
					}
				},
			}
			void $$formDesigner(obj as any)//
		})
		designFormMessage.value = saved ? '表单配置已保存。' : '已取消表单设计。'
	} catch (error) {
		designFormMessage.value = error instanceof Error ? error.message : '表单配置保存失败。'
	} finally {
		designingForm.value = false
	}
}

function handleModelUpdate(value: ShapeFormModel) {
	if (isCanvasFormActive.value) {
		formModel.value = value
		if (!props.editor.getIsReadonly()) {
			applyWorkspaceFormModel(value)
		}
		return
	}

	if (isMultiShapeFormActive.value) {
		formModel.value = value
		return
	}

	const shape = selectedShape.value
	const modelShapeId = typeof value.shapeId === 'string' ? value.shapeId : ''
	if (!shape || modelShapeId !== shape.id) return

	formModel.value = value

	const descriptor = activeDescriptor.value
	if (!descriptor || props.editor.getIsReadonly()) return

	descriptor.apply(props.editor, shape, value)
	if (shape.type === 'vue-image' && usesUploadedImageSource(activeSchema.value)) {
		void hydrateUploadedImageShape(shape.id, readImageFileId(value.src))
	}
}

function usesUploadedImageSource(schema: LowCodeFormSchema | null) {
	return schema?.fields.some((field) => field.field === 'src' && field.component === 'vxe-upload') === true
}

function readImageFileId(value: unknown) {
	const candidate = Array.isArray(value) ? value[0] : value
	if (isRecord(candidate)) {
		return String(candidate.fileId ?? candidate.id ?? '').trim()
	}
	return typeof candidate === 'string' ? candidate.trim() : ''
}

function isFileObjectId(value: string) {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function hydrateUploadedImageShape(shapeId: TLShape['id'], requestedFileId = '') {
	const shape = props.editor.getShape(shapeId)
	if (!shape || shape.type !== 'vue-image') return

	const shapeProps = getProps(shape)
	const persistedFileId = readImageFileId(shapeProps.fileId)
	const legacyFileId = readImageFileId(shapeProps.src)
	const fileId = requestedFileId || persistedFileId || (isFileObjectId(legacyFileId) ? legacyFileId : '')
	if (!fileId || !isFileObjectId(fileId)) return

	if (persistedFileId !== fileId || legacyFileId === fileId) {
		props.editor.run(() => props.editor.updateShape({
			id: shape.id,
			type: shape.type,
			props: {
				fileId,
				assetId: null,
				...(legacyFileId === fileId ? { src: '' } : {}),
			},
		} as TLShapePartial), { history: 'ignore' })
	}

	const cached = imageSourceCache.get(fileId)
	if (cached) {
		applyResolvedImageSource(shape.id, fileId, cached.src)
		return
	}

	let request = imageSourceRequests.get(fileId)
	if (!request) {
		request = resolveUploadedImageSource(fileId)
		imageSourceRequests.set(fileId, request)
		request.finally(() => imageSourceRequests.delete(fileId)).catch(() => undefined)
	}

	try {
		imageSourceError.value = ''
		const resolved = await request
		imageSourceCache.set(fileId, resolved)
		applyResolvedImageSource(shape.id, fileId, resolved.src)
	} catch (error) {
		const current = props.editor.getShape(shape.id)
		if (current && readImageFileId(getProps(current).fileId) === fileId) {
			imageSourceError.value = error instanceof Error ? error.message : '图片加载失败，请重新上传。'
		}
	}
}

async function resolveUploadedImageSource(fileId: string) {
	const result = await host.getServiceApi().invoke<{
		download?: { signedUrl?: unknown }
	}>('files', 'runAction', {
		resource: 'file_objects',
		operation: 'getDownloadUrl',
		fileId,
		expiresInSeconds: 7200,
	})
	const signedUrl = typeof result?.download?.signedUrl === 'string'
		? result.download.signedUrl.trim()
		: ''
	if (!signedUrl) throw new Error('未获取到图片地址，请重新上传。')

	try {
		const response = await fetch(signedUrl)
		if (!response.ok) throw new Error(`图片下载失败 (${response.status})`)
		const blob = await response.blob()
		if (blob.type && !blob.type.startsWith('image/')) {
			throw new Error('上传文件不是可显示的图片。')
		}
		return { src: await readBlobAsDataUrl(blob) }
	} catch (error) {
		// A signed URL can still be rendered by <img> when storage CORS blocks fetch().
		if (error instanceof TypeError) return { src: signedUrl }
		throw error
	}
}

function readBlobAsDataUrl(blob: Blob) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader()
		reader.addEventListener('load', () => resolve(String(reader.result ?? '')))
		reader.addEventListener('error', () => reject(reader.error ?? new Error('图片读取失败。')))
		reader.readAsDataURL(blob)
	})
}

function applyResolvedImageSource(shapeId: TLShape['id'], fileId: string, src: string) {
	const shape = props.editor.getShape(shapeId)
	if (!shape || shape.type !== 'vue-image') return
	if (readImageFileId(getProps(shape).fileId) !== fileId || getProps(shape).src === src) return

	props.editor.run(() => props.editor.updateShape({
		id: shape.id,
		type: shape.type,
		props: { src, fileId, assetId: null },
	} as TLShapePartial), { history: 'ignore' })
}

function getShapeFormDescriptor(type: string) {
	return shapeFormDescriptors[type] ?? fallbackDescriptor
}

const PROPERTY_FORM_CODE_PREFIX = 'print-designer.property.'

function propertyFormCode(type: string) {
	return `${PROPERTY_FORM_CODE_PREFIX}${type}`
}

function createSchema(title: string, fields: LowCodeField[]): LowCodeFormSchema {
	return {
		title,
		// fields: [...baseFields, ...baseStyleFields, ...fields],
		fields: [ ...fields],//
		actions: [],
	}
}

function inputField(field: string, label: string, props: Record<string, unknown> = {}): LowCodeField {
	return {
		field,
		label,
		component: 'vxe-input',
		props,
	}
}

function textareaField(
	field: string,
	label: string,
	props: Record<string, unknown> = {}
): LowCodeField {
	return {
		field,
		label,
		component: 'vxe-textarea',
		props: {
			'auto-size': { minRows: 2, maxRows: 5 },
			...props,
		},
	}
}

function jsonField(
	field: string,
	label: string,
	props: Record<string, unknown> = {}
): LowCodeField {
	return {
		field,
		label,
		component: 'lc-json-editor',
		props: {
			jsonValueMode: 'string',
			...props,
		},
	}
}

function numberField(
	field: string,
	label: string,
	props: Record<string, unknown> = {}
): LowCodeField {
	return {
		field,
		label,
		component: 'lc-number-input',
		props,
	}
}

function switchField(field: string, label: string): LowCodeField {
	return {
		field,
		label,
		component: 'vxe-switch',
	}
}

function selectField(field: string, label: string, options: LowCodeOption[]): LowCodeField {
	return {
		field,
		label,
		component: 'vxe-select',
		options,
		props: {
			clearable: false,
		},
	}
}

function colorPickerField(field: string, label: string): LowCodeField {
	return {
		field,
		label,
		component: 'lc-color-picker',
	}
}

const disabledInputProps = { disabled: true }
const disabledNumberProps = { disabled: true }

const dataSourceTypeOptions = [
	{ label: '无', value: 'none' },
	{ label: '内联 JSON', value: 'inline' },
	{ label: 'JSON 文本', value: 'json' },
	{ label: 'CSV 文本', value: 'csv' },
	{ label: 'HTTP 接口', value: 'http' },
	{ label: '自定义协议', value: 'custom' },
] satisfies LowCodeOption[]

const httpMethodOptions = [
	{ label: 'GET', value: 'GET' },
	{ label: 'POST', value: 'POST' },
	{ label: 'PUT', value: 'PUT' },
	{ label: 'PATCH', value: 'PATCH' },
] satisfies LowCodeOption[]

const workspaceFormDescriptor = {
	title: '画布属性',
	formCode: propertyFormCode('workspace'),
	schema: {
		title: '画布属性',
		fields: [
			numberField('pageWidthMm', '页面宽度(mm)', { min: 10, max: 1000, step: 0.1 }),
			numberField('pageHeightMm', '页面高度(mm)', { min: 10, max: 1000, step: 0.1 }),
			numberField('pageWidthPx', '页面宽度(px)', disabledNumberProps),
			numberField('pageHeightPx', '页面高度(px)', disabledNumberProps),
			numberField('zoomPercent', '缩放(%)', { min: 20, max: 400, step: 1 }),
			numberField('cameraX', '视图 X', { step: 1 }),
			numberField('cameraY', '视图 Y', { step: 1 }),
			numberField('pxPerMm', '像素/mm', disabledNumberProps),
			numberField('viewportW', '视口宽度', disabledNumberProps),
			numberField('viewportH', '视口高度', disabledNumberProps),
			selectField('dataSourceType', '打印数据源', dataSourceTypeOptions),
			inputField('dataSourceProtocol', '自定义协议'),
			inputField('dataSourceUrl', '接口地址'),
			selectField('dataSourceMethod', '请求方法', httpMethodOptions),
			inputField('dataSourceDataPath', '数据路径'),
			textareaField('dataSourceText', '数据内容/配置', {
				placeholder: 'JSON 数组、CSV 文本，或自定义协议配置 JSON',
			}),
			jsonField('dataSourceHeaders', '请求头 JSON', {
				placeholder: '{"Authorization":"Bearer ..."}',
				jsonRootType: 'object',
			}),
			textareaField('dataSourceBody', '请求体 JSON/文本'),
		],
		actions: [],
	},
	} satisfies { title: string; formCode: string; schema: LowCodeFormSchema }

const fontOptions = [
	{ label: '手写', value: 'draw' },
	{ label: '无衬线', value: 'sans' },
	{ label: '衬线', value: 'serif' },
	{ label: '等宽', value: 'mono' },
] satisfies LowCodeOption[]

const textJustifyContentOptions = [
	{ label: '居左', value: 'start' },
	{ label: '居中', value: 'center' },
	{ label: '居右', value: 'end' },
] satisfies LowCodeOption[]

const textAlignItemsOptions = [
	{ label: '居上', value: 'start' },
	{ label: '居中', value: 'center' },
	{ label: '居下', value: 'end' },
] satisfies LowCodeOption[]

const qrLevelOptions = [
	{ label: 'L - 低', value: 'L' },
	{ label: 'M - 中', value: 'M' },
	{ label: 'Q - 较高', value: 'Q' },
	{ label: 'H - 高', value: 'H' },
] satisfies LowCodeOption[]

const barcodeFormatOptions = [
	{ label: 'Code 128', value: 'code128' },
	{ label: 'Code 39', value: 'code39' },
	{ label: 'EAN-13', value: 'ean13' },
	{ label: 'EAN-8', value: 'ean8' },
	{ label: 'UPC-A', value: 'upca' },
] satisfies LowCodeOption[]

const materialZoneOptions = [
	{ label: '页头', value: 'pageHeader' },
	{ label: '表头', value: 'tableHeader' },
	{ label: '表体', value: 'tableBody' },
	{ label: '表尾', value: 'tableFooter' },
	{ label: '页尾', value: 'pageFooter' },
] satisfies LowCodeOption[]

const materialVisibilityFields = [
	switchField('showPageHeader', '显示页头'),
	switchField('showTableHeader', '显示表头'),
	switchField('showTableFooter', '显示表尾'),
	switchField('showPageFooter', '显示页尾'),
] satisfies LowCodeField[]

const materialHeightFields = [
	numberField('pageHeaderHeight', '页头高度', { min: 0, step: 1 }),
	numberField('tableHeaderHeight', '表头高度', { min: 0, step: 1 }),
	numberField('tableFooterHeight', '表尾高度', { min: 0, step: 1 }),
	numberField('pageFooterHeight', '页尾高度', { min: 0, step: 1 }),
] satisfies LowCodeField[]

const resumeZoneOptions = [
	{ label: '简历页头', value: 'pageHeader' },
	{ label: '自动填充内容', value: 'content' },
	{ label: '简历页尾', value: 'pageFooter' },
] satisfies LowCodeOption[]

const baseFields = [
	inputField('shapeId', '节点 ID', disabledInputProps),
	inputField('shapeTypeLabel', '节点类型', disabledInputProps),
	numberField('x', 'X', { step: 1 }),
	numberField('y', 'Y', { step: 1 }),
	numberField('rotation', '旋转角度', { min: -360, max: 360, step: 1 }),
	numberField('opacity', '透明度', { min: 0, max: 100, step: 1 }),
	switchField('isLocked', '锁定'),
] satisfies LowCodeField[]

// Every custom node inherits these properties from baseProps. Keep their
// panel fields in one place so local and database-backed schemas stay aligned.
const baseStyleFields = baseProps.formFields.filter(
	// (field) => field.field !== 'w' && field.field !== 'h'
	(field) => false
)

const sizeFields = [
	numberField('w', '宽度', { min: 1, step: 1 }),
	numberField('h', '高度', { min: 1, step: 1 }),
] satisfies LowCodeField[]

const strokeStyleFields = [
	selectField('color', '颜色', colorOptions),
	selectField('dash', '线条', dashOptions),
	selectField('size', '尺寸', sizeOptions),
] satisfies LowCodeField[]

const fillStyleFields = [selectField('fill', '填充', fillOptions)] satisfies LowCodeField[]
const borderVisibilityFields = [switchField('showBorder', '显示边框')] satisfies LowCodeField[]

const shapeFormDescriptors: Record<string, ShapeFormDescriptor> = {
	'vue-box': createPropsDescriptor('vue-box', '几何节点', [
		...vueBoxPropertyRegistry.formFields,
	]),
	'vue-text': createPropsDescriptor('vue-text', '文字节点', [
		...sizeFields,
		textareaField('text', '文本内容'),
		selectField('color', '颜色', colorOptions),
		selectField('font', '字体', fontOptions),
		selectField('size', '字号', sizeOptions),
		switchField('autoSize', '自动尺寸'),
		...borderVisibilityFields,
	]),
	'vue-image': createPropsDescriptor('vue-image', '图片节点', [
		...sizeFields,
		inputField('name', '图片名称'),
		textareaField('src', '图片地址', {
			placeholder: '输入 data URL 或图片 URL',
		}),
		inputField('assetId', '资源 ID', disabledInputProps),
		...borderVisibilityFields,
	]),
	'vue-line': createPropsDescriptor('vue-line', '直线节点', [
		...sizeFields,
		numberField('startX', '起点 X', { step: 1 }),
		numberField('startY', '起点 Y', { step: 1 }),
		numberField('endX', '终点 X', { step: 1 }),
		numberField('endY', '终点 Y', { step: 1 }),
		...strokeStyleFields,
	]),
	'vue-arrow': createPropsDescriptor('vue-arrow', '箭头节点', [
		...sizeFields,
		numberField('startX', '起点 X', { step: 1 }),
		numberField('startY', '起点 Y', { step: 1 }),
		numberField('endX', '终点 X', { step: 1 }),
		numberField('endY', '终点 Y', { step: 1 }),
		...strokeStyleFields,
		...fillStyleFields,
	]),
	'vue-draw': createPropsDescriptor('vue-draw', '手绘节点', [
		...sizeFields,
		numberField('pointsCount', '点数量', disabledNumberProps),
		...strokeStyleFields,
		...fillStyleFields,
	]),
	'vue-qr': {
		title: '二维码节点',
		formCode: propertyFormCode('vue-qr'),
		schema: createSchema('二维码节点', [
			numberField('qrSize', '二维码尺寸', { min: 24, step: 1 }),
			textareaField('text', '二维码内容'),
			selectField('color', '前景色', colorOptions),
			colorPickerField('background', '背景色'),
			selectField('errorCorrectionLevel', '容错级别', qrLevelOptions),
			numberField('margin', '留白', { min: 0, max: 24, step: 1 }),
			...borderVisibilityFields,
		]),
		toModel(shape) {
			const props = getProps(shape)
			return {
				...getCommonModel(shape),
				qrSize: toFiniteNumber(props.w, 180),
				text: props.text ?? '',
				color: props.color ?? 'black',
				background: props.background ?? '#ffffff',
				errorCorrectionLevel: props.errorCorrectionLevel ?? 'M',
				margin: toFiniteNumber(props.margin, 4),
				showBorder: Boolean(props.showBorder),
			}
		},
		apply(editor, shape, model) {
			const currentProps = getProps(shape)
			const propsPartial: Record<string, unknown> = {}
			if ('qrSize' in model) {
				const size = clampNumber(model.qrSize, 24, 4096, toFiniteNumber(currentProps.w, 180))
				propsPartial.w = size
				propsPartial.h = size
			}
			if ('text' in model) propsPartial.text = String(model.text ?? '')
			if ('color' in model) propsPartial.color = getOptionValue(model.color, colorOptions, currentProps.color ?? 'black')
			if ('background' in model) propsPartial.background = String(model.background ?? '#ffffff')
			if ('errorCorrectionLevel' in model) {
				propsPartial.errorCorrectionLevel = getOptionValue(
					model.errorCorrectionLevel,
					qrLevelOptions,
					currentProps.errorCorrectionLevel ?? 'M'
				)
			}
			if ('margin' in model) propsPartial.margin = clampNumber(model.margin, 0, 24, toFiniteNumber(currentProps.margin, 4))
			if ('showBorder' in model) propsPartial.showBorder = Boolean(model.showBorder)
			editor.updateShape({
				...getCommonPartial(shape, model),
				...(Object.keys(propsPartial).length ? { props: propsPartial } : {}),
			} as TLShapePartial)
		},
	},
	'vue-barcode': {
		title: '条形码节点',
		formCode: propertyFormCode('vue-barcode'),
		schema: createSchema('条形码节点', [
			...sizeFields,
			textareaField('text', '条形码内容'),
			selectField('format', '编码格式', barcodeFormatOptions),
			colorPickerField('barColor', '条码颜色'),
			colorPickerField('background', '背景色'),
			switchField('includeText', '显示文本'),
			numberField('padding', '留白', { min: 0, max: 48, step: 1 }),
			...borderVisibilityFields,
		]),
		toModel(shape) {
			const props = getProps(shape)
			return {
				...getCommonModel(shape),
				w: toFiniteNumber(props.w, 240),
				h: toFiniteNumber(props.h, 96),
				text: props.text ?? '',
				format: props.format ?? 'code128',
				barColor: props.barColor ?? '#000000',
				background: props.background ?? '#ffffff',
				includeText: props.includeText !== false,
				padding: toFiniteNumber(props.padding, 4),
				showBorder: Boolean(props.showBorder),
			}
		},
		apply(editor, shape, model) {
			const currentProps = getProps(shape)
			const propsPartial: Record<string, unknown> = {}
			if ('w' in model) propsPartial.w = clampNumber(model.w, 40, 4096, toFiniteNumber(currentProps.w, 240))
			if ('h' in model) propsPartial.h = clampNumber(model.h, 24, 4096, toFiniteNumber(currentProps.h, 96))
			if ('text' in model) propsPartial.text = String(model.text ?? '')
			if ('format' in model) propsPartial.format = getOptionValue(model.format, barcodeFormatOptions, currentProps.format ?? 'code128')
			if ('barColor' in model) propsPartial.barColor = String(model.barColor ?? '#000000')
			if ('background' in model) propsPartial.background = String(model.background ?? '#ffffff')
			if ('includeText' in model) propsPartial.includeText = Boolean(model.includeText)
			if ('padding' in model) propsPartial.padding = clampNumber(model.padding, 0, 48, toFiniteNumber(currentProps.padding, 4))
			if ('showBorder' in model) propsPartial.showBorder = Boolean(model.showBorder)
			editor.updateShape({
				...getCommonPartial(shape, model),
				...(Object.keys(propsPartial).length ? { props: propsPartial } : {}),
			} as TLShapePartial)
		},
	},
	'vue-frame': createPropsDescriptor('vue-frame', '画框节点', [
		...sizeFields,
		inputField('name', '画框名称'),
		...borderVisibilityFields,
	]),
	'vue-table': createPropsDescriptor('vue-table', '表格节点', [
		...sizeFields,
		numberField('rowHeight', 'Row height', { min: 22, max: 72, step: 1 }),
		...borderVisibilityFields,
	]),
	'vue-material': {
		title: '物料节点',
		formCode: propertyFormCode('vue-material'),
		schema: createSchema('物料节点', [
			numberField('w', '宽度', { min: 280, step: 1 }),
			numberField('h', '高度', { min: 272, step: 1 }),
			inputField('name', '物料名称'),
			selectField('dataSourceField', '数据源字段', []),
			...materialHeightFields,
			...materialVisibilityFields,
		]),
		toModel(shape) {
			return {
				...getCommonModel(shape),
				...getFlatPropsModel(shape),
				...getVueMaterialVisibilityModel(shape as VueMaterialShape),
				dataSourceField: String(getProps(shape).dataSourceField ?? ''),
				...getVueMaterialSectionHeightModel(props.editor, shape.id),
			}
		},
		apply(editor, shape, model) {
			const partial = getCommonPartial(shape, model)
			const currentProps = getProps(shape)
			const currentMeta = (shape.meta as Record<string, unknown> | undefined) ?? {}
			const currentHeightCache = currentMeta.__materialSectionHeights &&
				typeof currentMeta.__materialSectionHeights === 'object'
				? currentMeta.__materialSectionHeights as Record<string, unknown>
				: {}
			const visibleHeightCache = Object.fromEntries(
				getVueMaterialSections(editor, shape.id)
					.filter((section) => section.props.zone !== 'tableBody' && section.props.h > 0)
					.map((section) => [section.props.zone, section.props.h])
			)
			const shapePartial: TLShapePartial = { ...partial }
			const metaPartial: Record<string, unknown> = {}
			for (const key of ['showPageHeader', 'showTableHeader', 'showTableFooter', 'showPageFooter']) {
				if (key in model) metaPartial[key] = Boolean(model[key])
			}
			if (Object.keys(metaPartial).length) {
				shapePartial.meta = {
					...currentMeta,
					__materialSectionHeights: { ...currentHeightCache, ...visibleHeightCache },
					...metaPartial,
				} as TLShapePartial['meta']
			}
			const propsPartial: Record<string, unknown> = {}
			if ('name' in model) propsPartial.name = String(model.name ?? currentProps.name ?? '')
			if ('dataSourceField' in model) propsPartial.dataSourceField = String(model.dataSourceField ?? currentProps.dataSourceField ?? '')
			if (Object.keys(propsPartial).length) shapePartial.props = propsPartial

			const layoutModel: Record<string, number> = {}
			if ('x' in model) layoutModel.x = toFiniteNumber(model.x, shape.x)
			if ('y' in model) layoutModel.y = toFiniteNumber(model.y, shape.y)
			if ('w' in model) layoutModel.w = clampNumber(model.w, 280, 4096, toFiniteNumber(currentProps.w, 500))
			if ('h' in model) layoutModel.h = clampNumber(model.h, 272, 4096, toFiniteNumber(currentProps.h, 500))

			editor.run(() => {
				if (Object.keys(shapePartial).length > 2) editor.updateShape(shapePartial)
				if (Object.keys(layoutModel).length) {
					updateVueMaterialShapeLayout(editor, shape.id, {
						x: layoutModel.x ?? shape.x,
						y: layoutModel.y ?? shape.y,
						w: layoutModel.w ?? currentProps.w,
						h: layoutModel.h ?? currentProps.h,
					})
				}
				if (Object.keys(metaPartial).length || Object.keys(layoutModel).length) {
					normalizeVueMaterialSections(editor, shape.id, { fitToMaterialHeight: false })
				}
				const sections = getVueMaterialSections(editor, shape.id).filter(
					(section) => section.props.zone !== 'tableBody'
				)
				const heightChanges = sections.map((section) => {
					if (!( `${section.props.zone}Height` in model)) return null
					const value = Number(model[`${section.props.zone}Height`])
					return Number.isFinite(value) && value > 0
						? { id: section.id, type: 'vue-material-section', props: { h: value } }
						: null
				}).filter(Boolean) as TLShapePartial[]
				if (heightChanges.length) editor.updateShapes(heightChanges)
				normalizeVueMaterialSections(editor, shape.id, { fitToMaterialHeight: false })
			})
		},
	},
	'vue-material-section': {
		title: '物料分区',
		formCode: propertyFormCode('vue-material-section'),
		schema: createSchema('物料分区', [
			numberField('w', '宽度', disabledNumberProps),
			numberField('h', '高度', { min: 24, step: 1 }),
			selectField('zone', '分区', materialZoneOptions),
			inputField('label', '名称', disabledInputProps),
		]),
		toModel(shape) {
			return {
				...getCommonModel(shape),
				...getFlatPropsModel(shape),
			}
		},
		apply(editor, shape, model) {
			const currentProps = getProps(shape)
			const propsPartial: Record<string, unknown> = {}
			if ('h' in model) propsPartial.h = clampNumber(model.h, 24, 4096, toFiniteNumber(currentProps.h, 60))
			if ('zone' in model) propsPartial.zone = getOptionValue(model.zone, materialZoneOptions, currentProps.zone ?? 'pageHeader')
			editor.updateShape({
				...getCommonPartial(shape, model),
				...(Object.keys(propsPartial).length ? { props: propsPartial } : {}),
			} as TLShapePartial)

			if (isShapeId(shape.parentId)) {
				normalizeVueMaterialSections(editor, shape.parentId)
			}
		},
	},
	'vue-resume': createPropsDescriptor('vue-resume', '简历分页组件', [
		...sizeFields,
		inputField('name', '组件名称'),
	]),
	'vue-resume-section': {
		title: '简历分区',
		formCode: propertyFormCode('vue-resume-section'),
		schema: createSchema('简历分区', [
			numberField('w', '宽度', disabledNumberProps),
			numberField('h', '高度', { min: 28, step: 1 }),
			selectField('zone', '分区', resumeZoneOptions),
			inputField('label', '名称', disabledInputProps),
		]),
		toModel(shape) {
			return { ...getCommonModel(shape), ...getFlatPropsModel(shape) }
		},
		apply(editor, shape, model) {
			const currentProps = getProps(shape)
			const propsPartial: Record<string, unknown> = {}
			let zone = String(currentProps.zone ?? 'content') as 'pageHeader' | 'content' | 'pageFooter'
			if ('zone' in model) {
				zone = String(getOptionValue(model.zone, resumeZoneOptions, zone)) as 'pageHeader' | 'content' | 'pageFooter'
				propsPartial.zone = zone
			}
			if ('h' in model) propsPartial.h = clampNumber(model.h, getVueResumeSectionDefinition(zone).minHeight, 4096, toFiniteNumber(currentProps.h, 180))
			editor.updateShape({
				...getCommonPartial(shape, model),
				...(Object.keys(propsPartial).length ? { props: propsPartial } : {}),
			} as TLShapePartial)
			if (isShapeId(shape.parentId)) normalizeVueResumeSections(editor, shape.parentId)
		},
	},
	group: {
		title: '分组节点',
		formCode: propertyFormCode('group'),
		schema: createSchema('分组节点', []),
		toModel(shape) {
			return getCommonModel(shape)
		},
		apply(editor, shape, model) {
			editor.updateShape(getCommonPartial(shape, model) as TLShapePartial)
		},
	},
}

const fallbackDescriptor: ShapeFormDescriptor = {
	title: '通用节点',
	formCode: propertyFormCode('generic'),
	schema: createSchema('通用节点', [
		jsonField('propsJson', 'Props JSON', {
			readonly: true,
			jsonRootType: 'object',
		}),
	]),
	toModel(shape) {
		return {
			...getCommonModel(shape),
			propsJson: JSON.stringify(shape.props, null, 2),
		}
	},
	apply(editor, shape, model) {
		editor.updateShape(getCommonPartial(shape, model) as TLShapePartial)
	},
}

type PropertyFormDefinitionRow = {
	id?: unknown
	code?: unknown
	schema?: unknown
}

const requiredPropertyFormCodes = [
	workspaceFormDescriptor.formCode,
	...Object.values(shapeFormDescriptors).map((descriptor) => descriptor.formCode),
	fallbackDescriptor.formCode,
].filter((code, index, codes) => codes.indexOf(code) === index)

async function loadPropertyFormDefinitions() {
	formDefinitionsLoading.value = true
	formDefinitionError.value = ''

	try {
		const serviceApi = host.getServiceApi()
		const rows = await serviceApi.invoke<PropertyFormDefinitionRow[]>('lowcode', 'listItems', {
			resource: 'lowcode_form_definitions',
			filters: { code: requiredPropertyFormCodes, enabled: true },
			limit: requiredPropertyFormCodes.length,
		})
		const loaded: Record<string, LowCodeFormSchema> = {}
		const ids: Record<string, string> = {}

		for (const row of Array.isArray(rows) ? rows : []) {
			if (typeof row.code !== 'string' || !isLowCodeFormSchema(row.schema)) continue
			loaded[row.code] = structuredClone(row.schema)
			if (typeof row.id === 'string' && row.id.trim()) ids[row.code] = row.id.trim()
		}

		const missing = requiredPropertyFormCodes.filter((code) => !loaded[code])
		if (missing.length) {
			// Database definitions are authoritative. Keep the designer usable while
			// a new migration is rolling out by filling only missing codes from the
			// matching local descriptor; later database responses still win.
			const localSchemas = new Map<string, LowCodeFormSchema>([
				[workspaceFormDescriptor.formCode, workspaceFormDescriptor.schema],
				...Object.values(shapeFormDescriptors).map((descriptor) => [descriptor.formCode, descriptor.schema] as const),
				[fallbackDescriptor.formCode, fallbackDescriptor.schema],
			])
			const unresolved = missing.filter((code) => !localSchemas.has(code))
			if (unresolved.length) {
				throw new Error(`缺少或停用了属性表单：${unresolved.join('、')}`)
			}
			for (const code of missing) {
				const schema = localSchemas.get(code)
				if (schema) loaded[code] = structuredClone(schema)
			}
		}

		for (const code of requiredPropertyFormCodes) {
			if (code !== workspaceFormDescriptor.formCode) {
				ensureBasePropertyFields(loaded[code])
			}
		}

		formDefinitions.value = loaded
		formDefinitionIds.value = ids
	} catch (error) {
		formDefinitions.value = {}
		formDefinitionIds.value = {}
		formDefinitionError.value =
			error instanceof Error ? error.message : '属性表单加载失败，请稍后重试。'
	} finally {
		formDefinitionsLoading.value = false
	}
}

function ensureBasePropertyFields(schema: LowCodeFormSchema | undefined) {
	if (!schema) return
	const normalizedFields = [] as typeof schema.fields
	const normalizedFieldNames = new Set<string>()
	for (const field of schema.fields) {
		const normalizedName = normalizeBasePropertyFieldName(field.field)
		if (normalizedFieldNames.has(normalizedName)) continue
		field.field = normalizedName
		normalizedFieldNames.add(normalizedName)
		normalizedFields.push(field)
	}
	schema.fields = normalizedFields
	const existingFields = new Set(schema.fields.map((field) => field.field))
	for (const field of baseStyleFields) {
		const fieldName = field.field
		if (existingFields.has(fieldName)) continue
		schema.fields.push(structuredClone(field))
		existingFields.add(fieldName)
	}
}

function normalizeBasePropertyFieldName(field: string) {
	return {
		'align-items': 'alignItems',
		'justify-content': 'justifyContent',
		'font-size': 'fontSize',
		'padding-left': 'paddingLeft',
		'padding-right': 'paddingRight',
		'padding-top': 'paddingTop',
		'padding-bottom': 'paddingBottom',
	}[field] ?? field
}

function isLowCodeFormSchema(value: unknown): value is LowCodeFormSchema {
	if (!isRecord(value)) return false
	if (!Array.isArray(value.fields) || !Array.isArray(value.actions)) return false
	if (value.layout !== undefined && !Array.isArray(value.layout)) return false
	return value.fields.every(
		(field) =>
			isRecord(field) &&
			typeof field.field === 'string' &&
			typeof field.label === 'string' &&
			typeof field.component === 'string'
	)
}

onMounted(() => {
	void loadPropertyFormDefinitions()
})

watch(
	[
		selectedShape,
		isMultiShapeFormActive,
		multiSelectedShapeType,
		isCanvasFormActive,
		activeSchema,
		workspaceCamera,
		() => props.workspaceRevision,
	],
	() => {
		syncFormModel()
		const shape = selectedShape.value
		if (shape?.type === 'vue-image' && usesUploadedImageSource(activeSchema.value)) {
			void hydrateUploadedImageShape(shape.id)
		} else {
			imageSourceError.value = ''
		}
	},
	{ immediate: true }
)

watch(
	formModel,
	(model) => {
		if (!isMultiShapeFormActive.value) return
		if (skipNextMultiModelChange) {
			skipNextMultiModelChange = false
			return
		}
		const changedModel: ShapeFormModel = {}
		for (const key of Object.keys(model)) {
			if (!Object.is(model[key], previousMultiFormModel[key])) changedModel[key] = model[key]
		}
		previousMultiFormModel = { ...model }
		applyMultiShapeFormModel(changedModel)
	},
	{ deep: true }
)

watch(
	[uploadedImageShapeKeys, imagePropertySchema],
	() => {
		if (!usesUploadedImageSource(imagePropertySchema.value)) return
		for (const shape of props.editor.getCurrentPageShapes()) {
			if (shape.type === 'vue-image') void hydrateUploadedImageShape(shape.id)
		}
	},
	{ immediate: true }
)

function syncFormModel() {
	skipNextMultiModelChange = false
	previousMultiFormModel = {}

	if (isCanvasFormActive.value) {
		formModel.value = getWorkspaceFormModel()
		return
	}

	if (isMultiShapeFormActive.value) {
		skipNextMultiModelChange = true
		formModel.value = {}
		return
	}

	const shape = selectedShape.value
	const descriptor = shape ? getShapeFormDescriptor(shape.type) : null
	formModel.value = shape && descriptor ? descriptor.toModel(shape) : {}
}

function applyMultiShapeFormModel(model: ShapeFormModel) {
	const descriptor = activeDescriptor.value
	if (!descriptor || !Object.keys(model).length || props.editor.getIsReadonly()) return

	const selected = selectedShapeIds.value
		.map((id) => props.editor.getShape(id))
		.filter((shape): shape is TLShape => Boolean(shape))
	if (selected.length < 2 || !multiSelectedShapeType.value) return

	props.editor.run(() => {
		for (const shape of selected) {
			descriptor.apply(props.editor, shape, model)
		}
	}, { history: 'record' })

	if (multiSelectedShapeType.value === 'vue-image' && usesUploadedImageSource(activeSchema.value)) {
		for (const shape of selected) {
			void hydrateUploadedImageShape(shape.id, readImageFileId(model.src))
		}
	}
}

function getWorkspaceFormModel(): ShapeFormModel {
	const config = getWorkspaceConfigSnapshot()
	const pageSizeMm = config.pageSizeMm ?? { w: 80, h: 80 }
	const pxPerMm = toFiniteNumber(config.pxPerMm, DEFAULT_PX_PER_MM)
	const pageBounds = config.pageBounds ?? {
		x: 0,
		y: 0,
		w: pageSizeMm.w * pxPerMm,
		h: pageSizeMm.h * pxPerMm,
	}
	const camera = config.camera ?? workspaceCamera.value
	const viewportSize = config.viewportSize ?? { w: 0, h: 0 }

	return {
		pageWidthMm: roundNumber(pageSizeMm.w),
		pageHeightMm: roundNumber(pageSizeMm.h),
		pageWidthPx: roundNumber(pageBounds.w),
		pageHeightPx: roundNumber(pageBounds.h),
		zoomPercent: roundNumber(camera.z * 100),
		cameraX: roundNumber(camera.x),
		cameraY: roundNumber(camera.y),
		pxPerMm: roundNumber(pxPerMm, 6),
		viewportW: roundNumber(viewportSize.w),
		viewportH: roundNumber(viewportSize.h),
		...getDataSourceFormModel(editorPrintDataSource.value),
	}
}

function applyWorkspaceFormModel(model: ShapeFormModel) {
	const config = getWorkspaceConfigSnapshot()
	const currentPageSizeMm = config.pageSizeMm ?? { w: 80, h: 80 }
	const currentCamera = config.camera ?? workspaceCamera.value
	const pageWidthMm = getFiniteFormNumber(model.pageWidthMm)
	const pageHeightMm = getFiniteFormNumber(model.pageHeightMm)
	const zoomPercent = getFiniteFormNumber(model.zoomPercent)
	const cameraX = getFiniteFormNumber(model.cameraX)
	const cameraY = getFiniteFormNumber(model.cameraY)

	if (
		pageWidthMm === null ||
		pageHeightMm === null ||
		zoomPercent === null ||
		cameraX === null ||
		cameraY === null
	) {
		return
	}

	const nextConfig: VueTemplateWorkspaceConfig = {
		pageSizeMm: {
			w: clampNumber(pageWidthMm, 10, 1000, currentPageSizeMm.w),
			h: clampNumber(pageHeightMm, 10, 1000, currentPageSizeMm.h),
		},
		camera: {
			x: cameraX,
			y: cameraY,
			z: clampNumber(zoomPercent, 20, 400, currentCamera.z * 100) / 100,
		},
	}
	editorPrintDataSource.value = createDataSourceConfigFromModel(model)

	if (props.applyWorkspaceTemplateConfig) {
		props.applyWorkspaceTemplateConfig(nextConfig)
		return
	}

	props.editor.run(() => props.editor.setCamera(nextConfig.camera!, { immediate: true }), {
		history: 'ignore',
	})
}

function getDataSourceFormModel(dataSource: PrintDataSourceConfig | undefined) {
	if (!dataSource || dataSource.type === 'none') return getEmptyDataSourceFormModel()

	if (dataSource.type === 'inline') {
		return {
			...getEmptyDataSourceFormModel(),
			dataSourceType: 'inline',
			dataSourceText: stringifyJson(dataSource.rows ?? []),
		}
	}

	if (dataSource.type === 'json') {
		return {
			...getEmptyDataSourceFormModel(),
			dataSourceType: 'json',
			dataSourceText: typeof dataSource.value === 'string' ? dataSource.value : stringifyJson(dataSource.value),
			dataSourceDataPath: dataSource.dataPath ?? '',
		}
	}

	if (dataSource.type === 'csv') {
		return {
			...getEmptyDataSourceFormModel(),
			dataSourceType: 'csv',
			dataSourceText: dataSource.value ?? '',
		}
	}

	if (dataSource.type === 'http') {
		return {
			...getEmptyDataSourceFormModel(),
			dataSourceType: 'http',
			dataSourceUrl: dataSource.url ?? '',
			dataSourceMethod: dataSource.method ?? 'GET',
			dataSourceDataPath: dataSource.dataPath ?? '',
			dataSourceHeaders: stringifyJson(dataSource.headers ?? {}),
			dataSourceBody: dataSource.body === undefined ? '' : stringifyJson(dataSource.body),
		}
	}

	return {
		...getEmptyDataSourceFormModel(),
		dataSourceType: 'custom',
		dataSourceProtocol: dataSource.type,
		dataSourceText: stringifyJson(dataSource),
	}
}

function getEmptyDataSourceFormModel() {
	return {
		dataSourceType: 'none',
		dataSourceProtocol: '',
		dataSourceUrl: '',
		dataSourceMethod: 'GET',
		dataSourceDataPath: '',
		dataSourceText: '',
		dataSourceHeaders: '',
		dataSourceBody: '',
	}
}

function createDataSourceConfigFromModel(
	model: ShapeFormModel
): PrintDataSourceConfig {
	const type = String(model.dataSourceType ?? 'none')
	const text = String(model.dataSourceText ?? '')
	const dataPath = String(model.dataSourceDataPath ?? '').trim() || undefined

	if (type === 'none') return { type: 'none' }
	if (type === 'inline') return { type: 'inline', rows: parseRowsJson(text) }
	if (type === 'json') return { type: 'json', value: text, dataPath }
	if (type === 'csv') return { type: 'csv', value: text, delimiter: ',', header: true }
	if (type === 'http') {
		return {
			type: 'http',
			url: String(model.dataSourceUrl ?? '').trim(),
			method: getOptionValue(model.dataSourceMethod, httpMethodOptions, 'GET') as
				| 'GET'
				| 'POST'
				| 'PUT'
				| 'PATCH',
			dataPath,
			headers: parseRecordJson(String(model.dataSourceHeaders ?? '')),
			body: parseLooseJson(String(model.dataSourceBody ?? '')),
		}
	}

	const customProtocol = String(model.dataSourceProtocol ?? '').trim() || 'custom'
	const customConfig = parseRecordJson(text)
	return {
		...customConfig,
		type: customProtocol,
	}
}

function parseRowsJson(value: string) {
	const parsed = parseLooseJson(value)
	return Array.isArray(parsed) ? parsed.filter(isRecord) : []
}

function parseRecordJson(value: string) {
	const parsed = parseLooseJson(value)
	return isRecord(parsed) ? parsed : {}
}

function parseLooseJson(value: string): unknown {
	const trimmed = value.trim()
	if (!trimmed) return undefined
	try {
		return JSON.parse(trimmed)
	} catch {
		return value
	}
}

function stringifyJson(value: unknown) {
	return JSON.stringify(value, null, 2)
}

function getWorkspaceConfigSnapshot(): VueTemplateWorkspaceConfig {
	const config = props.getWorkspaceTemplateConfig?.()
	const camera = workspaceCamera.value

	return {
		...config,
		pageSizeMm: config?.pageSizeMm,
		pageBounds: config?.pageBounds,
		camera: config?.camera ?? {
			x: camera.x,
			y: camera.y,
			z: camera.z,
		},
		viewportSize: config?.viewportSize,
		pxPerMm: config?.pxPerMm,
	}
}

function createPropsDescriptor(type: string, title: string, fields: LowCodeField[]): ShapeFormDescriptor {
	return {
		title,
		formCode: propertyFormCode(type),
		schema: createSchema(title, fields),
		toModel(shape) {
			return {
				...getCommonModel(shape),
				...getFlatPropsModel(shape),
			}
		},
		apply(editor, shape, model) {
			const props = getPropsPartial(shape, model)
			editor.updateShape({
				...getCommonPartial(shape, model),
				...(Object.keys(props).length ? { props } : {}),
			} as TLShapePartial)
		},
	}
}

function getCommonModel(shape: TLShape): ShapeFormModel {
	return {
		shapeId: shape.id,
		shapeTypeLabel: getShapeTypeLabel(shape.type),
		x: roundNumber(shape.x),
		y: roundNumber(shape.y),
		rotation: roundNumber(radiansToDegrees(shape.rotation)),
		opacity: roundNumber(shape.opacity * 100),
		isLocked: shape.isLocked,
	}
}

function getFlatPropsModel(shape: TLShape): ShapeFormModel {
	const props = getProps(shape)
	const model: ShapeFormModel = {}

	for (const [key, value] of Object.entries(props)) {
		if (key === 'start' && isPoint(value)) {
			model.startX = roundNumber(value.x)
			model.startY = roundNumber(value.y)
			continue
		}
		if (key === 'end' && isPoint(value)) {
			model.endX = roundNumber(value.x)
			model.endY = roundNumber(value.y)
			continue
		}
		if (key === 'points' && Array.isArray(value)) {
			model.pointsCount = value.length
			continue
		}
		model[key] = typeof value === 'number' ? roundNumber(value) : value
	}
	if (shape.type === 'vue-image') {
		const fileId = readImageFileId(props.fileId)
		if (fileId) model.src = fileId
	}
	if (shape.type === 'vue-text') {
		model.justifyContent = getOptionValue(props.justifyContent, textJustifyContentOptions, 'start')
		model.alignItems = getOptionValue(props.alignItems, textAlignItemsOptions, 'center')
	}

	return model
}

function getCommonPartial(shape: TLShape, model: ShapeFormModel): TLShapePartial {
	const partial: TLShapePartial = {
		id: shape.id,
		type: shape.type,
	} as TLShapePartial
	if ('x' in model) partial.x = toFiniteNumber(model.x, shape.x)
	if ('y' in model) partial.y = toFiniteNumber(model.y, shape.y)
	if ('rotation' in model) {
		partial.rotation = degreesToRadians(toFiniteNumber(model.rotation, radiansToDegrees(shape.rotation)))
	}
	if ('opacity' in model) partial.opacity = clampNumber(model.opacity, 0, 100, shape.opacity * 100) / 100
	if ('isLocked' in model) partial.isLocked = Boolean(model.isLocked)
	return partial
}

function getPropsPartial(shape: TLShape, model: ShapeFormModel) {
	const currentProps = getProps(shape)
	const nextProps: Record<string, unknown> = {}

	for (const field of activeSchema.value?.fields ?? []) {
		const key = normalizeBasePropertyFieldName(field.field)
		if (!(key in model)) continue
		if (key in commonModelKeys || key === 'shapeTypeLabel') continue
		if (key === 'assetId' || key === 'pointsCount' || key === 'propsJson') continue
		if (shape.type === 'vue-box' && vueBoxPropertyRegistry.has(key)) {
			nextProps[key] = vueBoxPropertyRegistry.normalize(key, model[key], currentProps[key])
			continue
		}

		if (key === 'w' || key === 'h') {
			nextProps[key] = clampNumber(model[key], 1, 4096, toFiniteNumber(currentProps[key], 1))
			continue
		}
		if (key === 'fontSize') {
			nextProps.fontSize = clampNumber(model[key], 1, 512, toFiniteNumber(currentProps.fontSize, 14))
			continue
		}
		if (key === 'paddingLeft' || key === 'paddingRight' || key === 'paddingTop' || key === 'paddingBottom') {
			nextProps[key] = clampNumber(model[key], 0, 4096, toFiniteNumber(currentProps[key], 0))
			continue
		}
		if (key === 'startX' || key === 'startY') {
			const point = isPoint(currentProps.start) ? currentProps.start : { x: 0, y: 0 }
			nextProps.start = {
				...(nextProps.start as Record<string, number> | undefined),
				...point,
				[key === 'startX' ? 'x' : 'y']: toFiniteNumber(model[key], point[key === 'startX' ? 'x' : 'y']),
			}
			continue
		}
		if (key === 'endX' || key === 'endY') {
			const point = isPoint(currentProps.end) ? currentProps.end : { x: 0, y: 0 }
			nextProps.end = {
				...(nextProps.end as Record<string, number> | undefined),
				...point,
				[key === 'endX' ? 'x' : 'y']: toFiniteNumber(model[key], point[key === 'endX' ? 'x' : 'y']),
			}
			continue
		}
		if (key === 'color') {
			nextProps.color = getOptionValue(model.color, colorOptions, currentProps.color ?? 'black')
			continue
		}
		if (key === 'fill') {
			nextProps.fill = getOptionValue(model.fill, fillOptions, currentProps.fill ?? 'none')
			continue
		}
		if (key === 'dash') {
			nextProps.dash = getOptionValue(model.dash, dashOptions, currentProps.dash ?? 'draw')
			continue
		}
		if (key === 'size') {
			nextProps.size = getOptionValue(model.size, sizeOptions, currentProps.size ?? 'm')
			continue
		}
		if (key === 'font') {
			nextProps.font = getOptionValue(model.font, fontOptions, currentProps.font ?? 'sans')
			continue
		}
		if (key === 'geo') {
			nextProps.geo = getOptionValue(model.geo, geoOptions, currentProps.geo ?? 'rectangle')
			continue
		}
		if (key === 'justifyContent') {
			nextProps.justifyContent = getOptionValue(model.justifyContent, textJustifyContentOptions, currentProps.justifyContent ?? 'start')
			continue
		}
		if (key === 'alignItems') {
			nextProps.alignItems = getOptionValue(model.alignItems, textAlignItemsOptions, currentProps.alignItems ?? 'center')
			continue
		}
		if (key === 'autoSize') {
			nextProps.autoSize = Boolean(model.autoSize)
			continue
		}
		if (key === 'showBorder') {
			nextProps.showBorder = Boolean(model.showBorder)
			continue
		}
		if (shape.type === 'vue-image' && key === 'src' && usesUploadedImageSource(activeSchema.value)) {
			const fileId = readImageFileId(model[key])
			const currentFileId = readImageFileId(currentProps.fileId)
			nextProps.fileId = fileId
			nextProps.assetId = null
			if (!fileId || fileId !== currentFileId) nextProps.src = ''
			continue
		}
		if (key === 'text' || key === 'name' || key === 'src') {
			nextProps[key] = String(model[key] ?? '')
			if (shape.type === 'vue-image' && key === 'src') {
				nextProps.assetId = null
			}
			continue
		}

		nextProps[key] = model[key]
	}

	return nextProps
}

const commonModelKeys = {
	shapeId: true,
	x: true,
	y: true,
	rotation: true,
	opacity: true,
	isLocked: true,
} as const

function getProps(shape: TLShape): Record<string, unknown> {
	return shape.props as Record<string, unknown>
}

function getShapeTypeLabel(type: string) {
	return (
		{
			'vue-box': '几何节点',
			'vue-text': '文字节点',
			'vue-image': '图片节点',
			'vue-line': '直线节点',
			'vue-arrow': '箭头节点',
			'vue-draw': '手绘节点',
			'vue-qr': '二维码节点',
			'vue-barcode': '条形码节点',
			'vue-frame': '画框节点',
			'vue-table': '表格节点',
			'vue-material': '物料节点',
			'vue-material-section': '物料分区',
			group: '分组',
		} as Record<string, string>
	)[type] ?? type
}

function isPoint(value: unknown): value is { x: number; y: number } {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { x?: unknown }).x === 'number' &&
		typeof (value as { y?: unknown }).y === 'number'
	)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toFiniteNumber(value: unknown, fallback: number) {
	const numeric = Number(value)
	return Number.isFinite(numeric) ? numeric : fallback
}

function getFiniteFormNumber(value: unknown) {
	if (value === '' || value === null || value === undefined) return null
	const numeric = Number(value)
	return Number.isFinite(numeric) ? numeric : null
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
	const numeric = toFiniteNumber(value, fallback)
	return Math.min(max, Math.max(min, numeric))
}

function roundNumber(value: number, digits = 2) {
	const factor = 10 ** digits
	return Math.round(value * factor) / factor
}

function radiansToDegrees(value: number) {
	return (value * 180) / Math.PI
}

function degreesToRadians(value: number) {
	return (value * Math.PI) / 180
}

function getOptionValue(value: unknown, options: readonly LowCodeOption[], fallback: unknown) {
	return options.some((option) => option.value === value) ? value : fallback
}

</script>

<template>
	<section
		class="lowcode-form-panel"
		aria-label="低代码属性表单"
		@pointerdown.stop
		@pointermove.stop
		@keydown.stop
		@keyup.stop
		@keypress.stop
		@wheel.stop
		@contextmenu.prevent.stop
	>
		<header class="lowcode-form-panel__header">
			<div class="lowcode-form-panel__heading">
				<div class="lowcode-form-panel__title">{{ panelTitle }}</div>
				<div class="lowcode-form-panel__subtitle">{{ panelSubtitle }}</div>
			</div>
			<div class="lowcode-form-panel__header-actions" aria-label="属性表单操作">
				<button
					type="button"
					class="lowcode-form-panel__action lowcode-form-panel__action--primary"
					:disabled="!canDesignForm"
					:title="canDesignForm ? '设计当前属性表单' : '当前属性表单不可设计'"
					@click="handleDesignForm"
				>
					<i :class="designingForm ? 'ri-loader-4-line print-spin' : 'ri-edit-2-line'" aria-hidden="true" />
					<span>设计表单</span>
				</button>
			</div>
		</header>
		<div v-if="designFormMessage" class="lowcode-form-panel__action-message" role="status">
			<i :class="designingForm ? 'ri-loader-4-line print-spin' : 'ri-checkbox-circle-line'" aria-hidden="true" />
			<span>{{ designFormMessage }}</span>
		</div>

		<div v-if="formDefinitionsLoading" class="lowcode-form-panel__state" role="status">
			正在加载属性表单...
		</div>
		<div v-else-if="formDefinitionError" class="lowcode-form-panel__state lowcode-form-panel__state--error" role="alert">
			<p>{{ formDefinitionError }}</p>
			<button type="button" @click="loadPropertyFormDefinitions">重新加载</button>
		</div>
		<div v-else-if="emptyMessage" class="lowcode-form-panel__empty">{{ emptyMessage }}</div>
		<LowCodeForm
			v-else-if="activeSchema"
			:key="formKey"
			:model-value="formModel"
			:schema="activeSchema"
			@update:model-value="handleModelUpdate"
		/>
		<div v-if="imageSourceError" class="lowcode-form-panel__state lowcode-form-panel__state--error" role="alert">
			{{ imageSourceError }}
		</div>
	</section>
</template>
