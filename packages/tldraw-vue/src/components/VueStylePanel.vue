<script setup lang="ts">
import {
	DefaultColorStyle,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	getColorValue,
	type Editor,
	type SharedStyle,
	type StyleProp,
	type StylePropValue,
} from '@tldraw/editor'
import type {
	TLDefaultColorStyle,
	TLDefaultDashStyle,
	TLDefaultFillStyle,
	TLDefaultSizeStyle,
} from '@tldraw/tlschema'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { StylePanelController } from '@/editor/interactions/StylePanelController'
import {
	VUE_COLOR_ITEMS,
	VUE_DASH_ITEMS,
	VUE_FILL_ITEMS,
	VUE_SIZE_ITEMS,
} from '@/editor/vueStyleDefs'
import { useEditorValue } from '@/vue/useEditorValue'

const props = defineProps<{
	compact?: boolean
	editor: Editor
}>()

type VueStyleId = 'color' | 'fill' | 'dash' | 'size'

const controller = new StylePanelController(props.editor)
const pointingStyle = ref<VueStyleId | null>(null)
const collapsed = ref(false)

const snapshot = useEditorValue('style panel snapshot', () => controller.getSnapshot())
const theme = useEditorValue('style panel theme', () => props.editor.getCurrentTheme())
const colorMode = useEditorValue('style panel color mode', () => props.editor.getColorMode())

const colorLabels: Record<TLDefaultColorStyle, string> = {
	black: '黑色',
	grey: '灰色',
	'light-violet': '浅紫色',
	violet: '紫色',
	blue: '蓝色',
	'light-blue': '浅蓝色',
	yellow: '黄色',
	orange: '橙色',
	green: '绿色',
	'light-green': '浅绿色',
	'light-red': '浅红色',
	red: '红色',
	white: '白色',
}

const fillLabels: Record<TLDefaultFillStyle, string> = {
	none: '无填充',
	semi: '半透明',
	solid: '实心',
	pattern: '图案',
	fill: '填充',
	'lined-fill': '线性填充',
}

const dashLabels: Record<TLDefaultDashStyle, string> = {
	draw: '手绘',
	dashed: '虚线',
	dotted: '点线',
	solid: '实线',
	none: '无',
}

const sizeLabels: Record<TLDefaultSizeStyle, string> = {
	s: '小',
	m: '中',
	l: '大',
	xl: '超大',
}

const opacityItems = [0.1, 0.25, 0.5, 0.75, 1] as const

watch(
	() => props.compact,
	(compact) => {
		collapsed.value = compact === true
	},
	{ immediate: true }
)

function getColor(color: TLDefaultColorStyle, variant: 'solid' | 'semi' | 'fill' | 'pattern') {
	return getColorValue(theme.value.colors[colorMode.value], color, variant)
}

function isActive<T extends string>(style: SharedStyle<T> | undefined, value: T) {
	return style?.type === 'shared' && style.value === value
}

function applyStyle<S extends StyleProp<any>>(
	styleId: VueStyleId,
	style: S,
	value: StylePropValue<S>,
	event?: PointerEvent | MouseEvent
) {
	pointingStyle.value = styleId
	controller.onValueChange(style, value, event)
}

function onButtonPointerDown<S extends StyleProp<any>>(
	styleId: VueStyleId,
	style: S,
	value: StylePropValue<S>,
	event: PointerEvent
) {
	controller.onHistoryMark('point picker item')
	applyStyle(styleId, style, value, event)
}

function onButtonPointerEnter<S extends StyleProp<any>>(
	styleId: VueStyleId,
	style: S,
	value: StylePropValue<S>,
	event: PointerEvent
) {
	if (pointingStyle.value !== styleId) return
	controller.onValueChange(style, value, event)
}

function onButtonClick<S extends StyleProp<any>>(
	shared: SharedStyle<StylePropValue<S>> | undefined,
	style: S,
	value: StylePropValue<S>,
	event: MouseEvent
) {
	if (shared?.type === 'shared' && shared.value === value) return
	controller.onHistoryMark('point picker item')
	controller.onValueChange(style, value, event)
}

function onOpacityPointerDown(opacity: number, event: PointerEvent) {
	controller.onHistoryMark('opacity picker item')
	controller.onOpacityChange(opacity, event)
}

function onOpacityClick(opacity: number, event: MouseEvent) {
	if (snapshot.value.opacity.type === 'shared' && snapshot.value.opacity.value === opacity) return
	controller.onHistoryMark('opacity picker item')
	controller.onOpacityChange(opacity, event)
}

function onWindowPointerUp() {
	pointingStyle.value = null
}

function toggleCollapsed() {
	collapsed.value = !collapsed.value
}

onMounted(() => {
	window.addEventListener('pointerup', onWindowPointerUp)
})

onBeforeUnmount(() => {
	window.removeEventListener('pointerup', onWindowPointerUp)
})
</script>

<template>
	<aside
		class="style-panel"
		:class="{ 'is-collapsed': collapsed, 'is-compact': compact }"
		aria-label="Style panel"
		@pointerdown.stop
		@pointermove.stop
		@wheel.stop
		@contextmenu.prevent.stop
	>
		<button
			type="button"
			class="side-panel-toggle style-panel-toggle"
			:aria-label="collapsed ? '展开样式面板' : '收起样式面板'"
			:title="collapsed ? '展开样式面板' : '收起样式面板'"
			@click="toggleCollapsed"
		>
			{{ collapsed ? '›' : '‹' }}
		</button>
		<div v-if="snapshot.color" v-show="!collapsed" class="style-panel-section style-panel-section--grid">
			<button
				v-for="color in VUE_COLOR_ITEMS"
				:key="color"
				type="button"
				class="style-panel-button style-panel-color-button"
				:class="{ 'is-selected': isActive(snapshot.color, color), 'is-mixed': snapshot.color.type === 'mixed' }"
				:title="`颜色 - ${colorLabels[color]}`"
				:aria-label="`颜色 - ${colorLabels[color]}`"
				@pointerdown.prevent="onButtonPointerDown('color', DefaultColorStyle, color, $event)"
				@pointerenter="onButtonPointerEnter('color', DefaultColorStyle, color, $event)"
				@click="onButtonClick(snapshot.color, DefaultColorStyle, color, $event)"
			>
				<span
					class="style-panel-swatch"
					:style="{ backgroundColor: getColor(color, 'solid') }"
				/>
			</button>
		</div>

		<div v-if="snapshot.fill" v-show="!collapsed" class="style-panel-section">
			<button
				v-for="fill in VUE_FILL_ITEMS"
				:key="fill"
				type="button"
				class="style-panel-button"
				:class="{ 'is-selected': isActive(snapshot.fill, fill), 'is-mixed': snapshot.fill.type === 'mixed' }"
				:title="`填充 - ${fillLabels[fill]}`"
				:aria-label="`填充 - ${fillLabels[fill]}`"
				@pointerdown.prevent="onButtonPointerDown('fill', DefaultFillStyle, fill, $event)"
				@pointerenter="onButtonPointerEnter('fill', DefaultFillStyle, fill, $event)"
				@click="onButtonClick(snapshot.fill, DefaultFillStyle, fill, $event)"
			>
				<span class="style-panel-fill-icon" :class="`style-panel-fill-icon--${fill}`" />
			</button>
		</div>

		<div v-if="snapshot.dash" v-show="!collapsed" class="style-panel-section">
			<button
				v-for="dash in VUE_DASH_ITEMS"
				:key="dash"
				type="button"
				class="style-panel-button"
				:class="{ 'is-selected': isActive(snapshot.dash, dash), 'is-mixed': snapshot.dash.type === 'mixed' }"
				:title="`线条 - ${dashLabels[dash]}`"
				:aria-label="`线条 - ${dashLabels[dash]}`"
				@pointerdown.prevent="onButtonPointerDown('dash', DefaultDashStyle, dash, $event)"
				@pointerenter="onButtonPointerEnter('dash', DefaultDashStyle, dash, $event)"
				@click="onButtonClick(snapshot.dash, DefaultDashStyle, dash, $event)"
			>
				<span class="style-panel-dash-icon" :class="`style-panel-dash-icon--${dash}`" />
			</button>
		</div>

		<div v-if="snapshot.size" v-show="!collapsed" class="style-panel-section">
			<button
				v-for="size in VUE_SIZE_ITEMS"
				:key="size"
				type="button"
				class="style-panel-button style-panel-size-button"
				:class="{ 'is-selected': isActive(snapshot.size, size), 'is-mixed': snapshot.size.type === 'mixed' }"
				:title="`大小 - ${sizeLabels[size]}`"
				:aria-label="`大小 - ${sizeLabels[size]}`"
				@pointerdown.prevent="onButtonPointerDown('size', DefaultSizeStyle, size, $event)"
				@pointerenter="onButtonPointerEnter('size', DefaultSizeStyle, size, $event)"
				@click="onButtonClick(snapshot.size, DefaultSizeStyle, size, $event)"
			>
				{{ size.toUpperCase() }}
			</button>
		</div>

		<div v-show="!collapsed" class="style-panel-section">
			<button
				v-for="opacity in opacityItems"
				:key="opacity"
				type="button"
				class="style-panel-button style-panel-opacity-button"
				:class="{ 'is-selected': snapshot.opacity.type === 'shared' && snapshot.opacity.value === opacity }"
				:title="`透明度 - ${Math.round(opacity * 100)}%`"
				:aria-label="`透明度 - ${Math.round(opacity * 100)}%`"
				@pointerdown.prevent="onOpacityPointerDown(opacity, $event)"
				@click="onOpacityClick(opacity, $event)"
			>
				<span :style="{ opacity }" />
			</button>
		</div>
	</aside>
</template>
