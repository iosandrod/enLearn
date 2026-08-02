<script setup lang="ts">
import type { Editor } from '@tldraw/editor'
import { ref, shallowRef } from 'vue'
import LowCodeFormPanel from './components/LowCodeFormPanel.vue'
import TldrawVue, {
	defineVueEditorPlugin,
	historyValidationPlugin,
	materialExtension,
	qrExtension,
} from './index'

const editor = shallowRef<Editor | null>(null)
const tldrawRef = ref<InstanceType<typeof TldrawVue> | null>(null)
const workspaceRevision = ref(0)
const proFeaturePlugin = defineVueEditorPlugin({
	id: 'demo.pro',
	extensions: [qrExtension, materialExtension],
	commands: [
		{
			id: 'print.preview',
			label: '打印预览',
			run: () => true,
		},
		{
			id: 'print.print',
			label: '打印',
			run: () => true,
		},
	],
})
const plugins = [historyValidationPlugin, proFeaturePlugin]

function handleReady(nextEditor: Editor) {
	editor.value = nextEditor
}

function handleWorkspaceConfigChange() {
	workspaceRevision.value++
}
</script>

<template>
	<div class="project-shell">
		<TldrawVue
			ref="tldrawRef"
			:plugins="plugins"
			@ready="handleReady"
			@workspace-config-change="handleWorkspaceConfigChange"
		/>
		<LowCodeFormPanel
			v-if="editor"
			:editor="editor"
			:workspace-revision="workspaceRevision"
			:get-workspace-template-config="tldrawRef?.getWorkspaceTemplateConfig"
			:apply-workspace-template-config="tldrawRef?.applyWorkspaceTemplateConfig"
		/>
	</div>
</template>
