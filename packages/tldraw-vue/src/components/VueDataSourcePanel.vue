<script setup lang="ts">
import LowCodeForm from '@enlearn/lowcode-framework/components/low-code-form'
import { useLowCodeHost } from '@enlearn/lowcode-framework/core/host'
import {
	$$formDesigner,
	createLowCodeFormSchemaFromDesignerResult,
} from '@enlearn/lowcode-framework/visual-editor/components/form-designer/form-designer.service'
import { createFormDesignerFieldsFromSchema } from '@enlearn/lowcode-framework/lowcode/block-materials/runtime-form-designer'
import type { FormDesignerResult } from '@enlearn/lowcode-framework/visual-editor/components/form-designer/form-designer.service'
import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode'
import type { Editor } from '@tldraw/editor'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
const DATA_SOURCE_DEFINITION_FORM_CODE = 'print-designer.datasource-definition'

type DataSourceAction = 'add' | 'manage' | 'design'

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
const actionMessage = ref('')
const actionMessageTimer = ref<ReturnType<typeof setTimeout> | null>(null)
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
	if (definitionsLoading.value || !dataSourceDefinitionForm.value) return
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
			schema: createDataSourceDefinitionSchema(),
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
		fields: createFormDesignerFieldsFromSchema(definition.schema),
		layout: definition.schema.layout,
		columns: definition.schema.columns,
		headerForm: {
			schema: dataSourceDefinitionForm.value?.schema ?? createDataSourceDefinitionSchema(true),
			model: headerModel,
		},
		designerModel: null,
		serviceApi: host.getServiceApi(),
		onConfirm: async (result) => {
			await saveDataSourceDefinition(result.header ?? headerModel, result, definition.id)
			await loadDefinitions()
			setActionMessage('数据源设计已保存。')
		},
	})
}

function createDataSourceDefinitionSchema(readonlyCode = false): LowCodeFormSchema {
	return {
		title: '数据源信息',
		columns: 2,
		fields: [
			{
				field: 'code',
				label: '数据源编码',
				component: 'vxe-input',
				rules: [{ required: true, message: '请输入数据源编码' }],
				props: {
					placeholder: 'print-designer.datasource.inventory',
					...(readonlyCode ? { disabled: true } : {}),
				},
			},
			{
				field: 'name',
				label: '数据源名称',
				component: 'vxe-input',
				rules: [{ required: true, message: '请输入数据源名称' }],
				props: { placeholder: '请输入数据源名称' },
			},
			{
				field: 'tableName',
				label: '关联表',
				component: 'vxe-input',
				rules: [{ required: true, message: '请输入业务表名' }],
				props: { placeholder: '例如：public.inventory' },
			},
			{
				field: 'description',
				label: '描述',
				component: 'vxe-textarea',
				span: 2,
				props: { placeholder: '请输入数据源说明', rows: 2 },
			},
		],
		layout: [
			{
				kind: 'row',
				columns: [
					{ span: 1, blocks: [{ kind: 'field', field: 'code' }] },
					{ span: 1, blocks: [{ kind: 'field', field: 'name' }] },
				],
			},
			{
				kind: 'row',
				columns: [
					{ span: 1, blocks: [{ kind: 'field', field: 'tableName' }] },
					{ span: 1, blocks: [{ kind: 'field', field: 'description' }] },
				],
			},
		],
		actions: [],
	}
}

async function saveDataSourceDefinition(
	model: Record<string, unknown>,
	result: FormDesignerResult,
	id?: string,
): Promise<string> {
	const code = readString(model.code)
	const name = readString(model.name)
	const tableName = readString(model.tableName)
	const description = readString(model.description)
	if (!/^print-designer\.datasource\.[A-Za-z0-9_-]+$/.test(code)) {
		throw new Error('数据源编码必须以 print-designer.datasource. 开头，并包含英文、数字、下划线或短横线。')
	}
	if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(tableName)) {
		throw new Error('关联表名格式不正确，只支持 table 或 schema.table。')
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
			<div class="lowcode-form-panel__heading">
				<div class="lowcode-form-panel__title">数据源</div>
				<div class="lowcode-form-panel__subtitle">{{ panelSubtitle }}</div>
			</div>
			<div class="lowcode-form-panel__header-actions" aria-label="数据源操作">
				<button
					type="button"
					class="lowcode-form-panel__action lowcode-form-panel__action--primary"
					:disabled="definitionsLoading"
					title="添加数据源"
					@click="handleAddDataSource"
				>
					<i class="ri-add-line" aria-hidden="true" />
					<span>添加</span>
				</button>
				<button
					type="button"
					class="lowcode-form-panel__action"
					title="管理数据源"
					@click="handleManageDataSource"
				>
					<i class="ri-settings-3-line" aria-hidden="true" />
					<span>管理</span>
				</button>
				<button
					type="button"
					class="lowcode-form-panel__action"
					title="设计数据源"
					@click="handleDesignDataSource"
				>
					<i class="ri-layout-4-line" aria-hidden="true" />
					<span>设计</span>
				</button>
			</div>
		</header>
		<div v-if="actionMessage" class="lowcode-form-panel__action-message" role="status">
			<i class="ri-information-line" aria-hidden="true" />
			<span>{{ actionMessage }}</span>
		</div>
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
