<script setup lang="ts">
import { openGlobalDialog } from '@enlearn/lowcode-framework/runtime/global-dialog'
import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode'
import { onMounted, ref } from 'vue'

type ServiceApi = {
	invoke<TResponse = unknown>(serviceName: string, serviceMethod: string, postData?: Record<string, unknown>): Promise<TResponse>
}

type PrintDataSource = {
	id?: string
	type: 'typeorm'
	code: string
	name: string
	schema: Record<string, unknown>
	enabled: boolean
	version: number
	updated_at?: string
}

const props = defineProps<{ serviceApi: ServiceApi }>()
const sources = ref<PrintDataSource[]>([])
const selectedId = ref('')
const loading = ref(true)
const message = ref('')

onMounted(() => { void loadSources() })

function createDraft(): PrintDataSource {
	return {
		type: 'typeorm',
		code: '',
		name: '',
		schema: { driver: 'postgres', host: '', port: 5432, database: '', username: '', password: '', query: 'select * from your_table limit 100' },
		enabled: true,
		version: 1,
	}
}

async function loadSources() {
	loading.value = true
	try {
		const rows = await props.serviceApi.invoke<unknown[]>('print', 'listManagedDataSources')
		sources.value = Array.isArray(rows) ? rows.filter(isPrintDataSource) : []
		if (!sources.value.length) selectedId.value = ''
		else if (!sources.value.some((source) => (source.id ?? source.code) === selectedId.value)) selectedId.value = sources.value[0].id ?? sources.value[0].code
	} catch (error) {
		message.value = error instanceof Error ? error.message : '数据源加载失败。'
	} finally {
		loading.value = false
	}
}

function selectSource(source: PrintDataSource) {
	selectedId.value = source.id ?? source.code
	}

function editSource(source?: PrintDataSource) {
	const original = source ? cloneSource(source) : createDraft()
	const model = {
		code: original.code,
		name: original.name,
		enabled: original.enabled,
		schema: JSON.stringify(original.schema, null, 2),
	}
	void openGlobalDialog<Record<string, unknown>>({
		title: source ? `编辑数据源 · ${source.name || source.code}` : '新建 TypeORM 数据源',
		width: 720,
		model,
		form: { schema: dataSourceSchema(), model },
		actions: [
			{ code: 'cancel', label: '取消', role: 'cancel' },
			{ code: 'confirm', label: '保存', role: 'confirm', status: 'primary' },
		],
		onConfirm: async ({ model: values }) => {
			const code = String(values.code ?? '').trim()
			if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(code)) {
				throw new Error('数据源编码只能包含字母、数字、点、下划线、冒号和短横线。')
			}
			const schema = parseSchema(values.schema)
			const saved = await props.serviceApi.invoke<unknown>('print', 'saveDataSource', {
				id: original.id,
				type: 'typeorm',
				code,
				name: String(values.name ?? '').trim() || code,
				enabled: values.enabled !== false,
				schema,
				version: original.version,
			})
			if (!isPrintDataSource(saved)) throw new Error('保存结果无效。')
			await loadSources()
			selectSource(saved)
			message.value = '数据源已保存。'
		},
	})
}

function parseSchema(value: unknown) {
	try {
		const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : value
		if (!isRecord(parsed)) throw new Error('schema 必须是 JSON 对象。')
		return parsed
	} catch (error) {
		throw new Error(error instanceof Error ? error.message : 'schema JSON 格式不正确。')
	}
}

function dataSourceSchema(): LowCodeFormSchema {
	return {
		title: 'TypeORM 数据源配置',
		columns: 1,
		fields: [
			{ field: 'code', label: '数据源编码', component: 'vxe-input', props: { placeholder: '例如 sales.orders' } },
			{ field: 'name', label: '数据源名称', component: 'vxe-input', props: { placeholder: '例如 销售订单数据库' } },
			{ field: 'enabled', label: '启用', component: 'vxe-switch' },
			{ field: 'schema', label: '连接与查询配置', component: 'lc-json-editor', props: { jsonValueMode: 'string', jsonRootType: 'object' } },
		],
		actions: [],
	}
}

function cloneSource(source: PrintDataSource) {
	return { ...source, schema: cloneJsonObject(source.schema) }
}

function cloneJsonObject(value: unknown): Record<string, unknown> {
	if (!isRecord(value)) return {}
	try {
		return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
	} catch {
		return {}
	}
}

function isPrintDataSource(value: unknown): value is PrintDataSource {
	return isRecord(value) && value.type === 'typeorm' && typeof value.code === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
</script>

<template>
	<section class="print-data-source-manager" aria-label="打印数据源管理">
		<header class="print-data-source-manager__header">
			<div>
				<strong>数据源管理</strong>
				<span>TypeORM / PostgreSQL 连接配置</span>
			</div>
			<button type="button" class="print-data-source-manager__new" @click="editSource()">
				<i class="ri-add-line" aria-hidden="true" /> 新建数据源
			</button>
		</header>
		<div v-if="message" class="print-data-source-manager__message" role="status">{{ message }}</div>
		<div v-if="loading" class="print-data-source-manager__state">正在加载...</div>
		<div v-else-if="!sources.length" class="print-data-source-manager__state">
			暂无数据源，点击右上角“新建数据源”开始配置。
		</div>
		<div v-else class="print-data-source-manager__list">
			<div v-for="source in sources" :key="source.id || source.code"
				:class="['print-data-source-manager__row', { 'is-active': (source.id || source.code) === selectedId }]">
				<div class="print-data-source-manager__row-icon"><i class="ri-database-2-line" aria-hidden="true" /></div>
				<div class="print-data-source-manager__row-copy">
					<strong>{{ source.name || source.code }}</strong>
					<small>{{ source.code }} · {{ source.enabled ? '已启用' : '已停用' }}</small>
				</div>
				<button type="button" class="print-data-source-manager__edit" @click="selectSource(source); editSource(source)">
					<i class="ri-edit-line" aria-hidden="true" /> 编辑
				</button>
			</div>
		</div>
	</section>
</template>
