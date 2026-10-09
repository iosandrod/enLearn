import assert from 'node:assert/strict'
import {
	getMaterialColumns,
	updateMaterialNodeColumns,
	moveMaterialColumn,
	removeMaterialColumn,
} from '../src/editor/materialColumnOperations.ts'
import { cloneVueTemplateDocument, cloneVueTemplateRecord } from '../src/editor/templateStore.ts'

const source = {
	type: 'inline',
	detailTables: [{ field: 'items', columns: [{ field: 'sku', title: '物料', width: 100 }] }],
}
const originalSource = JSON.stringify(source)
const node = { id: 'shape:material', type: 'vue-material', props: { dataSourceField: 'items' } }
const editor = {
	updateShape(partial) {
		assert.equal(partial.id, node.id)
		node.props = { ...node.props, ...partial.props }
	},
}

// Legacy nodes inherit definition columns until their own configuration exists.
const columns = getMaterialColumns(source, 'items', node.props.columns)
const draft = [{ ...columns[0], type: 'qrCode', props: { margin: 4 }, width: 160 }, {
	field: 'codes', title: '编码', children: [{ field: 'ean', title: '条码', type: 'barCode' }],
}]
updateMaterialNodeColumns(editor, node, draft)
draft[0].props.margin = 99
assert.equal(node.props.columns[0].props.margin, 4)
assert.equal(JSON.stringify(source), originalSource)

// Template serialization must preserve node columns even with no workspace source.
const content = {
	pages: [{ id: 'page:one', name: '第一页', content: { shapes: [node], bindings: [], assets: [], rootShapeIds: [node.id], schema: {} } }],
	currentPageId: 'page:one',
}
const saved = cloneVueTemplateRecord({ id: 'template:one', name: '物料', createdAt: 1, updatedAt: 1, content })
const restored = cloneVueTemplateDocument(JSON.parse(JSON.stringify(saved.content)))
const restoredNode = restored.pages[0].content.shapes[0]
const restoredColumns = getMaterialColumns(undefined, 'items', restoredNode.props.columns)
assert.equal(restoredColumns[0].type, 'qrCode')
assert.equal(restoredColumns[0].width, 160)
assert.equal(restoredColumns[1].children[0].type, 'barCode')

// Reloading or changing a shared definition cannot overwrite saved node columns.
source.detailTables[0].columns[0].width = 600
assert.equal(getMaterialColumns(source, 'items', restoredNode.props.columns)[0].width, 160)
assert.deepEqual(getMaterialColumns(source, 'items', []), [])

const moved = moveMaterialColumn(restoredColumns, 'codes', 'sku', 'before')
assert.equal(moved[0].field, 'codes')
updateMaterialNodeColumns(editor, node, moved)
const removed = removeMaterialColumn(node.props.columns, 'sku')
updateMaterialNodeColumns(editor, node, removed.columns)
assert.deepEqual(node.props.columns.map(column => column.field), ['codes'])
assert.equal(restoredColumns.length, 2)
console.log('Material node column configuration persists through template save/load and isolated edits.')
