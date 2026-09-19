<script setup lang="ts">
import LowCodeForm from '@enlearn/lowcode-framework/components/low-code-form'
import { useLowCodeHost } from '@enlearn/lowcode-framework/core/host'
import type { Editor } from '@tldraw/editor'
import { computed, onMounted, ref, watch } from 'vue'
import {
	createInlinePrintDataSource,
	getPrintDataSourceFormCode,
	getPrintDataSourceFormModel,
	isLowCodeFormSchema,
	isPrintDataSourceFormDefinition,
	type PrintDataSourceFormDefinition,
} from '@/editor/dataSourceForm'
import type { VueTemplateWorkspaceConfig } from '@/editor/templateStore'

const SELECTOR_FORM_CODE = 'print-designer.datasource-selector'

interface StoredFormDefinition {
	id: string
	code: string
	name: string
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
const activeDefinition = ref<PrintDataSourceFormDefinition | null>(null)
const definitionsLoading = ref(true)
const definitionError = ref('')
const selectorModel = ref<Record<string, unknown>>({ formCode: '' })
const formModel = ref<Record<string, unknown>>({})
const panelSubtitle = computed(() => {
	const definition = activeDefinition.value
	return definition ? `${definition.name} · ${definition.table_name}` : '请选择低代码表单'
})
let definitionRequestRevision = 0

async function loadDefinitions() {
	definitionsLoading.value = true
	definitionError.value = ''
	try {
		selectorDefinition.value = await loadStoredFormDefinition(SELECTOR_FORM_CODE)
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
		activeDefinition.value = null
		selectorModel.value = { formCode: '' }
		formModel.value = {}
		definitionError.value =
			error instanceof Error ? error.message : '低代码表单定义加载失败，请稍后重试。'
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
		definitionError.value =
			error instanceof Error ? error.message : '低代码表单定义加载失败，请稍后重试。'
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
		printDataSource: createInlinePrintDataSource(value, definition),
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
	selectorModel.value = { formCode: definition.code }
	formModel.value = getPrintDataSourceFormModel(
		resetModel ? undefined : getWorkspaceDataSource(),
		definition.schema
	)
	if (resetModel) applyFormModel(formModel.value, definition)
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

function readString(value: unknown) {
	return typeof value === 'string' ? value.trim() : ''
}

function getWorkspaceDataSource() {
	return props.getWorkspaceTemplateConfig?.()?.printDataSource
}

onMounted(() => {
	void loadDefinitions()
})

watch(
	() => props.workspaceRevision,
	() => {
		const sourceCode = getPrintDataSourceFormCode(getWorkspaceDataSource())
		if (sourceCode && sourceCode !== activeDefinition.value?.code) {
			selectorModel.value = { formCode: sourceCode }
			void activateDefinition(sourceCode, false).catch((error) => {
				definitionError.value =
					error instanceof Error ? error.message : '低代码表单定义加载失败，请稍后重试。'
			})
			return
		}
		syncFormModel()
	}
)
</script>

<template>
	<section
		class="lowcode-form-panel data-source-panel"
		aria-label="打印数据源表单"
		@pointerdown.stop
		@pointermove.stop
		@keydown.stop
		@keyup.stop
		@keypress.stop
		@wheel.stop
		@contextmenu.prevent.stop
	>
		<header class="lowcode-form-panel__header">
			<div>
				<div class="lowcode-form-panel__title">数据源</div>
				<div class="lowcode-form-panel__subtitle">{{ panelSubtitle }}</div>
			</div>
		</header>
		<div v-if="selectorDefinition" class="data-source-panel__selector-form">
			<LowCodeForm
				:model-value="selectorModel"
				:schema="selectorDefinition.schema"
				:disabled="definitionsLoading"
				@update:model-value="handleDefinitionChange"
			/>
		</div>
		<div v-if="definitionsLoading" class="lowcode-form-panel__state" role="status">
			正在加载低代码表单...
		</div>
		<div
			v-else-if="definitionError"
			class="lowcode-form-panel__state lowcode-form-panel__state--error"
			role="alert"
		>
			<p>{{ definitionError }}</p>
			<button type="button" @click="loadDefinitions">重新加载</button>
		</div>
		<div v-else-if="activeDefinition" class="data-source-panel__body">
			<LowCodeForm
				:key="activeDefinition.code"
				:model-value="formModel"
				:schema="activeDefinition.schema"
				@update:model-value="handleModelUpdate"
			/>
		</div>
	</section>
</template>
