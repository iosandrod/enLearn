<script setup lang="ts">
import LowCodeForm from '@enlearn/lowcode-framework/components/low-code-form'
import type { LowCodeFormSchema, LowCodeOption } from '@enlearn/lowcode-framework/types/lowcode'
import MonacoEditor from '@enlearn/lowcode-framework/visual-editor/components/common/monaco-editor/MonacoEditor'
import { computed, h, onMounted, ref } from 'vue'
import { openGlobalDialog } from '@enlearn/lowcode-framework/runtime/global-dialog'
import { isLowCodeFormSchema } from '@/editor/dataSourceForm'
import PrintDataSourceManager from './PrintDataSourceManager.vue'

const SCRIPT_META_FORM_CODE = 'print-designer.datasource-script-meta'

type ServiceApi = {
	invoke<TResponse = unknown>(serviceName: string, serviceMethod: string, postData?: Record<string, unknown>): Promise<TResponse>
}

type RemoteDataSource = {
	id?: string
	type: 'script'
	code: string
	name: string
	datasource_code?: string | null
	script: string
	schema: Record<string, unknown>
	enabled: boolean
	version: number
	updated_at?: string
}

const props = defineProps<{
	serviceApi: ServiceApi
}>()

const sources = ref<RemoteDataSource[]>([])
const typeormOptions = ref<LowCodeOption[]>([])
const optionSources = computed(() => ({ typeormDataSources: typeormOptions.value }))
const selectedId = ref('')
const editorKey = ref(0)
const draft = ref<RemoteDataSource>(createDraft())
const loading = ref(true)
const saving = ref(false)
const message = ref('')
const metaSchema = ref<LowCodeFormSchema | null>(null)
const metaSchemaLoading = ref(true)
const metaSchemaError = ref('')
const metaForm = ref<{ commitPendingValues(): void; validate(): Promise<boolean> } | null>(null)
const metaModel = computed<Record<string, unknown>>(() => ({
	code: draft.value.code,
	name: draft.value.name,
	datasource_code: draft.value.datasource_code ?? null,
	enabled: draft.value.enabled,
}))

const editorOptions = computed(() => ({
	language: 'javascript',
	theme: 'vs-dark',
	automaticLayout: true,
	fontSize: 13,
	minimap: { enabled: false },
	formatOnPaste: true,
	wordWrap: 'on' as const,
}))

onMounted(() => {
	void loadSources()
	void loadMetaSchema()
})

async function loadMetaSchema() {
	metaSchemaLoading.value = true
	metaSchemaError.value = ''
	metaSchema.value = null
	try {
		const rows = await props.serviceApi.invoke<Array<{ code: string; schema: unknown }>>('lowcode', 'listItems', {
			resource: 'lowcode_form_definitions',
			filters: { code: SCRIPT_META_FORM_CODE, enabled: true },
			limit: 1,
		})
		const definition = Array.isArray(rows) ? rows[0] : undefined
		const schema = definition?.schema
		if (definition?.code !== SCRIPT_META_FORM_CODE || !isLowCodeFormSchema(schema)
			|| !['code', 'name', 'enabled', 'datasource_code'].every((key) => schema.fields.some((field) => field.field === key))) {
			throw new Error('打印脚本基本信息表单不存在、已停用或 schema 无效。')
		}
		metaSchema.value = structuredClone(schema)
	} catch (error) {
		metaSchemaError.value = error instanceof Error ? error.message : '打印脚本基本信息表单加载失败。'
	} finally {
		metaSchemaLoading.value = false
	}
}

function updateMetaModel(value: Record<string, unknown>) {
	draft.value = {
		...draft.value,
		code: typeof value.code === 'string' ? value.code : draft.value.code,
		name: typeof value.name === 'string' ? value.name : draft.value.name,
		datasource_code: Object.prototype.hasOwnProperty.call(value, 'datasource_code')
			? (typeof value.datasource_code === 'string' ? value.datasource_code.trim() || null : null)
			: draft.value.datasource_code ?? null,
		enabled: typeof value.enabled === 'boolean' ? value.enabled : draft.value.enabled,
	}
}

function createDraft(): RemoteDataSource {
	return {
		type: 'script',
		code: '',
		name: '',
		datasource_code: null,
		script: `async function main(context) {
  // 关联数据库后：return await context.datasource.query('SELECT 1 AS value', []);
  return [];
}`,
		schema: {},
		enabled: true,
		version: 1,
	}
}

function cloneSource(source: RemoteDataSource) {
	return {
		...source,
		schema: cloneJsonObject(source.schema),
	}
}

function cloneJsonObject(value: unknown): Record<string, unknown> {
	if (!isRecord(value)) return {}
	try {
		return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
	} catch {
		return {}
	}
}

async function loadSources() {
	loading.value = true
	message.value = ''
	try {
		const rows = await props.serviceApi.invoke<unknown[]>('print', 'listManagedDataSources')
		updateTypeormOptions(rows)
		sources.value = Array.isArray(rows)
			? rows.filter((row): row is RemoteDataSource => isRemoteDataSource(row) && row.type === 'script')
			: []
		if (sources.value.length) selectSource(sources.value[0])
		else {
			selectedId.value = ''
			draft.value = createDraft()
			editorKey.value += 1
		}
	} catch (error) {
		message.value = error instanceof Error ? error.message : '远程数据源加载失败。'
	} finally {
		loading.value = false
	}
}

function updateTypeormOptions(rows: unknown) {
	typeormOptions.value = Array.isArray(rows) ? rows.filter((row) => (
		isRecord(row) && row.type === 'typeorm' && typeof row.code === 'string'
	)).map((row) => ({
		value: String(row.code),
		label: row.name ? `${row.name}（${row.code}）` : String(row.code),
	})) : []
}

async function refreshTypeormOptions() {
	try {
		const rows = await props.serviceApi.invoke<unknown[]>('print', 'listManagedDataSources')
		updateTypeormOptions(rows)
	} catch (error) {
		message.value = error instanceof Error ? error.message : '关联数据源加载失败。'
	}
}

function selectSource(source: RemoteDataSource) {
		selectedId.value = source.id ?? source.code
		draft.value = cloneSource(source)
		editorKey.value += 1
}

function createSource() {
	selectedId.value = ''
	draft.value = createDraft()
	editorKey.value += 1
	message.value = '已创建未保存的脚本草稿。'
}

function updateScript(value: string) {
	draft.value = { ...draft.value, script: value }
}

function openConfig() {
	void openGlobalDialog({
		title: '数据源管理',
		width: 980,
		height: 680,
		showFooter: false,
		className: 'print-data-source-dialog',
		body: () => h(PrintDataSourceManager, { serviceApi: props.serviceApi }),
	}).then(() => refreshTypeormOptions())
}

async function saveSource() {
	if (saving.value || loading.value || metaSchemaLoading.value || !metaSchema.value) return
	metaForm.value?.commitPendingValues()
	if (!metaForm.value || !(await metaForm.value.validate())) return
	if (!draft.value.code.trim()) {
		message.value = '请先配置脚本编码。'
		return
	}
	if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(draft.value.code.trim())) {
		message.value = '脚本编码只能包含字母、数字、点、下划线、冒号和短横线。'
		return
	}
	if (!draft.value.script.trim()) {
		message.value = '脚本数据源不能为空。'
		return
	}
	saving.value = true
	message.value = ''
	try {
		const saved = await props.serviceApi.invoke<unknown>('print', 'saveDataSource', {
			id: draft.value.id,
			type: 'script',
			code: draft.value.code.trim(),
			name: draft.value.name.trim() || draft.value.code.trim(),
			datasource_code: draft.value.datasource_code?.trim() || null,
			script: draft.value.script,
			schema: draft.value.schema,
			enabled: draft.value.enabled,
			version: draft.value.version,
		})
		if (!isRemoteDataSource(saved)) throw new Error('保存结果无效。')
		const index = sources.value.findIndex((source) => source.id === saved.id)
		if (index >= 0) sources.value[index] = saved
		else sources.value.push(saved)
		selectSource(saved)
		message.value = '脚本已保存。'
	} catch (error) {
		message.value = error instanceof Error ? error.message : '脚本保存失败。'
	} finally {
		saving.value = false
	}
}

async function deleteSource() {
	if (!draft.value.id) {
		createSource()
		return
	}
	if (!window.confirm(`确定删除脚本“${draft.value.name || draft.value.code}”吗？`)) return
	try {
		await props.serviceApi.invoke('print', 'deleteDataSource', { id: draft.value.id, type: draft.value.type })
		sources.value = sources.value.filter((source) => source.id !== draft.value.id)
		if (sources.value.length) selectSource(sources.value[0])
		else createSource()
		message.value = '脚本已删除。'
	} catch (error) {
		message.value = error instanceof Error ? error.message : '脚本删除失败。'
	}
}

function isRemoteDataSource(value: unknown): value is RemoteDataSource {
	return isRecord(value) && typeof value.code === 'string' && value.type === 'script'
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
</script>

<template>
	<section class="print-remote-data-source-manager" aria-label="打印脚本管理">
		<aside class="print-remote-data-source-manager__sidebar">
			<div class="print-remote-data-source-manager__sidebar-header">
				<div>
					<strong>打印脚本</strong>
					<span>{{ sources.length }} 个脚本</span>
				</div>
				<button type="button" class="print-remote-data-source-manager__icon-button" title="新建脚本" @click="createSource">
					<i class="ri-add-line" aria-hidden="true" />
				</button>
			</div>
			<div v-if="loading" class="print-remote-data-source-manager__state">正在加载...</div>
			<div v-else-if="!sources.length" class="print-remote-data-source-manager__state">暂无脚本</div>
			<div v-else class="print-remote-data-source-manager__list">
				<button v-for="source in sources" :key="source.id || source.code" type="button"
					:class="['print-remote-data-source-manager__item', { 'is-active': (source.id || source.code) === selectedId }]"
					@click="selectSource(source)">
					<span class="print-remote-data-source-manager__item-icon"><i :class="source.type === 'script' ? 'ri-javascript-line' : 'ri-database-2-line'" aria-hidden="true" /></span>
					<span class="print-remote-data-source-manager__item-copy">
						<strong>{{ source.name || source.code }}</strong>
						<small>{{ source.code }}</small>
					</span>
					<span v-if="!source.enabled" class="print-remote-data-source-manager__item-status">停用</span>
				</button>
			</div>
		</aside>
		<main class="print-remote-data-source-manager__main">
			<header class="print-remote-data-source-manager__toolbar">
				<div>
					<strong>{{ draft.name || '未命名脚本' }}</strong>
					<span>Script 数据源脚本</span>
				</div>
				<div class="print-remote-data-source-manager__actions">
					<button type="button" class="print-remote-data-source-manager__button" title="打开数据源管理" @click="openConfig">
						<i class="ri-settings-3-line" aria-hidden="true" />
						<span>管理数据源</span>
					</button>
					<button type="button" class="print-remote-data-source-manager__button print-remote-data-source-manager__button--danger" title="删除脚本" @click="deleteSource">
						<i class="ri-delete-bin-line" aria-hidden="true" />
						<span>删除</span>
					</button>
					<button type="button" class="print-remote-data-source-manager__button print-remote-data-source-manager__button--primary" :disabled="saving || loading || metaSchemaLoading || !metaSchema" title="保存脚本" @click="saveSource">
						<i class="ri-save-line" aria-hidden="true" />
						<span>{{ saving ? '保存中...' : '保存' }}</span>
					</button>
				</div>
			</header>
			<div class="print-remote-data-source-manager__meta">
				<div v-if="metaSchemaLoading" class="print-remote-data-source-manager__state" role="status">正在加载脚本表单...</div>
				<div v-else-if="metaSchemaError" class="print-remote-data-source-manager__state" role="alert">
					<p>{{ metaSchemaError }}</p>
					<button type="button" class="print-remote-data-source-manager__button" @click="loadMetaSchema">重新加载</button>
				</div>
				<LowCodeForm v-else-if="metaSchema" ref="metaForm" :key="editorKey" :schema="metaSchema"
					:model-value="metaModel" :option-sources="optionSources" :disabled="loading || saving" vertical
					@update:model-value="updateMetaModel" />
			</div>
			<div v-if="message" class="print-remote-data-source-manager__message" role="status">{{ message }}</div>
			<div class="print-remote-data-source-manager__editor-shell">
				<div class="print-remote-data-source-manager__editor">
					<MonacoEditor :key="editorKey" :code="draft.script" :vid="draft.id || draft.code" :layout="{ width: 0, height: 0 }"
						:options="editorOptions" :on-change="updateScript" />
				</div>
			</div>
		</main>
	</section>
</template>
