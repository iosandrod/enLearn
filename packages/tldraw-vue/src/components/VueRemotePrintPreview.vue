<script setup lang="ts">
import type { Editor } from '@tldraw/editor'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useLowCodeHost } from '@enlearn/lowcode-framework/core/host'
import { getEditorPrintDataSource } from '@/editor/workspaceDataSource'
import type { VueTemplateWorkspaceConfig } from '@/editor/templateStore'
import { createLocalPrintJobConfig } from '@/print/localConfig'
import { createPrintExpressionConfig, ensurePrintExpressionsLoaded } from '@/print/expressions'
import { createRemotePreviewRequests, requestRemotePreview } from '@/print/remotePreview'

const props = defineProps<{
	editor: Editor
	getWorkspaceTemplateConfig?: () => VueTemplateWorkspaceConfig
}>()
const emit = defineEmits<{
	'loading-change': [loading: boolean]
}>()
const host = useLowCodeHost()
const visible = ref(false)
const loading = ref(false)
const error = ref('')
const urls = ref<string[]>([])
const index = ref(0)
const completed = ref(0)
const total = ref(0)
const currentUrl = computed(() => urls.value[index.value])
let controller: AbortController | undefined

function release() {
	controller?.abort()
	for (const url of urls.value) URL.revokeObjectURL(url)
	urls.value = []
}

function close() {
	visible.value = false
	release()
}

async function open() {
	if (loading.value) return
	release()
	const active = new AbortController()
	controller = active
	visible.value = true
	loading.value = true
	emit('loading-change', true)
	error.value = ''
	index.value = 0
	completed.value = 0
	total.value = 0
	try {
		const expressions = await ensurePrintExpressionsLoaded(host.getServiceApi(), { refresh: true })
		active.signal.throwIfAborted()
		const config = createLocalPrintJobConfig(props.editor, props.getWorkspaceTemplateConfig?.(),
			getEditorPrintDataSource(props.editor).value, createPrintExpressionConfig(expressions))
		const requests = await createRemotePreviewRequests(props.editor, config, active.signal)
		active.signal.throwIfAborted()
		total.value = requests.length
		urls.value = Array(requests.length).fill('')
		let next = 0
		// Keep editor snapshotting sequential, then feed independent jobs to the server pool.
		await Promise.all(Array.from({ length: Math.min(4, requests.length) }, async () => {
			while (next < requests.length) {
				const position = next++
				const blob = await requestRemotePreview(requests[position], active.signal)
				active.signal.throwIfAborted()
				urls.value[position] = URL.createObjectURL(blob)
				completed.value++
			}
		}))
	} catch (cause) {
		if (!active.signal.aborted) {
			error.value = cause instanceof Error ? cause.message : '远程预览失败'
			release()
		}
	} finally {
		// Keep other print actions blocked until an in-flight SVG export restores the editor.
		if (controller === active) {
			controller = undefined
			loading.value = false
			emit('loading-change', false)
		}
	}
}

onBeforeUnmount(release)
defineExpose({ open, loading })
</script>

<template>
	<Teleport to="body">
		<vxe-modal v-model="visible" class-name="remote-print-preview-modal" title="远程预览"
			width="min(1000px, calc(100vw - 24px))" height="min(800px, calc(100vh - 24px))"
			min-width="280px" min-height="240px" :show-footer="true" :show-close="true"
			:show-zoom="false" :mask-closable="true" @hide="close">
			<div class="remote-preview-body" @pointerdown.stop @wheel.stop>
				<p v-if="loading" role="status">{{ total ? `正在生成预览（${completed}/${total}）…` : '正在准备页面和数据…' }}</p>
				<div v-else-if="error" role="alert" class="remote-preview-error">
					<p>{{ error }}</p><button type="button" @click="open">重试</button>
				</div>
				<img v-else-if="currentUrl" :src="currentUrl" :alt="`远程预览第 ${index + 1} 页`" />
			</div>
			<template #footer>
				<div class="remote-preview-footer">
					<button type="button" :disabled="loading || index === 0 || !urls.length" @click="index--">上一页</button>
					<span>{{ urls.length ? index + 1 : 0 }} / {{ urls.length }} 页</span>
					<button type="button" :disabled="loading || index >= urls.length - 1" @click="index++">下一页</button>
					<a v-if="!loading && currentUrl" :href="currentUrl" :download="`打印预览-${index + 1}.png`">下载当前页</a>
					<button type="button" @click="close">关闭</button>
				</div>
			</template>
		</vxe-modal>
	</Teleport>
</template>

<style scoped>
.remote-preview-body { height: 100%; overflow: auto; padding: 16px; background: #f1f5f9; text-align: center; }
.remote-preview-body img { display: block; max-width: 100%; height: auto; margin: 0 auto; background: white; box-shadow: 0 2px 12px #0002; }
.remote-preview-error { color: #b91c1c; white-space: pre-wrap; }
.remote-preview-footer { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 12px; }
.remote-preview-footer button, .remote-preview-error button { padding: 6px 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: white; cursor: pointer; }
.remote-preview-footer button:disabled { cursor: default; opacity: .45; }
.remote-preview-footer a { color: #2563eb; }
</style>
