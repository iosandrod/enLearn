<script setup lang="ts">
import LowCodeForm from '@enlearn/lowcode-framework/components/low-code-form'
import { useLowCodeHost } from '@enlearn/lowcode-framework/core/host'
import { openGlobalDialog } from '@enlearn/lowcode-framework/runtime/global-dialog'
import {
	createPrintDetailToolbar,
	type ArrayTableToolbarExecutionContext,
} from '@enlearn/lowcode-framework/runtime'
import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode'
import { computed, h, nextTick, reactive, ref, type Ref } from 'vue'
import { useVxeMessage } from '@enlearn/lowcode-framework/utils/vxe-message'
import { getPrintDataSourceFormModel } from '@/editor/dataSourceForm'
import { syncPrintDetailFields } from '@/editor/printDetailFieldSync'
import { openPrintDetailColumnsDialog } from '@/editor/printDetailColumnsDialog'
import { importPrintDetailData } from '@/editor/printDetailImport'
import type { PrintDataRow, PrintDataSourceDetailTable } from '@/print/types'

const props = defineProps<{
	rows: readonly PrintDataRow[]
	schema: LowCodeFormSchema
	detailTables: readonly PrintDataSourceDetailTable[]
	saveDetailTables: (tables: PrintDataSourceDetailTable[]) => Promise<boolean>
	readonly: boolean
	activeRowIndex?: number
	compact?: boolean
	busy?: boolean
}>()
const emit = defineEmits<{
	'update:rows': [rows: PrintDataRow[]]
	'select-row': [index: number]
	'import': []
	'fetch': []
	'configure-script': []
}>()
const host = useLowCodeHost()
const errorMessage = ref('')
useVxeMessage(errorMessage, 'error')
const columns = computed(() => [
	...props.schema.fields.filter(field => !props.detailTables.some(table => table.field === field.field))
		.map(field => ({ field: field.field, title: field.label || field.field, detail: false })),
	...props.detailTables.map(table => ({ field: table.field, title: table.label, detail: true })),
])
// This display model is never saved: row actions edit the original records,
// preserving nested detail arrays and fields absent from the header schema.
const tableModel = computed(() => ({
	records: props.rows.map(row => Object.fromEntries(columns.value.map(column => {
		const value = row[column.field]
		return [
			column.field,
			column.detail ? `${Array.isArray(value) ? value.length : 0} 条明细` : cellText(row, column.field),
		]
	}))),
}))
const tableSchema = computed<LowCodeFormSchema>(() => ({
	columns: 1,
	fields: [{
		field: 'records',
		label: '表头记录',
		component: 'lc-array-table',
		showTitle: false,
		props: {
			columns: columns.value.map(column => ({
				field: column.field, title: column.title, component: 'lc-text', minWidth: 150,
			})),
			height: '100%',
			showSeq: true,
			movable: false,
			removable: false,
			copyable: false,
			actionWidth: 162,
			toolbarButtons: [
				{ code: 'create', label: '新增行', execute: () => editRow() },
				{ code: 'import', label: '导入', execute: () => emit('import') },
				{ code: 'fetch', label: '获取数据', execute: () => emit('fetch') },
				{ code: 'configure-script', label: '设置关联脚本', execute: () => emit('configure-script') },
			],
			rowActions: [
				{ code: 'edit', label: '编辑', status: 'primary' },
				{ code: 'copy', label: '复制' },
				{ code: 'delete', label: '删除', status: 'danger' },
			],
			onRowAction: ({ actionCode, index }: { actionCode: string; index: number }) => {
				if (index < 0 || index >= props.rows.length) return
				if (actionCode === 'edit') void editRow(index)
				else if (actionCode === 'copy') copyRow(index)
				else if (actionCode === 'delete') deleteRow(index)
			},
			onRowClick: ({ index }: { index: number }) => selectRow(index),
			onRowDblclick: ({ index }: { index: number }) => {
				if (index >= 0 && index < props.rows.length) void editRow(index)
			},
			rowClassName: createRowClassName(props.activeRowIndex),
		},
	}],
	actions: [],
}))
type RowForm = {
	commitPendingValues(): void
	validate(): Promise<boolean>
	snapshot(): Record<string, unknown>
}
type RowEditSession = {
	tables: Ref<PrintDataSourceDetailTable[]>
	form: Ref<RowForm | null>
	pending: Ref<number>
	active: boolean
	metadata: Map<string, { metadata: unknown; rows: Record<string, unknown>[] }>
}

function createRowSchema(session: RowEditSession, activeTab: string): LowCodeFormSchema {
	const tables = session.tables.value
	const detailNames = new Set(tables.map(table => table.field))
	const headerFields = props.schema.fields.filter(field => !detailNames.has(field.field))
	const headerLayout = (props.schema.layout ?? headerFields.map(field => ({ kind: 'field' as const, field: field.field })))
		.filter(node => node.kind !== 'field' || !detailNames.has(node.field))
	const detailFields = tables.map(table => ({
		field: table.field,
		label: table.label,
		component: 'lc-array-table',
		showTitle: false,
		props: {
			columns: table.columns.map(column => ({
				...column,
				component: column.component ?? 'vxe-input',
			})),
			showSeq: true,
			fillAvailableHeight: true,
			copyable: true,
			...(table.gridOptions ?? {}),
			toolbarButtons: createRowDetailToolbar(table, session),
		},
	}))
	return {
		...props.schema,
		columns: 1,
		fields: [...headerFields, ...detailFields],
		layout: [
			...headerLayout,
			...(tables.length ? [{
				kind: 'tabs' as const,
				fillRemaining: true,
				defaultKey: activeTab || tables[0]?.id,
				tabs: tables.map(table => ({
					key: table.id,
					label: `${table.label}（${table.field}）`,
					blocks: [{ kind: 'field' as const, field: table.field }],
				})),
			}] : []),
		],
		actions: [],
	}
}

function createRowDetailToolbar(table: PrintDataSourceDetailTable, session: RowEditSession) {
	const guard = (handler: (context: ArrayTableToolbarExecutionContext) => unknown | Promise<unknown>) =>
		async (context: ArrayTableToolbarExecutionContext) => {
			if (!session.active || session.pending.value || props.readonly) return
			session.pending.value++
			try {
				errorMessage.value = ''
				session.form.value?.commitPendingValues()
				await nextTick()
				context.formValues = session.form.value?.snapshot() ?? context.formValues
				return await handler(context)
			} catch (error) {
				errorMessage.value = error instanceof Error ? error.message : '明细操作失败。'
			} finally {
				session.pending.value--
			}
		}
	return reactive(createPrintDetailToolbar({
		fetch: guard(async ({ setRows, formValues }) => {
			const sourceCode = readString(table.dataSourceScript)
			if (!sourceCode) throw new Error(`明细“${table.label}”尚未配置数据源脚本。`)
			const result = await host.getServiceApi().invoke<unknown>('print', 'resolveDataSource', {
				sourceCode,
				params: {
					...(formValues ?? {}),
					detailField: table.field,
				},
			})
			if (!session.active) return
			const rows = normalizeFetchedRows(result)
			session.metadata.set(table.field, {
				metadata: isRecord(result) ? result.metadata ?? result.metedata : undefined,
				rows: clone(rows.slice(0, 1)),
			})
			setRows(clone(rows))
		}),
		syncFields: guard(async ({ rows, formValues }) => {
			const fetched = session.metadata.get(table.field)
			const currentRows = Array.isArray(formValues?.[table.field]) ? formValues[table.field] as Record<string, unknown>[] : rows
			const result = syncPrintDetailFields(table.columns, fetched?.metadata, fetched?.rows ?? currentRows)
			if (!result.detected) throw new Error('没有可同步的字段，请先获取数据。')
			if (result.added) session.tables.value = session.tables.value.map(item => item.id === table.id ? { ...item, columns: result.columns } : item)
		}),
		clear: guard(({ setRows }) => setRows([])),
		import: guard(async ({ setRows, formValues }) => {
			const imported = await importPrintDetailData(host.getServiceApi(), table)
			if (!imported || !session.active) return
			const rows = Array.isArray(formValues?.[table.field]) ? formValues[table.field] as Record<string, unknown>[] : []
			setRows(imported.mode === 'replace' ? imported.rows : [...rows, ...imported.rows])
		}),
		configure: guard(async () => {
			await openPrintDetailColumnsDialog(host.getServiceApi(), table, config => {
				if (session.active) session.tables.value = session.tables.value.map(item => item.id === table.id ? clone({ ...item, ...config }) : item)
			})
		}),
		delete: guard(async () => {
			session.tables.value = session.tables.value.filter(item => item.id !== table.id)
		}),
	}))
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

function normalizeFetchedRows(value: unknown): Record<string, unknown>[] {
	const rows = Array.isArray(value)
		? value
		: isRecord(value) && Array.isArray(value.records)
			? value.records
			: isRecord(value) && Array.isArray(value.data)
				? value.data
				: null
	if (!rows) throw new Error('数据源脚本必须返回数组或 { records }。')
	if (!rows.every(isRecord)) throw new Error('明细数据必须是对象数组。')
	return rows
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown) {
	return typeof value === 'string' ? value.trim() : ''
}

function cellText(row: PrintDataRow, field: string) {
	const value = row[field] ?? (typeof row.header === 'object' && row.header ? (row.header as PrintDataRow)[field] : undefined)
	if (value == null) return ''
	return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function selectRow(index: number) {
	if (index >= 0 && index < props.rows.length) emit('select-row', index)
}

function createRowClassName(activeRowIndex?: number) {
	return ({ rowIndex }: { rowIndex: number }) => rowIndex === activeRowIndex ? 'print-header-table__row--active' : ''
}

async function editRow(index?: number) {
	if (props.readonly || props.busy) return
	errorMessage.value = ''
	const row = index === undefined ? {} : props.rows[index]
	const model = clone({
		...row,
		...getPrintDataSourceFormModel({ type: 'inline', rows: [row] }, props.schema),
		...Object.fromEntries(props.detailTables.map(table => [table.field, row[table.field] ?? []])),
	})
	const session: RowEditSession = {
		tables: ref(clone([...props.detailTables])),
		form: ref<RowForm | null>(null),
		pending: ref(0),
		active: true,
		metadata: new Map(),
	}
	const originalTables = JSON.stringify(session.tables.value)
	const activeTab = ref('')
	const rowSchema = computed(() => createRowSchema(session, activeTab.value))
	try {
		await openGlobalDialog<Record<string, unknown>>({
			title: index === undefined ? '新增表头记录' : `编辑表头记录 · 第 ${index + 1} 行`,
			width: 1180, height: 760, model, className: 'print-header-row-dialog',
			body: context => h(LowCodeForm, {
				ref: session.form, schema: rowSchema.value, modelValue: context.model,
				disabled: props.readonly,
				'onUpdate:modelValue': context.setModel,
				'onTabChange': (key: string) => { activeTab.value = key },
			}),
			actions: [
				{ code: 'cancel', label: '取消', role: 'cancel' },
				{ code: 'confirm', label: '保存', role: 'confirm', status: 'primary', disabled: computed(() => session.pending.value > 0) },
			],
			onConfirm: async () => {
				if (session.pending.value || !session.active) return false
				session.form.value?.commitPendingValues()
				await nextTick()
				if (!session.form.value || !(await session.form.value.validate())) return false
				if (props.readonly) return false
				const saved = clone(session.form.value.snapshot()) as PrintDataRow
				if (originalTables !== JSON.stringify(session.tables.value)) {
					if (!(await props.saveDetailTables(clone(session.tables.value)))) return false
				}
				if (!session.active || props.readonly) return false
				const rows = [...props.rows]
				if (index === undefined) rows.push(saved)
				else rows[index] = saved
				emit('update:rows', rows)
			},
			onClose: () => { session.active = false },
		})
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : '表头记录编辑失败。'
	} finally {
		session.active = false
	}
}

function copyRow(index: number) {
	if (props.readonly || props.busy) return
	const rows = [...props.rows]
	rows.splice(index + 1, 0, clone(rows[index]))
	emit('update:rows', rows)
}
function deleteRow(index: number) {
	if (!props.readonly && !props.busy) emit('update:rows', props.rows.filter((_, rowIndex) => rowIndex !== index))
}
</script>

<template>
	<div class="print-header-table" :class="{ 'print-header-table--compact': compact }">
		<p class="print-header-table__hint">{{ rows.length }} 条表头记录 · {{ compact ? '点击表头行查看下方明细，双击或点击编辑修改当前记录。' : '普通列来自表单字段；点击编辑录入当前记录及明细。' }}</p>
		<div class="print-header-table__grid">
			<LowCodeForm :schema="tableSchema" :model-value="tableModel" :disabled="readonly || busy" />
		</div>
	</div>
</template>

<style scoped>
.print-header-table { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: 10px; padding: 12px; }
.print-header-table__hint { margin: 0; font-size: 12px; color: #64748b; line-height: 1.6; }
.print-header-table__grid { flex: 1; min-height: 0; }
.print-header-table__grid :deep(.lc-form),
.print-header-table__grid :deep(.lc-form-grid),
.print-header-table__grid :deep(.lc-form-grid-cell),
.print-header-table__grid :deep(.vxe-form--item),
.print-header-table__grid :deep(.vxe-form--item-inner),
.print-header-table__grid :deep(.vxe-form--item-content),
.print-header-table__grid :deep(.lc-field) { height: 100%; min-height: 0; }
.print-header-table__grid :deep(.vxe-form--item-inner) { padding: 0; }
.print-header-table--compact { height: 220px; flex: 0 0 220px; padding: 0; gap: 6px; }
.print-header-table--compact :deep(.vxe-body--row) { cursor: pointer; }
.print-header-table :deep(.print-header-table__row--active > .vxe-body--column) { background: #eaf3ff; }
</style>
