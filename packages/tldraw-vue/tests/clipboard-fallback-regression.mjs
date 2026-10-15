import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const canvasSource = await readFile(
	new URL('../src/components/VueCanvas.vue', import.meta.url),
	'utf8'
)
const controllerSource = await readFile(
	new URL('../src/editor/interactions/VueEditorController.ts', import.meta.url),
	'utf8'
)
const contextMenuSource = await readFile(
	new URL('../src/editor/interactions/ContextMenuState.ts', import.meta.url),
	'utf8'
)

assert.match(canvasSource, /window\.addEventListener\('copy', onCopy\)/)
assert.match(canvasSource, /window\.addEventListener\('cut', onCut\)/)
assert.match(canvasSource, /controller\.handleClipboardEvent\(event, 'copy'\)/)
assert.match(canvasSource, /controller\.handleClipboardEvent\(event, 'cut'\)/)

assert.match(controllerSource, /handleClipboardEvent\(event: ClipboardEvent, operation: 'copy' \| 'cut'\)/)
assert.match(controllerSource, /getClipboardSelectionShapeIds\(editor\)/)
assert.match(controllerSource, /editor\.isShapeOrAncestorLocked\(shape\)/)
assert.match(controllerSource, /\.lowcode-form-panel, \.vue-table-shape/)
assert.match(controllerSource, /getSelection\(\)\?\.toString\(\)/)
assert.doesNotMatch(
	controllerSource,
	/this\.matchesShortcut\(event, \{ key: '[xcv]', accel: true \}\)/,
	'Clipboard keyboard shortcuts must be left to native copy/cut/paste events.'
)

assert.match(contextMenuSource, /clipboardData\.setData\('text\/html', html\)/)
assert.match(contextMenuSource, /clipboardData\.setData\('text\/plain', payload\)/)
assert.match(contextMenuSource, /catch \{\s*return false\s*\}/)
assert.match(contextMenuSource, /return this\.copyTextWithExecCommand\(win, payload\)/)
assert.match(contextMenuSource, /previousActiveElement\.focus\(\{ preventScroll: true \}\)/)

console.log('Verified native clipboard events and insecure-context copy fallback.')
