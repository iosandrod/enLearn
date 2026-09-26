<script setup lang="ts">
import LowCodeForm from '@enlearn/lowcode-framework/components/low-code-form'
import { useLowCodeHost } from '@enlearn/lowcode-framework/core/host'
import {
	$$formDesigner,
	createLowCodeFormSchemaFromDesignerResult,
} from '@enlearn/lowcode-framework/visual-editor/components/form-designer/form-designer.service'
import {
	$$gridDesigner,
	type GridDesignerEvent,
	type GridDesignerResult,
} from '@enlearn/lowcode-framework/designer'
import { createFormDesignerFieldsFromSchema } from '@enlearn/lowcode-framework/lowcode/block-materials/runtime-form-designer'
import type { FormDesignerResult } from '@enlearn/lowcode-framework/visual-editor/components/form-designer/form-designer.service'
import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode'
import { openGlobalDialog } from '@enlearn/lowcode-framework/runtime/global-dialog'
import type { Editor } from '@tldraw/editor'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as XLSX from 'xlsx'
import {
	createInlinePrintDataSource,
	getPrintDataSourceDetailRows,
	getPrintDataSourceDetailTables,
	getPrintDataSourceHeaderSchema,
	getPrintDataSourceFormCode,
	getPrintDataSourceFormModel,
	isLowCodeFormSchema,
	isPrintDataSourceFormDefinition,
	type PrintDataSourceFormDefinition,
} from '@/editor/dataSourceForm'
import type { PrintDataSourceDetailTable } from '@/print/types'
import type { VueTemplateWorkspaceConfig } from '@/editor/templateStore'

const SELECTOR_FORM_CODE = 'print-designer.datasource-selector'
const DATA_SOURCE_DEFINITION_FORM_CODE = 'print-designer.datasource-definition'
const DETAIL_IMPORT_FORM_CODE = 'print-designer.datasource-detail-import'

type DataSourceAction = 'add' | 'manage' | 'design'

type DetailImportConfig = {
	hasFieldRow: boolean
	hasChineseRow: boolean
	sheetName: string
	mode: 'append' | 'replace'
}

type AddDetailTableModel = {
	label: string
	field: string
}

interface StoredFormDefinition {
	id: string
	code: string
	name: string
	description?: string | null
	table_name?: string | null
	schema: PrintDataSourceFormDefinition['schema']
	enabled: boolean
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

const host = useLowCodeHost()
const selectorDefinition = ref<StoredFormDefinition | null>(null)
const dataSourceDefinitionForm = ref<StoredFormDefinition | null>(null)
const activeDefinition = ref<PrintDataSourceFormDefinition | null>(null)
const definitionsLoading = ref(true)
const definitionError = ref('')
const selectorModel = ref<Record<string, unknown>>({ formCode: '' })
const formModel = ref<Record<string, unknown>>({})
const activeSourceTab = ref<'header' | 'detail'>('header')
const detailTables = computed(() =>
	activeDefinition.value ? getPrintDataSourceDetailTables(activeDefinition.value.schema) : [],
)
const detailFormModel = ref<Record<string, unknown[]>>({})
const detailFormSchema = computed<LowCodeFormSchema>(() => ({
	title: '明细数据',
		columns: 1,
		fields: detailTables.value.map((table) => ({
			field: table.field,
			label: table.label,
			component: 'lc-array-table',
			showTitle: false,
			props: {
				columns: table.columns.map((column) => ({
					...column,
					component: column.component ?? 'vxe-input',
				})),
				showSeq: true,
				fillAvailableHeight: true,
				toolbarButtons: [
					{ code: 'add', label: '新增行', command: 'add', status: 'primary' },
					{
						code: 'clear',
						label: '清空',
						status: 'warning',
						execute: ({ rows }: { rows: Record<string, unknown>[] }) => {
							rows.splice(0, rows.length)
							handleDetailFormUpdate({ ...detailFormModel.value, [table.field]: [] })
						},
					},
					{
						code: 'import',
						label: '导入',
						execute: () => {
							activeDetailTableId.value = table.id
							void handleImportData()
						},
					},
					{
						code: 'configure',
						label: '表格配置',
						execute: () => {
							activeDetailTableId.value = table.id
							void handleConfigureDetailTable()
						},
					},
					{
						code: 'delete',
						label: '删除子表',
						status: 'danger',
						execute: () => {
							activeDetailTableId.value = table.id
							void handleDeleteDetailTable()
						},
					},
				],
				...(table.gridOptions ?? {}),
			},
		})),
		layout: [{
			kind: 'tabs',
			fillRemaining: true,
			defaultKey: activeDetailTableId.value || detailTables.value[0]?.id,
			tabs: detailTables.value.map((table) => ({
				key: table.id,
				label: `${table.label}（${table.field}）`,
				blocks: [{ kind: 'field', field: table.field }],
			})),
		}],
		actions: [],
}))
const activeDetailTableId = ref('')
const activeDetailTable = computed(() =>
	detailTables.value.find((table) => table.id === activeDetailTableId.value) ?? detailTables.value[0],
)
const detailRows = computed(() => {
	const table = activeDetailTable.value
	return table ? getPrintDataSourceDetailRows(getWorkspaceDataSource(), table.field) : []
})
const actionMessage = ref('')
const actionMessageTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const importFileInput = ref<HTMLInputElement | null>(null)
const pendingDetailImportConfig = ref<DetailImportConfig | null>(null)
const emit = defineEmits<{
	'data-source-action': [action: DataSourceAction]
}>()
const panelSubtitle = computed(() => {
	const definition = activeDefinition.value
	return definition ? `${definition.name} · ${definition.table_name}` : '请选择低代码表单'
})
let definitionRequestRevision = 0

function notifyAction(action: DataSourceAction) {
	emit('data-source-action', action)
	if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent('enlearn:print-data-source-action', {
			detail: {
				action,
				formCode: activeDefinition.value?.code ?? '',
				formId: activeDefinition.value?.id ?? '',
			},
		}))
	}
}

function setActionMessage(message: string) {
	actionMessage.value = message
	if (actionMessageTimer.value) clearTimeout(actionMessageTimer.value)
	actionMessageTimer.value = setTimeout(() => {
		actionMessage.value = ''
		actionMessageTimer.value = null
	}, 3200)
}

async function handleAddDataSource() {
	notifyAction('add')
	if (definitionsLoading.value) return
	setActionMessage('正在打开数据源表单设计器…')
	const headerModel: Record<string, unknown> = {
		code: 'print-designer.datasource.',
		name: '',
		tableName: '',
		description: '',
	}
	void $$formDesigner({
		title: '新增打印数据源',
		mode: 'edit',
		fields: [
			{
				field: 'value',
				label: '值',
				component: 'vxe-input',
				placeholder: '请输入值',
			},
		],
		columns: 1,
		headerForm: {
			schema: dataSourceDefinitionForm.value?.schema ?? createDataSourceDefinitionSchema(),
			model: headerModel,
		},
		serviceApi: host.getServiceApi(),
		onConfirm: async (result) => {
			const code = await saveDataSourceDefinition(result.header ?? headerModel, result)
			await loadDefinitions()
			await activateDefinition(code, true)
			setActionMessage('数据源已创建。')
		},
	})
}

function handleManageDataSource() {
	notifyAction('manage')
	setActionMessage('已触发数据源管理操作。')
}

function handleDesignDataSource() {
	notifyAction('design')
	const definition = activeDefinition.value
	if (!definition) {
		setActionMessage('请先选择一个数据源再进行设计。')
		return
	}
	setActionMessage(`正在打开“${definition.name}”的数据源设计器…`)
	const headerModel: Record<string, unknown> = {
		code: definition.code,
		name: definition.name,
		tableName: definition.table_name,
		description: definition.description ?? '',
	}
	void $$formDesigner({
		title: `设计打印数据源 - ${definition.name}`,
		mode: 'edit',
		fields: createFormDesignerFieldsFromSchema(getPrintDataSourceHeaderSchema(definition.schema)),
		layout: getPrintDataSourceHeaderSchema(definition.schema).layout,
		columns: getPrintDataSourceHeaderSchema(definition.schema).columns,
		headerForm: {
			schema: dataSourceDefinitionForm.value?.schema ?? createDataSourceDefinitionSchema(true),
			model: headerModel,
		},
		designerModel: null,
		serviceApi: host.getServiceApi(),
		onConfirm: async (result) => {
			await saveDataSourceDefinition(result.header ?? headerModel, result, definition.id, definition.schema)
			await loadDefinitions()
			setActionMessage('数据源设计已保存。')
		},
	})
}

async function handleAddDetailTable() {
	notifyAction('design')
	const definition = activeDefinition.value
	if (!definition) {
		setActionMessage('请先选择一个数据源再添加子表。')
		return
	}
	const nextIndex = detailTables.value.length + 1
	const model: AddDetailTableModel = {
		label: `明细${nextIndex}`,
		field: `detail_${nextIndex}`,
	}
	const result = await openGlobalDialog<AddDetailTableModel>({
		title: '添加子表',
		width: 520,
		model,
		form: {
			schema: createAddDetailTableSchema(),
			model,
		},
		actions: [
			{ code: 'cancel', label: '取消', role: 'cancel' },
			{ code: 'confirm', label: '添加', role: 'confirm', status: 'primary' },
		],
		onConfirm: ({ model: values }) => {
			const label = readString(values.label)
			const field = readString(values.field)
			if (!label) throw new Error('请输入子表名称。')
			if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) {
				throw new Error('子表字段只能以字母或下划线开头，并包含字母、数字或下划线。')
			}
			if (detailTables.value.some((table) => table.field === field)) {
				throw new Error(`子表字段“${field}”已存在。`)
			}
		},
	})
	debugger//
	if (result.action !== 'confirm') return

	const label = readString(result.values.label)
	const field = readString(result.values.field)
	const table: PrintDataSourceDetailTable = {
		id: createDetailTableId(),
		field,
		label,
		columns: [{ field: 'value', title: '值', width: 120 }],
	}
	try {
		await saveDetailTables(definition, [...detailTables.value, table], table.id)
	} catch (error) {
		setActionMessage(error instanceof Error ? error.message : '子表保存失败。')
	}
}

function createAddDetailTableSchema(): LowCodeFormSchema {
	return {
		title: '子表信息',
		columns: 1,
		fields: [
			{
				field: 'label',
				label: '子表名称',
				component: 'vxe-input',
				props: { placeholder: '例如：商品明细' },
				rules: [{ required: true, message: '请输入子表名称' }],
			},
			{
				field: 'field',
				label: '数据字段',
				component: 'vxe-input',
				props: { placeholder: '例如：items' },
				rules: [{ required: true, message: '请输入数据字段' }],
			},
		],
		actions: [],
	}
}

async function handleDeleteDetailTable() {
	notifyAction('design')
	const definition = activeDefinition.value
	const table = activeDetailTable.value
	if (!definition || !table) return
	await saveDetailTables(
		definition,
		detailTables.value.filter((item) => item.id !== table.id),
	)
}

async function handleConfigureDetailTable() {
	notifyAction('design')
	const definition = activeDefinition.value
	const table = activeDetailTable.value
	if (!definition || !table) {
		setActionMessage('请先添加一个明细子表再进行配置。')
		return
	}
	setActionMessage('正在打开子表 Grid 配置…')
	void $$gridDesigner({
		title: `配置子表 - ${table.label}`,
		columns: table.columns.map((column) => ({ ...column })),
		gridOptions: table.gridOptions,
		gridEvents: table.gridEvents
			? table.gridEvents.map((event) => ({ ...event })) as GridDesignerEvent[]
			: undefined,
		serviceApi: host.getServiceApi(),
		onConfirm: async (result: GridDesignerResult) => {
			const nextTable: PrintDataSourceDetailTable = {
				...table,
				label: result.business.title || table.label,
				columns: result.columns.map((column) => ({
					...column,
					field: readString(column.field),
					title: readString(column.title, readString(column.field)),
					width: Number.isFinite(Number(column.width)) ? Number(column.width) : undefined,
				})).filter((column) => column.field),
				gridOptions: result.gridOptions,
				gridEvents: result.gridEvents,
			}
			await saveDetailTables(
				definition,
				detailTables.value.map((item) => item.id === table.id ? nextTable : item),
				table.id,
			)
		},
	})
}

function handleAddDetailRow() {
	const table = activeDetailTable.value
	if (!table) return
	const row = Object.fromEntries(table.columns.map((column) => [column.field, '']))
	updateDetailRows(table.field, [...detailRows.value, row])
	setActionMessage('已新增一行明细。')
}

function handleClearDetailRows() {
	const table = activeDetailTable.value
	if (!table || !detailRows.value.length) return
	updateDetailRows(table.field, [])
	setActionMessage('当前明细数据已清空。')
}

async function handleImportData() {
	if (!activeDetailTable.value) {
		setActionMessage('请先选择一个明细子表。')
		return
	}
	pendingDetailImportConfig.value = null
	try {
		const config = await openDetailImportDialog()
		if (!config) return
		pendingDetailImportConfig.value = config
		// The file picker must be opened only after the configuration is confirmed.
		importFileInput.value?.click()
	} catch (error) {
		setActionMessage(error instanceof Error ? error.message : '导入配置打开失败。')
	}
}

async function handleImportFileChange(event: Event) {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	input.value = ''
	const config = pendingDetailImportConfig.value
	pendingDetailImportConfig.value = null
	if (!file || !config) return
	try {
		await importDetailFile(file, config)
	} catch (error) {
		setActionMessage(error instanceof Error ? error.message : '明细 Excel 导入失败。')
	}
}

async function openDetailImportDialog(): Promise<DetailImportConfig | undefined> {
	const schema = await loadDetailImportSchema()
	const model: DetailImportConfig = {
		hasFieldRow: true,
		hasChineseRow: false,
		sheetName: '',
		mode: 'append',
	}
	const result = await openGlobalDialog<DetailImportConfig>({
		title: '导入明细数据',
		width: 520,
		model,
		form: { schema, model },
		actions: [
			{ code: 'cancel', label: '取消', role: 'cancel' },
			{
				code: 'confirm',
				label: '开始导入',
				role: 'confirm',
				status: 'primary',
			},
		],
	})
	return result.action === 'confirm' ? result.values : undefined
}

async function loadDetailImportSchema(): Promise<LowCodeFormSchema> {
	try {
		const rows = await host.getServiceApi().invoke<unknown[]>('lowcode', 'listItems', {
			resource: 'lowcode_form_definitions',
			filters: { code: DETAIL_IMPORT_FORM_CODE, enabled: true },
			limit: 1,
		})
		const schema = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined)?.schema : undefined
		if (isLowCodeFormSchema(schema)) return structuredClone(schema)
	} catch {
		// Use the local schema when the catalog is temporarily unavailable.
	}
	return createDetailImportSchema()
}

function createDetailImportSchema(): LowCodeFormSchema {
	return {
		title: 'Excel 导入配置',
		columns: 2,
		fields: [
			{
				field: 'hasFieldRow',
				label: '包含 field 行',
				component: 'vxe-switch',
				defaultValue: true,
			},
			{
				field: 'hasChineseRow',
				label: '包含中文行',
				component: 'vxe-switch',
				defaultValue: false,
			},
			{
				field: 'sheetName',
				label: '工作表名称',
				component: 'vxe-input',
				props: { placeholder: '留空使用第一个工作表' },
			},
			{
				field: 'mode',
				label: '导入方式',
				component: 'vxe-select',
				options: [
					{ label: '追加到现有数据', value: 'append' },
					{ label: '替换现有数据', value: 'replace' },
				],
				defaultValue: 'append',
			},
		],
		actions: [],
	}
}

async function importDetailFile(file: File, config: DetailImportConfig) {
	const table = activeDetailTable.value
	if (!table) return
	setActionMessage('正在解析 Excel 明细数据…')
	const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
	const sheet = config.sheetName.trim() ? workbook.Sheets[config.sheetName.trim()] : workbook.Sheets[workbook.SheetNames[0]]
	if (!sheet) throw new Error('未找到指定的 Excel 工作表。')
	const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false })
	const rows = convertImportedRows(matrix, table, config)
	if (!rows.length) throw new Error('Excel 中没有可导入的明细数据。')
	updateDetailRows(table.field, config.mode === 'replace' ? rows : [...detailRows.value, ...rows])
	setActionMessage(`已导入 ${rows.length} 行明细数据。`)
}

function convertImportedRows(matrix: unknown[][], table: PrintDataSourceDetailTable, config: DetailImportConfig) {
	const columns = table.columns.filter((column) => column.field)
	if (!columns.length) return []
	let dataRows = matrix.map((row) => row.map((value) => value === null || value === undefined ? '' : String(value)))
	let fieldIndexes = columns.map((_column, index) => index)
	if (config.hasFieldRow && dataRows.length) {
		const fieldRow = dataRows.shift() ?? []
		fieldIndexes = columns.map((column, index) => {
			const field = fieldRow.findIndex((value) => value.trim() === column.field || value.trim() === column.title)
			return field >= 0 ? field : index
		})
	}
	if (config.hasChineseRow && dataRows.length) dataRows.shift()
	return dataRows
		.filter((row) => row.some((value) => value.trim()))
		.map((row) => Object.fromEntries(columns.map((column, index) => [column.field, row[fieldIndexes[index]] ?? ''])))
}

function updateDetailRows(field: string, rows: Record<string, unknown>[]) {
	detailFormModel.value = { ...detailFormModel.value, [field]: rows }
	const current = props.getWorkspaceTemplateConfig?.() ?? {}
	const source = current.printDataSource
	if (!source || source.type !== 'inline') return
	const inlineSource = source as Extract<NonNullable<VueTemplateWorkspaceConfig['printDataSource']>, { type: 'inline' }>
	const sourceRows = inlineSource.rows.length ? inlineSource.rows.map((row) => ({ ...row })) : [{}]
	sourceRows[0][field] = rows
	props.applyWorkspaceTemplateConfig?.({
		...current,
		printDataSource: { ...inlineSource, rows: sourceRows },
	})
}

function syncDetailFormModel(source = getWorkspaceDataSource()) {
	detailFormModel.value = Object.fromEntries(
		detailTables.value.map((table) => [
			table.field,
			getPrintDataSourceDetailRows(source, table.field),
		]),
	)
}

function handleDetailFormUpdate(value: Record<string, unknown>) {
	const nextModel = Object.fromEntries(
		detailTables.value.map((table) => [
			table.field,
			Array.isArray(value[table.field]) ? value[table.field] : [],
		]),
	)
	detailFormModel.value = nextModel as Record<string, unknown[]>
	const current = props.getWorkspaceTemplateConfig?.() ?? {}
	const source = current.printDataSource
	if (!source || source.type !== 'inline') return
	const inlineSource = source as Extract<NonNullable<VueTemplateWorkspaceConfig['printDataSource']>, { type: 'inline' }>
	const rows = inlineSource.rows.length ? inlineSource.rows : [{}]
	props.applyWorkspaceTemplateConfig?.({
		...current,
		printDataSource: {
			...inlineSource,
			rows: rows.map((row) => ({
				...row,
				...nextModel,
			})),
		},
	})
}

function handleDetailTabChange(key: string) {
	const table = detailTables.value.find((item) => item.id === key)
	if (!table) return
	activeDetailTableId.value = table.id
	const current = props.getWorkspaceTemplateConfig?.() ?? {}
	const source = current.printDataSource
	if (!source || source.type !== 'inline' || source.detailField === table.field) return
	props.applyWorkspaceTemplateConfig?.({
		...current,
		printDataSource: {
			...source,
			detailField: table.field,
			detailColumns: table.columns.map((column) => ({ ...column })),
		},
	})
}

function createDataSourceDefinitionSchema(readonlyCode = false): LowCodeFormSchema {
	return {} as any
}

async function saveDataSourceDefinition(
	model: Record<string, unknown>,
	result: FormDesignerResult,
	id?: string,
	existingSchema?: PrintDataSourceFormDefinition['schema'],
): Promise<string> {
	const code = readString(model.code)
	const name = readString(model.name)
	const tableName = readString(model.tableName)
	const description = readString(model.description)
	if (!/^print-designer\.datasource\./.test(code)) {
		throw new Error('数据源编码必须以 print-designer.datasource. 开头')
	}

	const serviceApi = host.getServiceApi()
	if (!id) {
		const existing = await serviceApi.invoke<unknown[]>('lowcode', 'listItems', {
			resource: 'lowcode_form_definitions',
			filters: { code },
			limit: 1,
		})
		if (Array.isArray(existing) && existing.length) {
			throw new Error(`数据源编码“${code}”已存在。`)
		}
	}
	const schema = {
		...createLowCodeFormSchemaFromDesignerResult(result),
		title: name || code,
		columns: 1,
		printDetail: existingSchema?.printDetail ?? [],
	}
	await serviceApi.invoke('lowcode', id ? 'updateItem' : 'createItem', {
		resource: 'lowcode_form_definitions',
		...(id ? { id } : {}),
		data: {
			...(id ? {} : { code }),
			name,
			description,
			table_name: tableName,
			schema,
			enabled: true,
		},
	})
	return code
}

async function saveDetailTables(
	definition: PrintDataSourceFormDefinition,
	tables: PrintDataSourceDetailTable[],
	selectedId?: string,
) {
	const schema = {
		// ...structuredClone(definition.schema),
		...definition.schema,//
		printDetail: tables,
	}
	const nextDefinition: PrintDataSourceFormDefinition = {
		...definition,
		schema,
	}
	// Update the local definition and canvas source first so the left data-source
	// menu reflects the new detail table immediately, without waiting for the
	// catalog round-trip to finish.
	activeDefinition.value = nextDefinition
	activeDetailTableId.value = selectedId ?? tables[0]?.id ?? ''
	applyWorkspaceDetailTables(tables)
	syncDetailFormModel()
	activeSourceTab.value = 'detail'
	try {
		await host.getServiceApi().invoke('lowcode', 'saveItem', {
			resource: 'lowcode_form_definitions',//
			id: definition.id,
			data: { schema },
		})
		// await loadDefinitions()
	} catch (error) {
		console.error(error)//
		// Keep the optimistic local state visible, but report the persistence error.
		setActionMessage(error instanceof Error ? error.message : '子表配置保存失败。')
		return
	}
	setActionMessage('子表配置已保存。')
}

function applyWorkspaceDetailTables(tables: PrintDataSourceDetailTable[]) {
	const current = props.getWorkspaceTemplateConfig?.() ?? {}
	const source = current.printDataSource
	if (!source || source.type !== 'inline') return
	const inlineSource = source as Extract<NonNullable<VueTemplateWorkspaceConfig['printDataSource']>, { type: 'inline' }>

	const previousFields = new Set(
		(inlineSource.detailTables ?? []).map((table) => readString(table.field)).filter(Boolean),
	)
	const nextFields = new Set(tables.map((table) => table.field))
	const sourceRows = inlineSource.rows.length ? inlineSource.rows : [{}]
	const rows = sourceRows.map((row) => {
		const nextRow = { ...row }
		previousFields.forEach((field) => {
			if (!nextFields.has(field)) delete nextRow[field]
		})
		tables.forEach((table) => {
			if (!Array.isArray(nextRow[table.field])) nextRow[table.field] = []
		})
		return nextRow
	})
	props.applyWorkspaceTemplateConfig?.({
		...current,
		printDataSource: {
			...inlineSource,
			rows,
			detailField: tables.find((table) => table.id === activeDetailTableId.value)?.field ?? tables[0]?.field,
			detailColumns: (tables.find((table) => table.id === activeDetailTableId.value)?.columns ?? tables[0]?.columns ?? []).map((column) => ({ ...column })),
			detailTables: tables.map((table) => ({
				...table,
				columns: table.columns.map((column) => ({ ...column })),
			})),
		},
	})
}

function createDetailTableId() {
	return `detail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function loadDefinitions() {
	definitionsLoading.value = true
	definitionError.value = ''
	try {
		selectorDefinition.value = await loadStoredFormDefinition(SELECTOR_FORM_CODE)
		dataSourceDefinitionForm.value = await loadStoredFormDefinition(
			DATA_SOURCE_DEFINITION_FORM_CODE,
		)
		const sourceCode = getPrintDataSourceFormCode(getWorkspaceDataSource())
		const defaultCode = readString(
			selectorDefinition.value.schema.fields.find((field) => field.field === 'formCode')
				?.defaultValue
		)
		const nextCode = sourceCode || defaultCode
		if (!nextCode) throw new Error('数据源选择器没有配置默认低代码表单。')

		selectorModel.value = { formCode: nextCode }
		await activateDefinition(nextCode, false)
	} catch (error) {
		selectorDefinition.value = null
		dataSourceDefinitionForm.value = null
		activeDefinition.value = null
		selectorModel.value = { formCode: '' }
		formModel.value = {}
		definitionError.value = isOptionalFormDefinitionError(error)
			? ''
			: error instanceof Error
				? error.message
				: '低代码表单定义加载失败，请稍后重试。'
	} finally {
		definitionsLoading.value = false
	}
}

async function handleDefinitionChange(value: Record<string, unknown>) {
	selectorModel.value = value
	const nextCode = readString(value.formCode)
	if (!nextCode || nextCode === activeDefinition.value?.code) return

	definitionsLoading.value = true
	definitionError.value = ''
	try {
		await activateDefinition(nextCode, true)
	} catch (error) {
		selectorModel.value = { formCode: activeDefinition.value?.code ?? '' }
		definitionError.value = isOptionalFormDefinitionError(error)
			? ''
			: error instanceof Error
				? error.message
				: '低代码表单定义加载失败，请稍后重试。'
	} finally {
		definitionsLoading.value = false
	}
}

function handleModelUpdate(value: Record<string, unknown>) {
	formModel.value = value
	const definition = activeDefinition.value
	if (!definition || props.editor.getIsReadonly()) return
	applyFormModel(value, definition)
}

function applyFormModel(
	value: Record<string, unknown>,
	definition: PrintDataSourceFormDefinition
) {
	const current = props.getWorkspaceTemplateConfig?.() ?? {}
	props.applyWorkspaceTemplateConfig?.({
		...current,
		printDataSource: createInlinePrintDataSource(value, definition, getWorkspaceDataSource()),
	})
}

function syncFormModel() {
	const definition = activeDefinition.value
	formModel.value = definition
		? getPrintDataSourceFormModel(getWorkspaceDataSource(), definition.schema)
		: {}
}

async function activateDefinition(code: string, resetModel: boolean) {
	const requestRevision = ++definitionRequestRevision
	const definition = await loadStoredFormDefinition(code)
	if (requestRevision !== definitionRequestRevision) return
	if (!isPrintDataSourceFormDefinition(definition)) {
		throw new Error(`表单定义“${code}”未关联业务表或 schema 无效。`)
	}

	activeDefinition.value = definition
	activeSourceTab.value = 'header'
	const detailDefinitions = getPrintDataSourceDetailTables(definition.schema)
	const workspaceSource = getWorkspaceDataSource()
	const activeField = workspaceSource?.type === 'inline' ? workspaceSource.detailField : undefined
	activeDetailTableId.value = detailDefinitions.find((table) => table.field === activeField)?.id
		?? detailDefinitions[0]?.id
		?? ''
	syncDetailFormModel()
	selectorModel.value = { formCode: definition.code }
	formModel.value = getPrintDataSourceFormModel(
		resetModel ? undefined : getWorkspaceDataSource(),
		getPrintDataSourceHeaderSchema(definition.schema)
	)
	// A selector can load a default form while the workspace still has no
	// print data source. Keep the panel and canvas menu in sync by materializing
	// that definition as an inline source once. Existing inline sources (even
	// generic ones without a form code) are intentionally left untouched.
	const currentSource = getWorkspaceDataSource()
	if (resetModel || !currentSource || currentSource.type === 'none') {
		applyFormModel(formModel.value, definition)
	}
}

async function loadStoredFormDefinition(code: string): Promise<StoredFormDefinition> {
	const serviceApi = host.getServiceApi()
	const rows = await serviceApi.invoke<unknown[]>('lowcode', 'listItems', {
		resource: 'lowcode_form_definitions',
		filters: { code, enabled: true },
		limit: 1,
	})
	const definition = Array.isArray(rows) ? rows[0] : undefined
	if (!isStoredFormDefinition(definition)) {
		throw new Error(`表单定义“${code}”不存在、已停用或 schema 无效。`)
	}
	return {
		...definition,
		schema: structuredClone(definition.schema),
	}
}

function isStoredFormDefinition(value: unknown): value is StoredFormDefinition {
	if (!isRecord(value)) return false
	return (
		typeof value.id === 'string' &&
		typeof value.code === 'string' &&
		typeof value.name === 'string' &&
		value.enabled !== false &&
		isLowCodeFormSchema(value.schema)
	)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown, fallback = '') {
	return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function isOptionalFormDefinitionError(error: unknown) {
	if (!(error instanceof Error)) return false
	return /低代码表单|表单定义.*(不存在|已停用|无效)|选择器没有配置默认/.test(error.message)
}

function getWorkspaceDataSource() {
	return props.getWorkspaceTemplateConfig?.()?.printDataSource
}

onMounted(() => {
	void loadDefinitions()
})

onBeforeUnmount(() => {
	if (actionMessageTimer.value) clearTimeout(actionMessageTimer.value)
})

watch(
	() => props.workspaceRevision,
	() => {
		const sourceCode = getPrintDataSourceFormCode(getWorkspaceDataSource())
		if (sourceCode && sourceCode !== activeDefinition.value?.code) {
			selectorModel.value = { formCode: sourceCode }
			void activateDefinition(sourceCode, false).catch((error) => {
				definitionError.value = isOptionalFormDefinitionError(error)
					? ''
					: error instanceof Error
						? error.message
						: '低代码表单定义加载失败，请稍后重试。'
			})
			return
		}
		syncFormModel()
	}
)
</script>

<template>
	<section class="lowcode-form-panel data-source-panel" aria-label="打印数据源表单" @pointerdown.stop @pointermove.stop
		@keydown.stop @keyup.stop @keypress.stop @wheel.stop @contextmenu.prevent.stop>
		<input ref="importFileInput" class="data-source-panel__file-input" type="file" accept=".xlsx,.xls,.csv"
			@change="handleImportFileChange" />
		<header class="lowcode-form-panel__header">
			<div class="lowcode-form-panel__heading">
				<div class="lowcode-form-panel__title">数据源</div>
				<div class="lowcode-form-panel__subtitle">{{ panelSubtitle }}</div>
			</div>
		</header>
		<div v-if="selectorDefinition" class="data-source-panel__selector-form">
			<div class="data-source-panel__actions-footer">
			<div class="lowcode-form-panel__header-actions" aria-label="数据源操作">
				<button type="button" class="lowcode-form-panel__action lowcode-form-panel__action--primary"
					:disabled="definitionsLoading" title="添加数据源" @click="handleAddDataSource">
					<i class="ri-add-line" aria-hidden="true" />
					<span>添加</span>
				</button>
				<button type="button" class="lowcode-form-panel__action" title="管理数据源" @click="handleManageDataSource">
					<i class="ri-settings-3-line" aria-hidden="true" />
					<span>管理</span>
				</button>
				<button type="button" class="lowcode-form-panel__action" title="设计数据源" @click="handleDesignDataSource">
					<i class="ri-layout-4-line" aria-hidden="true" />
					<span>设计</span>
				</button>
			</div>
		</div>
			<LowCodeForm :model-value="selectorModel" :schema="selectorDefinition.schema" :disabled="definitionsLoading"
				@update:model-value="handleDefinitionChange" />
		</div>
		<div v-if="definitionsLoading" class="lowcode-form-panel__state" role="status">
			正在加载低代码表单...
		</div>
		<div v-else-if="definitionError" class="lowcode-form-panel__state lowcode-form-panel__state--error"
			role="alert">
			<p>{{ definitionError }}</p>
			<button type="button" @click="loadDefinitions">重新加载</button>
		</div>
		<div v-else-if="activeDefinition" class="data-source-panel__body">
			<div class="data-source-panel__tabs" role="tablist" aria-label="数据源区域">
				<button type="button" :class="['data-source-panel__tab', { 'is-active': activeSourceTab === 'header' }]"
					role="tab" :aria-selected="activeSourceTab === 'header'" @click="activeSourceTab = 'header'">
					表头
				</button>
				<button type="button" :class="['data-source-panel__tab', { 'is-active': activeSourceTab === 'detail' }]"
					role="tab" :aria-selected="activeSourceTab === 'detail'" @click="activeSourceTab = 'detail'">
					明细
				</button>
			</div>
			<div v-if="activeSourceTab === 'header'" class="data-source-panel__header-form" role="tabpanel">
				<LowCodeForm :key="activeDefinition.code" :model-value="formModel"
					:schema="getPrintDataSourceHeaderSchema(activeDefinition.schema)"
					@update:model-value="handleModelUpdate" />
			</div>
			<div v-else class="data-source-panel__detail" role="tabpanel">
				<div class="data-source-panel__detail-toolbar">
					<div class="data-source-panel__detail-actions">

						<button type="button" class="lowcode-form-panel__action lowcode-form-panel__action--primary"
							@click="handleAddDetailTable">
							<i class="ri-add-line" aria-hidden="true" />
							<span>添加子表</span>
						</button>
					</div>
				</div>
				<LowCodeForm
					v-if="detailTables.length"
					:model-value="detailFormModel"
					:schema="detailFormSchema"
					class="data-source-panel__detail-form"
					@update:model-value="handleDetailFormUpdate"
					@tab-change="handleDetailTabChange"
				/>
				<div v-else class="lowcode-form-panel__state">
					暂未添加明细子表，请先点击“添加子表”。
				</div>
			</div>
		</div>

	</section>
</template>
