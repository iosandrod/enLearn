import assert from 'node:assert/strict'
import {
	getMaterialColumns,
	getVisibleMaterialColumns,
	updateVisibleMaterialColumnWidths,
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

const visibilityColumns = [
	{ field: 'id', title: 'ID', width: 70, visible: false },
	{ field: 'sku', title: '编码', width: 100 },
	{ field: 'group', title: '分组', children: [
		{ field: 'price', title: '单价', width: 80, visible: false },
		{ field: 'qty', title: '数量', width: 120 },
	] },
	{ field: 'hiddenGroup', title: '隐藏分组', visible: false, children: [
		{ field: 'secret', title: '隐藏子列', width: 60 },
	] },
	{ field: 'emptyGroup', title: '无显示子列', children: [
		{ field: 'disabled', title: '隐藏子列', visible: false },
	] },
]
const originalVisibilityColumns = JSON.stringify(visibilityColumns)
assert.deepEqual(getVisibleMaterialColumns(visibilityColumns).map(column => column.field), ['sku', 'group'])
assert.deepEqual(getVisibleMaterialColumns(visibilityColumns)[1].children.map(column => column.field), ['qty'])
const resizedColumns = updateVisibleMaterialColumnWidths(visibilityColumns, [150, 200])
assert.equal(resizedColumns[0].width, 70, 'Resizing displayed columns preserves hidden widths.')
assert.equal(resizedColumns[1].width, 150)
assert.equal(resizedColumns[2].children[0].width, 80)
assert.equal(resizedColumns[2].children[1].width, 200)
assert.equal(resizedColumns[3].children[0].width, 60)
assert.equal(resizedColumns.length, visibilityColumns.length, 'Resizing does not remove hidden definitions.')
assert.equal(JSON.stringify(visibilityColumns), originalVisibilityColumns, 'Display filtering and resizing do not mutate the input.')
assert.deepEqual(getVisibleMaterialColumns([{ field: 'id', title: 'ID', visible: false }]), [])
resizedColumns[0] = { ...resizedColumns[0], visible: true }
assert.equal(getVisibleMaterialColumns(resizedColumns)[0].field, 'id', 'Re-enabling visibility restores the column.')
console.log('Material node column configuration persists through template save/load and isolated edits.')
