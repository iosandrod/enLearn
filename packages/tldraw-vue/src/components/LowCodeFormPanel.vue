<script setup lang="ts">
import LowCodeForm from '@enlearn/lowcode-framework/components/LowCodeForm.vue'
import type {
	LowCodeField,
	LowCodeFormSchema,
	LowCodeOption,
} from '@enlearn/lowcode-framework/types/lowcode'
import { isShapeId, type Editor, type TLShape, type TLShapePartial } from '@tldraw/editor'
import { computed, ref, watch } from 'vue'
import {
	normalizeVueMaterialSections,
	updateVueMaterialShapeLayout,
} from '@/editor/extensions/material/vueMaterialShape'
import type { VueTemplateWorkspaceConfig } from '@/editor/templateStore'
import { useEditorValue } from '@/vue/useEditorValue'

type ShapeFormModel = Record<string, unknown>

type ShapeFormDescriptor = {
	title: string
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
const collapsed = ref(false)

const selectedShapeIds = useEditorValue('lowcode form selected shape ids', () =>
	props.editor.getSelectedShapeIds()
)
const selectedShape = useEditorValue('lowcode form selected shape', () => {
	const ids = props.editor.getSelectedShapeIds()
	if (ids.length !== 1) return null
	return props.editor.getShape(ids[0]) ?? null
})
const workspaceCamera = useEditorValue('lowcode form workspace camera', () => props.editor.getCamera())

const isCanvasFormActive = computed(() => selectedShapeIds.value.length !== 1)
const activeDescriptor = computed(() =>
	selectedShape.value ? getShapeFormDescriptor(selectedShape.value.type) : null
)
const activeSchema = computed(() =>
	isCanvasFormActive.value ? workspaceFormDescriptor.schema : activeDescriptor.value?.schema ?? null
)
const panelTitle = computed(() => {
	if (isCanvasFormActive.value) return workspaceFormDescriptor.title
	if (selectedShapeIds.value.length === 0) return '低代码属性表单'
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
	if (isCanvasFormActive.value) return ''
	if (selectedShapeIds.value.length === 0) return '请选择画布上的一个节点'
	if (selectedShapeIds.value.length > 1) return '当前选择了多个节点，请只选择一个节点'
	return activeDescriptor.value ? '' : '当前节点类型暂未配置表单'
})
const formKey = computed(() => {
	if (isCanvasFormActive.value) return 'workspace'
	const shape = selectedShape.value
	return shape ? `${shape.id}:${shape.type}` : 'empty'
})

function handleModelUpdate(value: ShapeFormModel) {
	formModel.value = value

	if (isCanvasFormActive.value) {
		if (!props.editor.getIsReadonly()) {
			applyWorkspaceFormModel(value)
		}
		return
	}

	const shape = selectedShape.value
	const descriptor = activeDescriptor.value
	if (!shape || !descriptor || props.editor.getIsReadonly()) return

	descriptor.apply(props.editor, shape, value)
}

function toggleCollapsed() {
	collapsed.value = !collapsed.value
}

function getShapeFormDescriptor(type: string) {
	return shapeFormDescriptors[type] ?? fallbackDescriptor
}

function createSchema(title: string, fields: LowCodeField[]): LowCodeFormSchema {
	return {
		title,
		fields: [...baseFields, ...fields],
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
} satisfies { title: string; schema: LowCodeFormSchema }

const colorOptions = [
	{ label: '黑色', value: 'black' },
	{ label: '灰色', value: 'grey' },
	{ label: '浅紫', value: 'light-violet' },
	{ label: '紫色', value: 'violet' },
	{ label: '蓝色', value: 'blue' },
	{ label: '浅蓝', value: 'light-blue' },
	{ label: '黄色', value: 'yellow' },
	{ label: '橙色', value: 'orange' },
	{ label: '绿色', value: 'green' },
	{ label: '浅绿', value: 'light-green' },
	{ label: '浅红', value: 'light-red' },
	{ label: '红色', value: 'red' },
	{ label: '白色', value: 'white' },
] satisfies LowCodeOption[]

const fillOptions = [
	{ label: '无填充', value: 'none' },
	{ label: '半透明', value: 'semi' },
	{ label: '实心', value: 'solid' },
	{ label: '图案', value: 'pattern' },
	{ label: '填充', value: 'fill' },
	{ label: '线性填充', value: 'lined-fill' },
] satisfies LowCodeOption[]

const dashOptions = [
	{ label: '手绘', value: 'draw' },
	{ label: '实线', value: 'solid' },
	{ label: '虚线', value: 'dashed' },
	{ label: '点线', value: 'dotted' },
	{ label: '无', value: 'none' },
] satisfies LowCodeOption[]

const sizeOptions = [
	{ label: '小', value: 's' },
	{ label: '中', value: 'm' },
	{ label: '大', value: 'l' },
	{ label: '超大', value: 'xl' },
] satisfies LowCodeOption[]

const fontOptions = [
	{ label: '手写', value: 'draw' },
	{ label: '无衬线', value: 'sans' },
	{ label: '衬线', value: 'serif' },
	{ label: '等宽', value: 'mono' },
] satisfies LowCodeOption[]

const geoOptions = [
	{ label: '矩形', value: 'rectangle' },
	{ label: '椭圆', value: 'ellipse' },
	{ label: '三角形', value: 'triangle' },
	{ label: '菱形', value: 'diamond' },
	{ label: '六边形', value: 'hexagon' },
	{ label: '胶囊', value: 'oval' },
	{ label: '平行四边形', value: 'rhombus' },
	{ label: '星形', value: 'star' },
	{ label: '云形', value: 'cloud' },
	{ label: '心形', value: 'heart' },
	{ label: '叉框', value: 'x-box' },
	{ label: '勾选框', value: 'check-box' },
	{ label: '左箭头', value: 'arrow-left' },
	{ label: '上箭头', value: 'arrow-up' },
	{ label: '下箭头', value: 'arrow-down' },
	{ label: '右箭头', value: 'arrow-right' },
] satisfies LowCodeOption[]

const qrLevelOptions = [
	{ label: 'L - 低', value: 'L' },
	{ label: 'M - 中', value: 'M' },
	{ label: 'Q - 较高', value: 'Q' },
	{ label: 'H - 高', value: 'H' },
] satisfies LowCodeOption[]

const materialZoneOptions = [
	{ label: '页头', value: 'pageHeader' },
	{ label: '表头', value: 'tableHeader' },
	{ label: '表体', value: 'tableBody' },
	{ label: '表尾', value: 'tableFooter' },
	{ label: '页尾', value: 'pageFooter' },
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
	'vue-box': createPropsDescriptor('几何节点', [
		...sizeFields,
		selectField('geo', '几何形状', geoOptions),
		...strokeStyleFields,
		...fillStyleFields,
	]),
	'vue-text': createPropsDescriptor('文字节点', [
		...sizeFields,
		textareaField('text', '文本内容'),
		selectField('color', '颜色', colorOptions),
		selectField('font', '字体', fontOptions),
		selectField('size', '字号', sizeOptions),
		switchField('autoSize', '自动尺寸'),
		...borderVisibilityFields,
	]),
	'vue-image': createPropsDescriptor('图片节点', [
		...sizeFields,
		inputField('name', '图片名称'),
		textareaField('src', '图片地址', {
			placeholder: '输入 data URL 或图片 URL',
		}),
		inputField('assetId', '资源 ID', disabledInputProps),
		...borderVisibilityFields,
	]),
	'vue-line': createPropsDescriptor('直线节点', [
		...sizeFields,
		numberField('startX', '起点 X', { step: 1 }),
		numberField('startY', '起点 Y', { step: 1 }),
		numberField('endX', '终点 X', { step: 1 }),
		numberField('endY', '终点 Y', { step: 1 }),
		...strokeStyleFields,
	]),
	'vue-arrow': createPropsDescriptor('箭头节点', [
		...sizeFields,
		numberField('startX', '起点 X', { step: 1 }),
		numberField('startY', '起点 Y', { step: 1 }),
		numberField('endX', '终点 X', { step: 1 }),
		numberField('endY', '终点 Y', { step: 1 }),
		...strokeStyleFields,
		...fillStyleFields,
	]),
	'vue-draw': createPropsDescriptor('手绘节点', [
		...sizeFields,
		numberField('pointsCount', '点数量', disabledNumberProps),
		...strokeStyleFields,
		...fillStyleFields,
	]),
	'vue-qr': {
		title: '二维码节点',
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
			const size = clampNumber(model.qrSize, 24, 4096, toFiniteNumber(getProps(shape).w, 180))
			editor.updateShape({
				...getCommonPartial(shape, model),
				props: {
					w: size,
					h: size,
					text: String(model.text ?? ''),
					color: getOptionValue(model.color, colorOptions, 'black'),
					background: String(model.background ?? '#ffffff'),
					errorCorrectionLevel: getOptionValue(model.errorCorrectionLevel, qrLevelOptions, 'M'),
					margin: clampNumber(model.margin, 0, 24, 4),
					showBorder: Boolean(model.showBorder),
				},
			} as TLShapePartial)
		},
	},
	'vue-frame': createPropsDescriptor('画框节点', [
		...sizeFields,
		inputField('name', '画框名称'),
		...borderVisibilityFields,
	]),
	'vue-table': createPropsDescriptor('Table node', [
		...sizeFields,
		numberField('rowHeight', 'Row height', { min: 22, max: 72, step: 1 }),
		...borderVisibilityFields,
	]),
	'vue-material': {
		title: '物料节点',
		schema: createSchema('物料节点', [
			numberField('w', '宽度', { min: 280, step: 1 }),
			numberField('h', '高度', { min: 272, step: 1 }),
			inputField('name', '物料名称'),
		]),
		toModel(shape) {
			return {
				...getCommonModel(shape),
				...getFlatPropsModel(shape),
			}
		},
		apply(editor, shape, model) {
			const partial = getCommonPartial(shape, model)
			editor.run(() => {
				editor.updateShape({
					id: partial.id,
					type: partial.type,
					rotation: partial.rotation,
					opacity: partial.opacity,
					isLocked: partial.isLocked,
					props: {
						name: String(model.name ?? getProps(shape).name ?? ''),
					},
				} as TLShapePartial)
				updateVueMaterialShapeLayout(editor, shape.id, {
					x: toFiniteNumber(model.x, shape.x),
					y: toFiniteNumber(model.y, shape.y),
					w: clampNumber(model.w, 280, 4096, toFiniteNumber(getProps(shape).w, 500)),
					h: clampNumber(model.h, 272, 4096, toFiniteNumber(getProps(shape).h, 500)),
				})
			})
		},
	},
	'vue-material-section': {
		title: '物料分区',
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
			editor.updateShape({
				...getCommonPartial(shape, model),
				props: {
					h: clampNumber(model.h, 24, 4096, toFiniteNumber(getProps(shape).h, 60)),
					zone: getOptionValue(model.zone, materialZoneOptions, getProps(shape).zone ?? 'pageHeader'),
				},
			} as TLShapePartial)

			if (isShapeId(shape.parentId)) {
				normalizeVueMaterialSections(editor, shape.parentId)
			}
		},
	},
	group: {
		title: '分组节点',
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

watch(
	[selectedShape, isCanvasFormActive, workspaceCamera, () => props.workspaceRevision],
	() => {
		syncFormModel()
	},
	{ immediate: true }
)

function syncFormModel() {
	if (isCanvasFormActive.value) {
		formModel.value = getWorkspaceFormModel()
		return
	}

	const shape = selectedShape.value
	const descriptor = shape ? getShapeFormDescriptor(shape.type) : null
	formModel.value = shape && descriptor ? descriptor.toModel(shape) : {}
}

function getWorkspaceFormModel(): ShapeFormModel {
	const config = getWorkspaceConfigSnapshot()
	const pageSizeMm = config.pageSizeMm ?? { w: 80, h: 80 }
	const pxPerMm = toFiniteNumber(config.pxPerMm, 10)
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
		pxPerMm: roundNumber(pxPerMm),
		viewportW: roundNumber(viewportSize.w),
		viewportH: roundNumber(viewportSize.h),
		...getDataSourceFormModel(config.printDataSource),
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
		printDataSource: createDataSourceConfigFromModel(model),
	}

	if (props.applyWorkspaceTemplateConfig) {
		props.applyWorkspaceTemplateConfig(nextConfig)
		return
	}

	props.editor.run(() => props.editor.setCamera(nextConfig.camera!, { immediate: true }), {
		history: 'ignore',
	})
}

function getDataSourceFormModel(dataSource: VueTemplateWorkspaceConfig['printDataSource']) {
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
): VueTemplateWorkspaceConfig['printDataSource'] {
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

function createPropsDescriptor(title: string, fields: LowCodeField[]): ShapeFormDescriptor {
	return {
		title,
		schema: createSchema(title, fields),
		toModel(shape) {
			return {
				...getCommonModel(shape),
				...getFlatPropsModel(shape),
			}
		},
		apply(editor, shape, model) {
			editor.updateShape({
				...getCommonPartial(shape, model),
				props: getPropsPartial(shape, model),
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

	return model
}

function getCommonPartial(shape: TLShape, model: ShapeFormModel): TLShapePartial {
	return {
		id: shape.id,
		type: shape.type,
		x: toFiniteNumber(model.x, shape.x),
		y: toFiniteNumber(model.y, shape.y),
		rotation: degreesToRadians(toFiniteNumber(model.rotation, radiansToDegrees(shape.rotation))),
		opacity: clampNumber(model.opacity, 0, 100, shape.opacity * 100) / 100,
		isLocked: Boolean(model.isLocked),
	} as TLShapePartial
}

function getPropsPartial(shape: TLShape, model: ShapeFormModel) {
	const currentProps = getProps(shape)
	const nextProps: Record<string, unknown> = {}

	for (const field of activeDescriptor.value?.schema.fields ?? []) {
		const key = field.field
		if (key in commonModelKeys || key === 'shapeTypeLabel') continue
		if (key === 'assetId' || key === 'pointsCount' || key === 'propsJson') continue

		if (key === 'w' || key === 'h') {
			nextProps[key] = clampNumber(model[key], 1, 4096, toFiniteNumber(currentProps[key], 1))
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
		if (key === 'autoSize') {
			nextProps.autoSize = Boolean(model.autoSize)
			continue
		}
		if (key === 'showBorder') {
			nextProps.showBorder = Boolean(model.showBorder)
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
			'vue-frame': '画框节点',
			'vue-table': 'Table node',
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

function roundNumber(value: number) {
	return Math.round(value * 100) / 100
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
	<aside
		class="lowcode-form-panel"
		:class="{ 'is-collapsed': collapsed }"
		aria-label="低代码属性表单"
		@pointerdown.stop
		@pointermove.stop
		@keydown.stop
		@keyup.stop
		@keypress.stop
		@wheel.stop
		@contextmenu.prevent.stop
	>
		<button
			type="button"
			class="side-panel-toggle lowcode-form-panel__toggle"
			:aria-label="collapsed ? '展开属性面板' : '收起属性面板'"
			:title="collapsed ? '展开属性面板' : '收起属性面板'"
			@click="toggleCollapsed"
		>
			{{ collapsed ? '‹' : '›' }}
		</button>
		<header v-show="!collapsed" class="lowcode-form-panel__header">
			<div>
				<div class="lowcode-form-panel__title">{{ panelTitle }}</div>
				<div class="lowcode-form-panel__subtitle">{{ panelSubtitle }}</div>
			</div>
		</header>

		<div v-if="emptyMessage" v-show="!collapsed" class="lowcode-form-panel__empty">{{ emptyMessage }}</div>
		<LowCodeForm
			v-else-if="activeSchema && !collapsed"
			:key="formKey"
			:model-value="formModel"
			:schema="activeSchema"
			@update:model-value="handleModelUpdate"
		/>
	</aside>
</template>
