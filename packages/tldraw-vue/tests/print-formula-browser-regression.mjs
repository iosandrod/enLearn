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
	const dialog = page.locator('.formula-editor')
	const output = dialog.locator('.formula-editor__output').last()
	await page.waitForFunction(() => document.querySelector('.formula-editor__output:last-child span')?.textContent === '100.00')
	await page.getByLabel('统计范围', { exact: true }).selectOption('page')
	await page.getByLabel('示例页', { exact: true }).selectOption('1')
	await page.waitForFunction(() => document.querySelector('.formula-editor__output:last-child span')?.textContent === '20.00')
	await page.getByLabel('函数', { exact: true }).selectOption('AVERAGE')
	await page.getByLabel('统计范围', { exact: true }).selectOption('all')
	await page.waitForFunction(() => document.querySelector('.formula-editor__output:last-child span')?.textContent === '25.00')
	await page.getByLabel('函数', { exact: true }).selectOption('COUNT')
	assert.equal(await page.getByLabel('字段', { exact: true }).isDisabled(), true)
	await page.waitForFunction(() => document.querySelector('.formula-editor__output:last-child span')?.textContent === '4.00')
	await page.getByLabel('函数', { exact: true }).selectOption('TOTAL')
	await page.getByRole('button', { name: '插入到文本末尾' }).click()
	await page.waitForFunction(() => !document.querySelector('.formula-editor'))
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
	await page.getByLabel('统计范围', { exact: true }).selectOption('page')
	await page.getByLabel('示例页', { exact: true }).selectOption('1')
	assert.equal(await output.locator('span').textContent(), Number(pages[1].subtotal).toFixed(2))
	await page.screenshot({ path: fileURLToPath(new URL('../../../artifacts/print-formula-local-preview.png', import.meta.url)), fullPage: true })
	await page.setViewportSize({ width: 375, height: 812 })
	const mobile = await dialog.boundingBox()
	assert.ok(mobile.x >= 0 && mobile.x + mobile.width <= 375, JSON.stringify(mobile))
	assert.equal(await page.getByRole('button', { name: '插入到文本末尾' }).isVisible(), true)
	await page.getByRole('button', { name: '取消', exact: true }).click()
	await page.evaluate(() => window.formulaTest.setReadonly(true))
	assert.equal(await page.getByRole('button', { name: '插入公式', exact: true }).isDisabled(), true)
	await page.evaluate(() => window.formulaTest.dispose())
	assert.deepEqual(errors, [])
	console.log('Browser verified formula insertion, function/field selectors, actual pagination samples, rendered PNGs, template restoration, undo and readonly mode.')
} catch (error) {
	console.error(await page?.evaluate(() => ({ text: document.body.innerText.slice(0, 2000), initialized: Boolean(window.formulaTest) })))
	throw error
} finally {
	await browser?.close()
	await server.close()
}
