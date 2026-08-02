import type { TLContent } from '@tldraw/editor'
import type { PrintDataSourceConfig } from '@/print/types'
import type {
	WorkspaceCamera,
	WorkspacePageBounds,
	WorkspacePageSizeMm,
	WorkspaceViewportSize,
} from './interactions/WorkspaceBoundsManager'
import type { WorkspaceGuide } from './interactions/guides'

const LOCAL_TEMPLATE_STORAGE_KEY = 'tldraw-vue.templates.v1'

export interface VueTemplateRecord {
	id: string
	name: string
	createdAt: number
	updatedAt: number
	content: TLContent
	workspace?: VueTemplateWorkspaceConfig
}

export interface VueTemplateWorkspaceConfig {
	pageSizeMm?: WorkspacePageSizeMm
	pageBounds?: WorkspacePageBounds
	camera?: WorkspaceCamera
	guides?: WorkspaceGuide[]
	viewportSize?: WorkspaceViewportSize
	pxPerMm?: number
	printDataSource?: PrintDataSourceConfig
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
	return {
		id: createTemplateId(),
		name,
		createdAt: now,
		updatedAt: now,
		content: cloneVueTemplateContent(content),
		workspace: cloneVueTemplateWorkspaceConfig(workspace),
	}
}

export function cloneVueTemplateContent(content: TLContent): TLContent {
	return JSON.parse(JSON.stringify(content)) as TLContent
}

export function cloneVueTemplateRecord(template: VueTemplateRecord): VueTemplateRecord {
	return {
		...template,
		content: cloneVueTemplateContent(template.content),
		workspace: cloneVueTemplateWorkspaceConfig(template.workspace),
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
	const { pageSizeMm, pageBounds, camera, guides, viewportSize, pxPerMm, printDataSource } = value
	return (
		(pageSizeMm === undefined || isSizeLike(pageSizeMm)) &&
		(pageBounds === undefined || isBoundsLike(pageBounds)) &&
		(camera === undefined || isCameraLike(camera)) &&
		(guides === undefined || isGuideList(guides)) &&
		(viewportSize === undefined || isSizeLike(viewportSize)) &&
		(pxPerMm === undefined || isFiniteNumber(pxPerMm)) &&
		(printDataSource === undefined || isPrintDataSourceConfig(printDataSource))
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
