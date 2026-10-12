import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [designerSource, topMenuSource, stylesSource] = await Promise.all([
	readFile(new URL('../src/TldrawVue.vue', import.meta.url), 'utf8'),
	readFile(new URL('../src/components/VueTopLeftMenu.vue', import.meta.url), 'utf8'),
	readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
])

const toolsView = designerSource.match(
	/<div v-show="activeDesignerTab === 'tools'"[\s\S]*?<\/section>\s*<\/div>/
)?.[0]

assert.ok(toolsView, 'The designer tools view must be present.')
assert.match(
	toolsView,
	/<VueTopLeftMenu[\s\S]*?controls="actions" embedded/,
	'The side panel must retain only the non-dropdown actions.'
)

assert.match(
	designerSource,
	/<div style="flex:1;" ref="designerStage" class="designer-stage flex-1">[\s\S]*?<VueCanvas[\s\S]*?<VueTopLeftMenu[\s\S]*?controls="dropdowns"/,
	'The menu and page controls must render over the canvas.'
)
assert.match(designerSource, /@before-action="handleSideMenuBeforeAction"/)
assert.match(designerSource, /@before-action="handleCanvasMenuBeforeAction"/)
assert.match(topMenuSource, /controls\?: 'all' \| 'dropdowns' \| 'actions'/)
assert.match(topMenuSource, /v-if="showDropdownControls"[\s\S]*?aria-label="菜单"/)
assert.match(topMenuSource, /v-if="showDropdownControls"[\s\S]*?aria-label="页面"/)
assert.match(topMenuSource, /top-menu-panel--canvas-shortcuts/)

assert.match(
	stylesSource,
	/\.top-menu-panel--canvas-shortcuts \.top-menu-button-label,[\s\S]*?display: none/,
	'The canvas shortcuts must hide their text labels.'
)
assert.match(
	stylesSource,
	/\.top-menu-panel--canvas-shortcuts \.top-menu-page-button[^}]*width: 30px[^}]*min-width: 30px/,
	'The page shortcut must use the same square icon-button dimensions as the menu shortcut.'
)

console.log('Canvas top menu layout regression passed.')
