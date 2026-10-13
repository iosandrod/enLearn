<script setup lang="ts">
import type { Editor, TLShapeId } from '@tldraw/editor'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { confirmForm, closeGlobalDialog } from '@enlearn/lowcode-framework/runtime/global-dialog'
import { useLowCodeHost } from '@enlearn/lowcode-framework/core/host'
import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode'
import { getEditorPrintDataSource } from '@/editor/workspaceDataSource'
import type { VueTemplateWorkspaceConfig } from '@/editor/templateStore'
import { useEditorValue } from '@/vue/useEditorValue'
import { resolvePrintDataSource } from '@/print/dataSource'
import { resolveTemplateString } from '@/print/expression'
import { createPrintFormula, getPrintFormulaSources, type PrintFormulaFunction, type PrintFormulaScope } from '@/print/formula'
import { createLocalPrintJobConfig } from '@/print/localConfig'
import { PrintRenderer } from '@/print/renderer'
import type { PrintDataRow, PrintExpressionContext } from '@/print/types'

const FORM_CODE = 'print-designer.formula'
const props = defineProps<{
	editor: Editor
	shapeId: TLShapeId
	workspaceRevision?: number
	getWorkspaceTemplateConfig?: () => VueTemplateWorkspaceConfig | undefined
}>()
const emit = defineEmits<{ close: []; insert: [formula: string] }>()
const host = useLowCodeHost()
const dialogId = `print-formula-${props.shapeId}-${Date.now()}`
const source = getEditorPrintDataSource(props.editor)
const rows = shallowRef<PrintDataRow[]>([])
const loading = ref(true)
const loadError = ref('')
const schema = shallowRef<LowCodeFormSchema>()
const model = reactive({ functionName: 'TOTAL', detailField: '', field: '', scope: 'all', digits: '2', pageIndex: 0, formula: '', preview: '', hint: '' })
const readonly = useEditorValue('formula readonly', () => props.editor.getIsReadonly())
const target = useEditorValue('formula target', () => props.editor.getShape(props.shapeId))
const shapes = useEditorValue('formula sample shapes', () => props.editor.getCurrentPageShapes())
const renderer = new PrintRenderer(props.editor)
let disposed = false

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
const fields = computed(() => sources.value.find(item => item.field === model.detailField)?.fields ?? [])
watch(sources, values => {
	if (!values.some(item => item.field === model.detailField)) model.detailField = values[0]?.field ?? ''
}, { immediate: true })
watch([fields, () => model.functionName], ([values]) => {
	if (model.functionName === 'COUNT') model.field = ''
	else if (!values.some(item => item.field === model.field)) model.field = values[0]?.field ?? ''
}, { immediate: true })

const formula = computed(() => {
	try {
		return createPrintFormula(model.functionName as PrintFormulaFunction, model.detailField, model.field,
			model.scope as PrintFormulaScope, model.digits === '' ? undefined : Number(model.digits))
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
watch(() => pagination.value.contexts.length, length => {
	model.pageIndex = Math.max(0, Math.min(Number(model.pageIndex) || 0, Math.max(0, length - 1)))
})
const preview = computed(() => {
	if (loading.value) return { error: true, text: '正在加载示例数据…' }
	if (loadError.value) return { error: true, text: loadError.value }
	if (!formula.value) return { error: true, text: '请选择明细源和字段。' }
	if (model.scope === 'page' && pagination.value.error) return { error: true, text: pagination.value.error }
	const tables = {}
	const context: PrintExpressionContext = pagination.value.contexts[Number(model.pageIndex)] ?? {
		row: rows.value[0] ?? {}, dataSource: source.value, currentTable: tables, currentTables: tables, index: 0, pageNo: 1, total: 1,
	}
	try {
		const text = resolveTemplateString(formula.value, context)
		return { error: false, text: text === '' ? '（空值）' : text }
	} catch (error) { return { error: true, text: message(error) } }
})
const canInsert = computed(() => !readonly.value && !!target.value && !loading.value && !!formula.value && !preview.value.error)
const confirmDisabled = computed(() => !canInsert.value)
watch([formula, preview, () => model.scope, sources, rows], () => {
	model.formula = formula.value
	model.preview = preview.value.text
	model.hint = !sources.value.length
		? '请先在数据源中配置明细表或导入明细数据。'
		: `${model.scope === 'page' ? '按本地预览的实际分页统计本页明细。' : '统计当前单据的全部明细，分页后总计保持一致。'}空值和非数字不参与计算。${!rows.value.length ? '当前无示例记录。' : ''}`
}, { immediate: true })

// Only editor-dependent options/state are patched; layout, labels and static
// options remain controlled by the database form definition.
watch([schema, sources, fields, pagination, () => model.functionName, readonly], () => {
	if (!schema.value) return
	for (const item of schema.value.fields) {
		if (item.field === 'detailField') {
			item.options = sources.value.map(value => ({ label: `${value.label}（${value.field}）`, value: value.field }))
			item.props = { ...item.props, disabled: readonly.value || !sources.value.length }
		} else if (item.field === 'field') {
			item.options = model.functionName === 'COUNT'
				? [{ label: '全部记录（无需选择字段）', value: '' }]
				: fields.value.map(value => ({ label: `${value.label}（${value.field}）`, value: value.field }))
			item.props = { ...item.props, disabled: readonly.value || model.functionName === 'COUNT' || !fields.value.length }
		} else if (item.field === 'pageIndex') {
			item.options = pagination.value.contexts.map((value, index) => ({ label: `第 ${value.pageNo} 页 / 共 ${pagination.value.contexts.length} 页`, value: index }))
			item.props = { ...item.props, disabled: readonly.value || !item.options.length }
		}
	}
}, { immediate: true, flush: 'sync' })

onMounted(async () => {
	try {
		const result = await confirmForm({
			formCode: FORM_CODE,
			title: '插入公式',
			width: 'min(560px, calc(100vw - 24px))',
			className: 'print-formula-confirm-dialog',
			confirmLabel: '插入到文本末尾',
			confirmDisabled,
			serviceApi: host.getServiceApi(),
			formOptions: { model },
			configureForm: value => {
				if (disposed) throw new Error('公式弹框已关闭。')
				for (const field of ['functionName', 'detailField', 'field', 'scope', 'digits', 'pageIndex', 'formula', 'preview']) {
					if (!value.fields.some(item => item.field === field)) throw new Error(`公式表单缺少字段：${field}`)
				}
				schema.value = value
			},
			dialog: { id: dialogId, props: { draggable: false, maskClosable: true, escClosable: true } },
			beforeConfirm: () => {
				if (disposed || readonly.value || !target.value) return false
				if (!canInsert.value) throw new Error(preview.value.text)
				return true
			},
		})
		if (disposed) return
		if (result.action === 'confirm' && canInsert.value) emit('insert', formula.value)
		else emit('close')
	} catch (error) {
		if (disposed) return
		const { VxeUI } = await import('vxe-pc-ui')
		void VxeUI.modal.message({ content: message(error), status: 'error' })
		emit('close')
	}
})
onBeforeUnmount(() => {
	disposed = true
	void closeGlobalDialog(dialogId, { action: 'close' })
})
function message(error: unknown) { return error instanceof Error ? error.message : String(error) }
</script>

<template><span hidden aria-hidden="true" /></template>

<style scoped>
:global(.print-formula-confirm-dialog .vxe-modal--box) { left: 50% !important; top: 50% !important; transform: translate(-50%, -50%) !important; max-width: calc(100vw - 24px); max-height: calc(100dvh - 24px); }
:global(.print-formula-confirm-dialog .vxe-modal--body) { min-height: 0; overflow: auto; }
:global(.print-formula-confirm-dialog input), :global(.print-formula-confirm-dialog select), :global(.print-formula-confirm-dialog textarea) { width: 100%; min-width: 0; }
</style>
