<script setup lang="ts">
import type { Editor, TLShapeId } from '@tldraw/editor'
import { computed, ref, shallowRef, watch } from 'vue'
import { getEditorPrintDataSource } from '@/editor/workspaceDataSource'
import type { VueTemplateWorkspaceConfig } from '@/editor/templateStore'
import { useEditorValue } from '@/vue/useEditorValue'
import { resolvePrintDataSource } from '@/print/dataSource'
import { resolveTemplateString } from '@/print/expression'
import { createPrintFormula, getPrintFormulaSources, PRINT_FORMULA_FUNCTIONS, type PrintFormulaFunction, type PrintFormulaScope } from '@/print/formula'
import { createLocalPrintJobConfig } from '@/print/localConfig'
import { PrintRenderer } from '@/print/renderer'
import type { PrintDataRow, PrintExpressionContext } from '@/print/types'

const props = defineProps<{
	editor: Editor
	shapeId: TLShapeId
	workspaceRevision?: number
	getWorkspaceTemplateConfig?: () => VueTemplateWorkspaceConfig | undefined
}>()
const emit = defineEmits<{ close: []; insert: [formula: string] }>()
const visible = ref(true)
const name = ref<PrintFormulaFunction>('TOTAL')
const detailField = ref('')
const field = ref('')
const selectedField = computed({ get: () => name.value === 'COUNT' ? '' : field.value, set: (value: string) => { field.value = value } })
const scope = ref<PrintFormulaScope>('all')
const digits = ref('2')
const pageIndex = ref(0)
const source = getEditorPrintDataSource(props.editor)
const rows = shallowRef<PrintDataRow[]>([])
const loading = ref(false)
const loadError = ref('')
const readonly = useEditorValue('formula readonly', () => props.editor.getIsReadonly())
const shapes = useEditorValue('formula sample shapes', () => props.editor.getCurrentPageShapes())
const renderer = new PrintRenderer(props.editor)

watch(source, async (value, _previous, onCleanup) => {
	let stale = false
	onCleanup(() => { stale = true })
	loading.value = true
	loadError.value = ''
	rows.value = []
	try {
		const resolved = await resolvePrintDataSource(value)
		if (!stale) rows.value = resolved ?? []
	} catch (error) {
		if (!stale) loadError.value = message(error)
	} finally {
		if (!stale) loading.value = false
	}
}, { immediate: true })

const sources = computed(() => getPrintFormulaSources(source.value, rows.value))
const fields = computed(() => sources.value.find(item => item.field === detailField.value)?.fields ?? [])
watch(sources, values => {
	if (!values.some(item => item.field === detailField.value)) detailField.value = values[0]?.field ?? ''
}, { immediate: true })
watch(fields, values => {
	if (!values.some(item => item.field === field.value)) field.value = values[0]?.field ?? ''
}, { immediate: true })

const formula = computed(() => {
	try {
		return createPrintFormula(name.value, detailField.value, field.value, scope.value,
			digits.value === '' ? undefined : Number(digits.value))
	} catch { return '' }
})
const pagination = computed(() => {
	shapes.value
	props.workspaceRevision
	const config = createLocalPrintJobConfig(props.editor, props.getWorkspaceTemplateConfig?.(), source.value)
	config.data = rows.value
	try {
		const jobs = renderer.createRenderJobs(config)
		return { contexts: jobs.map((job, index) => renderer.createExpressionContext(config, job, index, jobs.length)), error: '' }
	} catch (error) { return { contexts: [], error: message(error) } }
})
watch(() => pagination.value.contexts.length, length => { pageIndex.value = Math.min(pageIndex.value, Math.max(0, length - 1)) })
const preview = computed(() => {
	if (loading.value) return { error: false, text: '正在加载示例数据…' }
	if (loadError.value) return { error: true, text: loadError.value }
	if (!formula.value) return { error: true, text: '请选择明细源和字段。' }
	if (scope.value === 'page' && pagination.value.error) return { error: true, text: pagination.value.error }
	const tables = {}
	const context: PrintExpressionContext = pagination.value.contexts[pageIndex.value] ?? {
		row: rows.value[0] ?? {}, dataSource: source.value,
		currentTable: tables, currentTables: tables, index: 0, pageNo: 1, total: 1,
	}
	try {
		const text = resolveTemplateString(formula.value, context)
		return { error: false, text: text === '' ? '（空值）' : text }
	} catch (error) { return { error: true, text: message(error) } }
})
const canInsert = computed(() => !readonly.value && !loading.value && Boolean(formula.value) && !preview.value.error)
function insert() { if (canInsert.value) emit('insert', formula.value) }
function message(error: unknown) { return error instanceof Error ? error.message : String(error) }
</script>

<template>
	<Teleport to="body">
		<vxe-modal v-model="visible" class-name="print-formula-modal" title="插入公式" width="min(560px, calc(100vw - 24px))" min-width="300px" :draggable="false"
			:show-footer="true" :mask-closable="true" :esc-closable="true" @hide="emit('close')">
			<div class="formula-editor" @pointerdown.stop @keydown.stop>
				<p v-if="!loading && !sources.length" class="formula-editor__hint">请先在数据源中配置明细表或导入明细数据。</p>
				<div class="formula-editor__fields">
					<label>函数<select v-model="name" aria-label="函数"><option v-for="item in PRINT_FORMULA_FUNCTIONS" :key="item.value" :value="item.value">{{ item.label }}（{{ item.value }}）</option></select></label>
					<label>明细源<select v-model="detailField" aria-label="明细源" :disabled="!sources.length"><option v-for="item in sources" :key="item.field" :value="item.field">{{ item.label }}（{{ item.field }}）</option></select></label>
					<label>字段<select v-model="selectedField" aria-label="字段" :disabled="name === 'COUNT' || !fields.length"><option v-if="name === 'COUNT'" value="">全部记录（无需选择字段）</option><option v-else v-for="item in fields" :key="item.field" :value="item.field">{{ item.label }}（{{ item.field }}）</option></select></label>
					<label>统计范围<select v-model="scope" aria-label="统计范围"><option value="all">全单</option><option value="page">本页</option></select></label>
					<label>小数位<select v-model="digits" aria-label="小数位"><option value="">不固定</option><option v-for="digit in 21" :key="digit" :value="String(digit - 1)">{{ digit - 1 }} 位</option></select></label>
					<label v-if="pagination.contexts.length">示例页<select v-model.number="pageIndex" aria-label="示例页"><option v-for="(context, index) in pagination.contexts" :key="index" :value="index">第 {{ context.pageNo }} 页 / 共 {{ pagination.contexts.length }} 页</option></select></label>
				</div>
				<p class="formula-editor__hint">{{ scope === 'all' ? '统计当前单据的全部明细，分页后总计保持一致。' : '按本地预览的分页设置统计当前页明细。' }}空值和非数字不参与数值计算。</p>
				<section class="formula-editor__output"><strong>生成公式</strong><code>{{ formula || '等待选择…' }}</code></section>
				<section class="formula-editor__output" :class="{ 'is-error': preview.error }" aria-live="polite"><strong>示例结果</strong><span>{{ preview.text }}</span><small v-if="!rows.length && !loading && !loadError">当前无示例记录；有数据后会重新计算。</small></section>
			</div>
			<template #footer><div class="formula-editor__actions"><button type="button" @click="emit('close')">取消</button><button type="button" class="is-primary" :disabled="!canInsert" @click="insert">插入到文本末尾</button></div></template>
		</vxe-modal>
	</Teleport>
</template>

<style scoped>
:global(.print-formula-modal .vxe-modal--box) { left: 50% !important; top: 50% !important; transform: translate(-50%, -50%) !important; max-height: calc(100dvh - 24px); }
:global(.print-formula-modal .vxe-modal--body) { min-height: 0; overflow: auto; }
.formula-editor { display: grid; gap: 16px; padding: 8px; color: #334155; font-size: 13px; }
.formula-editor__fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.formula-editor label { display: grid; gap: 6px; font-weight: 600; }
.formula-editor select { width: 100%; min-width: 0; height: 36px; padding: 0 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: white; color: #0f172a; }
.formula-editor select:focus-visible, .formula-editor__actions button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
.formula-editor__hint { margin: 0; line-height: 1.7; color: #64748b; }
.formula-editor__output { display: grid; gap: 8px; padding: 14px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; overflow-wrap: anywhere; }
.formula-editor__output code { white-space: pre-wrap; color: #1d4ed8; }
.formula-editor__output span { font-size: 20px; color: #0f172a; }
.formula-editor__output small { color: #64748b; }
.formula-editor__output.is-error span { color: #b91c1c; font-size: 13px; }
.formula-editor__actions { display: flex; justify-content: flex-end; gap: 10px; }
.formula-editor__actions button { padding: 8px 14px; border: 1px solid #cbd5e1; border-radius: 6px; background: white; color: #334155; cursor: pointer; }
.formula-editor__actions .is-primary { background: #2563eb; border-color: #2563eb; color: white; }
.formula-editor__actions button:disabled { opacity: .5; cursor: default; }
@media (max-width: 480px) { .formula-editor__fields { grid-template-columns: minmax(0, 1fr); } }
</style>
