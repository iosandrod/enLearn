<script setup lang="ts">
import LowCodeForm from '@enlearn/lowcode-framework/components/low-code-form'
import { useLowCodeHost } from '@enlearn/lowcode-framework/core/host'
import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode'
import { onMounted, ref, watch } from 'vue'
import type { WorkspaceBackgroundConfig } from '@/editor/templateStore'

const BACKGROUND_FORM_CODE = 'print-designer.background'

const props = defineProps<{ background: WorkspaceBackgroundConfig }>()
const emit = defineEmits<{ 'update:background': [background: WorkspaceBackgroundConfig] }>()

const host = useLowCodeHost()
const fileInput = ref<HTMLInputElement | null>(null)
const schema = ref<LowCodeFormSchema | null>(null)
const model = ref<Record<string, unknown>>({})
const loading = ref(true)
const errorMessage = ref('')
const uploadError = ref('')

watch(
	() => props.background,
	(background) => {
		model.value = {
			color: background.color,
			imageUrl: background.imageUrl ?? '',
			imageSize: background.imageSize,
			imagePosition: background.imagePosition,
		}
	},
	{ immediate: true, deep: true },
)

onMounted(() => { void loadSchema() })

async function loadSchema() {
	loading.value = true
	errorMessage.value = ''
	try {
		const rows = await host.getServiceApi().invoke<Array<{ code?: unknown; schema?: unknown }>>(
			'lowcode', 'listItems', {
				resource: 'lowcode_form_definitions',
				filters: { code: BACKGROUND_FORM_CODE, enabled: true },
				limit: 1,
			},
		)
		const row = Array.isArray(rows) ? rows[0] : undefined
		if (row?.code !== BACKGROUND_FORM_CODE || !isLowCodeFormSchema(row.schema)) {
			throw new Error('未找到背景设置低代码表单 schema。')
		}
		schema.value = structuredClone(row.schema)
	} catch (error) {
		schema.value = null
		errorMessage.value = error instanceof Error ? error.message : '背景表单加载失败，请稍后重试。'
	} finally {
		loading.value = false
	}
}

function handleModelUpdate(value: Record<string, unknown>) {
	model.value = { ...model.value, ...value }
	const imageSize = value.imageSize
	emit('update:background', {
		...props.background,
		color: typeof value.color === 'string' ? value.color : props.background.color,
		imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : props.background.imageUrl ?? '',
		imageSize: imageSize === 'cover' || imageSize === 'contain' || imageSize === 'auto' ? imageSize : props.background.imageSize,
		imagePosition: typeof value.imagePosition === 'string' ? value.imagePosition : props.background.imagePosition,
	})
}

function openFilePicker() { uploadError.value = ''; fileInput.value?.click() }

function onFileChange(event: Event) {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	input.value = ''
	if (!file) return
	if (!file.type.startsWith('image/')) { uploadError.value = '请选择图片文件'; return }
	if (file.size > 8 * 1024 * 1024) { uploadError.value = '图片不能超过 8MB'; return }
	const reader = new FileReader()
	reader.onload = () => {
		if (typeof reader.result !== 'string') return
		uploadError.value = ''
		handleModelUpdate({ imageUrl: reader.result })
	}
	reader.onerror = () => { uploadError.value = '图片读取失败' }
	reader.readAsDataURL(file)
}

function clearImage() { uploadError.value = ''; handleModelUpdate({ imageUrl: '' }) }

function isLowCodeFormSchema(value: unknown): value is LowCodeFormSchema {
	if (!isRecord(value) || !Array.isArray(value.fields) || !Array.isArray(value.actions)) return false
	return value.fields.every((field) => isRecord(field) && typeof field.field === 'string' && typeof field.label === 'string' && typeof field.component === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
</script>

<template>
	<section
		class="background-panel"
		aria-label="背景设置"
		@pointerdown.stop
		@pointermove.stop
		@wheel.stop
		@contextmenu.prevent.stop
	>
		<header class="background-panel__header">
			<div>
				<strong>背景</strong>
				<span>应用于当前画布页面</span>
			</div>
			<span class="background-panel__preview" :style="{ backgroundColor: background.color }" aria-hidden="true" />
		</header>

		<div v-if="loading" class="background-panel__state" role="status">正在加载低代码表单...</div>
		<div v-else-if="errorMessage" class="background-panel__state background-panel__state--error" role="alert">
			<p>{{ errorMessage }}</p>
			<button type="button" @click="loadSchema">重新加载</button>
		</div>
		<template v-else-if="schema">
			<LowCodeForm
				:key="BACKGROUND_FORM_CODE"
				:model-value="model"
				:schema="schema"
				@update:model-value="handleModelUpdate"
			/>
			<div class="background-panel__actions">
				<button type="button" class="background-panel__button background-panel__button--primary" @click="openFilePicker">
					<i class="ri-image-add-line" aria-hidden="true" />
					上传图片
				</button>
				<button type="button" class="background-panel__button" :disabled="!background.imageUrl" @click="clearImage">
					<i class="ri-delete-bin-6-line" aria-hidden="true" />
					清除
				</button>
			</div>
			<input ref="fileInput" type="file" accept="image/*" hidden @change="onFileChange" />
			<p v-if="uploadError" class="background-panel__error">{{ uploadError }}</p>
			<div
				v-if="background.imageUrl"
				class="background-panel__image-preview"
				:style="{ backgroundImage: `url(${JSON.stringify(background.imageUrl)})` }"
				aria-label="背景图预览"
			/>
		</template>
	</section>
</template>
