import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { parse, compileScript } from 'vue/compiler-sfc'

// Exercise the actual shape and resize code without loading the browser editor.
function compile(path) {
	let source = readFileSync(new URL(path, import.meta.url), 'utf8')
	const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
	for (const statement of [...ast.statements].reverse()) {
		if (ts.isImportDeclaration(statement)) {
			source = source.slice(0, statement.pos) + source.slice(statement.end)
		}
	}
	return ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
	}).outputText
}

class Vec {
	constructor(x, y) { this.x = x; this.y = y }
	rot() { return this }
	add(point) { this.x += point.x; this.y += point.y; return this }
}
const resizeContext = { exports: {}, Vec }
vm.runInNewContext(compile('../packages/editor/src/lib/editor/shapes/shared/resizeBox.ts'), resizeContext)
let id = 0
const context = {
	exports: {}, BaseBoxShapeUtil: class {},
	vueMaterialPropertyRegistry: { validators: {} }, vueMaterialSectionPropertyRegistry: { validators: {} },
	resizeBox: resizeContext.exports.resizeBox, createShapeId: () => `shape:auto${++id}`,
	vueMaterialDefaultProps: {}, vueMaterialDefaultSize: { w: 500 }, vueMaterialRowDefaults: {},
	baseProps: { defaults: {} }, vueFrameDefaultProps: {},
}
vm.runInNewContext(compile('../src/editor/extensions/material/vueMaterialShape.ts'), context)
const api = context.exports
const shapes = new Map()
const editor = {
	getShape: id => shapes.get(id),
	getSortedChildIdsForParent: parentId => [...shapes.values()].filter(s => s.parentId === parentId).map(s => s.id),
	getShapeAndDescendantIds(ids) {
		const result = new Set(ids)
		for (const id of result) this.getSortedChildIdsForParent(id).forEach(childId => result.add(childId))
		return result
	},
	run(callback, options = {}) {
		const previous = this.ignoreShapeLock
		this.ignoreShapeLock = options.ignoreShapeLock ?? previous
		try { callback() } finally { this.ignoreShapeLock = previous }
	},
	updateShape(partial) {
		const shape = shapes.get(partial.id)
		if (!this.ignoreShapeLock) {
			if (shape.isLocked && partial.isLocked !== false) return
			if (!shape.isLocked) {
				let parent = shapes.get(shape.parentId)
				while (parent) {
					if (parent.isLocked) return
					parent = shapes.get(parent.parentId)
				}
			}
		}
		shapes.set(partial.id, { ...shape, ...partial, props: { ...shape.props, ...partial.props }, meta: { ...shape.meta, ...partial.meta } })
	},
	updateShapes(partials) { partials.forEach(p => this.updateShape(p)) },
	createShapes(partials) { partials.forEach(p => shapes.set(p.id, { meta: {}, isLocked: false, ...p })) },
}
const materialId = 'shape:material'
const partials = api.createVueMaterialShapePartials({ id: materialId, rect: { x: 0, y: 0, w: 500, h: 12 }, sectionIds: [] })
assert.equal(partials[0].props.h, 12)
editor.createShapes(partials)
api.normalizeVueMaterialSections(editor, materialId)
assert.equal(api.getVueMaterialSections(editor, materialId).find(s => s.props.zone === 'tableBody').props.h, 12)

const material = editor.getShape(materialId)
const util = new api.VueMaterialShapeUtil()
util.editor = editor
for (const height of [0, 0.5, 12, 100, 6000]) {
	const resized = util.onResize({ ...material, props: { ...material.props, h: 500 } }, {
		newPoint: { x: 0, y: 0 }, handle: 'bottom', scaleX: 1, scaleY: height / 500,
	})
	assert.ok(resized.props.h === height, `Dragging must retain height ${height}`)
	assert.equal(util.onBeforeUpdate(material, { ...material, props: { ...material.props, h: height } }), undefined)
	api.updateVueMaterialShapeLayout(editor, materialId, { x: 0, y: 0, w: 500, h: height })
	assert.equal(editor.getShape(materialId).props.h, height)
}

editor.updateShape({ id: materialId, meta: { showPageHeader: true } })
api.normalizeVueMaterialSections(editor, materialId)
const headerId = api.getVueMaterialSections(editor, materialId).find(s => s.props.zone === 'pageHeader').id
for (const height of [2, 0]) {
	editor.updateShape({ id: headerId, props: { h: height } })
	api.normalizeVueMaterialSections(editor, materialId)
	assert.equal(api.getVueMaterialSectionHeightModel(editor, materialId).pageHeaderHeight, height)
	for (const visible of [false, true]) {
		editor.updateShape({ id: materialId, meta: { showPageHeader: visible } })
		api.normalizeVueMaterialSections(editor, materialId)
	}
	assert.equal(editor.getShape(headerId).props.h, height, 'Hide/show must preserve small and zero heights')
}
const sectionUtil = new api.VueMaterialSectionShapeUtil()
sectionUtil.editor = editor
const header = editor.getShape(headerId)
assert.equal(sectionUtil.onBeforeUpdate(header, { ...header, props: { ...header.props, h: 0.5 } }), undefined)

// A hidden region locks nested content even below an already locked container.
// Showing it unlocks all content; other regions and subsequent layout edits
// retain their existing locks, coordinates and values.
const body = api.getVueMaterialSections(editor, materialId).find(s => s.props.zone === 'tableBody')
editor.createShapes([{ id: 'shape:body-child', type: 'vue-text', parentId: body.id, isLocked: true, props: { text: 'body' } }])
for (const zone of ['pageHeader', 'tableHeader', 'tableFooter', 'pageFooter']) {
	const section = api.getVueMaterialSections(editor, materialId).find(s => s.props.zone === zone)
	const visibilityKey = `show${zone[0].toUpperCase()}${zone.slice(1)}`
	editor.updateShape({ id: materialId, meta: { [visibilityKey]: true } })
	api.normalizeVueMaterialSections(editor, materialId)
	const containerId = `shape:${zone}-container`
	const textId = `shape:${zone}-text`
	editor.createShapes([
		{ id: containerId, type: 'group', parentId: section.id, isLocked: true, props: {} },
		{ id: textId, type: 'vue-text', parentId: containerId, x: 8, y: 12, props: { text: zone } },
	])
	api.normalizeVueMaterialSections(editor, materialId)
	assert.equal(editor.getShape(containerId).isLocked, true, 'Layout edits must preserve visible manual locks')
	for (let cycle = 0; cycle < 2; cycle++) {
		editor.updateShape({ id: materialId, meta: { [visibilityKey]: false } })
		api.normalizeVueMaterialSections(editor, materialId)
		assert.equal(editor.getShape(containerId).isLocked, true)
		assert.equal(editor.getShape(textId).isLocked, true, 'Nested descendants must lock despite locked ancestors')
		editor.updateShape({ id: textId, props: { text: 'blocked edit' } })
		assert.equal(editor.getShape(textId).props.text, zone, 'Hidden content must reject edits')
		editor.updateShape({ id: materialId, meta: { [visibilityKey]: true } })
		api.normalizeVueMaterialSections(editor, materialId)
		assert.equal(editor.getShape(containerId).isLocked, false)
		assert.equal(editor.getShape(textId).isLocked, false)
		assert.equal(editor.getShape(textId).x, 8)
		assert.equal(editor.getShape(textId).y, 12)
		assert.equal(editor.getShape('shape:body-child').isLocked, true, 'Table body locks must remain unchanged')
	}
}

const filename = '../src/components/LowCodeFormPanel.vue'
const parsed = parse(readFileSync(new URL(filename, import.meta.url), 'utf8'), { filename })
assert.equal(parsed.errors.length, 0)
compileScript(parsed.descriptor, { id: 'material-height-regression' })
console.log('Material height regression passed: creation, drag, updates, zero height, hide/show, nested section locking and property-panel compilation.')
