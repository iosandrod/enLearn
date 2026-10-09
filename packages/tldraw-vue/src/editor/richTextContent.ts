/** Use the same HTML content in the canvas and the print/export renderer. */
export function sanitizeRichText(value: string) {
	if (typeof DOMParser === 'undefined') return value.replace(/<\/?(?:script|style|iframe|object|embed)[^>]*>/gi, '')
	const document = new DOMParser().parseFromString(String(value ?? ''), 'text/html')
	document.querySelectorAll('script,style,iframe,object,embed,form').forEach((node) => node.remove())
	document.querySelectorAll('*').forEach((node) => {
		for (const attribute of [...node.attributes]) {
			if (attribute.name.toLowerCase().startsWith('on')) node.removeAttribute(attribute.name)
			if ((attribute.name === 'href' || attribute.name === 'src') && /^\s*javascript:/i.test(attribute.value)) node.removeAttribute(attribute.name)
		}
	})
	return document.body.innerHTML
}
