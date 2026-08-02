import type { PrintImageInput, PrinterAdapter } from '../types'

export class BrowserPrintAdapter implements PrinterAdapter {
	async printImage(input: PrintImageInput) {
		await this.printImages([input])
	}

	async printImages(inputs: PrintImageInput[]) {
		if (typeof document === 'undefined' || typeof window === 'undefined') {
			throw new Error('Browser printing is only available in a browser environment.')
		}
		if (!inputs.length) return

		const iframe = document.createElement('iframe')
		iframe.setAttribute('aria-hidden', 'true')
		Object.assign(iframe.style, {
			position: 'fixed',
			right: '0',
			bottom: '0',
			width: '0',
			height: '0',
			border: '0',
			visibility: 'hidden',
		})

		document.body.appendChild(iframe)

		try {
			const printWindow = iframe.contentWindow
			const printDocument = iframe.contentDocument
			if (!printWindow || !printDocument) throw new Error('Could not create print frame.')

			const firstInput = inputs[0]
			const marginMm = firstInput.page.marginMm ?? 0
			const title =
				firstInput.printer.type === 'browser' && firstInput.printer.title
					? firstInput.printer.title
					: 'Print'

			printDocument.open()
			printDocument.write(createPrintHtml(inputs, title, marginMm))
			printDocument.close()

			await waitForImages(printDocument)
			await printFrame(printWindow)
		} finally {
			iframe.remove()
		}
	}
}

function createPrintHtml(inputs: PrintImageInput[], title: string, marginMm: number) {
	const firstInput = inputs[0]
	const pageWidthMm = firstInput.page.widthMm
	const pageHeightMm = firstInput.page.heightMm

	return `<!doctype html>
<html>
<head>
	<meta charset="utf-8" />
	<title>${escapeHtml(title)}</title>
	<style>
		@page {
			size: ${pageWidthMm}mm ${pageHeightMm}mm;
			margin: ${marginMm}mm;
		}
		html,
		body {
			margin: 0;
			padding: 0;
			background: #fff;
		}
		.print-page {
			width: ${pageWidthMm}mm;
			height: ${pageHeightMm}mm;
			page-break-after: always;
			break-after: page;
			overflow: hidden;
		}
		.print-page:last-child {
			page-break-after: auto;
			break-after: auto;
		}
		.print-page img {
			display: block;
			width: 100%;
			height: 100%;
			object-fit: fill;
		}
	</style>
</head>
<body>
	${inputs
		.map(
			(input) =>
				`<section class="print-page"><img src="${escapeAttribute(input.dataUrl)}" alt="Page ${input.pageNo}" /></section>`
		)
		.join('')}
</body>
</html>`
}

function waitForImages(doc: Document) {
	const images = [...doc.images]
	return Promise.all(
		images.map((image) => {
			if (image.complete) return Promise.resolve()
			return new Promise<void>((resolve, reject) => {
				image.onload = () => resolve()
				image.onerror = () => reject(new Error('Could not load print image.'))
			})
		})
	)
}

function printFrame(printWindow: Window) {
	return new Promise<void>((resolve) => {
		let resolved = false
		const finish = () => {
			if (resolved) return
			resolved = true
			resolve()
		}

		printWindow.onafterprint = finish
		printWindow.focus()
		printWindow.print()
		window.setTimeout(finish, 1000)
	})
}

function escapeHtml(value: string) {
	return value.replace(/[&<>"']/g, (char) => {
		switch (char) {
			case '&':
				return '&amp;'
			case '<':
				return '&lt;'
			case '>':
				return '&gt;'
			case '"':
				return '&quot;'
			default:
				return '&#39;'
		}
	})
}

function escapeAttribute(value: string) {
	return escapeHtml(value)
}
