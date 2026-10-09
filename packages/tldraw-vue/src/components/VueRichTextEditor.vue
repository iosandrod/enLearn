<script setup lang="ts">
import { onBeforeUnmount, shallowRef } from 'vue'
import { Editor, Toolbar } from '@wangeditor-next/editor-for-vue'
import type { IDomEditor, IEditorConfig, IToolbarConfig } from '@wangeditor-next/editor'
import '@wangeditor-next/editor/dist/css/style.css'

defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const editor = shallowRef<IDomEditor>()
const toolbarConfig: Partial<IToolbarConfig> = {
	toolbarKeys: ['headerSelect', 'bold', 'italic', 'underline', 'color', 'bgColor', 'fontSize', 'bulletedList', 'numberedList', 'justifyLeft', 'justifyCenter', 'justifyRight', 'insertLink', 'undo', 'redo'],
}
const editorConfig: Partial<IEditorConfig> = {
	placeholder: '请输入富文本内容…',
	MENU_CONF: {},
}
function onCreated(instance: IDomEditor) {
	editor.value = instance
}

function onChange(instance: IDomEditor) {
	emit('update:modelValue', instance.getHtml())
}

onBeforeUnmount(() => {
	editor.value?.destroy()
	editor.value = undefined
})
</script>

<template>
	<div
		class="rich-text-editor"
		@pointerdown.stop
		@pointermove.stop
		@keydown.stop
		@keyup.stop
		@wheel.stop
	>
		<Toolbar :editor="editor" :default-config="toolbarConfig" />
		<div class="rich-text-editor__content">
			<Editor
				:model-value="modelValue"
				:default-config="editorConfig"
				@on-created="onCreated"
				@on-change="onChange"
			/>
		</div>
	</div>
</template>
