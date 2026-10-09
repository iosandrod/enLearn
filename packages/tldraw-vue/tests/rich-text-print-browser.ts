import '../src/styles.css'
import { Editor, createTLStore, createShapeId } from '@tldraw/editor'
import { VueRichTextShapeUtil, type VueRichTextShape } from '../src/editor/vueRichTextShape'
import { VueSelectTool } from '../src/editor/interactions/VueSelectTool'
import { PrintShapePreviewResolver } from '../src/print/shapePreviewStrategies'

declare global {
	interface Window { printTestResult?: { ok: boolean; error?: string } }
}

function check(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

const container = document.getElementById('editor')!
const shapeUtils = [VueRichTextShapeUtil]
const editor = new Editor({
	store: createTLStore({ shapeUtils, bindingUtils: [] }), shapeUtils, bindingUtils: [],
	assetUtils: [], overlayUtils: [], tools: [VueSelectTool],
	getContainer: () => container, initialState: 'select', autoFocus: false,
})

try {
	const content = `<p><strong style="color:rgb(255,0,0);font-size:28px">{{name}}</strong></p>
		<p style="text-align:right"><em style="color:rgb(0,0,255)">第二行</em> &amp; 内容</p>
		<ul><li>列表</li></ul><table><tbody><tr><td>表格</td></tr></tbody></table>
		<p><img src="/__rich-text-print-test/image.svg" width="40" height="20" onload="window.unexpected=true"></p>
		<script>window.unexpected=true</script>`
	const id = createShapeId()
	editor.createShape<VueRichTextShape>({ id, type: 'vue-rich-text', props: {
		w: 360, h: 260, content, fontSize: 14, color: 'black',
		paddingTop: 9, paddingRight: 13, paddingBottom: 11, paddingLeft: 17,
		justifyContent: 'center', alignItems: 'center',
		borderTop: true, borderLeft: true,
	} })
	const resolver = new PrintShapePreviewResolver()
	const update = resolver.resolve(editor.getShape(id)!, {
		row: { name: '富文本' }, data: [], index: 0, pageNo: 1, total: 1,
	})
	check(update, 'The print expression must resolve inside rich text HTML.')
	editor.updateShape(update)
	const exported = await editor.getSvgElement([id], { background: false, padding: 0 })
	check(exported, 'SVG export must succeed.')
	const foreignObject = exported.svg.querySelector('foreignObject.tl-export-embed-styles')
	check(foreignObject, 'Print export must retain an HTML rendering instead of stripping markup.')
	const root = foreignObject.firstElementChild as HTMLElement
	check(root.namespaceURI === 'http://www.w3.org/1999/xhtml', 'HTML must use the XHTML namespace in SVG.')
	const strong = root.querySelector('strong') as HTMLElement
	check(strong?.textContent === '富文本', 'Formatting and expression output must survive export.')
	check(strong.style.color === 'rgb(255, 0, 0)' && strong.style.fontSize === '28px', 'Font size and color must be embedded.')
	check(Number(getComputedStyle(strong).fontWeight) >= 700, 'Bold formatting must survive export.')
	check(getComputedStyle(root.querySelector('em')!).fontStyle === 'italic', 'Italic formatting must survive export.')
	check(root.querySelectorAll('p').length === 3 && root.querySelector('ul li') && root.querySelector('table td'), 'Paragraphs, lists and tables must survive export.')
	check(!root.querySelector('script') && !root.querySelector('[onload]'), 'Export must share canvas HTML sanitization.')
	check(root.style.paddingLeft === '17px' && root.style.paddingTop === '9px', 'Node padding must match the canvas.')
	check(root.style.alignItems === 'center' && root.style.textAlign === 'center', 'Node alignment must match the canvas.')
	check(getComputedStyle(root).borderTopWidth === '1px' && getComputedStyle(root).borderRightWidth === '0px', 'Only configured borders must print.')
	check(root.querySelector('img')?.src.startsWith('data:'), 'Images must remain self-contained in SVG.')

	// Exercise the same SVG-to-PNG path used by PrintRenderer, then inspect pixels.
	const image = await editor.toImageDataUrl([id], { format: 'png', background: false, padding: 0, pixelRatio: 1 })
	const raster = new Image()
	raster.src = image.url
	await raster.decode()
	const canvas = document.createElement('canvas')
	canvas.width = raster.naturalWidth
	canvas.height = raster.naturalHeight
	const context = canvas.getContext('2d')!
	context.drawImage(raster, 0, 0)
	const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
	let red = 0, blue = 0, green = 0
	for (let i = 0; i < pixels.length; i += 4) {
		if (pixels[i + 3] < 128) continue
		if (pixels[i] > 180 && pixels[i + 1] < 60 && pixels[i + 2] < 60) red++
		if (pixels[i + 2] > 180 && pixels[i] < 60 && pixels[i + 1] < 60) blue++
		if (pixels[i + 1] > 180 && pixels[i] < 60 && pixels[i + 2] < 60) green++
	}
	check(red > 20 && blue > 20 && green > 100, `PNG must preserve styled text and the image (red=${red}, blue=${blue}, green=${green}).`)
	editor.updateShape<VueRichTextShape>({ id, type: 'vue-rich-text', props: { content: '', borderTop: false, borderLeft: false } })
	const empty = await editor.getSvgElement([id], { background: false, padding: 0 })
	const emptyRoot = empty?.svg.querySelector('foreignObject > div') as HTMLElement
	check(emptyRoot && emptyRoot.textContent === '', 'Empty content must not print a placeholder label.')
	check(getComputedStyle(emptyRoot).borderTopWidth === '0px', 'Canvas selection hints must not become print borders.')
	window.printTestResult = { ok: true }
} catch (error) {
	window.printTestResult = { ok: false, error: error instanceof Error ? error.stack : String(error) }
} finally {
	editor.dispose()
}
