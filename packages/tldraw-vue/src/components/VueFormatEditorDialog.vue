<script setup lang="ts">
import type { Editor, TLShapeId } from '@tldraw/editor'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { confirmForm, closeGlobalDialog } from '@enlearn/lowcode-framework/runtime/global-dialog'
import { useLowCodeHost } from '@enlearn/lowcode-framework/core/host'
import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode'
import { getEditorPrintDataSource } from '@/editor/workspaceDataSource'
import { useEditorValue } from '@/vue/useEditorValue'
import { resolvePrintDataSource } from '@/print/dataSource'
import { resolveTemplateString } from '@/print/expression'
import { createPrintValueFormat, getPrintFormatVariables, getPrintValueFormat, type ParsedPrintValueFormat, type PrintValueFormatType } from '@/print/format'
import type { PrintDataRow, PrintExpressionContext } from '@/print/types'

const FORM_CODE = 'print-designer.format'
const props = defineProps<{ editor: Editor; shapeId: TLShapeId }>()
const emit = defineEmits<{ close: []; apply: [variable: string, expression: string] }>()
const host = useLowCodeHost()
const dialogId = `print-format-${props.shapeId}-${Date.now()}`
const source = getEditorPrintDataSource(props.editor)
const rows = shallowRef<PrintDataRow[]>([])
const loading = ref(true)
const loadError = ref('')
const schema = shallowRef<LowCodeFormSchema>()
const model = reactive({ variable: '', formatType: 'number' as PrintValueFormatType, digits: '2', useGrouping: true, dateFormat: 'YYYY-MM-DD', expression: '', preview: '', hint: '' })
const dialogModel = shallowRef<Record<string, unknown>>()
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

const target = useEditorValue('format target', () => props.editor.getShape(props.shapeId))
const readonly = useEditorValue('format readonly', () => props.editor.getIsReadonly())
const targetText = computed(() => String((target.value?.props as Record<string, unknown> | undefined)?.text ?? ''))
const variables = computed(() => getPrintFormatVariables(
	source.value,
	rows.value,
	targetText.value,
))
let modelInitialized = false
watch(variables, values => {
	if (!values.length) return
	if (!modelInitialized) {
		const saved = getPrintValueFormat(targetText.value)
		model.variable = saved && values.some(value => value.value === saved.variable) ? saved.variable : values[0].value
		bindSavedFormat(saved?.variable === model.variable ? saved : undefined)
		modelInitialized = true
		syncDialogModel()
		return
	}
	if (!values.some(value => value.value === model.variable)) {
		model.variable = values[0].value
		bindSavedFormat(getPrintValueFormat(targetText.value, model.variable))
		syncDialogModel()
	}
}, { immediate: true })
const expression = computed(() => {
	try {
		return createPrintValueFormat({
			variable: model.variable,
			type: model.formatType,
			digits: model.formatType === 'number' ? Number(model.digits) : undefined,
			useGrouping: model.formatType === 'number' && model.useGrouping,
			dateFormat: model.formatType === 'date' ? model.dateFormat : undefined,
		})
	} catch { return '' }
})
const context = computed<PrintExpressionContext>(() => ({
	row: rows.value[0] ?? {}, dataSource: source.value, currentTable: {}, currentTables: {},
	currentDetailRows: Object.fromEntries(Object.entries(rows.value[0] ?? {}).flatMap(([key, value]) =>
		Array.isArray(value) && value[0] && typeof value[0] === 'object' ? [[key, value[0]]] : [])),
	index: 0, pageNo: 1, total: Math.max(1, rows.value.length),
}))
const preview = computed(() => {
	if (loading.value) return { error: true, text: '正在加载示例数据…' }
	if (loadError.value) return { error: true, text: loadError.value }
	if (!expression.value) return { error: true, text: '请选择需要格式化的变量。' }
	try {
		const value = resolveTemplateString(expression.value, context.value)
		return { error: false, text: value === '' ? '（空值）' : value }
	} catch (error) { return { error: true, text: message(error) } }
})
const canInsert = computed(() => !readonly.value && !!target.value && !loading.value && !!expression.value && !preview.value.error)
const confirmDisabled = computed(() => !canInsert.value)

watch([expression, preview, variables, () => model.formatType], syncDerivedFields, { immediate: true })

function syncDerivedFields() {
	model.expression = expression.value
	model.preview = preview.value.text
	model.hint = !variables.value.length
		? '请先配置数据源字段或在文本中添加 {{变量}}。'
		: model.formatType === 'number'
			? '设置小数位和千分位。文本中已有的同名变量会更新格式，否则追加到末尾。'
			: '日期时间按当前设备时区显示。文本中已有的同名变量会更新格式，否则追加到末尾。'
	syncDialogModel(['expression', 'preview', 'hint'])
}

watch([schema, variables, readonly], () => {
	if (!schema.value) return
	for (const item of schema.value.fields) {
		if (item.field === 'variable') {
			item.options = variables.value
			item.props = { ...item.props, disabled: readonly.value || !variables.value.length }
		}
	}
}, { immediate: true, flush: 'sync' })

onMounted(async () => {
	try {
		const result = await confirmForm({
			formCode: FORM_CODE,
			title: '格式化',
			width: 'min(560px, calc(100vw - 24px))',
			className: 'print-format-confirm-dialog',
			confirmLabel: '应用格式化',
			confirmDisabled,
			serviceApi: host.getServiceApi(),
			formOptions: {
				model,
				onFieldChange: (change, context) => {
					dialogModel.value = context.model
					if (change.field.field === 'variable') {
						bindSavedFormat(getPrintValueFormat(targetText.value, String(change.value ?? '')), context.model)
					}
					syncModelFromDialog(context.model)
					syncDialogModel(['variable', 'formatType', 'digits', 'useGrouping', 'dateFormat'])
					syncDerivedFields()
				},
			},
			configureForm: value => {
				if (disposed) throw new Error('格式化弹框已关闭。')
				for (const field of ['variable', 'formatType', 'digits', 'useGrouping', 'dateFormat', 'expression', 'preview']) {
					if (!value.fields.some(item => item.field === field)) throw new Error(`格式化表单缺少字段：${field}`)
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
		if (result.action === 'confirm' && canInsert.value) emit('apply', model.variable, expression.value)
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

function bindSavedFormat(saved?: ParsedPrintValueFormat, target: Record<string, unknown> = model) {
	target.formatType = saved?.type ?? 'number'
	target.digits = String(saved?.digits ?? 2)
	target.useGrouping = saved?.useGrouping ?? true
	target.dateFormat = saved?.dateFormat ?? 'YYYY-MM-DD'
}

function syncModelFromDialog(values: Record<string, unknown>) {
	model.variable = String(values.variable ?? '')
	model.formatType = values.formatType === 'date' ? 'date' : 'number'
	model.digits = String(values.digits ?? 2)
	model.useGrouping = values.useGrouping !== false
	model.dateFormat = String(values.dateFormat ?? 'YYYY-MM-DD')
}

function syncDialogModel(fields?: Array<keyof typeof model>) {
	if (!dialogModel.value) return
	for (const field of fields ?? Object.keys(model) as Array<keyof typeof model>) {
		dialogModel.value[field] = model[field]
	}
}
</script>

<template><span hidden aria-hidden="true" /></template>

<style scoped>
:global(.print-format-confirm-dialog .vxe-modal--box) { left: 50% !important; top: 50% !important; transform: translate(-50%, -50%) !important; max-width: calc(100vw - 24px); max-height: calc(100dvh - 24px); }
:global(.print-format-confirm-dialog .vxe-modal--body) { min-height: 0; overflow: auto; }
:global(.print-format-confirm-dialog input), :global(.print-format-confirm-dialog select), :global(.print-format-confirm-dialog textarea) { width: 100%; min-width: 0; }
</style>
