<script setup lang="ts">
import {
	getIndexBetween,
	type Editor,
	type TLParentId,
	type TLShape,
	type TLShapeId,
} from '@tldraw/editor'
import { computed, ref } from 'vue'
import { useEditorValue } from '@/vue/useEditorValue'

const props = defineProps<{
	editor: Editor
}>()

type LayerDropPosition = 'before' | 'inside' | 'after'

interface LayerTreeNode {
	id: TLShapeId
	parentId: TLParentId
	type: string
	name: string
	icon: string
	isLocked: boolean
	canDrag: boolean
	canContainChildren: boolean
	children: LayerTreeNode[]
}

interface VisibleLayerNode extends LayerTreeNode {
	depth: number
	hasChildren: boolean
}

interface LayerDropTarget {
	id: TLShapeId
	position: LayerDropPosition
}

const TYPE_LABELS: Record<string, string> = {
	'vue-box': '几何节点',
	'vue-text': '文字节点',
	'vue-image': '图片节点',
	'vue-line': '直线节点',
	'vue-arrow': '箭头节点',
	'vue-draw': '手绘节点',
	'vue-qr': '二维码节点',
	'vue-barcode': '条形码节点',
	'vue-frame': '画框节点',
	'vue-table': '表格节点',
	'vue-material': '物料节点',
	'vue-material-section': '物料分区',
	group: '分组',
}

const TYPE_ICONS: Record<string, string> = {
	'vue-box': '□',
	'vue-text': 'T',
	'vue-image': '▧',
	'vue-line': '╱',
	'vue-arrow': '→',
	'vue-draw': '〰',
	'vue-qr': '▦',
	'vue-barcode': '▥',
	'vue-frame': '▣',
	'vue-table': '▤',
	'vue-material': '▤',
	'vue-material-section': '▭',
	group: '◇',
}

const collapsedIds = ref<Set<TLShapeId>>(new Set())
const dragArmedId = ref<TLShapeId | null>(null)
const draggedId = ref<TLShapeId | null>(null)
const dropTarget = ref<LayerDropTarget | null>(null)
const isRootDropActive = ref(false)

const layerSnapshot = useEditorValue('layers panel tree', () => ({
	pageId: props.editor.getCurrentPageId(),
	pageName: props.editor.getCurrentPage().name,
	nodes: createLayerTree(props.editor, props.editor.getCurrentPageId()),
}))

const selectedShapeIds = useEditorValue('layers panel selected shapes', () =>
	props.editor.getSelectedShapeIds()
)

const selectedIdSet = computed(() => new Set(selectedShapeIds.value))
const visibleNodes = computed(() => {
	const result: VisibleLayerNode[] = []

	function visit(nodes: LayerTreeNode[], depth: number) {
		for (const node of nodes) {
			result.push({ ...node, depth, hasChildren: node.children.length > 0 })
			if (node.children.length > 0 && !collapsedIds.value.has(node.id)) {
				visit(node.children, depth + 1)
			}
		}
	}

	visit(layerSnapshot.value.nodes, 0)
	return result
})

function createLayerTree(editor: Editor, parentId: TLParentId): LayerTreeNode[] {
	return [...editor.getSortedChildIdsForParent(parentId)]
		.reverse()
		.map((id) => editor.getShape(id))
		.filter((shape): shape is TLShape => Boolean(shape))
		.map((shape) => ({
			id: shape.id,
			parentId: shape.parentId,
			type: shape.type,
			name: getLayerName(shape),
			icon: TYPE_ICONS[shape.type] ?? '◆',
			isLocked: shape.isLocked,
			canDrag: !shape.isLocked && shape.type !== 'vue-material-section',
			canContainChildren: shape.type === 'vue-frame' || shape.type === 'group',
			children: createLayerTree(editor, shape.id),
		}))
}

function getLayerName(shape: TLShape) {
	const shapeProps = shape.props as Record<string, unknown>
	const candidate = [shapeProps.name, shapeProps.text, shapeProps.label].find(
		(value) => typeof value === 'string' && value.trim().length > 0
	)
	if (typeof candidate === 'string') {
		const normalized = candidate.trim().replace(/\s+/g, ' ')
		return normalized.length > 24 ? `${normalized.slice(0, 24)}…` : normalized
	}
	return TYPE_LABELS[shape.type] ?? shape.type
}

function toggleExpanded(id: TLShapeId) {
	const next = new Set(collapsedIds.value)
	if (next.has(id)) next.delete(id)
	else next.add(id)
	collapsedIds.value = next
}

function selectLayer(id: TLShapeId, event: MouseEvent) {
	const nextSelection = event.shiftKey
		? selectedIdSet.value.has(id)
			? selectedShapeIds.value.filter((selectedId) => selectedId !== id)
			: [...selectedShapeIds.value, id]
		: [id]
	props.editor.markHistoryStoppingPoint('selecting layer')
	props.editor.setSelectedShapes(nextSelection)
}

function armDrag(id: TLShapeId, event: PointerEvent) {
	event.stopPropagation()
	dragArmedId.value = id
}

function disarmDrag() {
	if (!draggedId.value) dragArmedId.value = null
}

function onDragStart(event: DragEvent, node: VisibleLayerNode) {
	if (!node.canDrag || dragArmedId.value !== node.id) {
		event.preventDefault()
		return
	}
	draggedId.value = node.id
	dropTarget.value = null
	isRootDropActive.value = false
	if (event.dataTransfer) {
		event.dataTransfer.effectAllowed = 'move'
		event.dataTransfer.setData('text/plain', node.id)
	}
}

function onDragEnd() {
	dragArmedId.value = null
	draggedId.value = null
	dropTarget.value = null
	isRootDropActive.value = false
}

function getDropPosition(event: DragEvent, node: VisibleLayerNode): LayerDropPosition {
	const row = event.currentTarget as HTMLElement
	const rect = row.getBoundingClientRect()
	const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5
	if (node.canContainChildren && ratio >= 0.25 && ratio <= 0.75) return 'inside'
	return ratio < 0.5 ? 'before' : 'after'
}

function onRowDragOver(event: DragEvent, node: VisibleLayerNode) {
	const sourceId = draggedId.value
	if (!sourceId) return
	const position = getDropPosition(event, node)
	if (!canDrop(sourceId, node.id, position)) {
		if (dropTarget.value?.id === node.id) dropTarget.value = null
		return
	}
	event.preventDefault()
	if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
	dropTarget.value = { id: node.id, position }
	isRootDropActive.value = false
}

function onRowDragLeave(event: DragEvent, id: TLShapeId) {
	const row = event.currentTarget as HTMLElement
	if (event.relatedTarget instanceof Node && row.contains(event.relatedTarget)) return
	if (dropTarget.value?.id === id) dropTarget.value = null
}

function onRowDrop(event: DragEvent, node: VisibleLayerNode) {
	event.preventDefault()
	const sourceId = draggedId.value
	const target = dropTarget.value
	if (!sourceId || !target || target.id !== node.id) return
	moveLayer(sourceId, node.id, target.position)
	onDragEnd()
}

function onRootDragOver(event: DragEvent) {
	const sourceId = draggedId.value
	if (!sourceId || !canMoveToParent(sourceId, layerSnapshot.value.pageId)) return
	event.preventDefault()
	if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
	isRootDropActive.value = true
	dropTarget.value = null
}

function onRootDragLeave(event: DragEvent) {
	const root = event.currentTarget as HTMLElement
	if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return
	isRootDropActive.value = false
}

function onRootDrop(event: DragEvent) {
	event.preventDefault()
	const sourceId = draggedId.value
	const pageId = layerSnapshot.value.pageId
	if (!sourceId || !canMoveToParent(sourceId, pageId)) return
	const source = props.editor.getShape(sourceId)
	if (!source || source.parentId === pageId) {
		onDragEnd()
		return
	}
	props.editor.markHistoryStoppingPoint('move layer to page')
	props.editor.reparentShapes([sourceId], pageId)
	onDragEnd()
}

function canDrop(sourceId: TLShapeId, targetId: TLShapeId, position: LayerDropPosition) {
	if (sourceId === targetId) return false
	const source = props.editor.getShape(sourceId)
	const target = props.editor.getShape(targetId)
	if (!source || !target || source.isLocked || source.type === 'vue-material-section') return false
	if (props.editor.getShapeAndDescendantIds([sourceId]).has(targetId)) return false

	if (position === 'inside') {
		return (
			(target.type === 'vue-frame' || target.type === 'group') &&
			canMoveToParent(sourceId, target.id)
		)
	}

	return canMoveToParent(sourceId, target.parentId)
}

function canMoveToParent(sourceId: TLShapeId, nextParentId: TLParentId) {
	const source = props.editor.getShape(sourceId)
	if (!source) return false
	if (source.parentId === nextParentId) return true

	const currentParent = props.editor.getShape(source.parentId as TLShapeId)
	const nextParent = props.editor.getShape(nextParentId as TLShapeId)
	if (
		currentParent?.type === 'vue-material' ||
		currentParent?.type === 'vue-material-section' ||
		nextParent?.type === 'vue-material' ||
		nextParent?.type === 'vue-material-section'
	) {
		return false
	}

	if (
		currentParent &&
		!props.editor
			.getShapeUtil(currentParent)
			.canRemoveChildrenOfType(currentParent, source.type)
	) {
		return false
	}
	if (!nextParent) return true
	if (nextParent.type === 'group') return true
	return props.editor
		.getShapeUtil(nextParent)
		.canReceiveNewChildrenOfType(nextParent, source.type)
}

function moveLayer(sourceId: TLShapeId, targetId: TLShapeId, position: LayerDropPosition) {
	if (!canDrop(sourceId, targetId, position)) return
	const source = props.editor.getShape(sourceId)
	const target = props.editor.getShape(targetId)
	if (!source || !target) return

	if (position === 'inside') {
		props.editor.markHistoryStoppingPoint('move layer into container')
		props.editor.reparentShapes([sourceId], target.id)
		return
	}

	const nextParentId = target.parentId
	const currentVisualOrder = [...props.editor.getSortedChildIdsForParent(nextParentId)].reverse()
	const visualOrder = currentVisualOrder.filter((id) => id !== sourceId)
	const targetIndex = visualOrder.indexOf(targetId)
	if (targetIndex < 0) return
	visualOrder.splice(position === 'before' ? targetIndex : targetIndex + 1, 0, sourceId)
	if (
		source.parentId === nextParentId &&
		visualOrder.every((id, index) => currentVisualOrder[index] === id)
	) {
		return
	}

	const editorOrder = visualOrder.reverse()
	const sourceIndex = editorOrder.indexOf(sourceId)
	const below = sourceIndex > 0 ? props.editor.getShape(editorOrder[sourceIndex - 1]) : undefined
	const above =
		sourceIndex < editorOrder.length - 1
			? props.editor.getShape(editorOrder[sourceIndex + 1])
			: undefined
	const nextIndex = getIndexBetween(below?.index, above?.index)

	if (source.parentId === nextParentId && source.index === nextIndex) return
	props.editor.markHistoryStoppingPoint('reorder layer')
	if (source.parentId === nextParentId) {
		props.editor.updateShapes([{ id: source.id, type: source.type, index: nextIndex }])
	} else {
		props.editor.reparentShapes([source.id], nextParentId, nextIndex)
	}
}

function dropClass(node: VisibleLayerNode) {
	if (dropTarget.value?.id !== node.id) return undefined
	return `is-drop-${dropTarget.value.position}`
}
</script>

<template>
	<section class="layers-panel" aria-label="图层面板">
		<header class="layers-panel__header">
			<div>
				<h2>图层</h2>
				<p>拖动句柄调整层级和顺序</p>
			</div>
			<span class="layers-panel__count">{{ visibleNodes.length }}</span>
		</header>

		<div
			class="layers-root"
			:class="{ 'is-drop-active': isRootDropActive }"
			@dragover="onRootDragOver"
			@dragleave="onRootDragLeave"
			@drop="onRootDrop"
		>
			<span class="layers-root__icon" aria-hidden="true">▱</span>
			<div class="layers-root__copy">
				<strong>{{ layerSnapshot.pageName || '页面' }}</strong>
				<span>拖到这里移至页面顶层</span>
			</div>
		</div>

		<div v-if="visibleNodes.length > 0" class="layers-tree" role="tree">
			<div
				v-for="node in visibleNodes"
				:key="node.id"
				class="layers-row"
				:class="[
					{
						'is-selected': selectedIdSet.has(node.id),
						'is-dragging': draggedId === node.id,
						'is-locked': node.isLocked,
					},
					dropClass(node),
				]"
				:draggable="node.canDrag"
				:style="{ '--layer-depth': node.depth }"
				role="treeitem"
				:aria-level="node.depth + 1"
				:aria-selected="selectedIdSet.has(node.id)"
				@dragstart="onDragStart($event, node)"
				@dragend="onDragEnd"
				@dragover="onRowDragOver($event, node)"
				@dragleave="onRowDragLeave($event, node.id)"
				@drop="onRowDrop($event, node)"
				@click="selectLayer(node.id, $event)"
			>
				<span
					class="layers-row__drag-handle"
					:class="{ 'is-disabled': !node.canDrag }"
					:aria-label="node.canDrag ? `拖动 ${node.name}` : `${node.name} 不可拖动`"
					aria-hidden="true"
					@pointerdown="armDrag(node.id, $event)"
					@pointerup="disarmDrag"
				>⠿</span>
				<button
					v-if="node.hasChildren"
					type="button"
					class="layers-row__toggle"
					:aria-label="collapsedIds.has(node.id) ? `展开 ${node.name}` : `折叠 ${node.name}`"
					:aria-expanded="!collapsedIds.has(node.id)"
					@click.stop="toggleExpanded(node.id)"
				>
					<span :class="{ 'is-collapsed': collapsedIds.has(node.id) }">⌄</span>
				</button>
				<span v-else class="layers-row__toggle-placeholder" />
				<span class="layers-row__type-icon" aria-hidden="true">{{ node.icon }}</span>
				<span class="layers-row__name" :title="node.name">{{ node.name }}</span>
				<span v-if="node.isLocked" class="layers-row__lock" title="已锁定" aria-label="已锁定">⌑</span>
			</div>
		</div>

		<div v-else class="layers-panel__empty">
			<span aria-hidden="true">◇</span>
			<p>当前页面暂无图层</p>
		</div>
	</section>
</template>
