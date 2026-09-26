import type { TLContent } from '@tldraw/editor'
import type { PrintDataSourceConfig } from '@/print/types'
import type {
	WorkspaceCamera,
	WorkspacePageBounds,
	WorkspacePageSizeMm,
	WorkspaceViewportSize,
} from './interactions/WorkspaceBoundsManager'
import type { WorkspaceGuide } from './interactions/guides'
import type { DesignerMode, PresentationConfig } from '../presentation'

const LOCAL_TEMPLATE_STORAGE_KEY = 'tldraw-vue.templates.v1'

export interface VueTemplatePage {
	id: string
	name: string
	content: TLContent
}

export type VueTemplateDocument = Partial<TLContent> & {
	pages?: VueTemplatePage[]
	currentPageId?: string
	workspace?: VueTemplateWorkspaceConfig
}

export interface VueTemplateRecord {
	id: string
	name: string
	createdAt: number
	updatedAt: number
	content: VueTemplateDocument
	workspace?: VueTemplateWorkspaceConfig
	metadata?: VueTemplateMetadata
}

export interface VueTemplateMetadata {
	editor?: string
	schemaVersion?: number
	designerMode?: DesignerMode
	dataSourceType?: string
	dataSourceKey?: string
	pageSizeMm?: WorkspacePageSizeMm
	pageBounds?: WorkspacePageBounds
	[key: string]: unknown
}

export interface VueTemplateWorkspaceConfig {
	designerMode?: DesignerMode
	pageSizeMm?: WorkspacePageSizeMm
	pageBounds?: WorkspacePageBounds
	camera?: WorkspaceCamera
	guides?: WorkspaceGuide[]
	viewportSize?: WorkspaceViewportSize
	pxPerMm?: number
	printDataSource?: PrintDataSourceConfig
	background?: WorkspaceBackgroundConfig
	presentation?: PresentationConfig
}

export interface WorkspaceBackgroundConfig {
	color: string
	imageUrl?: string
	imageSize: 'cover' | 'contain' | 'auto'
	imagePosition: string
}

export type VueTemplateLoadHandler = () =>
	| readonly VueTemplateRecord[]
	| Promise<readonly VueTemplateRecord[]>

export type VueTemplateSaveHandler = (
	templates: readonly VueTemplateRecord[]
) => void | Promise<void>

export function createVueTemplateRecord(
	name: string,
	content: TLContent,
	workspace?: VueTemplateWorkspaceConfig
): VueTemplateRecord {
	const now = Date.now()
	const document = withWorkspaceInTemplateContent(content, workspace)
	return {
		id: createTemplateId(),
		name,
		createdAt: now,
		updatedAt: now,
		content: document,
		workspace: cloneVueTemplateWorkspaceConfig(workspace),
		metadata: createVueTemplateMetadata(workspace, name),
	}
}

export function cloneVueTemplateContent(content: TLContent): TLContent {
	return JSON.parse(JSON.stringify(content)) as TLContent
}

export function cloneVueTemplateRecord(template: VueTemplateRecord): VueTemplateRecord {
	const metadata = template.metadata
		? JSON.parse(JSON.stringify(template.metadata)) as VueTemplateMetadata
		: undefined
	const workspace = mergeMetadataWorkspace(
		isObject(template.content) && isObject((template.content as Record<string, unknown>).workspace)
			? (template.content as Record<string, unknown>).workspace as VueTemplateWorkspaceConfig
			: template.workspace,
		metadata,
	)
	return {
		...template,
		content: withWorkspaceInTemplateContent(template.content, workspace),
		// Keep the legacy property for consumers that still read it. New writes
		// use content.workspace as the authoritative value.
		workspace,
		metadata,
	}
}

export function cloneVueTemplateDocument(content: VueTemplateDocument): VueTemplateDocument {
	return JSON.parse(JSON.stringify(content)) as VueTemplateDocument
}

function withWorkspaceInTemplateContent(
	content: TLContent,
	workspace: VueTemplateWorkspaceConfig | undefined,
) {
	const cloned = cloneVueTemplateContent(content) as VueTemplateDocument
	if (workspace) cloned.workspace = cloneVueTemplateWorkspaceConfig(workspace)
	return cloned
}

function mergeMetadataWorkspace(
	workspace: VueTemplateWorkspaceConfig | undefined,
	metadata: VueTemplateMetadata | undefined
): VueTemplateWorkspaceConfig | undefined {
	if (!workspace && !metadata) return undefined
	return {
		...(metadata?.designerMode ? { designerMode: metadata.designerMode } : {}),
		...(metadata?.pageSizeMm ? { pageSizeMm: { ...metadata.pageSizeMm } } : {}),
		...(metadata?.pageBounds ? { pageBounds: { ...metadata.pageBounds } } : {}),
		...(cloneVueTemplateWorkspaceConfig(workspace) ?? {}),
	}
}

export function createVueTemplateMetadata(
	workspace: VueTemplateWorkspaceConfig | undefined,
	templateName?: string
): VueTemplateMetadata {
	const source = workspace?.printDataSource
	const dataSource = source && typeof source === 'object' ? source as Record<string, unknown> : undefined
	const dataSourceType = typeof dataSource?.type === 'string' ? dataSource.type : 'none'
	const dataSourceKey = typeof dataSource?.key === 'string' && dataSource.key.trim()
		? dataSource.key.trim()
		: typeof dataSource?.formCode === 'string' && dataSource.formCode.trim()
			? dataSource.formCode.trim()
			: typeof dataSource?.tableName === 'string' && dataSource.tableName.trim()
				? dataSource.tableName.trim()
				: undefined
	return {
		editor: 'tldraw-vue',
		schemaVersion: 1,
		designerMode: workspace?.designerMode,
		dataSourceType,
		...(templateName ? { templateName } : {}),
		...(dataSourceKey ? { dataSourceKey } : {}),
		...(workspace?.pageSizeMm ? { pageSizeMm: { ...workspace.pageSizeMm } } : {}),
		...(workspace?.pageBounds ? { pageBounds: { ...workspace.pageBounds } } : {}),
	}
}

export function cloneVueTemplateWorkspaceConfig(
	workspace: VueTemplateWorkspaceConfig | undefined
): VueTemplateWorkspaceConfig | undefined {
	if (!workspace) return undefined
	return JSON.parse(JSON.stringify(workspace)) as VueTemplateWorkspaceConfig
}

export function normalizeVueTemplates(value: unknown): VueTemplateRecord[] {
	if (!Array.isArray(value)) return []
	return value.filter(isVueTemplateRecord).map(cloneVueTemplateRecord)
}

export function readLocalVueTemplates(): VueTemplateRecord[] {
	const storage = getLocalStorage()
	if (!storage) return []

	const raw = storage.getItem(LOCAL_TEMPLATE_STORAGE_KEY)
	if (!raw) return []

	try {
		return normalizeVueTemplates(JSON.parse(raw))
	} catch {
		return []
	}
}

export function writeLocalVueTemplates(templates: readonly VueTemplateRecord[]) {
	const storage = getLocalStorage()
	if (!storage) return
	storage.setItem(LOCAL_TEMPLATE_STORAGE_KEY, JSON.stringify(normalizeVueTemplates(templates)))
}

function createTemplateId() {
	const crypto = globalThis.crypto
	if (crypto?.randomUUID) return `template:${crypto.randomUUID()}`
	return `template:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getLocalStorage() {
	if (typeof window === 'undefined') return null
	try {
		return window.localStorage
	} catch {
		return null
	}
}

function isVueTemplateRecord(value: unknown): value is VueTemplateRecord {
	if (!isObject(value)) return false
	return (
		typeof value.id === 'string' &&
		typeof value.name === 'string' &&
		typeof value.createdAt === 'number' &&
		typeof value.updatedAt === 'number' &&
		isTemplateContent(value.content) &&
		(value.workspace === undefined || isTemplateWorkspaceConfig(value.workspace))
		&& (value.metadata === undefined || isTemplateMetadata(value.metadata))
	)
}

function isTemplateMetadata(value: unknown): value is VueTemplateMetadata {
	if (!isObject(value)) return false
	return (
		(value.editor === undefined || typeof value.editor === 'string') &&
		(value.schemaVersion === undefined || isFiniteNumber(value.schemaVersion)) &&
		(value.designerMode === undefined || value.designerMode === 'print' || value.designerMode === 'presentation') &&
		(value.dataSourceType === undefined || typeof value.dataSourceType === 'string') &&
		(value.dataSourceKey === undefined || typeof value.dataSourceKey === 'string') &&
		(value.pageSizeMm === undefined || isSizeLike(value.pageSizeMm)) &&
		(value.pageBounds === undefined || isBoundsLike(value.pageBounds))
	)
}

function isTemplateContent(value: unknown): value is TLContent {
	if (!isObject(value)) return false
	return (
		Array.isArray(value.shapes) &&
		(Array.isArray(value.bindings) || value.bindings === undefined) &&
		Array.isArray(value.rootShapeIds) &&
		Array.isArray(value.assets) &&
		isObject(value.schema)
	)
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function isTemplateWorkspaceConfig(value: unknown): value is VueTemplateWorkspaceConfig {
	if (!isObject(value)) return false
	const { designerMode, pageSizeMm, pageBounds, camera, guides, viewportSize, pxPerMm, printDataSource, background, presentation } = value
	return (
		(designerMode === undefined || designerMode === 'print' || designerMode === 'presentation') &&
		(pageSizeMm === undefined || isSizeLike(pageSizeMm)) &&
		(pageBounds === undefined || isBoundsLike(pageBounds)) &&
		(camera === undefined || isCameraLike(camera)) &&
		(guides === undefined || isGuideList(guides)) &&
		(viewportSize === undefined || isSizeLike(viewportSize)) &&
		(pxPerMm === undefined || isFiniteNumber(pxPerMm)) &&
		(printDataSource === undefined || isPrintDataSourceConfig(printDataSource)) &&
		(background === undefined || isBackgroundConfig(background)) &&
		(presentation === undefined || isObject(presentation))
	)
}

export function stripVueTemplateDocumentMetadata(value: TLContent): TLContent {
	const { pages: _pages, currentPageId: _currentPageId, workspace: _workspace, ...content } = value as VueTemplateDocument
	return content as TLContent
}

function isBackgroundConfig(value: unknown): value is WorkspaceBackgroundConfig {
	return (
		isObject(value) &&
		typeof value.color === 'string' &&
		(value.imageUrl === undefined || typeof value.imageUrl === 'string') &&
		(value.imageSize === 'cover' || value.imageSize === 'contain' || value.imageSize === 'auto') &&
		typeof value.imagePosition === 'string'
	)
}

function isPrintDataSourceConfig(value: unknown): value is PrintDataSourceConfig {
	return isObject(value) && typeof value.type === 'string'
}

function isGuideList(value: unknown): value is WorkspaceGuide[] {
	return Array.isArray(value) && value.every(isGuide)
}

function isGuide(value: unknown): value is WorkspaceGuide {
	return (
		isObject(value) &&
		(value.axis === 'x' || value.axis === 'y') &&
		typeof value.id === 'string' &&
		isFiniteNumber(value.position)
	)
}

function isSizeLike(value: unknown): value is WorkspacePageSizeMm | WorkspaceViewportSize {
	return isObject(value) && isFiniteNumber(value.w) && isFiniteNumber(value.h)
}

function isBoundsLike(value: unknown): value is WorkspacePageBounds {
	return (
		isObject(value) &&
		isFiniteNumber(value.x) &&
		isFiniteNumber(value.y) &&
		isFiniteNumber(value.w) &&
		isFiniteNumber(value.h)
	)
}

function isCameraLike(value: unknown): value is WorkspaceCamera {
	return (
		isObject(value) &&
		isFiniteNumber(value.x) &&
		isFiniteNumber(value.y) &&
		isFiniteNumber(value.z) &&
		value.z > 0
	)
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value)
}
