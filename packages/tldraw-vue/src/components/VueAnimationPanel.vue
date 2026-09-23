<script setup lang="ts">
import LowCodeForm from '@enlearn/lowcode-framework/components/low-code-form'
import { useLowCodeHost } from '@enlearn/lowcode-framework/core/host'
import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode'
import type { Editor, TLShape } from '@tldraw/editor'
import { computed, onMounted, ref } from 'vue'
import { normalizePresentationAnimation, type PresentationAnimationPreset, type PresentationAnimationStart } from '@/presentation'
import { useEditorValue } from '@/vue/useEditorValue'

const props = defineProps<{ editor: Editor }>()
const host = useLowCodeHost()
const formSchema = ref<LowCodeFormSchema | null>(null)
const formSchemaError = ref('')

const selectedShape = useEditorValue('presentation animation selected shape', () => {
	const ids = props.editor.getSelectedShapeIds()
	return ids.length === 1 ? props.editor.getShape(ids[0]) ?? null : null
})

const animation = computed(() => readAnimation(selectedShape.value))
const hasShape = computed(() => Boolean(selectedShape.value))
const formKey = computed(() => selectedShape.value?.id ?? 'empty')
const formModel = computed<Record<string, unknown>>(() => ({ ...animation.value }))

onMounted(async () => {
	try {
		const rows = await host.getServiceApi().invoke<Array<{ schema?: unknown }>>('lowcode', 'listItems', {
			resource: 'lowcode_form_definitions',
			filters: { code: 'presentation-animation', enabled: true },
			limit: 1,
		})
		const schema = Array.isArray(rows) ? rows[0]?.schema : undefined
		if (!isLowCodeFormSchema(schema)) throw new Error('动画表单 schema 不存在或格式无效')
		formSchema.value = schema
	} catch (error) {
		formSchemaError.value = error instanceof Error ? error.message : '动画表单加载失败'
	}
})

function isLowCodeFormSchema(value: unknown): value is LowCodeFormSchema {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false
	const schema = value as Partial<LowCodeFormSchema>
	return Array.isArray(schema.fields)
		&& schema.fields.every((field) => (
			field && typeof field.field === 'string'
			&& typeof field.label === 'string'
			&& typeof field.component === 'string'
		))
		&& Array.isArray(schema.actions)
}

function updateAnimation(patch: Partial<ReturnType<typeof normalizePresentationAnimation>>) {
	const shape = selectedShape.value
	if (!shape) return
	const next = normalizePresentationAnimation({ ...animation.value, ...patch })
	const meta = { ...(shape.meta as Record<string, unknown> | undefined) }
	if (next.preset === 'none') {
		delete meta.presentationAnimation
	} else {
		meta.presentationAnimation = next
	}
	props.editor.updateShape({ id: shape.id, type: shape.type, meta } as never)
}

function handleFormUpdate(value: Record<string, unknown>) {
	const preset = typeof value.preset === 'string'
		? value.preset as PresentationAnimationPreset
		: animation.value.preset
	const start = value.start === 'onClick' ? 'onClick' : animation.value.start
	const readNumber = (key: string, fallback: number) => {
		const number = Number(value[key])
		return Number.isFinite(number) ? number : fallback
	}
	updateAnimation({
		preset,
		start: start as PresentationAnimationStart,
		duration: readNumber('duration', animation.value.duration),
		delay: readNumber('delay', animation.value.delay),
		order: readNumber('order', animation.value.order),
	})
}

function readAnimation(shape: TLShape | null) {
	const value = (shape?.meta as { presentationAnimation?: Record<string, unknown> } | undefined)?.presentationAnimation
	return normalizePresentationAnimation({
		preset: typeof value?.preset === 'string' ? value.preset as PresentationAnimationPreset : 'none',
		duration: typeof value?.duration === 'number' ? value.duration : 500,
		delay: typeof value?.delay === 'number' ? value.delay : 0,
		easing: typeof value?.easing === 'string' ? value.easing : 'ease-out',
		start: value?.start === 'onClick' ? 'onClick' : 'auto',
		order: typeof value?.order === 'number' ? value.order : 1,
	})
}
</script>

<template>
	<section class="presentation-animation-panel" aria-label="进场动画">
		<div class="presentation-panel-heading">
			<div>
				<strong>进场动画</strong>
				<span v-if="hasShape">设置当前元素的播放效果</span>
				<span v-else>选中一个元素后设置动画</span>
			</div>
		</div>
		<div v-if="hasShape" class="presentation-animation-form">
			<LowCodeForm
				v-if="formSchema"
				:key="formKey"
				:schema="formSchema"
				:model-value="formModel"
				:readonly="props.editor.getIsReadonly()"
				vertical
				@update:model-value="handleFormUpdate"
			/>
			<p v-else-if="formSchemaError" class="presentation-animation-form__error">{{ formSchemaError }}</p>
			<p v-else class="presentation-animation-form__loading">正在加载动画表单...</p>
		</div>
	</section>
</template>
