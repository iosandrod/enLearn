import type { Editor } from '@tldraw/editor'
import { resolvePrintDataSource } from './dataSource'
import { PrintRenderer } from './renderer'
import type { PrintJobConfig, PrintPageRenderResult } from './types'

export function getRemotePrintBaseUrl() {
	const configured = import.meta.env.VITE_PRINT_API_BASE_URL?.trim()
	if (configured) return configured.replace(/\/$/, '')
	const url = new URL(window.location.origin)
	url.port = '3302'
	return url.origin
}

/** Resolve bindings and pagination in the editor; Chromium on 3302 generates the image. */
export async function createRemotePreviewRequests(editor: Editor, config: PrintJobConfig, signal: AbortSignal) {
	const data = await resolvePrintDataSource(config.dataSource, { signal }) ?? config.data ?? [{}]
	const resolved = { ...config, data: [...data], signal }
	const renderer = new PrintRenderer(editor)
	const jobs = renderer.createRenderJobs(resolved)
	if (!jobs.length) throw new Error('当前数据源没有可预览的记录')
	if (jobs.length > 100) throw new Error('远程预览最多支持 100 页，请减少数据后重试')
	const current = editor.getCurrentPage()
	const page = {
		id: current.id, name: current.name,
		content: editor.getContentFromCurrentPage(editor.getCurrentPageShapeIdsSorted(), current.id),
	}
	const requests = []
	for (const [index, job] of jobs.entries()) {
		signal.throwIfAborted()
		// The renderer temporarily applies bindings and restores all editor changes in finally.
		const snapshot = await renderer.renderPage(resolved, job.row, index, jobs.length, { ...job, output: 'svg' })
		const html = await createRemotePageHtml(snapshot, signal)
		requests.push({
			html, format: 'png' as const, records: [job.row],
			page: { widthMm: config.page.widthMm, heightMm: config.page.heightMm },
			dpi: config.page.dpi ?? 144, printBackground: true, filename: `${current.name || '预览'}-${index + 1}`,
			// Send the source data and document, without source HTTP credentials or executable code.
			context: { page, dataSource: { type: 'inline', rows: data }, previewSettings: config.previewSettings,
				pageSettings: config.page, template: { pageBounds: config.template?.pageBounds, pxPerMm: config.template?.pxPerMm },
				pageNo: index + 1, totalPages: jobs.length },
		})
	}
	return requests
}

async function createRemotePageHtml(page: PrintPageRenderResult, signal: AbortSignal) {
	const background = page.backgroundStyle
	const image = background?.imageUrl ? await inlineImage(background.imageUrl, signal) : ''
	const section = document.createElement('section')
	section.dataset.printPage = String(page.pageNo)
	section.style.cssText = `position:relative;overflow:hidden;width:${page.width}px;height:${page.height}px;`
	section.style.backgroundColor = page.backgroundColor || '#fff'
	if (image) {
		const element = document.createElement('img')
		element.src = image
		element.alt = ''
		element.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;'
		element.style.objectFit = background?.imageSize === 'auto' ? 'none' : background?.imageSize || 'cover'
		element.style.objectPosition = background?.imagePosition || 'center'
		element.style.opacity = String(Math.min(100, Math.max(0, background?.opacity ?? 100)) / 100)
		section.append(element)
	}
	const content = document.createElement('div')
	content.style.cssText = 'position:relative;width:100%;height:100%;'
	content.innerHTML = page.svg ?? ''
	// Asset URLs from the editor may be blob URLs or authenticated public resources.
	// Inline images before crossing machines so the render service needs no credentials.
	for (const element of content.querySelectorAll('image,img')) {
		const attribute = element.tagName.toLowerCase() === 'img' ? 'src' : element.hasAttribute('href') ? 'href' : 'xlink:href'
		const source = element.getAttribute(attribute)
		if (source && !source.startsWith('data:')) element.setAttribute(attribute, await inlineImage(source, signal))
	}
	section.append(content)
	return section.outerHTML
}

async function inlineImage(source: string, signal: AbortSignal) {
	if (source.startsWith('data:')) return source
	const response = await fetch(source, { signal })
	if (!response.ok) throw new Error(`预览图片加载失败（${response.status}）`)
	const blob = await response.blob()
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result))
		reader.onerror = () => reject(reader.error ?? new Error('预览图片读取失败'))
		reader.readAsDataURL(blob)
	})
}

export async function requestRemotePreview(body: unknown, signal: AbortSignal) {
	let response: Response
	try {
		response = await fetch(`${getRemotePrintBaseUrl()}/preview`, {
			method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit',
			body: JSON.stringify(body), signal,
		})
	} catch (error) {
		if (signal.aborted) throw error
		throw new Error('无法连接远程预览服务，请检查服务是否已启动')
	}
	if (!response.ok) {
		const result = await response.json().catch(() => null)
		throw new Error(result?.error || `远程预览失败（${response.status}）`)
	}
	if (!response.headers.get('content-type')?.startsWith('image/png')) throw new Error('远程预览服务未返回 PNG 图片')
	return response.blob()
}
