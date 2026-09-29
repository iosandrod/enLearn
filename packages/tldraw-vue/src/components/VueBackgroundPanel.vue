<script setup lang="ts">
import LowCodeForm from '@enlearn/lowcode-framework/components/low-code-form'
import { useLowCodeHost } from '@enlearn/lowcode-framework/core/host'
import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode'
import { onMounted, ref, watch } from 'vue'
import type { WorkspaceBackgroundConfig } from '@/editor/templateStore'

const BACKGROUND_FORM_CODE = 'print-designer.background'
const IMAGE_TYPES = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif']

const props = defineProps<{ background: WorkspaceBackgroundConfig }>()
const emit = defineEmits<{ 'update:background': [background: WorkspaceBackgroundConfig] }>()

const host = useLowCodeHost()
const schema = ref<LowCodeFormSchema | null>(null)
const model = ref<Record<string, unknown>>({})
const loading = ref(true)
const errorMessage = ref('')
const uploadError = ref('')
let previewRequest = 0
let hydratedFileId = ''

watch(
	() => props.background,
	(background) => {
		const fileId = getBackgroundFileId(background)
		model.value = {
			color: background.color,
			imageUrl: fileId || background.imageUrl || '',
			imageSize: background.imageSize,
			imagePosition: background.imagePosition,
		}
		if (fileId && fileId !== hydratedFileId) {
			hydratedFileId = fileId
			void hydrateBackgroundImage(fileId)
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
		schema.value = normalizeBackgroundSchema(structuredClone(row.schema))
	} catch (error) {
		schema.value = null
		errorMessage.value = error instanceof Error ? error.message : '背景表单加载失败，请稍后重试。'
	} finally {
		loading.value = false
	}
}

function handleModelUpdate(value: Record<string, unknown>) {
	const nextModel = { ...model.value, ...value }
	model.value = nextModel
	const imageSize = nextModel.imageSize
	const hasImageValue = Object.prototype.hasOwnProperty.call(value, 'imageUrl')
	const imageValue = hasImageValue ? readImageValue(nextModel.imageUrl) : null
	const imageFileId = imageValue && isFileObjectId(imageValue) ? imageValue : undefined
	if (hasImageValue && !imageFileId && !imageValue) {
		clearBackgroundImage()
		return
	}
	const imageUrl = !hasImageValue
		? props.background.imageUrl ?? ''
		: imageFileId
			? imageFileId === props.background.imageFileId ? props.background.imageUrl ?? '' : ''
			: imageValue ?? ''

	emit('update:background', {
		...props.background,
		color: typeof nextModel.color === 'string' ? nextModel.color : props.background.color,
		imageFileId: imageFileId ?? '',
		imageUrl,
		imageSize: imageSize === 'cover' || imageSize === 'contain' || imageSize === 'auto' ? imageSize : props.background.imageSize,
		imagePosition: typeof nextModel.imagePosition === 'string' ? nextModel.imagePosition : props.background.imagePosition,
	})

	if (imageFileId && imageFileId !== hydratedFileId) {
		hydratedFileId = imageFileId
		void hydrateBackgroundImage(imageFileId)
	}
}

function clearBackgroundImage() {
	previewRequest += 1
	hydratedFileId = ''
	uploadError.value = ''
	model.value = {
		...model.value,
		imageUrl: '',
	}
	emit('update:background', {
		...props.background,
		imageFileId: '',
		imageUrl: '',
	})
}

async function hydrateBackgroundImage(fileId: string) {
	const request = ++previewRequest
	uploadError.value = ''
	try {
		const result = await host.getServiceApi().invoke<{
			download?: { signedUrl?: unknown }
		}>('files', 'runAction', {
			resource: 'file_objects',
			operation: 'getDownloadUrl',
			fileId,
			expiresInSeconds: 86400,
		})
		if (request !== previewRequest) return
		const signedUrl = typeof result?.download?.signedUrl === 'string'
			? result.download.signedUrl
			: ''
		if (!signedUrl) throw new Error('未获取到背景图预览地址。')
		emit('update:background', {
			...props.background,
			imageFileId: fileId,
			imageUrl: signedUrl,
		})
	} catch (error) {
		if (request !== previewRequest) return
		uploadError.value = error instanceof Error ? error.message : '背景图预览加载失败。'
	}
}

function getBackgroundFileId(background: WorkspaceBackgroundConfig) {
	const explicit = String(background.imageFileId ?? '').trim()
	if (isFileObjectId(explicit)) return explicit
	const legacy = String(background.imageUrl ?? '').trim()
	return isFileObjectId(legacy) ? legacy : ''
}

function readImageValue(value: unknown) {
	const candidate = Array.isArray(value) ? value[0] : value
	if (isRecord(candidate)) return String(candidate.fileId ?? candidate.id ?? candidate.url ?? '').trim()
	return typeof candidate === 'string' ? candidate.trim() : ''
}

function isFileObjectId(value: string) {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function normalizeBackgroundSchema(value: LowCodeFormSchema): LowCodeFormSchema {
	return {
		...value,
		fields: value.fields.map((field) => {
			if (field.field !== 'imageUrl' || field.component !== 'vxe-upload') return field
			return {
				...field,
				props: {
					...(field.props ?? {}),
					mode: 'image',
					imageTypes: [...IMAGE_TYPES],
					fileTypes: [...IMAGE_TYPES],
					multiple: false,
					limitCount: 1,
					showList: true,
					showPreview: true,
					previewType: 'image',
					previewExpiresInSeconds: 86400,
					buttonText: '选择图片',
					buttonIcon: 'ri-image-add-line',
				},
			}
		}),
	}
}

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
			<p v-if="uploadError" class="background-panel__error">{{ uploadError }}</p>
		</template>
	</section>
</template>
