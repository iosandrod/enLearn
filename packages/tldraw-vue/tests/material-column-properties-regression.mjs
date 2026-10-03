import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const [panel, section, canvas, operations, tldrawVue, migration, prefetch, guides, resizing] = await Promise.all([
	readFile(new URL('src/components/LowCodeFormPanel.vue', root), 'utf8'),
	readFile(new URL('src/components/shapes/VueMaterialSectionShapeNode.vue', root), 'utf8'),
	readFile(new URL('src/components/VueCanvas.vue', root), 'utf8'),
	readFile(new URL('src/editor/materialColumnOperations.ts', root), 'utf8'),
	readFile(new URL('src/TldrawVue.vue', root), 'utf8'),
	readFile(new URL('../../../supabase/migrations/20261002120000_print_material_column_property_form.sql', import.meta.url), 'utf8'),
	readFile(new URL('../../../frontend/utils/printDesignerLowCode.ts', import.meta.url), 'utf8'),
	readFile(new URL('src/editor/interactions/guides.ts', root), 'utf8'),
	readFile(new URL('src/editor/interactions/ResizingState.ts', root), 'utf8'),
])

assert.match(panel, /materialColumnFormCode = propertyFormCode\('vue-material-column'\)/)
assert.match(panel, /const propertyFormCodes = props\.columnOnly/)
assert.match(panel, /filters: \{ code: propertyFormCodes, enabled: true \}/)
assert.match(panel, /!isRecord\(row\) \|\| typeof row\.code !== 'string'/)
assert.match(panel, /shape\?\.type === 'vue-material'/)
assert.match(panel, /列属性/)
assert.match(panel, /handleColumnModelUpdate/)
assert.match(panel, /updateMaterialColumns\(source, field, replaceColumns\)/)
assert.match(panel, /添加列/)
assert.match(panel, /删除列/)
assert.match(panel, /添加子列/)
assert.match(section, /@click="selectMaterialColumn\(\$event, cell\.field\)"/)
assert.match(section, /enlearn:material-column-select/)
assert.match(section, /props\.editor\.select\(parent\.id\)/)
assert.match(section, /vue-material-table-column-drag/)
assert.match(section, /moveMaterialColumn/)
assert.match(canvas, /\[data-material-column-field\]/)
assert.match(canvas, /enlearn:material-column-select/)
assert.match(operations, /addMaterialChildColumn/)
assert.match(operations, /removeMaterialColumn/)
assert.match(operations, /areMaterialColumnsSiblings/)
assert.match(panel, /columnOnly\?: boolean/)
assert.match(panel, /props\.columnOnly && showMaterialColumnTab/)
assert.match(tldrawVue, /syncDesignerTabToSelection/)
assert.match(tldrawVue, /activeDesignerTab\.value = 'properties'/)
assert.match(tldrawVue, /id: 'columnProperties'/)
assert.match(tldrawVue, /:column-only="true"/)
assert.match(tldrawVue, /LowCodeFormPanel v-if="editor" :editor="editor"/)
assert.match(tldrawVue, /scope: 'session'/)
assert.match(migration, /'print-designer\.property\.vue-material-column'/)
assert.match(migration, /'title', '物料表格列属性'/)
assert.match(prefetch, /print-designer\.property\.vue-material-column/)
assert.match(guides, /preferGuideSnap\?: GuideSnapPreference/)
assert.match(guides, /preferredGuideAxes\.has\('x'\)/)
assert.match(resizing, /guide-snap:material-column:/)

console.log('material column property tab and persistence regression checks passed')
