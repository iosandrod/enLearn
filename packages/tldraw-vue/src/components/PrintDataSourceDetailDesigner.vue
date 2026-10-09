<script setup lang="ts">
import type { LowCodeHostServiceApi } from '@enlearn/lowcode-framework/core/host'
import { computed, ref, watch } from 'vue'
import type { PrintDataSourceDetailTable } from '@/print/types'
import { openPrintDetailColumnsDialog } from '@/editor/printDetailColumnsDialog'

type AddDetailTableModel = {
	label: string
	field: string
	dataSourceScript: string
}

const props = defineProps<{
	modelValue: PrintDataSourceDetailTable[]
	serviceApi: LowCodeHostServiceApi
}>()

const emit = defineEmits<{
	'update:modelValue': [value: PrintDataSourceDetailTable[]]
}>()

const activeTableId = ref('')
const addFormVisible = ref(false)
const addFormError = ref('')
const configurationError = ref('')
const addFormModel = ref<AddDetailTableModel>({ label: '', field: '', dataSourceScript: '' })
const tables = computed(() => props.modelValue ?? [])
const activeTable = computed(() =>
	tables.value.find((table) => table.id === activeTableId.value) ?? tables.value[0],
)

watch(
	tables,
	(nextTables) => {
		if (!nextTables.some((table) => table.id === activeTableId.value)) {
			activeTableId.value = nextTables[0]?.id ?? ''
		}
	},
	{ immediate: true },
)

function handleAddTable() {
	const nextIndex = tables.value.length + 1
	addFormModel.value = {
		label: `明细${nextIndex}`,
		field: `detail_${nextIndex}`,
		dataSourceScript: '',
	}
	addFormError.value = ''
	addFormVisible.value = true
}

function handleConfirmAddTable() {
	const label = readString(addFormModel.value.label)
	const field = readString(addFormModel.value.field)
	const dataSourceScript = readString(addFormModel.value.dataSourceScript)
	if (!label) {
		addFormError.value = '请输入明细名称。'
		return
	}
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) {
		addFormError.value = '明细字段只能以字母或下划线开头，并包含字母、数字或下划线。'
		return
	}
	if (tables.value.some((table) => table.field === field)) {
		addFormError.value = `明细字段“${field}”已存在。`
		return
	}

	const table: PrintDataSourceDetailTable = {
		id: createDetailTableId(),
		field,
		label,
		...(dataSourceScript ? { dataSourceScript } : {}),
		columns: [{ field: 'value', title: '值', width: 120 }],
	}
	activeTableId.value = table.id
	addFormVisible.value = false
	addFormError.value = ''
	emitTables([...tables.value, table])
}

function handleCancelAddTable() {
	addFormVisible.value = false
	addFormError.value = ''
}

async function handleConfigureTable() {
	const table = activeTable.value
	if (!table) return
	configurationError.value = ''
	try {
		await openPrintDetailColumnsDialog(props.serviceApi, table, (config) => {
			emitTables(tables.value.map((item) => item.id === table.id ? { ...table, ...config } : item))//
		})
	} catch (error) {
		configurationError.value = error instanceof Error ? error.message : '打印明细列配置打开失败。'
	}
}

function handleDeleteTable() {
	const table = activeTable.value
	if (!table) return
	const nextTables = tables.value.filter((item) => item.id !== table.id)
	activeTableId.value = nextTables[0]?.id ?? ''
	emitTables(nextTables)
}

function handleScriptChange(value: string) {
	const table = activeTable.value
	if (!table) return
	const dataSourceScript = readString(value)
	emitTables(tables.value.map((item) => item.id === table.id
		? { ...item, ...(dataSourceScript ? { dataSourceScript } : { dataSourceScript: undefined }) }
		: item))
}

function emitTables(value: PrintDataSourceDetailTable[]) {
	emit('update:modelValue', value.map((table) => ({
		...table,
		columns: table.columns.map((column) => ({ ...column })),
	})))
}

function createDetailTableId() {
	return `detail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readString(value: unknown, fallback = '') {
	return typeof value === 'string' && value.trim() ? value.trim() : fallback
}
</script>

<template>
	<section class="print-detail-designer" aria-label="明细数据源设计">
		<header class="print-detail-designer__toolbar">
			<div>
				<span>为打印数据源添加一个或多个明细表，并分别配置字段列。</span>
			</div>
			<button type="button" class="print-detail-designer__button print-detail-designer__button--primary"
				@click="handleAddTable">
				<i class="ri-add-line" aria-hidden="true" />
				<span>添加明细</span>
			</button>
		</header>
		<p v-if="configurationError" class="print-detail-designer__form-error" role="alert">{{ configurationError }}</p>
		<form v-if="addFormVisible" class="print-detail-designer__add-form" @submit.prevent="handleConfirmAddTable">
			<label>
				<span>明细名称</span>
				<input v-model="addFormModel.label" type="text" placeholder="例如：商品明细" autofocus />
			</label>
			<label>
				<span>数据字段</span>
				<input v-model="addFormModel.field" type="text" placeholder="例如：items" />
			</label>
			<label>
				<span>数据源脚本编码</span>
				<input v-model="addFormModel.dataSourceScript" type="text" placeholder="例如：orders.remote（可选）" />
			</label>
			<div class="print-detail-designer__add-actions">
				<span v-if="addFormError" class="print-detail-designer__form-error" role="alert">{{ addFormError }}</span>
				<button type="button" class="print-detail-designer__button" @click="handleCancelAddTable">取消</button>
				<button type="submit" class="print-detail-designer__button print-detail-designer__button--primary">添加</button>
			</div>
		</form>

		<div v-if="tables.length" class="print-detail-designer__content">
			<div class="print-detail-designer__tabs" role="tablist" aria-label="明细明细">
				<button v-for="table in tables" :key="table.id" type="button"
					:class="['print-detail-designer__tab', { 'is-active': activeTable?.id === table.id }]"
					role="tab" :aria-selected="activeTable?.id === table.id" @click="activeTableId = table.id">
					{{ table.label }}（{{ table.field }}）
				</button>
			</div>

			<div v-if="activeTable" class="print-detail-designer__table-panel" role="tabpanel">
				<div class="print-detail-designer__table-heading">
					<div>
						<strong>{{ activeTable.label }}</strong>
						<span>字段：{{ activeTable.field }}</span>
					</div>
					<div class="print-detail-designer__actions">
						<label class="print-detail-designer__script-field">
							<span>数据源脚本</span>
							<input :value="activeTable.dataSourceScript || ''" type="text"
								placeholder="脚本编码（可选）" @change="handleScriptChange(($event.target as HTMLInputElement).value)" />
						</label>
						<button type="button" class="print-detail-designer__button" @click="handleConfigureTable">
							<i class="ri-layout-grid-line" aria-hidden="true" />
							<span>表格配置</span>
						</button>
						<button type="button" class="print-detail-designer__button print-detail-designer__button--danger"
							@click="handleDeleteTable">
							<i class="ri-delete-bin-line" aria-hidden="true" />
							<span>删除明细</span>
						</button>
					</div>
				</div>

				<div class="print-detail-designer__table-wrap">
					<table>
						<thead>
							<tr>
								<th class="print-detail-designer__sequence">序号</th>
								<th v-for="column in activeTable.columns" :key="column.field">
									{{ column.title || column.field }}
									<small>{{ column.field }}</small>
								</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td :colspan="Math.max(1, activeTable.columns.length + 1)" class="print-detail-designer__empty-row">
									明细数据将在左侧数据源面板中录入
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<div v-else class="print-detail-designer__empty">
			<i class="ri-table-line" aria-hidden="true" />
			<strong>暂无明细明细</strong>
			<span>点击“添加明细”创建第一个明细表。</span>
		</div>
	</section>
</template>

<style scoped>
.print-detail-designer {
	display: flex;
	height: 100%;
	min-height: 0;
	flex-direction: column;
	border: 1px solid #d8e0ea;
	border-radius: 6px;
	background: #f8fafc;
	overflow: hidden;
}

.print-detail-designer__toolbar,
.print-detail-designer__table-heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
}

.print-detail-designer__toolbar {
	padding: 12px 14px;
	border-bottom: 1px solid #dfe5ec;
	background: #fff;
}

.print-detail-designer__toolbar strong,
.print-detail-designer__toolbar span,
.print-detail-designer__table-heading strong,
.print-detail-designer__table-heading span {
	display: block;
}

.print-detail-designer__toolbar strong,
.print-detail-designer__table-heading strong {
	color: #172033;
	font-size: 13px;
}

.print-detail-designer__toolbar > div > span,
.print-detail-designer__table-heading > div > span {
	margin-top: 2px;
	color: #64748b;
	font-size: 11px;
}

.print-detail-designer__button {
	display: inline-flex;
	height: 30px;
	padding: 0 10px;
	align-items: center;
	justify-content: center;
	gap: 5px;
	border: 1px solid #cfd8e3;
	border-radius: 5px;
	background: #fff;
	color: #334155;
	cursor: pointer;
	font: inherit;
	font-size: 12px;
	white-space: nowrap;
}

.print-detail-designer__button--primary {
	border-color: #1d73d8;
	background: #1d73d8;
	color: #fff;
}

.print-detail-designer__button--danger {
	border-color: #efc6c6;
	color: #c24141;
}

.print-detail-designer__add-form {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px 12px;
	padding: 12px 14px;
	border-bottom: 1px solid #dfe5ec;
	background: #fff;
}

.print-detail-designer__add-form label,
.print-detail-designer__add-form label > span {
	display: block;
}

.print-detail-designer__add-form label > span {
	margin-bottom: 5px;
	color: #536173;
	font-size: 11px;
	font-weight: 650;
}

.print-detail-designer__add-form input {
	box-sizing: border-box;
	width: 100%;
	height: 32px;
	padding: 0 9px;
	border: 1px solid #cfd8e3;
	border-radius: 5px;
	background: #fff;
	color: #172033;
	font: inherit;
	font-size: 12px;
	outline: 0;
}

.print-detail-designer__add-form input:focus {
	border-color: #1d73d8;
	box-shadow: 0 0 0 2px rgb(29 115 216 / 12%);
}

.print-detail-designer__add-actions {
	display: flex;
	grid-column: 1 / -1;
	align-items: center;
	justify-content: flex-end;
	gap: 8px;
}

.print-detail-designer__form-error {
	margin-right: auto;
	color: #c24141;
	font-size: 12px;
}

.print-detail-designer__content {
	display: flex;
	min-height: 0;
	flex: 1;
	flex-direction: column;
	padding: 12px;
}

.print-detail-designer__tabs {
	display: flex;
	min-height: 35px;
	flex: none;
	overflow-x: auto;
	border-bottom: 1px solid #dfe5ec;
	background: #fff;
}

.print-detail-designer__tab {
	padding: 8px 12px;
	border: 0;
	border-bottom: 2px solid transparent;
	background: transparent;
	color: #64748b;
	cursor: pointer;
	font: inherit;
	font-size: 12px;
	font-weight: 600;
	white-space: nowrap;
}

.print-detail-designer__tab.is-active {
	border-bottom-color: #1d73d8;
	color: #1d73d8;
}

.print-detail-designer__table-panel {
	display: flex;
	min-height: 0;
	flex: 1;
	flex-direction: column;
	margin-top: 10px;
	padding: 12px;
	border: 1px solid #dfe5ec;
	background: #fff;
}

.print-detail-designer__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.print-detail-designer__table-wrap {
	min-height: 0;
	margin-top: 12px;
	flex: 1;
	overflow: auto;
	border: 1px solid #dfe5ec;
}

.print-detail-designer__table-wrap table {
	width: 100%;
	border-collapse: collapse;
	background: #fff;
	font-size: 12px;
}

.print-detail-designer__table-wrap th,
.print-detail-designer__table-wrap td {
	min-width: 120px;
	padding: 9px 10px;
	border-right: 1px solid #e5eaf1;
	border-bottom: 1px solid #e5eaf1;
	text-align: left;
}

.print-detail-designer__table-wrap th {
	background: #f5f7fa;
	color: #334155;
	font-weight: 650;
}

.print-detail-designer__table-wrap th small {
	display: block;
	margin-top: 2px;
	color: #94a3b8;
	font-size: 10px;
	font-weight: 400;
}

.print-detail-designer__table-wrap .print-detail-designer__sequence {
	width: 64px;
	min-width: 64px;
}

.print-detail-designer__table-wrap .print-detail-designer__empty-row {
	height: 120px;
	color: #94a3b8;
	text-align: center;
}

.print-detail-designer__empty {
	display: flex;
	min-height: 0;
	flex: 1;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	gap: 6px;
	color: #64748b;
}

.print-detail-designer__empty i {
	font-size: 30px;
	color: #94a3b8;
}

.print-detail-designer__empty strong {
	color: #334155;
	font-size: 13px;
}

.print-detail-designer__empty span {
	font-size: 12px;
}

@media (max-width: 720px) {
	.print-detail-designer__add-form {
		grid-template-columns: minmax(0, 1fr);
	}

	.print-detail-designer__add-actions {
		grid-column: 1;
	}
}
</style>
