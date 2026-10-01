import type { PrintDataSourceConfig } from '../print/types'

export interface MaterialDataSourceFieldOption {
	label: string
	value: string
}

type InlinePrintDataSource = Extract<PrintDataSourceConfig, { type: 'inline' }>

const NO_DATA_SOURCE_OPTION: MaterialDataSourceFieldOption = {
	label: '未设置数据源',
	value: '',
}

const NO_DETAIL_TABLE_OPTION: MaterialDataSourceFieldOption = {
	label: '未设置明细表',
	value: '',
}

export function getMaterialDataSourceFieldOptions(
	source: PrintDataSourceConfig | undefined,
): MaterialDataSourceFieldOption[] {
	if (!source || source.type !== 'inline') return [NO_DATA_SOURCE_OPTION]
	const inlineSource = source as InlinePrintDataSource

	const optionsByValue = new Map<string, MaterialDataSourceFieldOption>()
	for (const table of inlineSource.detailTables ?? []) {
		const record = table as unknown as Record<string, unknown>
		const value = readString(record.key) || readString(record.field)
		if (!value) continue
		const label = readString(record.title) || readString(record.label) || value
		optionsByValue.set(value, { label, value })
	}
	if (optionsByValue.size) return [...optionsByValue.values()]

	const legacyDetailField = readString(inlineSource.detailField)
	if (legacyDetailField) return [{ label: legacyDetailField, value: legacyDetailField }]
	return [NO_DETAIL_TABLE_OPTION]
}

export function getMaterialDataSourceFieldOptionsKey(
	options: readonly MaterialDataSourceFieldOption[],
) {
	return JSON.stringify(options.map(({ label, value }) => [label, value]))
}
function readString(value: unknown) {
	return typeof value === 'string' ? value.trim() : ''
}
