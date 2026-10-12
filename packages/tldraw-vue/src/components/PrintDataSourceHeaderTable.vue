<script setup lang="ts">
import LowCodeForm from '@enlearn/lowcode-framework/components/low-code-form'
import { openGlobalDialog } from '@enlearn/lowcode-framework/runtime/global-dialog'
import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode'
import { computed, h, nextTick, ref } from 'vue'
import { useVxeMessage } from '@enlearn/lowcode-framework/utils/vxe-message'
import { getPrintDataSourceFormModel } from '@/editor/dataSourceForm'
import type { PrintDataRow, PrintDataSourceDetailTable } from '@/print/types'

const props = defineProps<{
	rows: readonly PrintDataRow[]
	schema: LowCodeFormSchema
	detailTables: readonly PrintDataSourceDetailTable[]
	readonly: boolean
}>()
const emit = defineEmits<{ 'update:rows': [rows: PrintDataRow[]] }>()
const errorMessage = ref('')
useVxeMessage(errorMessage, 'error')
// VXE assigns row keys internally; keep those keys out of the workspace data.
const displayRows = computed(() => JSON.parse(JSON.stringify(props.rows)) as PrintDataRow[])
const columns = computed(() => [
	...props.schema.fields.filter(field => !props.detailTables.some(table => table.field === field.field))
		.map(field => ({ field: field.field, title: field.label || field.field, detail: false })),
	...props.detailTables.map(table => ({ field: table.field, title: table.label, detail: true })),
])
const rowSchema = computed<LowCodeFormSchema>(() => ({
	...props.schema,
	fields: [
		...props.schema.fields.filter(field => !props.detailTables.some(table => table.field === field.field)),
		...props.detailTables.map(table => ({
			field: table.field, label: table.label, component: 'lc-array-table',
			props: { ...table.gridOptions, columns: table.columns, showSeq: true, copyable: true },
		})),
	],
	layout: [
		...(props.schema.layout ?? props.schema.fields.map(field => ({ kind: 'field' as const, field: field.field })))
			.filter(node => node.kind !== 'field' || !props.detailTables.some(table => table.field === node.field)),
		...props.detailTables.map(table => ({ kind: 'field' as const, field: table.field })),
	],
	actions: [],
}))

function cellText(row: PrintDataRow, field: string) {
	const value = row[field] ?? (typeof row.header === 'object' && row.header ? (row.header as PrintDataRow)[field] : undefined)
	if (value == null) return ''
	return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

async function editRow(index?: number) {
	if (props.readonly) return
	errorMessage.value = ''
	const row = index === undefined ? {} : props.rows[index]
	const model = JSON.parse(JSON.stringify({
		...row,
		...getPrintDataSourceFormModel({ type: 'inline', rows: [row] }, props.schema),
		...Object.fromEntries(props.detailTables.map(table => [table.field, row[table.field] ?? []])),
	}))
	const form = ref<{ commitPendingValues(): void; validate(): Promise<boolean> } | null>(null)
	try {
		await openGlobalDialog<Record<string, unknown>>({
			title: index === undefined ? '新增表头记录' : `编辑表头记录 · 第 ${index + 1} 行`,
			width: 960, model,
			body: context => h(LowCodeForm, {
				ref: form, schema: rowSchema.value, modelValue: context.model,
				'onUpdate:modelValue': context.setModel,
			}),
			actions: [
				{ code: 'cancel', label: '取消', role: 'cancel' },
				{ code: 'confirm', label: '保存', role: 'confirm', status: 'primary' },
			],
			onConfirm: async ({ model: value }) => {
				form.value?.commitPendingValues()
				await nextTick()
				if (!form.value || !(await form.value.validate())) return false
				if (props.readonly) return false
				const rows = [...props.rows]
				const saved = JSON.parse(JSON.stringify(value)) as PrintDataRow
				if (index === undefined) rows.push(saved)
				else rows[index] = saved
				emit('update:rows', rows)
			},
		})
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : '表头记录编辑失败。'
	}
}

function copyRow(index: number) {
	if (props.readonly) return
	const rows = [...props.rows]
	rows.splice(index + 1, 0, JSON.parse(JSON.stringify(rows[index])))
	emit('update:rows', rows)
}
function deleteRow(index: number) {
	if (!props.readonly) emit('update:rows', props.rows.filter((_, rowIndex) => rowIndex !== index))
}
</script>

<template>
	<div class="print-header-table">
		<div class="print-header-table__toolbar">
			<span>{{ rows.length }} 条表头记录</span>
			<button type="button" class="lowcode-form-panel__action" :disabled="readonly" @click="editRow()">新增行</button>
		</div>
		<p class="print-header-table__hint">普通列来自表单字段；明细列保留数组，点击编辑录入当前记录的明细。</p>
		<div class="print-header-table__grid">
			<vxe-table :data="displayRows" border auto-resize height="auto" @cell-dblclick="({ rowIndex }: { rowIndex: number }) => editRow(rowIndex)">
				<vxe-column type="seq" title="序号" width="52" />
				<vxe-column v-for="column in columns" :key="column.field" :field="column.field" :title="column.title" min-width="150">
					<template #default="{ row, rowIndex }">
						<button v-if="column.detail" type="button" class="lowcode-form-panel__action" :disabled="readonly" @click="editRow(rowIndex)">
							{{ Array.isArray(row[column.field]) ? row[column.field].length : 0 }} 条明细 · 编辑
						</button>
						<span v-else>{{ cellText(row, column.field) }}</span>
					</template>
				</vxe-column>
				<vxe-column title="操作" width="162" fixed="right">
					<template #default="{ rowIndex }">
						<div class="print-header-table__actions">
							<button type="button" :disabled="readonly" @click="editRow(rowIndex)">编辑</button>
							<button type="button" :disabled="readonly" @click="copyRow(rowIndex)">复制</button>
							<button type="button" :disabled="readonly" @click="deleteRow(rowIndex)">删除</button>
						</div>
					</template>
				</vxe-column>
			</vxe-table>
		</div>
	</div>
</template>

<style scoped>
.print-header-table { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: 10px; padding: 12px; }
.print-header-table__toolbar, .print-header-table__actions { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.print-header-table__hint { margin: 0; font-size: 12px; color: #64748b; line-height: 1.6; }
.print-header-table__grid { flex: 1; min-height: 0; }
.print-header-table__actions button { padding: 3px; border: 0; background: transparent; color: #1d73d8; cursor: pointer; }
.print-header-table__actions button:disabled { color: #94a3b8; cursor: default; }
</style>
