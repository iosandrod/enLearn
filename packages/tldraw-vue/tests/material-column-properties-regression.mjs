import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const [panel, section, tldrawVue, migration, prefetch] = await Promise.all([
	readFile(new URL('src/components/LowCodeFormPanel.vue', root), 'utf8'),
	readFile(new URL('src/components/shapes/VueMaterialSectionShapeNode.vue', root), 'utf8'),
	readFile(new URL('src/TldrawVue.vue', root), 'utf8'),
	readFile(new URL('../../../supabase/migrations/20261002120000_print_material_column_property_form.sql', import.meta.url), 'utf8'),
	readFile(new URL('../../../frontend/utils/printDesignerLowCode.ts', import.meta.url), 'utf8'),
])

assert.match(panel, /materialColumnFormCode = propertyFormCode\('vue-material-column'\)/)
assert.match(panel, /const propertyFormCodes = props\.columnOnly/)
assert.match(panel, /filters: \{ code: propertyFormCodes, enabled: true \}/)
assert.match(panel, /!isRecord\(row\) \|\| typeof row\.code !== 'string'/)
assert.match(panel, /shape\?\.type === 'vue-material'/)
assert.match(panel, /列属性/)
assert.match(panel, /handleColumnModelUpdate/)
assert.match(panel, /replaceColumns\(table\.columns\)/)
assert.match(section, /@click="selectMaterialColumn\(\$event, cell\.field\)"/)
assert.match(section, /enlearn:material-column-select/)
assert.match(section, /props\.editor\.select\(parent\.id\)/)
assert.match(panel, /columnOnly\?: boolean/)
assert.match(panel, /props\.columnOnly && showMaterialColumnTab/)
assert.match(tldrawVue, /syncDesignerTabToSelection/)
assert.match(tldrawVue, /activeDesignerTab\.value = 'properties'/)
assert.match(tldrawVue, /id: 'columnProperties'/)
assert.match(tldrawVue, /:column-only="true"/)
assert.match(tldrawVue, /scope: 'session'/)
assert.match(migration, /'print-designer\.property\.vue-material-column'/)
assert.match(migration, /'title', '物料表格列属性'/)
assert.match(prefetch, /print-designer\.property\.vue-material-column/)

console.log('material column property tab and persistence regression checks passed')
