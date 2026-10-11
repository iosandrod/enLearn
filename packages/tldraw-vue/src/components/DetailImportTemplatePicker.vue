<script setup lang="ts">
import { computed } from 'vue'
import type { PrintDataSourceDetailColumn } from '@/print/types'
import {
	detailImportTemplates,
	getDetailImportTemplateConfig,
	getDetailImportTemplateId,
	type DetailImportHeaderConfig,
	type DetailImportTemplateId,
} from '@/editor/detailImportTemplates'

const props = withDefaults(defineProps<{
	modelValue: DetailImportHeaderConfig
	columns?: readonly PrintDataSourceDetailColumn[]
}>(), {
	columns: () => [],
})

const emit = defineEmits<{
	'update:modelValue': [value: DetailImportHeaderConfig]
}>()

const activeTemplate = computed(() => getDetailImportTemplateId(props.modelValue))
const previewColumns = computed(() => {
	const columns = flattenColumns(props.columns).slice(0, 3)
	if (columns.length) return columns
	return [
		{ field: 'sku', title: '商品编码' },
		{ field: 'productName', title: '商品名称' },
		{ field: 'qty', title: '数量' },
	]
})

function flattenColumns(columns: readonly PrintDataSourceDetailColumn[]): PrintDataSourceDetailColumn[] {
	return columns.flatMap((column) => {
		const children = Array.isArray(column.children)
			? flattenColumns(column.children as PrintDataSourceDetailColumn[])
			: []
		return column.field ? [column, ...children] : children
	})
}

function getPreviewRows(template: typeof detailImportTemplates[number]) {
	const rows: Array<{ kind: 'field' | 'title' | 'data'; values: string[] }> = []
	if (template.config.hasFieldRow) {
		rows.push({ kind: 'field', values: previewColumns.value.map((column) => column.field) })
	}
	if (template.config.hasChineseRow) {
		rows.push({ kind: 'title', values: previewColumns.value.map((column) => column.title || column.field) })
	}
	for (let row = 0; row < 2; row += 1) {
		rows.push({
			kind: 'data',
			values: previewColumns.value.map((column, index) => getSampleValue(column.field, index, row)),
		})
	}
	return rows
}

function getSampleValue(field: string, index: number, row: number) {
	const normalized = field.toLowerCase()
	if (/(sku|code|no|number|id)$/.test(normalized)) return `SKU-${String(row + 1).padStart(3, '0')}`
	if (/(name|title|product|item)/.test(normalized)) return row === 0 ? '测试商品 A' : '测试商品 B'
	if (/(qty|quantity|count|num)/.test(normalized)) return String((row + 1) * 10)
	if (/(price|amount|total|cost)/.test(normalized)) return ((row + 1) * 99).toFixed(2)
	if (/(date|time|at)$/.test(normalized)) return `2026-10-${String(row + 11).padStart(2, '0')}`
	return index === 0 ? `TEST-${row + 1}` : `测试值 ${row + 1}`
}

function selectTemplate(id: DetailImportTemplateId) {
	emit('update:modelValue', getDetailImportTemplateConfig(id))
}
</script>

<template>
	<section class="detail-import-template-picker" aria-labelledby="detail-import-template-title">
		<div class="detail-import-template-picker__heading">
			<h3 id="detail-import-template-title">选择样板</h3>
			<span>Excel 表头结构</span>
		</div>
		<div class="detail-import-template-picker__options" role="radiogroup" aria-label="Excel 导入样板">
			<button v-for="template in detailImportTemplates" :key="template.id" type="button"
				class="detail-import-template-picker__option"
				:class="{ 'is-active': activeTemplate === template.id }"
				:aria-checked="activeTemplate === template.id" role="radio"
				@click="selectTemplate(template.id)">
				<span class="detail-import-template-picker__option-title">
					<i :class="activeTemplate === template.id ? 'ri-radio-button-line' : 'ri-checkbox-blank-circle-line'"
						aria-hidden="true" />
					{{ template.label }}
				</span>
				<small>{{ template.description }}</small>
				<span class="detail-import-template-picker__sheet"
					:style="{ '--sheet-columns': previewColumns.length }" aria-hidden="true">
					<span class="detail-import-template-picker__column-headings">
						<em />
						<b v-for="(_column, index) in previewColumns" :key="`heading-${index}`">{{ String.fromCharCode(65 + index) }}</b>
					</span>
					<span v-for="(row, rowIndex) in getPreviewRows(template)" :key="`${row.kind}-${rowIndex}`"
						class="detail-import-template-picker__row" :class="`is-${row.kind}`">
						<em>{{ rowIndex + 1 }}</em>
						<b v-for="(value, cellIndex) in row.values" :key="`${rowIndex}-${cellIndex}`">{{ value }}</b>
					</span>
				</span>
			</button>
		</div>
	</section>
</template>

<style scoped>
.detail-import-template-picker {
	padding-top: 16px;
	border-top: 1px solid #e5e7eb;
}

.detail-import-template-picker__heading {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	margin-bottom: 10px;
}

.detail-import-template-picker__heading h3 {
	margin: 0;
	color: #111827;
	font-size: 14px;
	font-weight: 600;
}

.detail-import-template-picker__heading span {
	color: #6b7280;
	font-size: 12px;
}

.detail-import-template-picker__options {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.detail-import-template-picker__option {
	min-width: 0;
	padding: 10px;
	border: 1px solid #d1d5db;
	border-radius: 6px;
	background: #fff;
	color: #374151;
	text-align: left;
	cursor: pointer;
}

.detail-import-template-picker__option:hover {
	border-color: #9ca3af;
	background: #f9fafb;
}

.detail-import-template-picker__option.is-active {
	border-color: #2563eb;
	box-shadow: inset 0 0 0 1px #2563eb;
}

.detail-import-template-picker__option-title {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 13px;
	font-weight: 600;
}

.detail-import-template-picker__option-title i {
	color: #2563eb;
	font-size: 15px;
}

.detail-import-template-picker__option small {
	display: block;
	margin: 3px 0 8px 21px;
	color: #6b7280;
	font-size: 11px;
}

.detail-import-template-picker__sheet {
	display: grid;
	overflow: hidden;
	border: 1px solid #cbd5e1;
	border-radius: 4px;
	background: #fff;
}

.detail-import-template-picker__column-headings,
.detail-import-template-picker__row {
	display: grid;
	grid-template-columns: 28px repeat(var(--sheet-columns), minmax(0, 1fr));
	min-height: 24px;
}

.detail-import-template-picker__column-headings {
	min-height: 20px;
	color: #475569;
	background: #e2e8f0;
}

.detail-import-template-picker__column-headings + .detail-import-template-picker__row,
.detail-import-template-picker__row + .detail-import-template-picker__row {
	border-top: 1px solid #cbd5e1;
}

.detail-import-template-picker__column-headings > *,
.detail-import-template-picker__row > * {
	min-width: 0;
	padding: 4px 6px;
	overflow: hidden;
	font-size: 10px;
	font-style: normal;
	font-weight: 400;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.detail-import-template-picker__column-headings > * {
	padding-block: 2px;
	font-size: 9px;
	font-style: normal;
	font-weight: 600;
	text-align: center;
}

.detail-import-template-picker__column-headings > * + *,
.detail-import-template-picker__row > * + * {
	border-left: 1px solid #cbd5e1;
}

.detail-import-template-picker__row em {
	color: #64748b;
	background: #f1f5f9;
	text-align: center;
}

.detail-import-template-picker__row.is-field b { color: #1d4ed8; background: #eff6ff; font-family: Consolas, monospace; }
.detail-import-template-picker__row.is-title b { color: #047857; background: #ecfdf5; font-weight: 600; }
.detail-import-template-picker__row.is-data b { color: #374151; }

@media (max-width: 620px) {
	.detail-import-template-picker__options { grid-template-columns: 1fr; }
}
</style>
