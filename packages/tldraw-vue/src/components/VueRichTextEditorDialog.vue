<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { Editor, Toolbar } from '@wangeditor-next/editor-for-vue'
import type { IDomEditor, IEditorConfig, IToolbarConfig } from '@wangeditor-next/editor'
import '@wangeditor-next/editor/dist/css/style.css'

const props = withDefaults(defineProps<{ modelValue: boolean; content: string; title?: string }>(), {
	title: '编辑富文本',
})
const emit = defineEmits<{ 'update:modelValue': [boolean]; save: [string] }>()
const draft = ref(props.content)
const editor = shallowRef<IDomEditor>()
const toolbarConfig: Partial<IToolbarConfig> = {
	toolbarKeys: ['headerSelect', 'bold', 'italic', 'underline', 'color', 'bgColor', 'fontSize', 'bulletedList', 'numberedList', 'justifyLeft', 'justifyCenter', 'justifyRight', 'insertLink', 'undo', 'redo'],
}
const editorConfig: Partial<IEditorConfig> = {
	placeholder: '请输入富文本内容…',
	MENU_CONF: {},
}
const visible = computed(() => props.modelValue)
watch(() => props.content, (value) => {
	if (!visible.value) draft.value = value
})
function close() { emit('update:modelValue', false) }
function save() { emit('save', draft.value); close() }
function onCreated(instance: IDomEditor) { editor.value = instance }
function onChange(instance: IDomEditor) { draft.value = instance.getHtml() }
</script>

<template>
	<Teleport to="body">
		<div v-if="visible" class="rich-text-dialog" role="dialog" aria-modal="true" :aria-label="title">
			<button class="rich-text-dialog__backdrop" type="button" aria-label="关闭" @click="close" />
			<section class="rich-text-dialog__panel">
				<header><h2>{{ title }}</h2><button type="button" aria-label="关闭" @click="close">×</button></header>
				<Toolbar :editor="editor" :default-config="toolbarConfig" />
				<div class="rich-text-dialog__editor"><Editor v-model="draft" :default-config="editorConfig" @on-created="onCreated" @on-change="onChange" /></div>
				<footer><button type="button" @click="close">取消</button><button type="button" class="is-primary" @click="save">保存</button></footer>
			</section>
		</div>
	</Teleport>
</template>
