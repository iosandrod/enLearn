import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { parse, compileScript } from 'vue/compiler-sfc'
import { computed } from 'vue'
import { createServer } from 'vite'

// The editor's state package is vendored source rather than a Node dependency.
const stateLoader = await createServer({ configFile: false, server: { watch: null, hmr: false } })
let atom, react
try {
	;[{ atom }, { react }] = await Promise.all([
		stateLoader.ssrLoadModule('/packages/state/src/lib/Atom.ts'),
		stateLoader.ssrLoadModule('/packages/state/src/lib/EffectScheduler.ts'),
	])
} finally {
	await stateLoader.close()
}

// Exercise the actual shape and resize code without loading the browser editor.
function compile(path) {
	return compileSource(readFileSync(new URL(path, import.meta.url), 'utf8'), path)
}

function compileSource(source, path) {
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
	createBindingId: () => `binding:auto${++id}`,
	vueMaterialDefaultProps: {}, vueMaterialDefaultSize: { w: 500 }, vueMaterialRowDefaults: {},
	baseProps: { defaults: {} }, vueFrameDefaultProps: { w: 200, h: 120 },
}
vm.runInNewContext(compile('../src/editor/extensions/material/vueMaterialShape.ts'), context)
const api = context.exports
const shapes = new Map()
const bindings = new Map()
const assets = new Map()
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
	getBindingsInvolvingShape(id) { return [...bindings.values()].filter(b => b.fromId === id || b.toId === id) },
	createBindings(partials) { partials.forEach(p => bindings.set(p.id, p)) },
	getAsset(id) { return assets.get(id) },
	createAssets(partials) { partials.forEach(p => assets.set(p.id, p)) },
	deleteShapes(ids) {
		assert.equal(this.ignoreShapeLock, true, 'Mode switches must also remove locked containers')
		const descendants = this.getShapeAndDescendantIds(ids)
		for (const id of descendants) shapes.delete(id)
		for (const binding of bindings.values()) {
			if (descendants.has(binding.fromId) || descendants.has(binding.toId)) bindings.delete(binding.id)
		}
	},
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
		for (const shapeId of [section.id, containerId, textId]) {
			assert.equal(api.isVueMaterialShapeVisible(editor, shapeId), false, `${zone} must hide its entire subtree`)
		}
		editor.updateShape({ id: textId, props: { text: 'blocked edit' } })
		assert.equal(editor.getShape(textId).props.text, zone, 'Hidden content must reject edits')
		editor.updateShape({ id: materialId, meta: { [visibilityKey]: true } })
		api.normalizeVueMaterialSections(editor, materialId)
		assert.equal(editor.getShape(containerId).isLocked, false)
		assert.equal(editor.getShape(textId).isLocked, false)
		assert.equal(api.isVueMaterialShapeVisible(editor, textId), true, 'Showing a region must restore child visibility')
		assert.equal(editor.getShape(textId).x, 8)
		assert.equal(editor.getShape(textId).y, 12)
		assert.equal(editor.getShape('shape:body-child').isLocked, true, 'Table body locks must remain unchanged')
	}
}

// Mount the real canvas wrapper before reparenting a shape. A getter based on
// its initial props has no store dependency while that shape is on the page.
const visibilityRecords = atom('material region visibility regression', new Map(shapes))
const visibilityEditor = {
	getShape: id => visibilityRecords.get().get(id),
	getCurrentPageId: () => 'page:main',
	getShapePageTransform: () => ({}),
}
function updateVisibilityShape(partial) {
	const records = new Map(visibilityRecords.get())
	const previous = records.get(partial.id)
	records.set(partial.id, { ...previous, ...partial, meta: { ...previous?.meta, ...partial.meta } })
	visibilityRecords.set(records)
}
const mountedShape = { id: 'shape:mounted-footer-text', type: 'vue-text', parentId: 'page:main', opacity: 0.4, props: {} }
updateVisibilityShape(mountedShape)
const wrapperPath = '../src/components/VueShapeWrapper.vue'
const wrapper = parse(readFileSync(new URL(wrapperPath, import.meta.url), 'utf8'), { filename: wrapperPath })
const subscriptions = []
const wrapperContext = {
	exports: {}, _defineComponent: options => options, computed,
	Mat: { toCssString: () => '' }, getVueShapeComponent: () => 'div',
	isVueMaterialShapeVisible: api.isVueMaterialShapeVisible,
	useEditorValue(name, getter) {
		const value = { value: getter() }
		subscriptions.push(react(name, () => { value.value = getter() }))
		return value
	},
}
vm.runInNewContext(compileSource(compileScript(wrapper.descriptor, { id: 'material-visibility' }).content, wrapperPath), wrapperContext)
const mounted = wrapperContext.exports.default.setup({ editor: visibilityEditor, shape: mountedShape }, { expose() {} })
assert.equal(mounted.isVisible.value, true)
const pageFooter = api.getVueMaterialSections(editor, materialId).find(s => s.props.zone === 'pageFooter')
updateVisibilityShape({ id: mountedShape.id, parentId: 'shape:pageFooter-container' })
for (let cycle = 0; cycle < 2; cycle++) {
	updateVisibilityShape({ id: materialId, meta: { showTableFooter: false, showPageFooter: true } })
	assert.equal(mounted.isVisible.value, true, 'Hiding the table footer must not hide the page footer')
	updateVisibilityShape({ id: materialId, meta: { showPageFooter: false } })
	assert.equal(mounted.isVisible.value, false, 'A reparented nested page-footer node must react to hide')
	assert.equal(api.isVueMaterialShapeVisible(visibilityEditor, pageFooter.id), false)
	updateVisibilityShape({ id: materialId, meta: { showTableFooter: true } })
	assert.equal(mounted.isVisible.value, false, 'Showing the table footer must leave the page footer hidden')
	updateVisibilityShape({ id: materialId, meta: { showPageFooter: true } })
	assert.equal(mounted.isVisible.value, true)
	assert.equal(visibilityEditor.getShape(mountedShape.id).opacity, 0.4, 'Hide/show must preserve custom opacity')
}
updateVisibilityShape({ id: materialId, meta: { showPageFooter: false } })
updateVisibilityShape({ id: mountedShape.id, parentId: 'page:main' })
assert.equal(mounted.isVisible.value, true, 'Moving out of a hidden region must restore visibility')
subscriptions.forEach(stop => stop())

// Switching to a table removes the whole frame tree and persists a detached
// snapshot on the material. Restore after serialization, including copied nodes.
editor.updateShape({ id: materialId, props: { containerList: true } })
api.normalizeVueMaterialSections(editor, materialId)
const frame = api.getVueMaterialContainerFrame(editor, body.id)
assert.ok(frame)
editor.updateShape({ id: frame.id, x: 23, y: 31, isLocked: true, props: { w: 175, h: 110 } })
editor.createShapes([
	{ id: 'shape:inner-group', type: 'group', parentId: frame.id, isLocked: true, props: {} },
	{ id: 'shape:inner-text', type: 'vue-text', parentId: 'shape:inner-group', x: 7, y: 9, props: { text: '缓存内容' } },
	{ id: 'shape:inner-arrow', type: 'vue-arrow', parentId: frame.id, props: {} },
	{ id: 'shape:inner-image', type: 'vue-image', parentId: frame.id, props: { assetId: 'asset:inner-image' } },
])
editor.createAssets([{ id: 'asset:inner-image', type: 'image', props: { src: 'https://example.com/image.png' } }])
editor.createBindings([{ id: 'binding:inner', type: 'arrow', fromId: 'shape:inner-arrow', toId: 'shape:inner-text', props: { terminal: 'end' } }])
editor.updateShape({ id: materialId, props: { containerList: false } })
api.normalizeVueMaterialSections(editor, materialId)
for (const id of [frame.id, 'shape:inner-group', 'shape:inner-text', 'shape:inner-arrow', 'shape:inner-image']) {
	assert.equal(editor.getShape(id), undefined, 'Cached frames and children must leave the canvas')
}
assert.equal(bindings.size, 0)
const saved = JSON.stringify(editor.getShape(materialId).meta.__materialContainerCache)
assert.equal(JSON.parse(saved).shapes.length, 5)
assert.equal(JSON.parse(saved).assets[0].id, 'asset:inner-image')
api.normalizeVueMaterialSections(editor, materialId)
assert.equal(JSON.stringify(editor.getShape(materialId).meta.__materialContainerCache), saved,
	'Normalizing table mode again must not erase the cache')
assert.ok(editor.getShape(materialId).meta.__materialSectionHeights, 'Caching must retain section metadata')

// A reloaded template or a copied material retains its cache via JSON metadata.
shapes.set(materialId, JSON.parse(JSON.stringify(editor.getShape(materialId))))
assets.clear() // Loading the saved table does not export assets from cached shapes.
const copyId = 'shape:material-copy'
editor.createShapes(api.createVueMaterialShapePartials({ id: copyId, rect: { x: 0, y: 0, w: 500, h: 500 }, sectionIds: [] }))
editor.updateShape({ id: copyId, meta: { __materialContainerCache: JSON.parse(saved) } })
for (const nodeId of [materialId, copyId]) {
	editor.updateShape({ id: nodeId, props: { containerList: true } })
	api.normalizeVueMaterialSections(editor, nodeId)
	const tableBody = api.getVueMaterialSections(editor, nodeId).find(s => s.props.zone === 'tableBody')
	const restored = api.getVueMaterialContainerFrame(editor, tableBody.id)
	assert.ok(restored)
	assert.notEqual(restored.id, frame.id)
	assert.equal(restored.x, 23)
	assert.equal(restored.y, 31)
	assert.equal(restored.props.w, 175)
	assert.equal(restored.props.h, 110)
	assert.equal(restored.isLocked, true)
	const ids = editor.getShapeAndDescendantIds([restored.id])
	assert.equal(ids.size, 5)
	assert.equal(editor.getAsset('asset:inner-image').props.src, 'https://example.com/image.png')
	const text = [...ids].map(id => editor.getShape(id)).find(s => s.type === 'vue-text')
	assert.equal(text.props.text, '缓存内容')
	assert.equal(text.x, 7)
	assert.equal(text.y, 9)
	assert.equal(editor.getShape(text.parentId).parentId, restored.id)
	assert.ok([...bindings.values()].some(b => b.toId === text.id && ids.has(b.fromId)))
	assert.equal(editor.getShape(nodeId).meta.__materialContainerCache, null, 'Restoration consumes the cache')
	api.normalizeVueMaterialSections(editor, nodeId)
	assert.equal(editor.getShapeAndDescendantIds([restored.id]).size, 5, 'Layout updates must not duplicate children')
}
assert.equal(bindings.size, 2, 'Copied nodes must restore independent internal bindings')

// Legacy transparent frames and manually placed frames must also be removed.
for (const generated of [true, false]) {
	const currentFrame = api.getVueMaterialContainerFrame(editor, body.id)
	editor.run(() => editor.updateShape({
		id: currentFrame.id, opacity: generated ? 0 : 0.4,
		meta: { __materialContainerListFrame: generated },
	}), { ignoreShapeLock: true })
	editor.updateShape({ id: materialId, props: { containerList: false } })
	api.normalizeVueMaterialSections(editor, materialId)
	assert.equal(api.getVueMaterialContainerFrame(editor, body.id), undefined)
	editor.updateShape({ id: materialId, props: { containerList: true } })
	api.normalizeVueMaterialSections(editor, materialId)
	const restored = api.getVueMaterialContainerFrame(editor, body.id)
	assert.equal(restored.opacity, generated ? 1 : 0.4)
	assert.equal(editor.getShapeAndDescendantIds([restored.id]).size, 5)
}
assert.equal(editor.getShape('shape:body-child').isLocked, true, 'Switching must retain unrelated body content')

const filename = '../src/components/LowCodeFormPanel.vue'
const parsed = parse(readFileSync(new URL(filename, import.meta.url), 'utf8'), { filename })
assert.equal(parsed.errors.length, 0)
compileScript(parsed.descriptor, { id: 'material-height-regression' })
console.log('Material height and container mode regression passed: layout, locks, region visibility, reactive page footer, frame removal, cache serialization, restore, copied nodes, internal bindings and property-panel compilation.')
