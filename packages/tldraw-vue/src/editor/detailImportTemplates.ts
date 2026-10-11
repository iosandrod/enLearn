export type DetailImportHeaderConfig = {
	hasFieldRow: boolean
	hasChineseRow: boolean
}

export type DetailImportTemplateId = 'field' | 'field-title' | 'title' | 'none'

export const detailImportTemplates: ReadonlyArray<{
	id: DetailImportTemplateId
	label: string
	description: string
	config: DetailImportHeaderConfig
}> = [
	{
		id: 'field',
		label: '仅 field 行',
		description: '首行是字段名',
		config: { hasFieldRow: true, hasChineseRow: false },
	},
	{
		id: 'field-title',
		label: 'field + title 行',
		description: '第一行字段名，第二行标题',
		config: { hasFieldRow: true, hasChineseRow: true },
	},
	{
		id: 'title',
		label: '仅 title 行',
		description: '首行是标题',
		config: { hasFieldRow: false, hasChineseRow: true },
	},
	{
		id: 'none',
		label: '无表头行',
		description: '第一行就是数据',
		config: { hasFieldRow: false, hasChineseRow: false },
	},
]

export function getDetailImportTemplateId(config: DetailImportHeaderConfig): DetailImportTemplateId {
	if (config.hasFieldRow && config.hasChineseRow) return 'field-title'
	if (config.hasFieldRow) return 'field'
	if (config.hasChineseRow) return 'title'
	return 'none'
}

export function getDetailImportTemplateConfig(id: DetailImportTemplateId): DetailImportHeaderConfig {
	const template = detailImportTemplates.find((item) => item.id === id) ?? detailImportTemplates[0]
	return { ...template.config }
}
