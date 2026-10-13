import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'

const require = createRequire(new URL('../../../api/package.json', import.meta.url))
const { chromium } = require('playwright-core')
const frontendRequire = createRequire(new URL('../../../frontend/package.json', import.meta.url))
const { default: vueJsx } = await import(pathToFileURL(frontendRequire.resolve('@vitejs/plugin-vue-jsx')).href)
const { transform } = frontendRequire('esbuild')
const server = await createServer({
	server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
	resolve: { alias: [
		{ find: '@enlearn/lowcode-framework/components/low-code-form', replacement: fileURLToPath(new URL('../../lowcode-framework/src/components/LowCodeForm.vue', import.meta.url)) },
		{ find: 'tldraw-vue-phase-one/style.css', replacement: fileURLToPath(new URL('../src/styles.css', import.meta.url)) },
		{ find: 'tldraw-vue-phase-one', replacement: fileURLToPath(new URL('../src/index.ts', import.meta.url)) },
	] },
	plugins: [vueJsx({ include: /lowcode-framework\/.*\.tsx$/ }), {
		name: 'formula-test-react-tsx', enforce: 'pre', async transform(code, id) {
			if (id.replaceAll('\\', '/').includes('/tldraw-vue/') && id.endsWith('.tsx')) {
				return transform(code, { loader: 'tsx', jsx: 'automatic', jsxImportSource: 'react', target: 'esnext', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } })
			}
		},
	}, { name: 'formula-test-page', configureServer(server) {
		server.middlewares.use('/__formula-test', (_request, response) => {
			response.setHeader('Content-Type', 'text/html')
			response.end('<link rel="icon" href="data:,"><div id="editor" style="position:absolute;left:620px;width:800px;height:600px"></div><div id="panel" style="width:360px"></div><script type="module" src="/tests/print-formula-browser.ts"></script>')
		})
	} }],
})
let browser
let page
try {
	await server.listen()
	browser = await chromium.launch({ headless: true, ...(process.env.PRINT_TEST_BROWSER ? { executablePath: process.env.PRINT_TEST_BROWSER } : { channel: 'msedge' }) })
	page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
	const errors = []
	page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
	page.on('console', message => { if (message.type() === 'error') console.error(message.text()) })
	page.on('requestfailed', request => console.error(request.url(), request.failure()?.errorText))
	await page.goto(`${server.resolvedUrls.local[0]}__formula-test`)
	await page.getByRole('button', { name: '插入公式', exact: true }).click({ timeout: 60_000 })
	const dialog = page.locator('.lowcode-confirm-form-dialog')
	const control = label => dialog.locator('.lc-field').nth({ '函数': 0, '明细源': 1, '字段': 2, '统计范围': 3, '小数位': 4, '示例页': 5, '生成公式': 6, '示例结果': 7 }[label]).locator('input,select')
	const preview = control('示例结果')
	const waitPreview = value => page.waitForFunction(value => [...document.querySelectorAll('.lc-field input')].at(-1)?.value === value, value)
	await waitPreview('100.00')
	await control('统计范围').selectOption('page')
	await control('示例页').selectOption('1')
	await waitPreview('20.00')
	await control('函数').selectOption('AVERAGE')
	await control('统计范围').selectOption('all')
	await waitPreview('25.00')
	await control('函数').selectOption('COUNT')
	assert.equal(await control('字段').isDisabled(), true)
	await waitPreview('4.00')
	await control('函数').selectOption('TOTAL')
	await page.getByRole('button', { name: '插入到文本末尾' }).click()
	await page.waitForFunction(() => !document.querySelector('.lowcode-confirm-form-dialog'))
	assert.equal(await page.evaluate(() => window.formulaTest.getText()), '金额合计：{{TOTAL(items.amount) | fixed:2}}')
	const rendered = await page.evaluate(() => window.formulaTest.render())
	assert.equal(rendered.count, 4)
	assert.deepEqual(rendered.captures, Array(4).fill('金额合计：100.00'))
	assert.equal(rendered.images, true)
	assert.equal(rendered.restored, true)
	await page.evaluate(() => window.formulaTest.undo())
	assert.equal(await page.evaluate(() => window.formulaTest.getText()), '金额合计：')
	const pages = await page.evaluate(() => window.formulaTest.componentPagination())
	assert.ok(pages.length > 1, JSON.stringify(pages))
	assert.ok(pages.every(page => page.total === '100'))
	assert.equal(pages.reduce((sum, page) => sum + Number(page.subtotal), 0), 100)
	assert.equal(pages.reduce((sum, page) => sum + page.count, 0), 4)
	await page.getByRole('button', { name: '插入公式', exact: true }).click()
	await control('统计范围').selectOption('page')
	await control('示例页').selectOption('1')
	assert.equal(await preview.inputValue(), Number(pages[1].subtotal).toFixed(2))
	await page.screenshot({ path: fileURLToPath(new URL('../../../artifacts/print-formula-local-preview.png', import.meta.url)), fullPage: true })
	await page.setViewportSize({ width: 375, height: 812 })
	const mobile = await dialog.locator('.vxe-modal--box').boundingBox()
	assert.ok(mobile.x >= 0 && mobile.x + mobile.width <= 375, JSON.stringify(mobile))
	assert.equal(await page.getByRole('button', { name: '插入到文本末尾' }).isVisible(), true)
	await page.getByRole('button', { name: '取消', exact: true }).click()
	await page.evaluate(() => window.formulaTest.setReadonly(true))
	assert.equal(await page.getByRole('button', { name: '插入公式', exact: true }).isDisabled(), true)
	await page.evaluate(() => window.formulaTest.setReadonly(false))
	const footer = await page.evaluate(() => window.formulaTest.materialFooterPagination())
	assert.deepEqual(footer.plan.map(page => page.rows), [2, 2, 1])
	assert.equal(footer.captures.length, footer.plan.length)
	for (const [index, capture] of footer.captures.entries()) {
		const height = footer.plan[index].height
		const removed = footer.original.bodyHeight - height
		assert.equal(capture.bodyHeight, height)
		assert.equal(capture.footerY, footer.bodyY + height, 'Table footer must touch the last actual row')
		assert.equal(capture.frameY, footer.original.frameY - removed, 'Nested frame must move with the footer')
		assert.equal(capture.labelY, footer.original.labelY - removed, 'Locked nested text must move with the footer')
		assert.equal(capture.footerHeight, footer.original.footerHeight)
		assert.equal(capture.frameHeight, footer.original.frameHeight)
		assert.equal(capture.labelHeight, footer.original.labelHeight)
		assert.equal(capture.pageFooterY, footer.original.pageFooterY, 'Page footer stays anchored')
		assert.equal(capture.pageFooterHeight, footer.original.pageFooterHeight)
		assert.equal(capture.text, ['本页合计：30', '本页合计：70', '本页合计：50'][index])
	}
	assert.equal(footer.images, true)
	assert.equal(footer.restored, true)
	assert.equal(footer.failed, true)
	assert.equal(footer.failureRestored, true)
	assert.equal(footer.emptyHeight, 30, 'Empty table must retain only its column header')
	assert.equal(footer.exactHeight, footer.exactBodyHeight)
	await page.evaluate(() => window.formulaTest.dispose())
	assert.deepEqual(errors, [])
	console.log('Browser verified formulas, pagination, compact table footers with nested/locked content, fixed page footers, PNG export, and restoration after success/failure.')
} catch (error) {
	console.error(await page?.evaluate(() => ({ text: document.body.innerText.slice(0, 2000), controls: [...document.querySelectorAll('.lc-field')].map(field => ({label: field.querySelector('label')?.textContent, value: field.querySelector('input,select')?.value})), initialized: Boolean(window.formulaTest) })))
	throw error
} finally {
	await browser?.close()
	await server.close()
}
