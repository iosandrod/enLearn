<script setup lang="ts">
import type { Editor, TLShapeId } from '@tldraw/editor'
import { useLowCodeHost } from '@enlearn/lowcode-framework/core/host'
import { computed, nextTick, onMounted, ref } from 'vue'
import { getEditorPrintDataSource } from '@/editor/workspaceDataSource'
import { ensurePrintExpressionsLoaded, upsertLoadedPrintExpression } from '@/print/expressions'
import { resolveTemplateString } from '@/print/expression'
import {
	evaluatePrintNodeExpressionSource,
	compilePrintNodeExpressionSource,
} from '@/print/nodeExpression'
import type { PrintDataRow, PrintDataSourceConfig, PrintExpressionContext } from '@/print/types'

type ReferenceTab = 'guide' | 'fields' | 'data' | 'functions'

type PrintExpressionRecord = {
	id: string
	name: string
	code: string
	description: string
	purpose: string
	templateId: string
	templateType: string
	source: string
	updatedAt: string
}

type PrintTemplateOption = {
	id: string
	name: string
	type: string
}

const props = defineProps<{
	editor: Editor
	shapeId: TLShapeId
}>()

const emit = defineEmits<{
	close: []
	saved: []
}>()

const host = useLowCodeHost()
const shape = props.editor.getShape(props.shapeId)
const literalExpressionKey = getFirstLiteralExpressionKey(shape?.props)
const activeExpressionId = ref('')
const source = ref('')
const expressionName = ref(literalExpressionKey || '节点表达式')
const expressionCode = ref('')
const description = ref('')
const purpose = ref('')
const templateId = ref('')
const templateType = ref('print')
const templateOptions = ref<PrintTemplateOption[]>([])
const expressions = ref<PrintExpressionRecord[]>([])
const searchQuery = ref('')
const loading = ref(true)
const activeTab = ref<ReferenceTab>('guide')
const testMessage = ref('')
const testFailed = ref(false)
const saving = ref(false)
const dialogVisible = ref(true)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const dataSource = getEditorPrintDataSource(props.editor)

const tabs: { id: ReferenceTab; label: string }[] = [
	{ id: 'guide', label: '使用教程' },
	{ id: 'fields', label: '可用字段' },
	{ id: 'data', label: '数据源参考' },
	{ id: 'functions', label: '函数参考' },
]

const sampleRow = computed<PrintDataRow>(() => getSampleRow(dataSource.value))
const sampleContext = computed<PrintExpressionContext>(() => ({
	row: sampleRow.value,
	data: getSourceRows(dataSource.value),
	dataSource: dataSource.value,
	index: 0,
	pageNo: 1,
	total: Math.max(1, getSourceRows(dataSource.value).length),
}))
const dataSourcePreview = computed(() => formatDataSourcePreview(sampleContext.value))
const fieldReferences = computed(() => createFieldReferences(dataSource.value, sampleRow.value))
const filteredExpressions = computed(() => {
	const query = searchQuery.value.trim().toLocaleLowerCase('zh-CN')
	if (!query) return expressions.value
	return expressions.value.filter((item) =>
		[item.name, item.code, item.description, item.purpose, getTemplateName(item.templateId)]
			.join(' ')
			.toLocaleLowerCase('zh-CN')
			.includes(query)
	)
})
const livePreview = computed(() => {
	const expression = source.value.trim()
	if (!expression) {
		return { state: 'empty', title: '等待表达式', detail: '输入函数后将在这里实时显示运行结果。' }
	}
	try {
		const result = evaluatePrintNodeExpressionSource(expression, sampleContext.value)
		const templateText = getShapeText(shape?.props)
		const renderedText = templateText
			? resolveTemplateString(templateText, sampleContext.value, {
				namedExpressions: [{
					name: expressionName.value.trim(),
					code: expressionCode.value.trim() || undefined,
					expressionSource: expression,
				}],
			})
			: undefined
		return {
			state: 'success',
			title: renderedText ?? getPreviewTitle(result),
			detail: renderedText !== undefined ? `函数返回：${formatResult(result)}` : formatResult(result),
		}
	} catch (error) {
		return { state: 'error', title: '表达式错误', detail: getErrorMessage(error) }
	}
})

const functionReferences = [
	{ name: 'String(value)', use: '转为文本', example: 'String(context.row.amount)' },
	{ name: 'Number(value)', use: '转为数字', example: 'Number(context.row.amount || 0)' },
	{ name: 'Math', use: '数值计算', example: 'Math.round(Number(context.row.amount) * 100) / 100' },
	{ name: 'JSON', use: 'JSON 转换', example: 'JSON.stringify(context.row)' },
	{ name: 'Array', use: '明细聚合', example: '(context.row.items || []).reduce((sum, item) => sum + Number(item.amount || 0), 0)' },
	{ name: 'Intl', use: '日期/数字格式化', example: "new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(context.row.amount)" },
]

onMounted(async () => {
	await loadExpressionDetails()
	await nextTick()
	textareaRef.value?.focus()
})

async function loadExpressionDetails() {
	loading.value = true
	try {
		const serviceApi = host.getServiceApi()
		const [templateResult, expressionResult] = await Promise.all([
			serviceApi.invoke<unknown>('admin', 'listItems', {
				resource: 'print_templates',
				sorts: [{ field: 'updated_at', direction: 'desc' }],
				limit: 500,
			}),
			ensurePrintExpressionsLoaded(serviceApi),
		])
		templateOptions.value = readRows(templateResult).map(mapTemplateOption).filter(isDefined)
		expressions.value = expressionResult.map((record) => ({
			id: record.id,
			name: record.name,
			code: record.code ?? '',
			description: record.description ?? '',
			purpose: record.purpose ?? '',
			templateId: record.templateId ?? '',
			templateType: record.templateType ?? 'print',
			source: record.expressionSource,
			updatedAt: record.updatedAt ?? '',
		}))
		const literalRecord = expressions.value.find((item) =>
			item.name === literalExpressionKey || item.code === literalExpressionKey
		)
		if (literalRecord) selectExpression(literalRecord)
	} catch (error) {
		testFailed.value = true
		testMessage.value = `表达式信息加载失败：${getErrorMessage(error)}`
	} finally {
		loading.value = false
	}
}

async function save() {
	if (saving.value) return
	const currentShape = props.editor.getShape(props.shapeId)
	if (!currentShape) {
		testFailed.value = true
		testMessage.value = '节点已不存在，无法保存。'
		return
	}

	const expression = source.value.trim()
	const name = expressionName.value.trim()
	if (!name) {
		testFailed.value = true
		testMessage.value = '请输入表达式名称。'
		return
	}
	if (!expression) {
		testFailed.value = true
		testMessage.value = '请输入函数表达式。'
		return
	}
	try {
		compilePrintNodeExpressionSource(expression)
	} catch (error) {
		testFailed.value = true
		testMessage.value = getErrorMessage(error)
		return
	}

	saving.value = true
	try {
		await persistExpression(activeExpressionId.value, expression, name)
		emit('saved')
		closeDialog()
	} catch (error) {
		testFailed.value = true
		testMessage.value = `保存失败：${getErrorMessage(error)}`
	} finally {
		saving.value = false
	}
}

async function persistExpression(
	existingId: string,
	expression: string,
	name: string,
) {
	const serviceApi = host.getServiceApi()
	const rawRecord = await serviceApi.invoke<unknown>('admin', 'saveItem', {
		resource: 'print_expressions',
		...(existingId ? { id: existingId } : {}),
		data: {
			name,
			code: expressionCode.value.trim() || null,
			description: description.value.trim() || null,
			purpose: purpose.value.trim() || null,
			template_id: templateId.value || null,
			template_type: templateType.value || null,
			expression_source: expression,
			enabled: true,
		},
	})
	const record = isRecord(rawRecord) ? mapExpressionRecord(rawRecord) : undefined
	const savedId = record?.id ?? ''
	if (!savedId) throw new Error('服务未返回表达式记录 ID')
	if (record) {
		upsertExpression(record)
		upsertLoadedPrintExpression(serviceApi, {
			id: record.id,
			name: record.name,
			code: record.code,
			description: record.description,
			purpose: record.purpose,
			templateId: record.templateId,
			templateType: record.templateType,
			expressionSource: record.source,
			enabled: true,
			updatedAt: record.updatedAt,
		})
	}
	return savedId
}

function selectExpression(record: PrintExpressionRecord) {
	activeExpressionId.value = record.id
	expressionName.value = record.name
	expressionCode.value = record.code
	description.value = record.description
	purpose.value = record.purpose
	templateId.value = record.templateId
	templateType.value = record.templateType || 'print'
	source.value = record.source
	testMessage.value = ''
	testFailed.value = false
}

function createExpression() {
	activeExpressionId.value = ''
	expressionName.value = literalExpressionKey || '节点表达式'
	expressionCode.value = ''
	description.value = ''
	purpose.value = ''
	templateId.value = ''
	templateType.value = 'print'
	source.value = ''
	testMessage.value = ''
	testFailed.value = false
	void nextTick(() => textareaRef.value?.focus())
}

function closeDialog() {
	dialogVisible.value = false
}

function handleModalHide() {
	emit('close')
}

function upsertExpression(record: PrintExpressionRecord) {
	const index = expressions.value.findIndex((item) => item.id === record.id)
	expressions.value = index < 0
		? [record, ...expressions.value]
		: expressions.value.map((item) => item.id === record.id ? record : item)
}

function onTemplateChange() {
	const template = templateOptions.value.find((item) => item.id === templateId.value)
	if (template) templateType.value = template.type
}

function readRows(value: unknown): Record<string, unknown>[] {
	if (Array.isArray(value)) return value.filter(isRecord)
	if (isRecord(value) && Array.isArray(value.rows)) return value.rows.filter(isRecord)
	return []
}

function mapTemplateOption(row: Record<string, unknown>): PrintTemplateOption | undefined {
	const id = readString(row.id)
	if (!id) return undefined
	const metadata = isRecord(row.metadata) ? row.metadata : {}
	const workspace = isRecord(row.workspace) ? row.workspace : {}
	return {
		id,
		name: readString(row.name) || id,
		type: readString(metadata.templateType) || readString(metadata.designerMode) || readString(workspace.designerMode) || 'print',
	}
}

function mapExpressionRecord(row: Record<string, unknown>): PrintExpressionRecord | undefined {
	const id = readString(row.id)
	const name = readString(row.name)
	if (!id || !name) return undefined
	return {
		id,
		name,
		code: readString(row.code),
		description: readString(row.description),
		purpose: readString(row.purpose),
		templateId: readString(row.template_id),
		templateType: readString(row.template_type) || 'print',
		source: readString(row.expression_source),
		updatedAt: readString(row.updated_at),
	}
}

function getFirstLiteralExpressionKey(props: unknown) {
	if (!isRecord(props) || typeof props.text !== 'string') return ''
	const match = props.text.match(/{{\s*([^{}|]+?)(?:\s*\|[^{}]*)?\s*}}/)
	return match?.[1]?.trim() ?? ''
}

function getShapeText(props: unknown) {
	return isRecord(props) && typeof props.text === 'string' ? props.text : ''
}

function getTemplateName(id: string) {
	return templateOptions.value.find((item) => item.id === id)?.name ?? ''
}

function getTemplateTypeLabel(type: string) {
	return ({ print: '打印', presentation: 'PPT', label: '标签', report: '报表', other: '其他' } as Record<string, string>)[type] ?? type
}

function formatUpdatedAt(value: string) {
	if (!value) return ''
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date)
}

function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined
}

function readString(value: unknown) {
	return typeof value === 'string' ? value.trim() : ''
}

function insertReference(value: string) {
	const textarea = textareaRef.value
	if (!textarea) {
		source.value += value
		return
	}
	const start = textarea.selectionStart
	const end = textarea.selectionEnd
	source.value = `${source.value.slice(0, start)}${value}${source.value.slice(end)}`
	void nextTick(() => {
		textarea.focus()
		textarea.setSelectionRange(start + value.length, start + value.length)
	})
}

function getSampleRow(sourceConfig: PrintDataSourceConfig | undefined): PrintDataRow {
	return getSourceRows(sourceConfig)[0] ?? {}
}

function getSourceRows(sourceConfig: PrintDataSourceConfig | undefined): PrintDataRow[] {
	if (!sourceConfig) return []
	if (sourceConfig.type === 'inline') {
		const inlineSource = sourceConfig as InlinePrintDataSource
		return [...inlineSource.rows]
	}
	if (sourceConfig.type === 'json') {
		try {
			const parsed = typeof sourceConfig.value === 'string' ? JSON.parse(sourceConfig.value) : sourceConfig.value
			if (Array.isArray(parsed)) return parsed.filter(isRecord)
			if (isRecord(parsed)) return [parsed]
		} catch {
			return []
		}
	}
	return []
}

function createFieldReferences(sourceConfig: PrintDataSourceConfig | undefined, row: PrintDataRow) {
	const references = new Map<string, { label: string; path: string; sample: string }>()
	const add = (label: string, path: string, value: unknown) => {
		if (!references.has(path)) references.set(path, { label, path, sample: formatCompact(value) })
	}

	add('当前记录', 'context.row', row)
	add('当前序号（从 0 开始）', 'context.index', 0)
	add('当前页码（从 1 开始）', 'context.pageNo', 1)
	add('打印总页数', 'context.total', 1)
	add('全部打印数据', 'context.data', getSourceRows(sourceConfig))
	for (const [key, value] of Object.entries(row)) add(key, `context.row.${key}`, value)

	if (sourceConfig?.type === 'inline') {
		const inlineSource = sourceConfig as InlinePrintDataSource
		for (const field of inlineSource.headerFields ?? []) {
			add(field.label || field.field, `context.row.${field.field}`, row[field.field])
		}
		for (const table of inlineSource.detailTables ?? []) {
			add(table.label || table.field, `context.row.${table.field}`, row[table.field])
			for (const column of table.columns) {
				const detailValue = row[table.field]
				const detailRows: unknown[] = Array.isArray(detailValue) ? detailValue : []
				const firstDetailRow = isRecord(detailRows[0]) ? detailRows[0] : {}
				add(`${table.label || table.field} / ${column.title || column.field}（当前明细）`, `context.row.${column.field}`, firstDetailRow[column.field])
				add(`${table.label || table.field} / ${column.title || column.field}（首行）`, `context.row.${table.field}?.[0]?.${column.field}`, firstDetailRow[column.field])
			}
		}
	}
	return [...references.values()]
}

type InlinePrintDataSource = Extract<PrintDataSourceConfig, { type: 'inline' }>

function isRecord(value: unknown): value is PrintDataRow {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function formatCompact(value: unknown) {
	if (value === undefined) return '暂无示例值'
	const serialized = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value))
	return serialized.length > 52 ? `${serialized.slice(0, 49)}...` : serialized
}

function formatResult(value: unknown) {
	if (value === undefined) return 'undefined'
	if (typeof value === 'string') return value || '空字符串'
	return JSON.stringify(value, null, 2)
}

function getPreviewTitle(value: unknown) {
	if (value === undefined) return '保留节点原值'
	if (value === null) return '空值'
	if (typeof value === 'string') return value || '空字符串'
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
	if (isRecord(value) && value.text !== undefined) return String(value.text ?? '') || '空文本'
	return '属性对象'
}

function formatDataSourcePreview(value: unknown) {
	const seen = new WeakSet<object>()
	try {
		return JSON.stringify(value, (_key, child) => {
			if (typeof child === 'function') return `[Function ${child.name || 'anonymous'}]`
			if (!child || typeof child !== 'object') return child
			if (seen.has(child)) return '[Circular]'
			seen.add(child)
			return child
		}, 2)
	} catch (error) {
		return `数据源暂时无法序列化：${getErrorMessage(error)}`
	}
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error)
}
</script>

<template>
	<Teleport to="body">
		<vxe-modal
			v-model="dialogVisible"
			class-name="expression-editor-modal"
			title="编辑打印表达式"
			width="calc(100vw - 32px)"
			height="calc(100vh - 32px)"
			min-width="320px"
			min-height="420px"
			:show-footer="true"
			:show-zoom="false"
			:show-maximize="false"
			:show-close="true"
			:mask-closable="true"
			:esc-closable="true"
			@hide="handleModalHide"
		>
			<div class="expression-dialog" @pointerdown.stop>
				<div class="expression-dialog__body">
				<aside class="expression-dialog__library" aria-label="表达式列表">
					<div class="expression-dialog__library-header">
						<div><h3>表达式</h3><span>{{ expressions.length }}</span></div>
						<button type="button" title="新建表达式" @click="createExpression">+ 新建</button>
					</div>
					<input v-model="searchQuery" class="expression-dialog__search" type="search" placeholder="搜索名称、编码、用途或模板" />
					<div class="expression-dialog__list">
						<p v-if="loading" class="expression-dialog__list-empty">正在加载...</p>
						<p v-else-if="!filteredExpressions.length" class="expression-dialog__list-empty">{{ searchQuery ? '没有匹配的表达式' : '暂无表达式' }}</p>
						<button
							v-for="item in filteredExpressions"
							:key="item.id"
							type="button"
							class="expression-dialog__list-item"
							:class="{ 'is-active': activeExpressionId === item.id }"
							@click="selectExpression(item)"
						>
							<span class="expression-dialog__list-name">
								<strong>{{ item.name }}</strong>
								<small v-if="item.name === literalExpressionKey || item.code === literalExpressionKey">文本引用</small>
							</span>
							<span class="expression-dialog__list-purpose">{{ item.purpose || item.description || '暂无说明' }}</span>
							<code v-if="item.code" class="expression-dialog__list-code">{{ item.code }}</code>
							<span class="expression-dialog__list-meta">
								<small>{{ getTemplateTypeLabel(item.templateType) }}</small>
								<small>{{ getTemplateName(item.templateId) || '通用' }}</small>
								<time>{{ formatUpdatedAt(item.updatedAt) }}</time>
							</span>
						</button>
					</div>
				</aside>

				<section class="expression-dialog__editor" aria-label="表达式编辑器">
					<div class="expression-dialog__metadata">
						<label>名称<input v-model="expressionName" type="text" maxlength="200" placeholder="例如：当前页面" /></label>
						<label>编码<input v-model="expressionCode" type="text" maxlength="100" placeholder="例如：current_page" /></label>
						<label>关联模板
							<select v-model="templateId" @change="onTemplateChange">
								<option value="">不关联模板</option>
								<option v-for="template in templateOptions" :key="template.id" :value="template.id">{{ template.name }}</option>
							</select>
						</label>
						<label>关联模板类型
							<select v-model="templateType">
								<option value="print">打印模板</option>
								<option value="presentation">PPT 模板</option>
								<option value="label">标签模板</option>
								<option value="report">报表模板</option>
								<option value="other">其他</option>
							</select>
						</label>
						<label>用途<input v-model="purpose" type="text" maxlength="500" placeholder="例如：打印时计算订单合计" /></label>
						<label class="expression-dialog__metadata-wide">描述<input v-model="description" type="text" maxlength="1000" placeholder="补充说明表达式的输入、输出和使用场景" /></label>
					</div>
					<div class="expression-dialog__editor-heading">
						<label for="print-node-expression">函数表达式</label>
						<span>参数：context</span>
					</div>
					<textarea
						id="print-node-expression"
						ref="textareaRef"
						v-model="source"
						class="expression-dialog__source"
						spellcheck="false"
						placeholder="(context) => context.row.name"
					/>
					<div class="expression-dialog__examples">
						<button type="button" @click="source = `(context) => context.row.name ?? ''`">文本示例</button>
						<button type="button" @click="source = `(context) => ({ text: String(context.pageNo) + ' / ' + String(context.total) })`">属性示例</button>
						<button type="button" @click="source = `(context) => (context.row.items || []).reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2)`">汇总示例</button>
					</div>
					<div v-if="testMessage" class="expression-dialog__test-result" :class="{ 'is-error': testFailed }" role="status">{{ testMessage }}</div>
				</section>

				<aside class="expression-dialog__support">
					<section class="expression-dialog__reference">
						<nav class="expression-dialog__tabs" aria-label="表达式帮助">
							<button v-for="tab in tabs" :key="tab.id" type="button" :class="{ 'is-active': activeTab === tab.id }" @click="activeTab = tab.id">{{ tab.label }}</button>
						</nav>

						<div class="expression-dialog__reference-content">
							<div v-if="activeTab === 'guide'" class="expression-dialog__guide">
								<h3>基本写法</h3>
								<p>表达式必须是同步 JavaScript 函数，唯一参数是 <code>context</code>。</p>
								<pre>(context) =&gt; context.row.customerName ?? '-'</pre>
								<h3>返回值</h3>
								<p>返回文本、数字或布尔值，结果会替换节点文字里的 <code v-pre>{{名称或编码}}</code>。</p>
								<pre>(context) =&gt; context.pageNo</pre>
								<h3>空值与条件</h3>
								<pre>(context) =&gt; context.row.status === 'paid'
  ? '已付款'
  : '待付款'</pre>
								<h3>注意事项</h3>
								<p>仅使用可信表达式；不支持 <code>async</code>、网络请求或 Promise。</p>
							</div>

							<table v-else-if="activeTab === 'fields'" class="expression-dialog__table">
								<thead><tr><th>字段</th><th>表达式</th><th></th></tr></thead>
								<tbody>
									<tr v-for="field in fieldReferences" :key="field.path">
										<td>{{ field.label }}</td><td><code>{{ field.path }}</code></td>
										<td><button type="button" title="插入表达式" @click="insertReference(field.path)">插入</button></td>
									</tr>
								</tbody>
							</table>

							<div v-else-if="activeTab === 'data'" class="expression-dialog__data-reference">
								<p>实时预览使用的 context：</p>
								<pre>{{ dataSourcePreview }}</pre>
							</div>

							<table v-else class="expression-dialog__table expression-dialog__table--functions">
								<thead><tr><th>函数</th><th>示例</th><th></th></tr></thead>
								<tbody>
									<tr v-for="item in functionReferences" :key="item.name">
										<td><code>{{ item.name }}</code><small>{{ item.use }}</small></td><td><code>{{ item.example }}</code></td>
										<td><button type="button" title="插入示例" @click="insertReference(item.example)">插入</button></td>
									</tr>
								</tbody>
							</table>
						</div>
					</section>

					<section class="expression-dialog__preview" :class="`is-${livePreview.state}`" aria-live="polite">
						<header><div><span class="expression-dialog__preview-dot" />实时预览</div><small>第 1 页 · {{ sampleContext.total }} 条数据</small></header>
						<div class="expression-dialog__preview-output">
							<strong>{{ livePreview.title }}</strong>
							<pre>{{ livePreview.detail }}</pre>
						</div>
					</section>
				</aside>
				</div>
			</div>

			<template #footer>
			<footer class="expression-dialog__footer">
				<div />
				<div>
					<button type="button" class="expression-dialog__button" :disabled="saving" @click="closeDialog">取消</button>
					<button type="button" class="expression-dialog__button expression-dialog__button--primary" :disabled="saving" @click="save">{{ saving ? '保存中...' : '保存表达式' }}</button>
				</div>
			</footer>
			</template>
		</vxe-modal>
	</Teleport>
</template>
