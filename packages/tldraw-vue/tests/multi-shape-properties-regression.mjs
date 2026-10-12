import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { computed, nextTick, ref, watch } from 'vue'
import { parse, compileScript, compileTemplate } from 'vue/compiler-sfc'

const filename = new URL('../src/components/LowCodeFormPanel.vue', import.meta.url)
const source = await readFile(filename, 'utf8')
const { descriptor, errors } = parse(source, { filename: filename.pathname })
assert.deepEqual(errors, [])
const compiled = compileScript(descriptor, { id: 'multi-shape-properties' })
const template = compileTemplate({
	source: descriptor.template.content,
	filename: filename.pathname,
	id: 'multi-shape-properties',
	compilerOptions: { bindingMetadata: compiled.bindings },
})
assert.deepEqual(template.errors, [])
assert.match(template.code, /onFieldChange:.*handleMultiShapeFieldChange/)
assert.match(template.code, /onPointerdownCapture:.*handleMultiShapeFieldInteraction/)
assert.match(template.code, /onKeydownCapture:.*handleMultiShapeFieldInteraction/)

// Execute the production handlers and selection watcher, including the real dimension conversion.
const script = ts.createSourceFile('panel.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true)
const functions = [
	'handleModelUpdate', 'handleMultiShapeFieldInteraction', 'handleMultiShapeFieldChange',
	'syncFormModel', 'applyMultiShapeFormModel', 'normalizeBasePropertyFieldName',
	'normalizePropertyFormModel', 'createPropsDescriptor', 'getPropsPartial', 'getCommonPartial',
	'getProps', 'toFiniteNumber', 'getFiniteFormNumber', 'clampNumber',
	'degreesToRadians', 'radiansToDegrees', 'getOptionValue',
]
const nodes = script.statements.filter((node) =>
	(ts.isFunctionDeclaration(node) && functions.includes(node.name?.text)) ||
	(ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) =>
		['formModel', 'multiShapeEditedFields', 'commonModelKeys'].includes(declaration.name.getText(script))
	)) ||
	(ts.isExpressionStatement(node) && (
		/^watch\(\s*\[\s*selectedShapeIds,/.test(node.getText(script)) ||
		/^watch\(\s*formModel,/.test(node.getText(script))
	))
)
for (const name of functions) {
	assert.ok(nodes.some((node) => ts.isFunctionDeclaration(node) && node.name?.text === name), name)
}
const handlers = ts.transpileModule(nodes.map((node) => node.getText(script)).join('\n'), {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText

class FieldElement {
	constructor(field) { this.field = field }
	closest() { return this }
	getAttribute() { return this.field }
}
const original = Array.from({ length: 5 }, (_, index) => ({
	id: `shape:${index}`, type: 'vue-text', x: 10 + index, y: 20 + index,
	rotation: 0, opacity: 1, isLocked: false,
	props: { w: 240 + index * 10, h: 96 + index, text: `Text ${index}`, color: 'black', showBorder: true },
}))
const shapes = new Map(original.map((shape) => [shape.id, structuredClone(shape)]))
const selectedShapeIds = ref([])
const selectedShape = computed(() => selectedShapeIds.value.length === 1
	? shapes.get(selectedShapeIds.value[0]) : null)
const multiSelectedShapeType = computed(() => {
	const selected = selectedShapeIds.value.map((id) => shapes.get(id))
	return selected.length > 1 && selected.every((shape) => shape.type === selected[0].type)
		? selected[0].type : null
})
const isMultiShapeFormActive = computed(() => multiSelectedShapeType.value !== null)
const isCanvasFormActive = computed(() => selectedShapeIds.value.length === 0)
const activeSchema = ref({ fields: [
	{ field: 'w', component: 'lc-number-input' }, { field: 'h', component: 'lc-number-input' },
	{ field: 'text', component: 'vxe-input' }, { field: 'color', component: 'vxe-select' },
	{ field: 'showBorder', component: 'vxe-switch' },
] })
const writes = []
const hydrations = []
let readonly = false
const editor = {
	getShape: (id) => shapes.get(id),
	getIsReadonly: () => readonly,
	run: (callback) => callback(),
	updateShape: (patch) => {
		writes.push(structuredClone(patch))
		const shape = shapes.get(patch.id)
		shapes.set(shape.id, { ...shape, ...patch, props: { ...shape.props, ...patch.props } })
	},
}
const context = vm.createContext({
	ref, computed, watch, Element: FieldElement,
	props: { editor, workspaceRevision: 0, columnOnly: false },
	selectedShapeIds, selectedShape, multiSelectedShapeType, isMultiShapeFormActive, isCanvasFormActive,
	activeSchema, workspaceCamera: ref({ x: 0, y: 0, z: 1 }), imageSourceError: ref(''),
	isVueTableCellShape: () => false,
	vueBoxPropertyRegistry: { has: () => false }, biChartPropertyRegistry: { has: () => false },
	colorOptions: [{ value: 'black' }, { value: 'red' }],
	propertyFormCode: (type) => type,
	getWorkspaceFormModel: () => ({}),
	getCommonModel: (shape) => ({ shapeId: shape.id }),
	getFlatPropsModel: (shape) => ({ ...shape.props }),
	createPropertyFormModel: () => ({}),
	usesUploadedImageSource: () => true,
	readImageFileId: (value) => value,
	hydrateUploadedImageShape: (...args) => hydrations.push(args),
})
context.getShapeFormDescriptor = (type) => context.createPropsDescriptor(type, type)
context.activeDescriptor = computed(() => context.getShapeFormDescriptor(multiSelectedShapeType.value ?? selectedShape.value?.type))
vm.runInContext(handlers, context)

function interact(field, trusted = true) {
	context.handleMultiShapeFieldInteraction({ isTrusted: trusted, target: new FieldElement(field) })
}
function change(field, value, previousValue = undefined) {
	context.handleMultiShapeFieldChange({
		field: activeSchema.value.fields.find((item) => item.field === field), value, previousValue,
		// Even a contaminated complete model must never change unrelated fields.
		values: { w: '', h: null, text: '', color: 'red', showBorder: false },
	})
}
async function select(ids) {
	selectedShapeIds.value = ids
	await nextTick()
}
function snapshot() { return [...shapes.values()].map((shape) => structuredClone(shape)) }

for (let count = 2; count <= 5; count++) {
	await select(original.slice(0, count).map((shape) => shape.id))
	context.handleModelUpdate({ w: '', h: null, color: 'red', showBorder: false })
	change('w', '')
	change('h', null)
	change('color', 'red')
	change('showBorder', false)
	await nextTick()
	assert.deepEqual(snapshot(), original, `Selecting ${count} nodes must preserve every attribute`)
}
assert.equal(writes.length, 0)
interact('w', false)
change('w', 400)
assert.equal(writes.length, 0, 'Synthetic initialization events cannot authorize batch edits')
interact('w')
for (const value of ['', '  ', null, undefined, NaN, Infinity, 'invalid', 0, -1]) change('w', value)
assert.equal(writes.length, 0, 'Empty or invalid dimensions cannot shrink selected nodes')
change('w', '400')
assert.equal(writes.length, 5)
for (const [index, shape] of snapshot().entries()) {
	assert.deepEqual(shape, { ...original[index], props: { ...original[index].props, w: 400 } })
}
change('w', 400, 400)
assert.equal(writes.length, 5, 'Repeated unchanged values must not create batch writes')
change('color', 'red')
assert.equal(writes.length, 5, 'Editing width cannot authorize initialization changes to color')
interact('showBorder')
change('showBorder', false, true)
assert.ok(snapshot().every((shape) => shape.props.showBorder === false))
interact('text')
change('text', '', 'previous text')
assert.ok(snapshot().every((shape) => shape.props.text === ''), 'Intentional text clearing still works')

await select(original.slice(1, 5).map((shape) => shape.id))
const beforeSwitch = snapshot()
change('w', 500)
assert.deepEqual(snapshot(), beforeSwitch, 'A new selection must discard permission from the previous form')
interact('w')
readonly = true
change('w', 500)
assert.deepEqual(snapshot(), beforeSwitch, 'Readonly editors cannot be changed')
readonly = false
context.props.columnOnly = true
change('w', 500)
assert.deepEqual(snapshot(), beforeSwitch, 'Column forms cannot write batch node properties')
context.props.columnOnly = false

await select([original[0].id])
context.handleModelUpdate({ shapeId: original[0].id, w: 333 })
assert.equal(shapes.get(original[0].id).props.w, 333, 'Single node editing remains functional')

shapes.get(original[1].id).type = 'vue-image'
await select(original.slice(0, 2).map((shape) => shape.id))
const beforeMixedSelection = snapshot()
interact('w')
change('w', 500)
context.handleModelUpdate({ w: 500 })
assert.deepEqual(snapshot(), beforeMixedSelection, 'Mixed node types must not receive batch writes')

shapes.forEach((shape) => { shape.type = 'vue-image'; shape.props.src = 'original-file' })
await select(original.slice(0, 4).map((shape) => shape.id))
interact('w')
change('w', 450)
assert.equal(hydrations.length, 0, 'Editing image width must not reload or clear image sources')
activeSchema.value.fields.push({ field: 'src', component: 'vxe-upload' })
await nextTick()
interact('src')
change('src', 'new-file')
assert.equal(hydrations.length, 4, 'Explicit source edits still hydrate every selected image')

console.log('Multi-selection initialization, isolated edits, invalid dimensions, selection changes, and image sources passed')
