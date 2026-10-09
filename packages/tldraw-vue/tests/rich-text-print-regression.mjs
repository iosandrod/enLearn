import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'vite'

const require = createRequire(new URL('../../../api/package.json', import.meta.url))
const { chromium } = require('playwright-core')
const server = await createServer({
	server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
	plugins: [{
		name: 'rich-text-print-test-page',
		configureServer(server) {
			server.middlewares.use('/__rich-text-print-test', (request, response) => {
				if (request.url === '/image.svg') {
					response.setHeader('Content-Type', 'image/svg+xml')
					response.end('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#00ff00"/></svg>')
					return
				}
				response.setHeader('Content-Type', 'text/html')
				response.end('<link rel="icon" href="data:,"><div id="editor" style="width:800px;height:600px"></div><script type="module" src="/tests/rich-text-print-browser.ts"></script>')
			})
		},
	}],
})
let browser
try {
	await server.listen()
	browser = await chromium.launch({
		headless: true,
		...(process.env.PRINT_TEST_BROWSER ? { executablePath: process.env.PRINT_TEST_BROWSER } : { channel: 'msedge' }),
	})
	const page = await browser.newPage()
	const errors = []
	page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message) })
	await page.goto(`${server.resolvedUrls.local[0]}__rich-text-print-test`)
	await page.waitForFunction(() => window.printTestResult !== undefined, undefined, { timeout: 60_000 })
	const result = await page.evaluate(() => window.printTestResult)
	assert.equal(result.ok, true, result.error ?? errors.join('\n'))
	assert.deepEqual(errors, [])
	console.log('Verified rich text HTML, embedded styles/media, layout, borders, expressions, and PNG print rendering in Chromium.')
} finally {
	await browser?.close()
	await server.close()
}
