<script setup lang="ts">
import LowCodeForm from '@enlearn/lowcode-framework/components/low-code-form'
import { useLowCodeHost } from '@enlearn/lowcode-framework/core/host'
import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode'
import {
	DefaultColorStyle,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	type Editor,
	type SharedStyle,
} from '@tldraw/editor'
import type {
	TLDefaultColorStyle,
	TLDefaultDashStyle,
	TLDefaultFillStyle,
	TLDefaultSizeStyle,
} from '@tldraw/tlschema'
import { computed, onMounted, ref, watch } from 'vue'
import { StylePanelController, type VueStylePanelSnapshot } from '@/editor/interactions/StylePanelController'
import {
	VUE_COLOR_ITEMS,
	VUE_DASH_ITEMS,
	VUE_FILL_ITEMS,
	VUE_SIZE_ITEMS,
} from '@/editor/vueStyleDefs'
import { useEditorValue } from '@/vue/useEditorValue'

type StyleFormModel = Record<string, unknown>
type FormDefinitionRow = { code?: unknown; schema?: unknown }

const STYLE_FORM_CODE = 'print-designer.style'
const props = defineProps<{ editor: Editor }>()
const host = useLowCodeHost()
const controller = new StylePanelController(props.editor)
const schema = ref<LowCodeFormSchema | null>(null)
const loading = ref(true)
const error = ref('')
const formModel = ref<StyleFormModel>({})
let syncingFromEditor = false
let lastModel: StyleFormModel = {}

const snapshot = useEditorValue<VueStylePanelSnapshot>('lowcode style panel snapshot', () => controller.getSnapshot())
const formKey = computed(() => {
	const selection = props.editor.getSelectedShapeIds()
	return selection.length ? selection.join(':') : 'canvas'
})

const fallbackSchema: LowCodeFormSchema = {
	title: '样式配置',
	columns: 1,
	fields: [
		{
			field: 'color', label: '颜色', component: 'vxe-select',
			options: VUE_COLOR_ITEMS.map((value) => ({ label: {
				black: '黑色', grey: '灰色', 'light-violet': '浅紫色', violet: '紫色', blue: '蓝色',
				'light-blue': '浅蓝色', yellow: '黄色', orange: '橙色', green: '绿色',
				'light-green': '浅绿色', 'light-red': '浅红色', red: '红色',
			}[value], value })),
		},
		{
			field: 'fill', label: '填充', component: 'vxe-select',
			options: VUE_FILL_ITEMS.map((value) => ({ label: {
				none: '无填充', semi: '半透明', solid: '实心', pattern: '图案',
			}[value], value })),
		},
		{
			field: 'dash', label: '线条', component: 'vxe-select',
			options: VUE_DASH_ITEMS.map((value) => ({ label: {
				draw: '手绘', dashed: '虚线', dotted: '点线', solid: '实线',
			}[value], value })),
		},
		{
			field: 'size', label: '大小', component: 'vxe-select',
			options: VUE_SIZE_ITEMS.map((value) => ({ label: {
				s: '小', m: '中', l: '大', xl: '超大',
			}[value], value })),
		},
		{
			field: 'opacity', label: '透明度', component: 'vxe-select',
			options: [
				{ label: '10%', value: 0.1 },
				{ label: '25%', value: 0.25 },
				{ label: '50%', value: 0.5 },
				{ label: '75%', value: 0.75 },
				{ label: '100%', value: 1 },
			],
		},
	],
	actions: [],
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSchema(value: unknown): value is LowCodeFormSchema {
	return isRecord(value)
		&& Array.isArray(value.fields)
		&& Array.isArray(value.actions)
		&& value.fields.every((field) => isRecord(field)
			&& typeof field.field === 'string'
			&& typeof field.label === 'string'
			&& typeof field.component === 'string')
}

function sharedValue<T>(value: SharedStyle<T> | undefined): T | '' {
	return value?.type === 'shared' ? value.value : ''
}

function snapshotToModel(value: VueStylePanelSnapshot): StyleFormModel {
	return {
		color: sharedValue(value.color),
		fill: sharedValue(value.fill),
		dash: sharedValue(value.dash),
		size: sharedValue(value.size),
		opacity: value.opacity.type === 'shared' ? value.opacity.value : '',
	}
}

function cloneModel(value: StyleFormModel): StyleFormModel {
	return { ...value }
}

function validString<T extends string>(value: unknown, values: readonly T[]): value is T {
	return typeof value === 'string' && values.includes(value as T)
}

function applyModel(value: StyleFormModel) {
	if (props.editor.getIsReadonly()) return
	const previous = lastModel
	const changes: Array<() => void> = []
	if (value.color !== previous.color && validString(value.color, VUE_COLOR_ITEMS)) {
		changes.push(() => controller.onValueChange(DefaultColorStyle, value.color as TLDefaultColorStyle))
	}
	if (value.fill !== previous.fill && validString(value.fill, VUE_FILL_ITEMS)) {
		changes.push(() => controller.onValueChange(DefaultFillStyle, value.fill as TLDefaultFillStyle))
	}
	if (value.dash !== previous.dash && validString(value.dash, VUE_DASH_ITEMS)) {
		changes.push(() => controller.onValueChange(DefaultDashStyle, value.dash as TLDefaultDashStyle))
	}
	if (value.size !== previous.size && validString(value.size, VUE_SIZE_ITEMS)) {
		changes.push(() => controller.onValueChange(DefaultSizeStyle, value.size as TLDefaultSizeStyle))
	}
	if (value.opacity !== previous.opacity) {
		const opacity = Number(value.opacity)
		if (Number.isFinite(opacity) && opacity >= 0 && opacity <= 1) {
			changes.push(() => controller.onOpacityChange(opacity))
		}
	}
	if (!changes.length) return
	controller.onHistoryMark('style form change')
	changes.forEach((change) => change())
}

function handleModelUpdate(value: StyleFormModel) {
	if (syncingFromEditor) return
	formModel.value = value
	applyModel(value)
	lastModel = cloneModel(value)
}

function syncFromEditor(value: VueStylePanelSnapshot) {
	const next = snapshotToModel(value)
	lastModel = cloneModel(next)
	syncingFromEditor = true
	formModel.value = next
	syncingFromEditor = false
}

async function loadDefinition() {
	loading.value = true
	error.value = ''
	try {
		const rows = await host.getServiceApi().invoke<FormDefinitionRow[]>('lowcode', 'listItems', {
			resource: 'lowcode_form_definitions',
			filters: { code: STYLE_FORM_CODE, enabled: true },
			limit: 1,
		})
		const stored = Array.isArray(rows) ? rows.find((row) => row.code === STYLE_FORM_CODE) : undefined
		schema.value = isSchema(stored?.schema) ? structuredClone(stored.schema) : structuredClone(fallbackSchema)
	} catch (cause) {
		schema.value = structuredClone(fallbackSchema)
		error.value = cause instanceof Error ? cause.message : '样式表单加载失败，已使用默认配置。'
	} finally {
		loading.value = false
	}
}

onMounted(() => {
	syncFromEditor(snapshot.value)
	void loadDefinition()
})

watch(snapshot, (value) => syncFromEditor(value), { deep: true })
</script>

<template>
	<section
		class="lowcode-style-panel"
		aria-label="低代码样式表单"
		@pointerdown.stop
		@pointermove.stop
		@keydown.stop
		@keyup.stop
		@keypress.stop
		@wheel.stop
		@contextmenu.prevent.stop
	>
		<header class="lowcode-style-panel__header">
			<div class="lowcode-style-panel__title">样式配置</div>
			<div class="lowcode-style-panel__subtitle">{{ props.editor.getSelectedShapeIds().length ? '应用到当前选中节点' : '应用到后续绘制节点' }}</div>
		</header>
		<div v-if="loading" class="lowcode-style-panel__state" role="status">正在加载样式表单...</div>
		<div v-else-if="schema" :key="formKey">
			<LowCodeForm
				:model-value="formModel"
				:schema="schema"
				@update:model-value="handleModelUpdate"
			/>
		</div>
		<div v-if="error" class="lowcode-style-panel__state lowcode-style-panel__state--error" role="alert">
			{{ error }}
			<button type="button" @click="loadDefinition">重新加载</button>
		</div>
	</section>
</template>
