<script setup lang="ts">
import LowCodeForm from '@enlearn/lowcode-framework/components/low-code-form'
import { useLowCodeHost } from '@enlearn/lowcode-framework/core/host'
import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode'
import type { Editor } from '@tldraw/editor'
import { computed, onMounted, ref } from 'vue'
import { useVxeMessage } from '@enlearn/lowcode-framework/utils/vxe-message'
import { isVueMaterialShape } from '@/editor/extensions/material/vueMaterialShape'
import { getMaterialDataSourceFieldOptions } from '@/editor/materialDataSourceFields'
import type { VueTemplateWorkspaceConfig } from '@/editor/templateStore'
import { getEditorPrintDataSource } from '@/editor/workspaceDataSource'
import { useEditorValue } from '@/vue/useEditorValue'
import { PRINT_HEADER_PREVIEW_SOURCE } from '@/print/dataSource'

const PREVIEW_FORM_CODE = 'print-designer.preview-settings'
const props = defineProps<{
	editor: Editor
	workspaceRevision: number
	getWorkspaceTemplateConfig: () => VueTemplateWorkspaceConfig | undefined
	applyWorkspaceTemplateConfig?: (config: VueTemplateWorkspaceConfig) => void
}>()
const host = useLowCodeHost()
const definition = ref<LowCodeFormSchema | null>(null)
const loading = ref(true)
const errorMessage = ref('')
useVxeMessage(errorMessage, 'error')
const source = getEditorPrintDataSource(props.editor)
const readonly = useEditorValue('preview settings readonly', () => props.editor.getIsReadonly())
const materialOptions = useEditorValue('preview pagination components', () =>
	props.editor.getCurrentPageShapes()
		.filter(isVueMaterialShape)
		.map((shape, index) => ({
			label: `${shape.props.name || `物料表格 ${index + 1}`} (${shape.id})`,
			value: shape.id,
		}))
)
const detailOptions = computed(() => [
	...getMaterialDataSourceFieldOptions(source.value).filter(option => option.value),
	...(source.value?.type === 'inline' ? [{ label: '表头表格', value: PRINT_HEADER_PREVIEW_SOURCE }] : []),
])
const model = computed(() => {
	props.workspaceRevision
	const settings = props.getWorkspaceTemplateConfig()?.previewSettings
	return {
		mode: settings?.mode ?? 'component',
		materialId: settings?.materialId ?? materialOptions.value[0]?.value ?? '',
		detailField: settings?.detailField ?? detailOptions.value[0]?.value ?? '',
	}
})
const schema = computed(() => definition.value ? {
	...definition.value,
	fields: definition.value.fields.map(field => {
		if (field.field === 'materialId') return { ...field, options: materialOptions.value }
		if (field.field === 'detailField') return {
			...field, label: '分页数据源', options: detailOptions.value,
			props: { ...field.props, placeholder: '选择表头表格或明细源' },
		}
		return field
	}),
} : null)
const selectionMessage = computed(() => {
	// if (model.value.mode === 'component') {
	// 	if (!materialOptions.value.length) return '请先在当前画布添加物料表格组件。'
	// 	if (!materialOptions.value.some(option => option.value === model.value.materialId)) return '已选组件不在当前画布中，请重新选择。'
	// } else {
	// 	if (!detailOptions.value.length) return '请先配置表头或明细数据源。'
	// 	if (!detailOptions.value.some(option => option.value === model.value.detailField)) return '已选分页数据源不存在，请重新选择。'
	// }
	return ''
})
useVxeMessage(selectionMessage, 'warning')

function handleModelUpdate(value: Record<string, unknown>) {
	if (readonly.value) return
	const next = { ...model.value, ...value }
	props.applyWorkspaceTemplateConfig?.({ previewSettings: {
		mode: next.mode === 'data' ? 'data' : 'component',
		materialId: typeof next.materialId === 'string' ? next.materialId : '',
		detailField: typeof next.detailField === 'string' ? next.detailField : '',
	} })
}

async function loadSchema() {
	loading.value = true
	errorMessage.value = ''
	try {
		const rows = await host.getServiceApi().invoke<Array<{ code?: unknown; schema?: unknown }>>(
			'lowcode', 'listItems', {
				resource: 'lowcode_form_definitions',
				filters: { code: PREVIEW_FORM_CODE, enabled: true },
				limit: 1,
			},
		)
		const row = Array.isArray(rows) ? rows[0] : undefined
		const candidate = row?.schema as LowCodeFormSchema | undefined
		if (row?.code !== PREVIEW_FORM_CODE || !Array.isArray(candidate?.fields) || !Array.isArray(candidate?.actions)) {
			throw new Error('未找到预览设置低代码表单。')
		}
		definition.value = candidate
	} catch (error) {
		definition.value = null
		errorMessage.value = error instanceof Error ? error.message : '预览设置表单加载失败。'
	} finally {
		loading.value = false
	}
}
onMounted(() => { void loadSchema() })
</script>

<template>
	<section class="preview-settings-panel" aria-label="预览设置" @pointerdown.stop @pointermove.stop @wheel.stop @contextmenu.prevent.stop>
		<header><strong>预览设置</strong><span>设置预览的分页依据</span></header>
		<p v-if="loading" role="status">正在加载低代码表单...</p>
		<button v-else-if="errorMessage" type="button" @click="loadSchema">重新加载</button>
		<template v-else-if="schema">
			<LowCodeForm :schema="schema" :model-value="model" :disabled="readonly" @update:model-value="handleModelUpdate" />
			<p class="preview-settings-panel__hint">{{ model.mode === 'component' ? '根据所选物料表格的内容和表体高度分页。' : model.detailField === PRINT_HEADER_PREVIEW_SOURCE ? '表头表格每条记录独立分页，明细保留为数组字段；物料表格明细过长时按表体高度续页。' : '所选明细源每条记录生成一页，可在表达式中读取当前记录。' }}</p>
		</template>
	</section>
</template>

<style scoped>
.preview-settings-panel { display: grid; gap: 14px; padding: 16px 12px; font-size: 13px; }
.preview-settings-panel header { display: grid; gap: 6px; }
.preview-settings-panel header strong { font-size: 15px; }
.preview-settings-panel header span, .preview-settings-panel__hint { color: #64748b; }
.preview-settings-panel p { margin: 0; line-height: 1.6; }
.preview-settings-panel__warning { color: #b45309; }
</style>
