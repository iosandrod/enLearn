import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const layersPanelUrl = new URL('../src/components/VueLayersPanel.vue', import.meta.url)
const designerUrl = new URL('../src/TldrawVue.vue', import.meta.url)
const [layersPanel, designer] = await Promise.all([
	readFile(layersPanelUrl, 'utf8'),
	readFile(designerUrl, 'utf8'),
])

assert.match(designer, /id: 'layers', label: '图层'/)
assert.match(designer, /<VueLayersPanel v-if="editor" :editor="editor"/)
assert.match(layersPanel, /getSortedChildIdsForParent\(parentId\)/)
assert.match(layersPanel, /class="layers-row__drag-handle"/)
assert.match(layersPanel, /getIndexBetween\(below\?\.index, above\?\.index\)/)
assert.match(layersPanel, /reparentShapes\(\[source\.id\], nextParentId, nextIndex\)/)
assert.match(layersPanel, /getShapeAndDescendantIds\(\[sourceId\]\)\.has\(targetId\)/)
assert.match(layersPanel, /target\.type === 'vue-frame' \|\| target\.type === 'group'/)
assert.match(layersPanel, /source\.type === 'vue-material-section'/)

console.log('Verified layers tree, drag handle, reordering, reparenting, and hierarchy guards.')
