import assert from 'node:assert/strict'
import { createPrintDetailColumnsModel, normalizePrintDetailColumns } from '../src/editor/printDetailColumns.ts'

const columns = [{ field: 'group', title: '分组', children: [{
	field: 'sku', title: '编码', width: 120, visible: false,
	editRender: { name: 'input', props: { clearable: true } },
	formatter: { type: 'text' }, props: { color: 'red' },
}] }]
const original = JSON.stringify(columns)
const draft = createPrintDetailColumnsModel(columns)
assert.equal(draft[0].children[0].editType, 'input')
assert.equal(draft[0].children[0].visible, false)
draft[0].children[0].editType = 'number'
draft[0].children[0].width = '160'
draft[0].children[0].__id = 'temporary'
draft[0].children[0].props.color = 'blue'
const saved = normalizePrintDetailColumns(draft)
assert.equal(saved[0].children[0].width, 160)
assert.deepEqual(saved[0].children[0].editRender, { name: 'number', props: { clearable: true } })
assert.equal(saved[0].children[0].__id, undefined)
assert.equal(saved[0].children[0].editType, undefined)
assert.deepEqual(saved[0].children[0].formatter, { type: 'text' })
assert.equal(JSON.stringify(columns), original, 'Editing a draft must not mutate the data source or another material.')
assert.deepEqual(normalizePrintDetailColumns([]), [])
assert.throws(() => normalizePrintDetailColumns([{ field: '', title: '' }]), /字段名/)
assert.throws(() => normalizePrintDetailColumns([{ field: 'sku', width: -1 }]), /正数/)
const incomplete = normalizePrintDetailColumns([{ field: '', title: '', width: '-' }], false)
assert.equal(incomplete[0].field, '')
assert.equal(incomplete[0].title, '')
assert.equal(incomplete[0].width, undefined, 'An in-progress input must not persist NaN in the shape store.')
console.log('Print column draft isolation, nested options, serialization and live incomplete values passed.')
