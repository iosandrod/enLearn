import type { Editor, TLShapeId, TLShapePartial } from '@tldraw/editor'
import {
	getVueResumeSections,
	isVueResumeShape,
	type VueResumeSectionShape,
	type VueResumeShape,
} from '@/editor/extensions/resume/vueResumeShape'
import type { VueResumePrintItem, VueResumePrintOverride } from '@/editor/vueSvgExport'
import type { PrintDataRow, PrintJobConfig, PrintResumeConfig } from './types'

export interface ResumePrintPage {
	items: VueResumePrintItem[]
	updates: TLShapePartial[]
}

export interface ResumePrintPlan {
	pageCount: number
	resume: VueResumeShape
	content: VueResumeSectionShape
	footer: VueResumeSectionShape | null
	pages: ResumePrintPage[]
	options: ReturnType<typeof getOptions>
}

const DEFAULT_FONT_SIZE = 13
const DEFAULT_LINE_HEIGHT = 20
const DEFAULT_ITEM_GAP = 18
const DEFAULT_MIN_ITEM_HEIGHT = 58

export function createResumePrintPlan(editor: Editor, config: PrintJobConfig, shapeIds: readonly TLShapeId[]): ResumePrintPlan | null {
	const resumes = [...editor.getShapeAndDescendantIds([...shapeIds])]
		.map((id) => editor.getShape(id))
		.filter(isVueResumeShape)
	if (!resumes.length) return null
	if (resumes.length > 1) throw new Error('同一页面只能包含一个简历分页组件。')
	const resume = resumes[0]
	const resumeConfig = normalizeResumeConfig(config.template?.resume)
	const sections = getVueResumeSections(editor, resume.id)
	const content = sections.find((section) => section.props.zone === 'content')
	if (!content) throw new Error('简历分页组件缺少自动填充内容区。')
	const footer = sections.find((section) => section.props.zone === 'pageFooter') ?? null
	const items = resolveResumeItems(resumeConfig, config.data ?? [])
	const options = getOptions(resumeConfig)
	const capacity = Math.max(options.minItemHeight, content.props.h - 24)
	const pages: ResumePrintPage[] = []
	let pageItems: VueResumePrintItem[] = []
	let pageHeight = 0
	for (const item of items) {
		const itemHeight = measureItem(item, content.props.w, options)
		if (pageItems.length > 0 && pageHeight + itemHeight > capacity) {
			pages.push(createPage(pageItems))
			pageItems = []
			pageHeight = 0
		}
		pageItems.push(item)
		pageHeight += Math.min(itemHeight, capacity)
	}
	if (pageItems.length || !pages.length) pages.push(createPage(pageItems))
	for (const page of pages) page.updates = createPage(page.items).updates
	return { pageCount: pages.length, resume, content, footer, pages, options }
}

export function getResumePageUpdates(plan: ResumePrintPlan, pageIndex: number) {
	return plan.pages[Math.min(pageIndex, plan.pages.length - 1)]?.updates ?? []
}

export function getResumeOverrides(plan: ResumePrintPlan, pageIndex: number) {
	const page = plan.pages[Math.min(pageIndex, plan.pages.length - 1)]
	const overrides = new Map<TLShapeId, VueResumePrintOverride>()
	if (!page) return overrides
	const options = plan.options
	const override = {
		items: page.items,
		fontSize: options.fontSize,
		lineHeight: options.lineHeight,
		itemGap: options.itemGap,
		pageNo: pageIndex + 1,
		total: plan.pageCount,
	}
	overrides.set(plan.content.id, override)
	if (plan.footer) overrides.set(plan.footer.id, override)
	return overrides
}

function createPage(items: VueResumePrintItem[]): ResumePrintPage {
	return { items, updates: [] }
}

function normalizeResumeConfig(value: PrintJobConfig['template'] extends { resume?: infer R } ? R : unknown): PrintResumeConfig {
	if (!value || typeof value !== 'object') return {}
	return value as PrintResumeConfig
}

function resolveResumeItems(config: PrintResumeConfig, rows: readonly PrintDataRow[]): VueResumePrintItem[] {
	const source = config.data ?? (config.dataPath ? resolvePath(rows[0], config.dataPath) : rows)
	const list = Array.isArray(source) ? source : []
	const fields = config.itemFields ?? {}
	return list.map((row, index) => {
		const item = typeof row === 'object' && row !== null ? row : { value: row }
		return {
			name: stringify(getPath(item, fields.name ?? 'name') ?? getPath(item, 'company') ?? `经历 ${index + 1}`),
			title: stringify(getPath(item, fields.title ?? 'title') ?? getPath(item, 'position')),
			period: stringify(getPath(item, fields.period ?? 'period') ?? getPath(item, 'date')),
			description: stringify(getPath(item, fields.description ?? 'description') ?? getPath(item, 'content') ?? getPath(item, 'summary')),
		}
	})
}

function getOptions(config: PrintResumeConfig | undefined) {
	const fontSize = number(config?.fontSize, DEFAULT_FONT_SIZE)
	return { fontSize, lineHeight: number(config?.lineHeight, Math.max(DEFAULT_LINE_HEIGHT, Math.ceil(fontSize * 1.45))), itemGap: number(config?.itemGap, DEFAULT_ITEM_GAP), minItemHeight: number(config?.minItemHeight, DEFAULT_MIN_ITEM_HEIGHT) }
}

function measureItem(item: VueResumePrintItem, width: number, options: ReturnType<typeof getOptions>) {
	const charsPerLine = Math.max(12, Math.floor((width - 36) / (options.fontSize * 0.58)))
	const descriptionLines = item.description ? Math.ceil(item.description.length / charsPerLine) : 0
	return Math.max(options.minItemHeight, options.lineHeight * (1 + descriptionLines) + options.itemGap)
}

function getPath(value: unknown, path: string): unknown {
	return path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, value)
}
function resolvePath(value: unknown, path: string) { return getPath(value, path) }
function stringify(value: unknown) { return value === undefined || value === null ? '' : typeof value === 'string' ? value : String(value) }
function number(value: unknown, fallback: number) { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback }
