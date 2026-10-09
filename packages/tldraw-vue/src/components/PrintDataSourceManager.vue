<script setup lang="ts">
import { openGlobalDialog } from '@enlearn/lowcode-framework/runtime/global-dialog'
import LowCodeForm from '@enlearn/lowcode-framework/components/low-code-form'
import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode'
import { h, nextTick, onMounted, ref } from 'vue'
import { isLowCodeFormSchema } from '@/editor/dataSourceForm'

const DATA_SOURCE_FORM_CODE = 'print-designer.datasource-typeorm'
const DRIVER_PORTS: Record<string, number> = { mssql: 1433, mysql: 3306, pgsql: 5432 }

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
const opening = ref(false)

onMounted(() => { void loadSources() })

function createDraft(): PrintDataSource {
	return {
		type: 'typeorm',
		code: '',
		name: '',
		schema: connectionModel({}),
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

async function editSource(source?: PrintDataSource) {
	if (opening.value) return
	opening.value = true
	let formSchema: LowCodeFormSchema
	try {
		const rows = await props.serviceApi.invoke<Array<{ schema: unknown }>>('lowcode', 'listItems', {
			resource: 'lowcode_form_definitions', filters: { code: DATA_SOURCE_FORM_CODE, enabled: true }, limit: 1,
		})
		const schema = Array.isArray(rows) ? rows[0]?.schema : undefined
		if (!isLowCodeFormSchema(schema) || !schema.fields.some((field) => (
			field.field === 'schema' && field.component === 'lc-sub-form' && isLowCodeFormSchema(field.props?.schema)
		))) throw new Error('数据源连接子表单不存在、已停用或 schema 无效。')
		formSchema = structuredClone(schema)
	} catch (error) {
		message.value = error instanceof Error ? error.message : '数据源配置表单加载失败。'
		return
	} finally {
		opening.value = false
	}
	const original = source ? cloneSource(source) : createDraft()
	const model = {
		code: original.code,
		name: original.name,
		enabled: original.enabled,
		schema: connectionModel(original.schema),
	}
	let previousDriver = String(model.schema.driver)
	const form = ref<{ commitPendingValues(): void; validate(): Promise<boolean> } | null>(null)
	const testing = ref(false)
	const testResult = ref<{ ok: boolean; message: string; elapsedMs?: number } | null>(null)
	void openGlobalDialog<Record<string, unknown>>({
		title: source ? `编辑数据源 · ${source.name || source.code}` : '新建数据库数据源',
		width: 820,
		model,
		body: (context) => h('div', [
			h(LowCodeForm, {
				ref: form, schema: formSchema, modelValue: context.model, disabled: testing.value,
				'onUpdate:modelValue': (value: Record<string, unknown>) => {
					const config = isRecord(value.schema) ? { ...value.schema } : {}
					const driver = String(config.driver ?? 'pgsql')
					if (driver !== previousDriver && Number(config.port) === DRIVER_PORTS[previousDriver]) {
						config.port = DRIVER_PORTS[driver]
					}
					previousDriver = driver
					testResult.value = null
					context.setModel({ ...value, schema: config })
				},
			}),
			testResult.value ? h('p', {
				role: 'status', style: { color: testResult.value.ok ? '#15803d' : '#b91c1c', margin: '12px 0 0' },
			}, `${testResult.value.message}${testResult.value.ok ? `（${testResult.value.elapsedMs ?? 0}ms）` : ''}`) : null,
		]),
		actions: [
			{ code: 'cancel', label: '取消', role: 'cancel' },
			{
				code: 'test-connection', label: '测试数据源连接', role: 'custom', loading: testing,
				onClick: async ({ model: values }) => {
					form.value?.commitPendingValues()
					await nextTick()
					testing.value = true
					testResult.value = null
					try {
						testResult.value = await props.serviceApi.invoke('print', 'testDataSourceConnection', {
							schema: parseSchema(values.schema),
						})
					} catch (error) {
						testResult.value = { ok: false, message: error instanceof Error ? error.message : '连接测试失败。' }
					} finally {
						testing.value = false
					}
					return false as const
				},
			},
			{ code: 'confirm', label: '保存', role: 'confirm', status: 'primary' },
		],
		onConfirm: async ({ model: values }) => {
			form.value?.commitPendingValues()
			await nextTick()
			if (!form.value || !(await form.value.validate())) return false
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
	if (!isRecord(value)) throw new Error('请填写连接与查询配置。')
	const config = connectionModel(value)
	if (!Object.prototype.hasOwnProperty.call(DRIVER_PORTS, String(config.driver))) throw new Error('请选择 MSSQL、MySQL 或 PostgreSQL 驱动。')
	if (!String(config.host).trim() || !String(config.database).trim() || !String(config.username).trim()) {
		throw new Error('请填写主机、数据库名称和用户名。')
	}
	if (!Number.isInteger(Number(config.port)) || Number(config.port) < 1 || Number(config.port) > 65535) {
		throw new Error('数据库端口必须是 1 到 65535 的整数。')
	}
	if (typeof config.parameters === 'string') config.parameters = JSON.parse(config.parameters)
	if (!Array.isArray(config.parameters)) throw new Error('查询参数必须是数组。')
	return config
}

function connectionModel(value: Record<string, unknown>): Record<string, unknown> {
	const config = { ...value }
	const urlText = config.url || config.connectionString
	if (!config.host && typeof urlText === 'string' && urlText) {
		try {
			const url = new URL(urlText)
			Object.assign(config, {
				host: url.hostname.replace(/^\[|\]$/g, ''), port: url.port || undefined,
				driver: config.driver || config.type || url.protocol.replace(':', ''),
				database: decodeURIComponent(url.pathname.slice(1)), username: decodeURIComponent(url.username),
				password: decodeURIComponent(url.password),
				ssl: config.ssl ?? ['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode') ?? ''),
			})
		} catch { /* Keep invalid legacy URLs editable through the explicit connection fields. */ }
	}
	const aliases: Record<string, string> = { postgres: 'pgsql', postgresql: 'pgsql', mysql2: 'mysql', sqlserver: 'mssql' }
	const rawDriver = String(config.driver || config.type || 'pgsql').toLowerCase()
	const driver = aliases[rawDriver] ?? rawDriver
	return {
		...config, driver, port: config.port ?? DRIVER_PORTS[driver],
		host: config.host ?? '', database: config.database ?? config.databaseName ?? '',
		username: config.username ?? config.user ?? '', password: config.password ?? '',
		query: config.query ?? 'SELECT 1 AS connected', parameters: config.parameters ?? [],
		ssl: config.ssl === true, encrypt: config.encrypt !== false,
		trustServerCertificate: config.trustServerCertificate === true,
		instanceName: config.instanceName ?? '', applicationName: config.applicationName ?? 'EnLearn Print',
		timeoutMs: 2000,
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
				<span>MSSQL / MySQL / PostgreSQL 连接配置</span>
			</div>
			<button type="button" class="print-data-source-manager__new" :disabled="opening" @click="editSource()">
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
				<button type="button" class="print-data-source-manager__edit" :disabled="opening" @click="selectSource(source); editSource(source)">
					<i class="ri-edit-line" aria-hidden="true" /> 编辑
				</button>
			</div>
		</div>
	</section>
</template>
