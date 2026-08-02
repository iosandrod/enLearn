# tldraw-vue-phase-one 使用与 API 文档

本文档基于当前项目源码与声明文件整理，面向外部使用者说明 `tldraw-vue-phase-one` 的安装、接入方式、公开导出、参数与类型。

## 1. 项目定位

`tldraw-vue-phase-one` 是一个 Vue 3 组件库，提供：

- 基于本地 `@tldraw/editor` 核心能力的 Vue 画布组件。
- 默认工具栏、画布、样式面板、导航面板、模板菜单等 UI。
- Vue 自定义形状：文本、图片、线条、箭头、手绘、几何图形、画框；二维码、物料节点通过 Pro 包插件注入。
- 模板保存/加载能力。
- 标签/模板批量打印能力，支持浏览器打印、网络打印桥接与自定义打印适配器。

当前发布入口由 `package.json` 声明：

```json
{
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/types/src/index.d.ts",
  "style": "./dist/style.css",
  "exports": {
    ".": {
      "types": "./dist/types/src/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./style.css": "./dist/style.css",
    "./package.json": "./package.json"
  }
}
```

对外可稳定导入的路径只有：

```ts
import TldrawVue from 'tldraw-vue-phase-one'
import { createVueEditor } from 'tldraw-vue-phase-one'
import 'tldraw-vue-phase-one/style.css'
```

不建议外部使用者直接导入 `src/*`、`dist/types/*` 或包内子路径，因为 `exports` 没有公开这些子路径。

## 2. 安装与基础接入

```sh
npm install tldraw-vue-phase-one
```

项目声明了这些 peer dependencies，宿主项目需要提供：

```json
{
  "vue": "^3.5.17",
  "react": "^18.2.0 || ^19.2.1",
  "react-dom": "^18.2.0 || ^19.2.1"
}
```

最小用法：

```vue
<script setup lang="ts">
import TldrawVue from 'tldraw-vue-phase-one'
import 'tldraw-vue-phase-one/style.css'
</script>

<template>
  <div style="width: 100vw; height: 100vh">
    <TldrawVue />
  </div>
</template>
```

组件会填满父容器，父容器必须有明确的宽高。

## 3. 主入口导出总览

从 `tldraw-vue-phase-one` 主入口可导入：

```ts
export { default, default as TldrawVue } from './TldrawVue.vue'
export { createVueEditor, type CreateVueEditorOptions } from './editor/createVueEditor'
export { coreExtension } from './editor/extensions/coreExtension'
export { getDefaultVueEditorExtensions } from './editor/extensions/defaultExtensions'
export { frameExtension } from './editor/extensions/frame/frameExtension'
export type { VueFrameShape } from './editor/extensions/frame/vueFrameShape'
export { materialExtension } from './editor/extensions/material/materialExtension'
export type {
  VueMaterialSectionDefinition,
  VueMaterialSectionShape,
  VueMaterialSectionZone,
  VueMaterialShape,
} from './editor/extensions/material/vueMaterialShape'
export { qrExtension } from './editor/extensions/qr/qrExtension'
export type { VueQrErrorCorrectionLevel, VueQrShape } from './editor/extensions/qr/vueQrShape'
export type { CanvasTool, ResizeHandle, VueGeoShape } from './editor/interactions/types'
export type {
  VueTemplateLoadHandler,
  VueTemplateRecord,
  VueTemplateSaveHandler,
  VueTemplateWorkspaceConfig,
} from './editor/templateStore'
export { useEditor, editorKey } from './vue/editorContext'
export { useEditorValue } from './vue/useEditorValue'
export type { VueBoxShape } from './editor/vueBoxShape'
export type {
  VueArrowShape,
  VueDrawShape,
  VueImageShape,
  VueLineShape,
  VuePoint,
  VueTextShape,
} from './editor/vueDefaultShapes'
export {
  createVueEditorExtensionRegistry,
  getToolbarPlacementGroup,
  isPrimaryToolbarPlacement,
  type VueEditorExtension,
  type VueEditorExtensionRegistry,
  type VueShapeCreateCompleteContext,
  type VueShapeCreateContext,
  type VueShapeCreateDefinition,
  type VueToolbarPlacement,
  type VueToolbarSelection,
  type VueToolbarToolDefinition,
} from './editor/vueEditorExtensions'
export {
  createVueEditorPluginRegistry,
  defineVueEditorPlugin,
  matchesVueEditorShortcut,
  VueEditorPluginHost,
  type VueEditorCommandContext,
  type VueEditorCommandDefinition,
  type VueEditorCommandResult,
  type VueEditorPlugin,
  type VueEditorPluginContext,
  type VueEditorPluginHostOptions,
  type VueEditorPluginRegistry,
  type VueEditorShortcutDefinition,
} from './editor/vuePlugins'
export * from './print'
export * from '@tldraw/editor'
```

说明：

- `@tldraw/editor` 在本项目中指向本地 `packages/editor/src/vue-core.ts`，不是完整 React UI 入口。
- `vue-core` 会继续 re-export `@tldraw/state`、`@tldraw/store`、`@tldraw/tlschema`、`@tldraw/utils`、`@tldraw/validate` 的公开 API。
- 默认扩展集合只包含基础扩展。`qrExtension`、`materialExtension` 已从主入口导出，当前由 `tldraw-vue-phase-one-pro` 组合为 Pro 插件使用。

## 4. `TldrawVue` 组件 API

### 4.1 Props

```ts
type TldrawVueProps = {
  extensions?: readonly VueEditorExtension[]
  plugins?: readonly VueEditorPlugin[]
  createDefaultShapes?: boolean
  loadTemplates?: VueTemplateLoadHandler
  saveTemplates?: VueTemplateSaveHandler
}
```

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `extensions` | `readonly VueEditorExtension[]` | `getDefaultVueEditorExtensions()` | 编辑器扩展列表。传入后会替换默认扩展；如果只是追加扩展，需要手动合并默认扩展。 |
| `plugins` | `readonly VueEditorPlugin[]` | `[]` | 插件列表。插件可以附加扩展、命令、快捷键和生命周期逻辑。第一阶段插件在编辑器创建时注册，不建议运行时动态切换。 |
| `createDefaultShapes` | `boolean` | `true` | 创建编辑器时，如果当前页面为空，是否插入默认示例文本形状。 |
| `loadTemplates` | `VueTemplateLoadHandler` | `undefined` | 顶部菜单加载模板时调用。 |
| `saveTemplates` | `VueTemplateSaveHandler` | `undefined` | 顶部菜单保存模板时调用。 |

扩展示例：

```vue
<script setup lang="ts">
import {
  TldrawVue,
  getDefaultVueEditorExtensions,
  type VueEditorExtension,
} from 'tldraw-vue-phase-one'
import 'tldraw-vue-phase-one/style.css'

const myExtension: VueEditorExtension = {
  id: 'my-extension',
  toolbarTools: [],
}

const extensions = [...getDefaultVueEditorExtensions(), myExtension]
</script>

<template>
  <div style="width: 100vw; height: 100vh">
    <TldrawVue :extensions="extensions" />
  </div>
</template>
```

### 4.2 Emits

```ts
type TldrawVueEmits = {
  ready: [editor: Editor]
  'workspace-config-change': [config: VueTemplateWorkspaceConfig]
}
```

| 事件 | 参数 | 触发时机 |
| --- | --- | --- |
| `ready` | `editor: Editor` | 编辑器实例创建完成后触发。 |
| `workspace-config-change` | `config: VueTemplateWorkspaceConfig` | 工作区页面尺寸、相机、辅助线等配置发生变化时触发。 |

### 4.3 组件实例暴露

通过 Vue `ref` 可访问：

```ts
type TldrawVueExpose = {
  editor: ShallowRef<Editor | null>
  getEditor(): Editor | null
  getWorkspaceTemplateConfig(): VueTemplateWorkspaceConfig | undefined
  applyWorkspaceTemplateConfig(config: VueTemplateWorkspaceConfig): void
  canRunCommand(commandId: string): boolean
  runCommand(commandId: string, event?: Event): Promise<boolean>
  getPluginIds(): string[]
}
```

示例：

```vue
<script setup lang="ts">
import type { Editor } from 'tldraw-vue-phase-one'
import TldrawVue from 'tldraw-vue-phase-one'
import { ref, shallowRef } from 'vue'

const editor = shallowRef<Editor | null>(null)
const tldrawRef = ref<InstanceType<typeof TldrawVue> | null>(null)

function onReady(nextEditor: Editor) {
  editor.value = nextEditor
}

function centerWorkspace() {
  tldrawRef.value?.applyWorkspaceTemplateConfig({
    camera: { x: 0, y: 0, z: 1 },
  })
}
</script>

<template>
  <TldrawVue ref="tldrawRef" @ready="onReady" />
</template>
```

## 5. 编辑器工厂

### `createVueEditor(container, options?)`

```ts
function createVueEditor(
  container: HTMLElement,
  options?: CreateVueEditorOptions
): Editor

interface CreateVueEditorOptions {
  createDefaultShapes?: boolean
  extensions?: readonly VueEditorExtension[]
}
```

参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `container` | `HTMLElement` | 是 | 编辑器绑定的 DOM 容器，用于计算视口、输入事件和画布边界。 |
| `options.createDefaultShapes` | `boolean` | 否 | 为 `false` 时不创建默认示例形状。 |
| `options.extensions` | `readonly VueEditorExtension[]` | 否 | 自定义扩展集合；未传入时使用 `getDefaultVueEditorExtensions()`。 |

行为：

- 创建 `TLStore`，注册扩展提供的 `shapeUtils` 和 `bindingUtils`。
- 创建 `Editor`，初始工具为 `select`，`autoFocus` 为 `false`。
- 默认开启吸附模式：`editor.user.updateUserPreferences({ isSnapMode: true })`。
- 注册文件资源处理器，可将拖入/粘贴的文件转换为 `vue-image` 资源。
- 当 `createDefaultShapes !== false` 且当前页面为空时，插入一组默认文本形状。

适合需要自定义宿主 UI、只使用编辑器核心能力的场景。若需要完整 UI，优先使用 `TldrawVue` 组件。

## 6. Vue 注入与响应式工具

### `editorKey`

```ts
const editorKey: InjectionKey<Editor>
```

Vue provide/inject 使用的 key。

### `useEditor()`

```ts
function useEditor(): Editor
```

从当前 Vue 注入上下文读取 `Editor`。如果没有上层 provider，会抛出：

```txt
Editor was not provided
```

### `useEditorValue(name, getter)`

```ts
function useEditorValue<T>(name: string, getter: () => T): ShallowRef<T>
```

将 `@tldraw/state` 的 `react` 订阅桥接为 Vue `ShallowRef`。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string` | 订阅名称，会以 `vue:${name}` 注册。 |
| `getter` | `() => T` | 读取编辑器或 state 值的函数。其内部访问的 signal 会被追踪。 |

返回值：

| 类型 | 说明 |
| --- | --- |
| `ShallowRef<T>` | 当被追踪值变化时更新 `.value` 并触发 Vue 响应式更新。 |

示例：

```ts
const selectedIds = useEditorValue('selected shape ids', () =>
  editor.getSelectedShapeIds()
)
```

## 7. 扩展系统 API

### `getDefaultVueEditorExtensions()`

```ts
function getDefaultVueEditorExtensions(): VueEditorExtension[]
```

返回默认扩展数组：

```ts
[coreExtension, frameExtension]
```

默认工具和形状包括：

- 基础工具：选择、手形平移、手绘、橡皮、箭头、文本、便签、媒体、高亮、直线、激光笔、几何图形。
- 画框形状：`vue-frame`。

二维码形状 `vue-qr` 和物料节点形状 `vue-material`、`vue-material-section` 由 `tldraw-vue-phase-one-pro` 注入。

### `coreExtension`

```ts
const coreExtension: VueEditorExtension
```

提供基础形状、箭头绑定与默认工具栏配置：

| 类型 | 内容 |
| --- | --- |
| `shapeUtils` | `VueBoxShapeUtil`、`VueTextShapeUtil`、`VueImageShapeUtil`、`VueLineShapeUtil`、`VueArrowShapeUtil`、`VueDrawShapeUtil` |
| `bindingUtils` | `VueArrowBindingUtil` |
| `shapeComponents` | `vue-arrow`、`vue-box`、`vue-draw`、`vue-image`、`vue-line`、`vue-text` 对应的 Vue 节点组件 |
| `toolbarTools` | `select`、`hand`、`draw`、`eraser`、`arrow`、`text`、`note`、`asset`、`highlight`、几何图形、`line`、`laser` |

### `qrExtension`

```ts
const qrExtension: VueEditorExtension
```

提供：

- `vue-qr` shape util。
- `vue-qr` Vue shape component。
- 工具栏 `qr` 工具，默认尺寸 `180 x 180`，强制等比缩放。

### `frameExtension`

```ts
const frameExtension: VueEditorExtension
```

提供：

- `vue-frame` shape util。
- `vue-frame` Vue shape component。
- 工具栏 `frame` 工具，默认尺寸 `320 x 180`。
- 创建完成后会把完全包围在画框中的兄弟节点 reparent 到该 frame。

### `VueEditorExtension`

```ts
interface VueEditorExtension {
  id: string
  shapeUtils?: readonly TLShapeUtilConstructor<any, any>[]
  bindingUtils?: readonly TLBindingUtilConstructor<any, any>[]
  shapeComponents?: Readonly<Record<string, Component>>
  toolbarTools?: readonly VueToolbarToolDefinition[]
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 扩展唯一标识。 |
| `shapeUtils` | `readonly TLShapeUtilConstructor<any, any>[]` | tldraw shape util 构造器列表。 |
| `bindingUtils` | `readonly TLBindingUtilConstructor<any, any>[]` | tldraw binding util 构造器列表。 |
| `shapeComponents` | `Readonly<Record<string, Component>>` | shape type 到 Vue 渲染组件的映射。key 必须与 shape `type` 一致。 |
| `toolbarTools` | `readonly VueToolbarToolDefinition[]` | 工具栏按钮定义。 |

### `VueToolbarToolDefinition`

```ts
interface VueToolbarToolDefinition {
  id: string
  label: string
  icon: string
  glyph?: string
  shortcut?: string
  disabled?: boolean
  placement: VueToolbarPlacement
  selection?: VueToolbarSelection
  canvasCreate?: VueShapeCreateDefinition
  toolbarCreate?: VueShapeCreateDefinition
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 工具按钮唯一标识。 |
| `label` | `string` | 工具显示名称。 |
| `icon` | `string` | 工具图标名，由 UI 组件解析。 |
| `glyph` | `string` | 可选字符图标。 |
| `shortcut` | `string` | 可选快捷键显示值。 |
| `disabled` | `boolean` | 是否禁用。 |
| `placement` | `VueToolbarPlacement` | 工具栏位置。 |
| `selection` | `VueToolbarSelection` | 点击后激活的工具/几何类型。 |
| `canvasCreate` | `VueShapeCreateDefinition` | 从画布拖拽/框选创建形状时的行为。 |
| `toolbarCreate` | `VueShapeCreateDefinition` | 从工具栏拖拽创建形状时的行为。 |

### `VueToolbarPlacement`

```ts
type VueToolbarPlacement =
  | 'primary'
  | {
      area: 'more'
      group: string
    }
```

| 值 | 说明 |
| --- | --- |
| `'primary'` | 放在主工具栏区域。 |
| `{ area: 'more', group }` | 放在更多工具分组中，`group` 用于归组。 |

### `VueToolbarSelection`

```ts
interface VueToolbarSelection {
  tool: CanvasTool
  geoShape?: VueGeoShape
}
```

### `VueShapeCreateDefinition`

```ts
interface VueShapeCreateDefinition {
  shapeType: string
  defaultSize: {
    w: number
    h: number
  }
  isAspectRatioLocked?: boolean
  createShape(context: VueShapeCreateContext): void
  updateShape?(context: VueShapeCreateContext): void
  onComplete?(context: VueShapeCreateCompleteContext): void
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `shapeType` | `string` | 要创建的 shape type，例如 `vue-text`。 |
| `defaultSize.w` | `number` | 默认宽度，编辑器页面单位。 |
| `defaultSize.h` | `number` | 默认高度，编辑器页面单位。 |
| `isAspectRatioLocked` | `boolean` | 是否锁定宽高比。二维码默认为 `true`。 |
| `createShape` | `(context) => void` | 创建时调用，通常调用 `editor.createShapes`。 |
| `updateShape` | `(context) => void` | 创建过程中尺寸变化时调用。 |
| `onComplete` | `(context) => void` | 创建完成后调用。 |

### `VueShapeCreateContext`

```ts
interface VueShapeCreateContext {
  editor: Editor
  id: TLShapeId
  point: Vec
  rect: {
    x: number
    y: number
    w: number
    h: number
  }
  source: 'canvas' | 'toolbar'
}
```

### `VueShapeCreateCompleteContext`

```ts
interface VueShapeCreateCompleteContext extends VueShapeCreateContext {
  shape: TLShape
}
```

### `VueEditorExtensionRegistry`

```ts
interface VueEditorExtensionRegistry {
  shapeUtils: TLShapeUtilConstructor<any, any>[]
  bindingUtils: TLBindingUtilConstructor<any, any>[]
  shapeComponents: Record<string, Component>
  toolbarTools: VueToolbarToolDefinition[]
}
```

### `createVueEditorExtensionRegistry(extensions)`

```ts
function createVueEditorExtensionRegistry(
  extensions: readonly VueEditorExtension[]
): VueEditorExtensionRegistry
```

把多个扩展拍平成编辑器可直接消费的注册表：

- `shapeUtils` 使用数组顺序合并。
- `bindingUtils` 使用数组顺序合并。
- `shapeComponents` 使用 `Object.assign` 合并；后面的扩展可覆盖前面的相同 key。
- `toolbarTools` 使用数组顺序合并。

### `isPrimaryToolbarPlacement(placement)`

```ts
function isPrimaryToolbarPlacement(
  placement: VueToolbarPlacement
): placement is 'primary'
```

判断工具是否位于主工具栏。

### `getToolbarPlacementGroup(placement)`

```ts
function getToolbarPlacementGroup(
  placement: VueToolbarPlacement
): string | null
```

返回更多工具区域的分组名；`'primary'` 返回 `null`。

## 8. 插件系统 API

插件系统是对 `VueEditorExtension` 的上层封装，用来支持“高级功能统一放入 Pro 包，再注入主库”的模式。第一阶段已经验证：

- 插件可以向主编辑器追加 shape/toolbar 扩展。
- 插件可以注册命令。
- 插件可以注册键盘快捷键。
- 插件可以在编辑器创建后执行 `setup()`，并在组件卸载时清理。
- 组件实例可以通过 `runCommand()` 执行插件命令。

插件更适合承载可收费能力，例如二维码、物料表格、打印预览、网络打印、团队模板库、快捷键增强等。目标拆包为 `tldraw-vue-phase-one` 主包和 `tldraw-vue-phase-one-pro` 高级包两个 npm 包；各高级功能作为 Pro 包内部模块维护。基础 shape util 仍然由 `VueEditorExtension` 表达。

### `VueEditorPlugin`

```ts
interface VueEditorPlugin {
  id: string
  extensions?: readonly VueEditorExtension[]
  commands?: readonly VueEditorCommandDefinition[]
  shortcuts?: readonly VueEditorShortcutDefinition[]
  setup?(context: VueEditorPluginContext): void | (() => void)
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 插件唯一 id。重复 id 会抛错。 |
| `extensions` | `readonly VueEditorExtension[]` | 插件附带的形状、绑定、工具栏扩展。适合二维码、物料表格等高级组件。 |
| `commands` | `readonly VueEditorCommandDefinition[]` | 命令列表。适合撤销/重做、打印预览、导出、云同步等动作。 |
| `shortcuts` | `readonly VueEditorShortcutDefinition[]` | 快捷键列表。快捷键通过 `command` 指向命令。 |
| `setup` | `(context) => void | (() => void)` | 编辑器创建后执行。返回的清理函数会在组件卸载时执行。 |

### `defineVueEditorPlugin(plugin)`

```ts
function defineVueEditorPlugin(plugin: VueEditorPlugin): VueEditorPlugin
```

轻量类型辅助函数，便于插件包导出插件定义。

### `VueEditorPluginContext`

```ts
interface VueEditorPluginContext {
  editor: Editor
  getContainer(): HTMLElement | null
  getWorkspaceTemplateConfig(): VueTemplateWorkspaceConfig | undefined
  applyWorkspaceTemplateConfig(config: VueTemplateWorkspaceConfig): void
  canRunCommand(commandId: string): boolean
  runCommand(commandId: string, event?: Event): Promise<boolean>
}
```

| 字段 | 说明 |
| --- | --- |
| `editor` | 当前编辑器实例。 |
| `getContainer` | 获取编辑器宿主 DOM。 |
| `getWorkspaceTemplateConfig` | 读取当前工作区配置。 |
| `applyWorkspaceTemplateConfig` | 应用工作区配置。 |
| `canRunCommand` | 检查命令是否存在且可执行。 |
| `runCommand` | 执行指定命令。 |

### `VueEditorCommandDefinition`

```ts
interface VueEditorCommandDefinition {
  id: string
  label: string
  isEnabled?(context: VueEditorPluginContext): boolean
  run(context: VueEditorCommandContext): VueEditorCommandResult
}

type VueEditorCommandResult = void | boolean | Promise<void | boolean>

interface VueEditorCommandContext extends VueEditorPluginContext {
  event?: Event
}
```

| 字段 | 说明 |
| --- | --- |
| `id` | 命令唯一 id。重复 id 会抛错。 |
| `label` | 命令名称。 |
| `isEnabled` | 可选启用判断。返回 `false` 时快捷键和 `runCommand` 都不会执行。 |
| `run` | 命令执行函数。返回 `false` 表示没有成功处理。 |

### `VueEditorShortcutDefinition`

```ts
interface VueEditorShortcutDefinition {
  command: string
  key?: string
  code?: string
  accel?: boolean
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  allowRepeat?: boolean
  preventDefault?: boolean
  stopPropagation?: boolean
  priority?: number
  when?(context: VueEditorPluginContext, event: KeyboardEvent): boolean
}
```

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `command` | 无 | 要触发的命令 id，必须已经在插件命令中注册。 |
| `key` | `undefined` | 匹配 `KeyboardEvent.key`，忽略大小写。 |
| `code` | `undefined` | 匹配 `KeyboardEvent.code`。 |
| `accel` | `false` | 匹配 Ctrl 或 Meta。 |
| `ctrl` | `undefined` | 精确匹配 Ctrl。通常不用，优先用 `accel`。 |
| `meta` | `undefined` | 精确匹配 Meta。通常不用，优先用 `accel`。 |
| `shift` | `false` | 是否要求 Shift。 |
| `alt` | `false` | 是否要求 Alt。 |
| `allowRepeat` | `false` | 是否允许按键 repeat。 |
| `preventDefault` | `true` | 命中快捷键后是否阻止浏览器默认行为。 |
| `stopPropagation` | `false` | 是否停止事件传播。 |
| `priority` | `0` | 快捷键优先级。数值越大越先匹配。 |
| `when` | `undefined` | 额外条件。返回 `false` 时不触发。 |

### `createVueEditorPluginRegistry(plugins)`

```ts
function createVueEditorPluginRegistry(
  plugins: readonly VueEditorPlugin[]
): VueEditorPluginRegistry

interface VueEditorPluginRegistry {
  plugins: readonly VueEditorPlugin[]
  extensions: readonly VueEditorExtension[]
  commands: ReadonlyMap<string, VueEditorCommandDefinition>
  shortcuts: readonly VueEditorShortcutDefinition[]
}
```

注册表会校验：

- 插件 id 不重复。
- 命令 id 不重复。
- 每个快捷键都指向已注册命令。
- 每个快捷键至少提供 `key` 或 `code`。

### `VueEditorPluginHost`

```ts
class VueEditorPluginHost {
  constructor(
    registry: VueEditorPluginRegistry,
    options: VueEditorPluginHostOptions
  )
  setup(): void
  dispose(): void
  getPluginIds(): string[]
  canRunCommand(commandId: string): boolean
  runCommand(commandId: string, event?: Event): Promise<boolean>
  handleKeyDown(event: KeyboardEvent): boolean
}
```

`TldrawVue` 内部会创建 `VueEditorPluginHost`。外部一般只需要使用 `plugins` prop 和组件实例暴露的 `runCommand()`。

### `matchesVueEditorShortcut(event, shortcut)`

```ts
function matchesVueEditorShortcut(
  event: KeyboardEvent,
  shortcut: VueEditorShortcutDefinition
): boolean
```

底层快捷键匹配函数，适合测试或自定义快捷键管理。

### 插件示例：撤销/重做

```ts
import { defineVueEditorPlugin } from 'tldraw-vue-phase-one'

export const historyPlugin = defineVueEditorPlugin({
  id: 'history',
  commands: [
    {
      id: 'history.undo',
      label: 'Undo',
      isEnabled: ({ editor }) => editor.getCanUndo(),
      run: ({ editor }) => {
        editor.undo()
      },
    },
    {
      id: 'history.redo',
      label: 'Redo',
      isEnabled: ({ editor }) => editor.getCanRedo(),
      run: ({ editor }) => {
        editor.redo()
      },
    },
  ],
  shortcuts: [
    { command: 'history.undo', key: 'z', accel: true, priority: 100 },
    { command: 'history.redo', key: 'z', accel: true, shift: true, priority: 100 },
    { command: 'history.redo', key: 'y', accel: true, priority: 100 },
  ],
})
```

使用：

```vue
<script setup lang="ts">
import TldrawVue from 'tldraw-vue-phase-one'
import { historyPlugin } from './historyPlugin'

const plugins = [historyPlugin]
</script>

<template>
  <TldrawVue :plugins="plugins" />
</template>
```

### 插件示例：Pro 包中的二维码能力

```ts
import {
  defineVueEditorPlugin,
  qrExtension,
} from 'tldraw-vue-phase-one'

export const qrPlugin = defineVueEditorPlugin({
  id: 'pro.qr',
  extensions: [qrExtension],
})
```

真实拆包时可以把 `qrExtension`、二维码 shape util、二维码渲染组件移动到 `tldraw-vue-phase-one-pro` 包内部，然后由 Pro 包导出：

```ts
import { defineVueEditorPlugin } from 'tldraw-vue-phase-one'
import { qrExtension } from './features/qr/qrExtension'

export function createQrPlugin() {
  return defineVueEditorPlugin({
    id: 'pro.qr',
    extensions: [qrExtension],
  })
}

export function createTldrawVueProPlugin() {
  return defineVueEditorPlugin({
    id: 'pro',
    extensions: [qrExtension],
  })
}
```

宿主应用使用：

```ts
import { createTldrawVueProPlugin } from 'tldraw-vue-phase-one-pro'

const plugins = [createTldrawVueProPlugin()]
```

## 9. 工具与形状类型

### `CanvasTool`

```ts
type CanvasTool =
  | 'select'
  | 'hand'
  | 'draw'
  | 'eraser'
  | 'arrow'
  | 'text'
  | 'note'
  | 'asset'
  | 'qr'
  | 'highlight'
  | 'line'
  | 'laser'
  | 'frame'
  | 'material'
  | 'geo'
  | (string & {})
```

`(string & {})` 允许自定义扩展注册自己的工具 id。

### `VueGeoShape`

```ts
type VueGeoShape =
  | 'rectangle'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'hexagon'
  | 'oval'
  | 'rhombus'
  | 'star'
  | 'cloud'
  | 'heart'
  | 'x-box'
  | 'check-box'
  | 'arrow-left'
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-right'
```

### `ResizeHandle`

```ts
type ResizeHandle = SelectionCorner | SelectionEdge

type SelectionEdge = 'top' | 'right' | 'bottom' | 'left'
type SelectionCorner =
  | 'top_left'
  | 'top_right'
  | 'bottom_right'
  | 'bottom_left'
```

### 通用样式枚举

这些类型来自 re-export 的 `@tldraw/tlschema`：

```ts
type TLDefaultColorStyle =
  | 'black'
  | 'grey'
  | 'light-violet'
  | 'violet'
  | 'blue'
  | 'light-blue'
  | 'yellow'
  | 'orange'
  | 'green'
  | 'light-green'
  | 'light-red'
  | 'red'
  | 'white'

type TLDefaultFontStyle = 'draw' | 'sans' | 'serif' | 'mono'
type TLDefaultSizeStyle = 's' | 'm' | 'l' | 'xl'
type TLDefaultDashStyle = 'solid' | 'draw' | 'dashed' | 'dotted' | 'none'
type TLDefaultFillStyle =
  | 'fill'
  | 'solid'
  | 'none'
  | 'semi'
  | 'pattern'
  | 'lined-fill'
```

## 10. 内置 Vue Shape 类型

所有内置 Vue shape 都是 `TLBaseShape<Type, Props>`。

### `VuePoint`

```ts
interface VuePoint {
  x: number
  y: number
}
```

### `VueBoxShape`

```ts
type VueBoxShape = TLBaseShape<
  'vue-box',
  {
    w: number
    h: number
    color: TLDefaultColorStyle
    fill: TLDefaultFillStyle
    dash: TLDefaultDashStyle
    size: TLDefaultSizeStyle
    geo: VueGeoShape
  }
>
```

默认 props：

```ts
{
  w: 160,
  h: 96,
  color: 'blue',
  fill: 'semi',
  dash: 'draw',
  size: 'm',
  geo: 'rectangle',
}
```

### `VueTextShape`

```ts
type VueTextShape = TLBaseShape<
  'vue-text',
  {
    w: number
    h: number
    text: string
    color: TLDefaultColorStyle
    font: TLDefaultFontStyle
    size: TLDefaultSizeStyle
    autoSize?: boolean
    showBorder?: boolean
  }
>
```

默认 props：

```ts
{
  w: 180,
  h: 44,
  text: 'Text',
  color: 'black',
  font: 'draw',
  size: 'm',
  autoSize: true,
  showBorder: false,
}
```

### `VueImageShape`

```ts
type VueImageShape = TLBaseShape<
  'vue-image',
  {
    w: number
    h: number
    assetId: TLAssetId | null
    src: string
    name: string
    showBorder?: boolean
  }
>
```

默认 props：

```ts
{
  w: 180,
  h: 120,
  assetId: null,
  src: '',
  name: 'Image',
  showBorder: false,
}
```

### `VueLineShape`

```ts
type VueLineShape = TLBaseShape<
  'vue-line',
  {
    w: number
    h: number
    start: VuePoint
    end: VuePoint
    color: TLDefaultColorStyle
    dash: TLDefaultDashStyle
    size: TLDefaultSizeStyle
  }
>
```

默认 props：

```ts
{
  w: 120,
  h: 1,
  start: { x: 0, y: 0 },
  end: { x: 120, y: 0 },
  color: 'black',
  dash: 'draw',
  size: 'm',
}
```

### `VueArrowShape`

```ts
type VueArrowShape = TLBaseShape<
  'vue-arrow',
  {
    w: number
    h: number
    start: VuePoint
    end: VuePoint
    color: TLDefaultColorStyle
    fill: TLDefaultFillStyle
    dash: TLDefaultDashStyle
    size: TLDefaultSizeStyle
  }
>
```

默认 props：

```ts
{
  w: 120,
  h: 1,
  start: { x: 0, y: 0 },
  end: { x: 120, y: 0 },
  color: 'black',
  fill: 'none',
  dash: 'draw',
  size: 'm',
}
```

### `VueDrawShape`

```ts
type VueDrawShape = TLBaseShape<
  'vue-draw',
  {
    w: number
    h: number
    points: VuePoint[]
    color: TLDefaultColorStyle
    fill: TLDefaultFillStyle
    dash: TLDefaultDashStyle
    size: TLDefaultSizeStyle
  }
>
```

默认 props：

```ts
{
  w: 1,
  h: 1,
  points: [{ x: 0, y: 0 }],
  color: 'black',
  fill: 'none',
  dash: 'draw',
  size: 'm',
}
```

### `VueFrameShape`

```ts
type VueFrameShape = TLBaseShape<
  'vue-frame',
  {
    w: number
    h: number
    name: string
    showBorder?: boolean
  }
>
```

默认 props：

```ts
{
  w: 320,
  h: 180,
  name: 'Frame',
  showBorder: false,
}
```

### `VueQrErrorCorrectionLevel`

```ts
type VueQrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'
```

二维码容错级别：

| 值 | 含义 |
| --- | --- |
| `L` | 低 |
| `M` | 中 |
| `Q` | 较高 |
| `H` | 高 |

### `VueQrShape`

```ts
type VueQrShape = TLBaseShape<
  'vue-qr',
  {
    w: number
    h: number
    text: string
    color: TLDefaultColorStyle
    background: string
    errorCorrectionLevel: VueQrErrorCorrectionLevel
    margin: number
    showBorder?: boolean
  }
>
```

默认 props：

```ts
{
  w: 180,
  h: 180,
  text: 'https://tldraw.dev',
  color: 'black',
  background: '#ffffff',
  errorCorrectionLevel: 'M',
  margin: 4,
  showBorder: false,
}
```

### Pro 包注入的物料形状

安装并注入 `tldraw-vue-phase-one-pro` 后会注册物料节点：

```ts
type VueMaterialShape = TLBaseShape<
  'vue-material',
  {
    w: number
    h: number
    name: string
  }
>

type VueMaterialSectionShape = TLBaseShape<
  'vue-material-section',
  {
    w: number
    h: number
    zone:
      | 'pageHeader'
      | 'tableHeader'
      | 'tableBody'
      | 'tableFooter'
      | 'pageFooter'
    label: string
  }
>
```

物料默认分区：

| `zone` | `label` | 默认高度 | 最小高度 | 接收子节点 |
| --- | --- | ---: | ---: | --- |
| `pageHeader` | `页头` | `60` | `36` | 是 |
| `tableHeader` | `表头` | `66` | `40` | 是 |
| `tableBody` | `表体` | `242` | `120` | 否 |
| `tableFooter` | `表尾` | `66` | `40` | 是 |
| `pageFooter` | `页尾` | `66` | `36` | 是 |

物料节点最小宽度为 `280`，默认宽高约为 `500 x 500`。

## 11. 模板 API

主入口导出模板相关类型：

```ts
interface VueTemplateRecord {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  content: TLContent
  workspace?: VueTemplateWorkspaceConfig
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 模板唯一 id。内部默认格式为 `template:${uuid}` 或时间戳随机串。 |
| `name` | `string` | 模板名称。 |
| `createdAt` | `number` | 创建时间戳，单位毫秒。 |
| `updatedAt` | `number` | 更新时间戳，单位毫秒。 |
| `content` | `TLContent` | tldraw 内容快照，包含 shapes、bindings、assets、schema 等。 |
| `workspace` | `VueTemplateWorkspaceConfig` | 可选工作区配置。 |

### `VueTemplateWorkspaceConfig`

```ts
interface VueTemplateWorkspaceConfig {
  pageSizeMm?: {
    w: number
    h: number
  }
  pageBounds?: {
    x: number
    y: number
    w: number
    h: number
  }
  camera?: {
    x: number
    y: number
    z: number
  }
  guides?: Array<{
    axis: 'x' | 'y'
    id: string
    position: number
  }>
  viewportSize?: {
    w: number
    h: number
  }
  pxPerMm?: number
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `pageSizeMm` | `{ w: number; h: number }` | 页面物理尺寸，单位 mm。内部会限制在 `10` 到 `1000` 之间并保留 1 位小数。 |
| `pageBounds` | `{ x: number; y: number; w: number; h: number }` | 页面在编辑器坐标系中的边界。 |
| `camera` | `{ x: number; y: number; z: number }` | 视图相机，`z` 为缩放倍数且必须大于 `0`。 |
| `guides` | `{ axis; id; position }[]` | 辅助线列表，`axis` 为 `x` 或 `y`，`position` 是页面坐标。 |
| `viewportSize` | `{ w: number; h: number }` | 当前可视区域大小。 |
| `pxPerMm` | `number` | 页面单位换算，默认实现中为 `10` 像素/mm。 |

### `VueTemplateLoadHandler`

```ts
type VueTemplateLoadHandler =
  () => readonly VueTemplateRecord[] | Promise<readonly VueTemplateRecord[]>
```

用于把外部模板数据接入顶部菜单。

### `VueTemplateSaveHandler`

```ts
type VueTemplateSaveHandler =
  (templates: readonly VueTemplateRecord[]) => void | Promise<void>
```

用于把顶部菜单中的模板列表保存到外部存储。

示例：

```ts
const loadTemplates: VueTemplateLoadHandler = async () => {
  const raw = localStorage.getItem('my-templates')
  return raw ? JSON.parse(raw) : []
}

const saveTemplates: VueTemplateSaveHandler = async (templates) => {
  localStorage.setItem('my-templates', JSON.stringify(templates))
}
```

## 12. 打印 API

打印相关 API 从主入口直接导出：

```ts
export {
  BrowserPrintAdapter,
  BluetoothPrintAdapter,
  NetworkPrintAdapter,
  PrintManager,
  PrintCancelledError,
  PrintQueue,
  PrintRenderer,
  resolveObjectExpressions,
  resolveTemplateString,
}
```

同时导出打印相关类型：

```ts
export type {
  BluetoothPrinterConfig,
  BrowserPrinterConfig,
  ExpressionMissingValue,
  NetworkPrinterConfig,
  PrintBounds,
  PrintDataRow,
  PrintExportConfig,
  PrintExpressionConfig,
  PrintExpressionContext,
  PrintImageInput,
  PrintJobCallbacks,
  PrintJobConfig,
  PrintManagerOptions,
  PrintMaterialGridCollection,
  PrintMaterialGridColumn,
  PrintMaterialGridConfig,
  PrintMaterialGridInstance,
  PrintPageConfig,
  PrintPageRenderResult,
  PrintProgress,
  PrintTemplateConfig,
  PrinterAdapter,
  PrinterConfig,
}
```

### 12.1 `PrintManager`

```ts
class PrintManager {
  constructor(editor: Editor, options?: PrintManagerOptions)
  cancel(): void
  renderPages(
    config: PrintJobConfig,
    callbacks?: PrintJobCallbacks
  ): Promise<PrintPageRenderResult[]>
  print(
    config: PrintJobConfig,
    callbacks?: PrintJobCallbacks
  ): Promise<void>
}
```

| 方法 | 说明 |
| --- | --- |
| `constructor(editor, options?)` | 绑定当前 `Editor`，并注册默认打印适配器。 |
| `cancel()` | 取消正在运行的打印队列。 |
| `renderPages(config, callbacks?)` | 只渲染页面图片，不发送给打印机。 |
| `print(config, callbacks?)` | 渲染页面并通过指定打印适配器打印。 |

默认适配器：

| `printer.type` | 默认适配器 | 状态 |
| --- | --- | --- |
| `browser` | `BrowserPrintAdapter` | 可用，调用浏览器打印。 |
| `network` | `NetworkPrintAdapter` | 可用，通过 HTTP bridge 发送图片数据。 |
| `bluetooth` | `BluetoothPrintAdapter` | 占位实现，会抛错；需要注入自定义适配器。 |

示例：

```ts
import { PrintManager, type PrintJobConfig } from 'tldraw-vue-phase-one'

const manager = new PrintManager(editor)

const config: PrintJobConfig = {
  data: [
    { name: '张三', code: 'A001', phone: '13800000000' },
    { name: '李四', code: 'A002', phone: '13900000000' },
  ],
  page: {
    widthMm: 80,
    heightMm: 80,
    copies: 1,
    background: true,
  },
  export: {
    format: 'png',
    pixelRatio: 2,
    padding: 0,
  },
  printer: {
    type: 'browser',
    title: '标签打印',
  },
}

await manager.print(config, {
  onStart(total) {
    console.log('total', total)
  },
  onProgress(progress) {
    console.log(progress.current, progress.total)
  },
})
```

### 12.2 `PrintJobConfig`

```ts
interface PrintJobConfig {
  template?: PrintTemplateConfig
  data?: PrintDataRow[]
  page: PrintPageConfig
  export?: PrintExportConfig
  expression?: PrintExpressionConfig
  printer: PrinterConfig
  signal?: AbortSignal
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `template` | `PrintTemplateConfig` | 否 | 指定导出哪些图形、导出边界和物料表格数据。 |
| `data` | `PrintDataRow[]` | 否 | 批量打印数据。无物料表格时，每一行生成一页。 |
| `page` | `PrintPageConfig` | 是 | 打印纸张设置。 |
| `export` | `PrintExportConfig` | 否 | 图片导出设置。 |
| `expression` | `PrintExpressionConfig` | 否 | `{{表达式}}` 解析设置。 |
| `printer` | `PrinterConfig` | 是 | 打印目标配置。 |
| `signal` | `AbortSignal` | 否 | 外部取消信号。 |

注意：

- `page.widthMm` 和 `page.heightMm` 必须大于 `0`，否则抛错。
- 没有物料表格时，`data` 至少需要一行，否则抛错。
- 有物料表格时，可以通过 `template.materialGrid` 或 `template.materialGrids` 提供表格实例/数据。

### 12.3 `PrintTemplateConfig`

```ts
interface PrintTemplateConfig {
  shapeIds?: TLShapeId[]
  pageBounds?: PrintBounds
  pxPerMm?: number
  materialGrid?: PrintMaterialGridConfig | PrintMaterialGridInstance
  materialGrids?: PrintMaterialGridCollection
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `shapeIds` | `TLShapeId[]` | 要导出的顶层 shape id。未传时导出当前页所有 shape。导出时会包含这些 shape 的 descendants。 |
| `pageBounds` | `PrintBounds` | 导出区域。未传时使用 `{ x: 0, y: 0, w: widthMm * pxPerMm, h: heightMm * pxPerMm }`。 |
| `pxPerMm` | `number` | 毫米到页面单位换算，默认 `10`。 |
| `materialGrid` | `PrintMaterialGridConfig | object` | 单个物料节点的表格配置；模板中只有一个物料节点时使用。 |
| `materialGrids` | `PrintMaterialGridCollection` | 多物料配置入口；当前实现同页只允许一个物料节点，但支持按 id 映射配置。 |

### 12.4 `PrintBounds`

```ts
interface PrintBounds {
  x: number
  y: number
  w: number
  h: number
}
```

### 12.5 `PrintDataRow`

```ts
type PrintDataRow = Record<string, unknown>
```

表达式会从当前 row 读取字段，例如 `{{name}}`、`{{user.name}}`、`{{items[0].title}}`。

### 12.6 `PrintPageConfig`

```ts
interface PrintPageConfig {
  widthMm: number
  heightMm: number
  dpi?: number
  copies?: number
  background?: boolean
  marginMm?: number
}
```

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `widthMm` | `number` | 无 | 纸张宽度，单位 mm，必须大于 `0`。 |
| `heightMm` | `number` | 无 | 纸张高度，单位 mm，必须大于 `0`。 |
| `dpi` | `number` | 未使用 | 预留字段，当前渲染逻辑未直接使用。 |
| `copies` | `number` | `1` | 每页打印份数，会取 `Math.max(1, Math.floor(copies))`。 |
| `background` | `boolean` | `true` | 导出图片时是否包含背景。 |
| `marginMm` | `number` | `0` | 浏览器打印时的 `@page margin`。 |

### 12.7 `PrintExportConfig`

```ts
interface PrintExportConfig {
  format?: 'png' | 'jpeg' | 'webp'
  pixelRatio?: number
  padding?: number | 'auto'
  quality?: number
}
```

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `format` | `'png' | 'jpeg' | 'webp'` | `'png'` | 导出图片格式。 |
| `pixelRatio` | `number` | `2` | 导出分辨率倍率。 |
| `padding` | `number | 'auto'` | `0` | 导出区域留白。 |
| `quality` | `number` | `undefined` | 图片质量，主要影响 `jpeg`/`webp`。 |

### 12.8 表达式 API

#### `resolveTemplateString(template, context, config?)`

```ts
function resolveTemplateString(
  template: string,
  context: PrintExpressionContext,
  config?: PrintExpressionConfig
): string
```

把字符串中的 `{{ expression }}` 替换为数据。

#### `resolveObjectExpressions(value, context, config?)`

```ts
function resolveObjectExpressions<T>(
  value: T,
  context: PrintExpressionContext,
  config?: PrintExpressionConfig
): T
```

递归处理对象、数组和字符串中的模板表达式。

#### `PrintExpressionContext`

```ts
interface PrintExpressionContext {
  row: PrintDataRow
  index: number
  pageNo: number
  total: number
}
```

| 字段 | 说明 |
| --- | --- |
| `row` | 当前数据行。 |
| `index` | 从 `0` 开始的页索引。 |
| `pageNo` | 从 `1` 开始的页码。 |
| `total` | 总页数。 |

#### `PrintExpressionConfig`

```ts
interface PrintExpressionConfig {
  missingValue?: ExpressionMissingValue
  resolvers?: Record<string, (context: PrintExpressionContext) => unknown>
}
```

#### `ExpressionMissingValue`

```ts
type ExpressionMissingValue =
  | 'empty'
  | 'keep'
  | ((expression: string, context: PrintExpressionContext) => string)
```

| 值 | 行为 |
| --- | --- |
| `'empty'` | 默认值，缺失表达式替换为空字符串。 |
| `'keep'` | 保留原始 `{{ expression }}`。 |
| 函数 | 调用函数返回替换文本。 |

内置表达式：

| 表达式 | 说明 |
| --- | --- |
| `{{index}}` | 当前页索引，从 `0` 开始。 |
| `{{pageNo}}` | 当前页码，从 `1` 开始。 |
| `{{total}}` | 总页数。 |
| `{{row}}` | 当前数据行对象。 |
| `{{name}}` | 当前 row 的 `name` 字段。 |
| `{{user.name}}` | 支持点路径。 |
| `{{items[0].name}}` | 支持数组下标路径，会转换为点路径。 |

内置 filter：

| filter | 示例 | 说明 |
| --- | --- | --- |
| `upper` | `{{name | upper}}` | 转大写。 |
| `lower` | `{{name | lower}}` | 转小写。 |
| `json` | `{{row | json}}` | `JSON.stringify`。 |
| `fixed` | `{{price | fixed:2}}` | 数值保留小数位；非数值返回原值。 |

自定义 resolver：

```ts
const expression = {
  resolvers: {
    today: () => new Date().toLocaleDateString(),
    fullName: ({ row }) => `${row.firstName ?? ''}${row.lastName ?? ''}`,
  },
}
```

### 12.9 物料表格打印

```ts
type PrintMaterialGridCollection =
  | readonly PrintMaterialGridConfig[]
  | Record<string, PrintMaterialGridConfig | PrintMaterialGridInstance>

interface PrintMaterialGridConfig {
  materialId?: TLShapeId
  grid?: PrintMaterialGridInstance
  data?: readonly PrintDataRow[]
  columns?: readonly PrintMaterialGridColumn[]
  headerHeight?: number
  minRowHeight?: number
  fontSize?: number
  lineHeight?: number
  cellPaddingX?: number
  cellPaddingY?: number
  emptyText?: string
}

type PrintMaterialGridInstance = object
```

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `materialId` | `TLShapeId` | 自动匹配 | 指定物料节点 id。单物料节点模板可省略。 |
| `grid` | `object` | `undefined` | vxe-grid 或兼容实例。系统会尝试读取 `getTableData()`、`getData()`、`getColumns()` 等。 |
| `data` | `readonly PrintDataRow[]` | 从 `grid` 读取 | 直接传入表格数据。 |
| `columns` | `readonly PrintMaterialGridColumn[]` | 从 `grid` 读取 | 直接传入列定义。 |
| `headerHeight` | `number` | `34` | 表头高度。 |
| `minRowHeight` | `number` | `28` | 最小行高。 |
| `fontSize` | `number` | `12` | 单元格字体大小。 |
| `lineHeight` | `number` | `ceil(fontSize * 1.35)` | 单元格行高。 |
| `cellPaddingX` | `number` | `8` | 单元格横向 padding。 |
| `cellPaddingY` | `number` | `6` | 单元格纵向 padding。 |
| `emptyText` | `string` | `'暂无数据'` | 空表格提示。 |

列定义：

```ts
interface PrintMaterialGridColumn {
  field?: string
  property?: string
  prop?: string
  key?: string
  title?: string
  label?: string
  name?: string
  width?: number | string
  minWidth?: number | string
  renderWidth?: number
  resizeWidth?: number
  visible?: boolean
  type?: string
  formatter?: unknown
}
```

字段解析优先级：

- 字段名：`field` -> `property` -> `prop` -> `key`。
- 列标题：`title` -> `label` -> `name` -> 字段名 -> `type` -> `''`。
- 列宽：`renderWidth` -> `resizeWidth` -> `width` -> `minWidth`。
- `visible === false` 的列会被过滤。
- `type === 'seq'` 时单元格值为行号，从 `1` 开始。
- `formatter` 如果是函数，会以 `{ cellValue, row, column, rowIndex, columnIndex }` 调用。

直接传入数据和列：

```ts
await manager.print({
  template: {
    materialGrid: {
      data: [
        { sku: 'A001', name: '物料 A', qty: 10 },
        { sku: 'B002', name: '物料 B', qty: 5 },
      ],
      columns: [
        { type: 'seq', title: '序号', width: 48 },
        { field: 'sku', title: '编码', width: 100 },
        { field: 'name', title: '名称' },
        { field: 'qty', title: '数量', width: 80 },
      ],
    },
  },
  page: { widthMm: 80, heightMm: 80 },
  printer: { type: 'browser' },
})
```

### 12.10 打印机配置

#### `BrowserPrinterConfig`

```ts
interface BrowserPrinterConfig {
  type: 'browser'
  title?: string
}
```

使用隐藏 iframe 生成打印 HTML，并调用 `window.print()`。

#### `NetworkPrinterConfig`

```ts
interface NetworkPrinterConfig {
  type: 'network'
  host: string
  port?: number
  protocol?: 'escpos' | 'tspl' | 'zpl' | 'http'
  bridgeUrl?: string
  requestInit?: RequestInit
}
```

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `host` | 无 | 打印机主机地址，必填。 |
| `port` | `9100` | 打印机端口。 |
| `protocol` | `'escpos'` | 打印协议。 |
| `bridgeUrl` | `'/api/print/image'` | HTTP bridge 地址。 |
| `requestInit` | `undefined` | 额外 fetch 参数；`body`、`method`、`headers` 会被适配器覆盖或合并。 |

默认 payload：

```ts
{
  printer: {
    type: 'network',
    host,
    port,
    protocol,
  },
  page,
  pageNo,
  copyNo,
  image: {
    dataUrl,
    width,
    height,
  },
  row,
}
```

#### `BluetoothPrinterConfig`

```ts
interface BluetoothPrinterConfig {
  type: 'bluetooth'
  deviceId?: string
  protocol?: 'escpos' | 'tspl' | 'zpl' | 'sdk'
}
```

默认 `BluetoothPrintAdapter` 只是占位实现，会抛出错误。实际蓝牙打印需要通过 `PrintManagerOptions.adapters.bluetooth` 注入自定义适配器。

### 12.11 `PrinterAdapter`

```ts
interface PrinterAdapter {
  connect?(): Promise<void>
  printImage(input: PrintImageInput): Promise<void>
  printImages?(inputs: PrintImageInput[]): Promise<void>
  disconnect?(): Promise<void>
}
```

| 方法 | 说明 |
| --- | --- |
| `connect` | 打印前连接设备或初始化资源。 |
| `printImage` | 打印单页图片。 |
| `printImages` | 可选批量打印；存在时 `PrintManager` 会优先一次性传入全部页面/份数。 |
| `disconnect` | 打印完成、取消或异常后释放资源。 |

自定义适配器示例：

```ts
const manager = new PrintManager(editor, {
  adapters: {
    bluetooth: {
      async connect() {
        await sdk.connect()
      },
      async printImage(input) {
        await sdk.printDataUrl(input.dataUrl)
      },
      async disconnect() {
        await sdk.disconnect()
      },
    },
  },
})
```

### 12.12 `PrintImageInput`

```ts
interface PrintImageInput {
  dataUrl: string
  width: number
  height: number
  pageNo: number
  copyNo: number
  row: PrintDataRow
  page: PrintPageConfig
  printer: PrinterConfig
}
```

### 12.13 `PrintPageRenderResult`

```ts
interface PrintPageRenderResult {
  dataUrl: string
  width: number
  height: number
  pageNo: number
  index: number
  row: PrintDataRow
}
```

### 12.14 `PrintJobCallbacks`

```ts
interface PrintJobCallbacks {
  onStart?(total: number): void
  onPageRendered?(page: PrintPageRenderResult): void
  onPagePrinted?(progress: PrintProgress): void
  onProgress?(progress: PrintProgress): void
  onError?(error: unknown, pageNo?: number): void
  onComplete?(): void
  onCancel?(): void
}
```

| 回调 | 参数 | 说明 |
| --- | --- | --- |
| `onStart` | `total: number` | 开始打印前触发，`total = 渲染页数 * copies`。 |
| `onPageRendered` | `PrintPageRenderResult` | 单页图片渲染完成后触发。 |
| `onPagePrinted` | `PrintProgress` | 单页单份发送到打印适配器后触发。 |
| `onProgress` | `PrintProgress` | 当前实现与 `onPagePrinted` 同步触发。 |
| `onError` | `error: unknown, pageNo?: number` | 非取消错误时触发。当前实现未传具体 `pageNo`。 |
| `onComplete` | 无 | 全部打印完成后触发。 |
| `onCancel` | 无 | 通过 `cancel()` 或 `AbortSignal` 取消后触发。 |

### 12.15 `PrintProgress`

```ts
interface PrintProgress {
  current: number
  total: number
  pageNo: number
  copyNo: number
}
```

### 12.16 `PrintRenderer`

```ts
class PrintRenderer {
  constructor(editor: Editor)
  createRenderJobs(config: PrintJobConfig): PrintRenderJob[]
  renderPage(
    config: PrintJobConfig,
    row: Record<string, unknown>,
    index: number,
    total: number,
    options?: {
      materialGridPlan?: MaterialGridPrintPlan
      materialGridPageIndex?: number
    }
  ): Promise<PrintPageRenderResult>
}
```

`PrintRenderer` 适合只需要图片导出、不需要打印队列或适配器的底层场景。一般优先使用 `PrintManager.renderPages()`。

渲染过程会临时把 shape props 中的 `{{表达式}}` 替换成当前 row 的值，调用 `editor.toImageDataUrl()` 后恢复原始 shape props。若编辑器处于 readonly 状态且需要临时更新 shape，会抛出错误。

### 12.17 `PrintQueue`

```ts
class PrintQueue {
  get isRunning(): boolean
  get isCancelled(): boolean
  cancel(): void
  run<T>(
    items: readonly T[],
    worker: (item: T, context: PrintQueueItemContext) => Promise<void>,
    signal?: AbortSignal
  ): Promise<void>
}

interface PrintQueueItemContext {
  index: number
  total: number
  signal?: AbortSignal
  isCancelled(): boolean
}
```

队列同一时间只允许一个 `run()`；重复运行会抛出：

```txt
Print queue is already running.
```

### 12.18 `PrintCancelledError`

```ts
class PrintCancelledError extends Error
```

取消打印时抛出，`name` 为 `'PrintCancelledError'`。

## 13. 继承导出的 tldraw core API

主入口还会导出本地 `@tldraw/editor` 的 Vue core 版本。这个入口不包含 React UI 组件，但包含编辑器核心、schema、store、state、utils、validate 等能力。

### 13.1 Editor 核心

```ts
export {
  Editor,
  createTLStore,
  DEFAULT_ANIMATION_OPTIONS,
  DEFAULT_CAMERA_OPTIONS,
  SIDES,
}

export type {
  TLEditorOptions,
  TLEditorRunOptions,
  TLStoreBaseOptions,
  TLStoreEventInfo,
  TLStoreOptions,
  TLStoreSchemaOptions,
}
```

常用方式：

```ts
import { Editor, createTLStore } from 'tldraw-vue-phase-one'
```

### 13.2 Shape 与 Binding 扩展基类

```ts
export {
  BaseBoxShapeUtil,
  GroupShapeUtil,
  ShapeUtil,
  BindingUtil,
  StateNode,
  resizeBox,
  resizeScaled,
}

export type {
  TLBaseBoxShape,
  TLGeometryOpts,
  TLResizeInfo,
  TLShapeUtilConstructor,
  TLBindingUtilConstructor,
  BindingOnChangeOptions,
  BindingOnCreateOptions,
  BindingOnDeleteOptions,
  BindingOnShapeChangeOptions,
  BindingOnShapeDeleteOptions,
  BindingOnShapeIsolateOptions,
  TLStateNodeConstructor,
  ResizeBoxOptions,
}
```

用于编写自定义 shape util、binding util、工具状态节点。

### 13.3 几何与数学工具

```ts
export {
  Box,
  Mat,
  Vec,
  Geometry2d,
  Geometry2dFilters,
  Group2d,
  Rectangle2d,
  ROTATE_CORNER_TO_SELECTION_CORNER,
  rotateSelectionHandle,
  intersectCircleCircle,
  intersectCirclePolygon,
  intersectCirclePolyline,
  intersectLineSegmentCircle,
  intersectLineSegmentLineSegment,
  intersectLineSegmentPolygon,
  intersectLineSegmentPolyline,
  intersectPolygonBounds,
  intersectPolygonPolygon,
  linesIntersect,
  polygonIntersectsPolyline,
  polygonsIntersect,
  HALF_PI,
  PI,
  PI2,
  approximately,
  areAnglesCompatible,
  clamp,
  clampRadians,
  degreesToRadians,
  pointInPolygon,
  radiansToDegrees,
  rangeIntersection,
  shortAngleDist,
  snapAngle,
  toDomPrecision,
}

export type {
  BoxLike,
  MatLike,
  MatModel,
  VecLike,
  Geometry2dOptions,
  RotateCorner,
  SelectionCorner,
  SelectionEdge,
  SelectionHandle,
}
```

### 13.4 SVG 导出节点

```ts
export {
  SVG_EXPORT_FRAGMENT,
  isSvgExportNode,
  svgExportElement,
  svgExportFragment,
}

export type {
  SvgExportContext,
  SvgExportDef,
  SvgExportRenderable,
  SvgExportChild,
  SvgExportElementNode,
  SvgExportFragmentNode,
  SvgExportNode,
  SvgExportPrimitive,
  SvgExportProps,
  SvgExportStyle,
}
```

### 13.5 Snap 与共享样式

```ts
export {
  BoundsSnaps,
  SnapManager,
  ReadonlySharedStyleMap,
  SharedStyleMap,
  getColorValue,
}

export type {
  BoundsSnapGeometry,
  BoundsSnapPoint,
  GapsSnapIndicator,
  PointsSnapIndicator,
  SnapData,
  SnapIndicator,
  SharedStyle,
}
```

### 13.6 内容、选择与 reparenting

```ts
export {
  getDroppedShapesToNewParents,
  kickoutOccludedShapes,
}

export type {
  TLContent,
  TLResizeHandle,
  TLSelectionHandle,
}
```

### 13.7 `@tldraw/state`

通过主入口继承导出。核心 API 包括：

```ts
export {
  atom,
  computed,
  react,
  reactor,
  transact,
  transaction,
  localStorageAtom,
  getComputedInstance,
  isAtom,
  isSignal,
  isUninitialized,
  unsafe__withoutCapture,
  whyAmIRunning,
  withDiff,
  RESET_VALUE,
  UNINITIALIZED,
  EffectScheduler,
  WithDiff,
}

export type {
  Atom,
  AtomOptions,
  Computed,
  ComputedOptions,
  ComputeDiff,
  EffectSchedulerOptions,
  Reactor,
  Signal,
  RESET_VALUE,
  UNINITIALIZED,
  WithDiff,
}
```

### 13.8 `@tldraw/store`

通过主入口继承导出。核心 API 包括：

```ts
export {
  AtomMap,
  AtomSet,
  Store,
  StoreQueries,
  StoreSchema,
  StoreSideEffects,
  RecordType,
  assertIdType,
  createComputedCache,
  createMigrationIds,
  createMigrationSequence,
  createRecordType,
  devFreeze,
  isRecordsDiffEmpty,
  reverseRecordsDiff,
  squashRecordDiffs,
  MigrationFailureReason,
}

export type {
  BaseRecord,
  ChangeSource,
  CollectionDiff,
  ComputedCache,
  CreateComputedCacheOpts,
  HistoryEntry,
  IdOf,
  LegacyMigration,
  LegacyMigrations,
  Migration,
  MigrationId,
  MigrationResult,
  MigrationSequence,
  QueryExpression,
  QueryValueMatcher,
  RecordFromId,
  RecordId,
  RecordScope,
  RecordsDiff,
  SerializedSchema,
  SerializedStore,
  StoreListener,
  StoreListenerFilters,
  StoreObject,
  StoreOperationCompleteHandler,
  StoreSchemaOptions,
  StoreSnapshot,
  StoreValidationFailure,
  StoreValidator,
  UnknownRecord,
}
```

### 13.9 `@tldraw/tlschema`

通过主入口继承导出。常用 API 包括：

```ts
export {
  createShapeId,
  createBindingId,
  createCustomRecordId,
  createTLSchema,
  createShapeValidator,
  createBindingValidator,
  createAssetValidator,
  createShapePropsMigrationIds,
  createShapePropsMigrationSequence,
  createBindingPropsMigrationIds,
  createBindingPropsMigrationSequence,
  createAssetPropsMigrationIds,
  createAssetPropsMigrationSequence,
  createCustomRecordMigrationIds,
  createCustomRecordMigrationSequence,
  createPresenceStateDerivation,
  createUserId,
  createUserRecordType,
  isShape,
  isShapeId,
  isBinding,
  isBindingId,
  isDocument,
  isPageId,
  isUserId,
  toRichText,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultHorizontalAlignStyle,
  DefaultSizeStyle,
  DefaultTextAlignStyle,
  DefaultVerticalAlignStyle,
  GeoShapeGeoStyle,
  ArrowShapeArrowheadStartStyle,
  ArrowShapeArrowheadEndStyle,
  ArrowShapeKindStyle,
  AssetRecordType,
  CameraRecordType,
  DocumentRecordType,
  InstancePageStateRecordType,
  InstancePresenceRecordType,
  UserRecordType,
  defaultShapeSchemas,
  defaultBindingSchemas,
  defaultAssetSchemas,
  b64Vecs,
}
```

常用类型包括：

```ts
export type {
  TLAsset,
  TLAssetId,
  TLAssetPartial,
  TLAssetStore,
  TLBaseAsset,
  TLBaseBinding,
  TLBaseShape,
  TLBinding,
  TLBindingCreate,
  TLBindingId,
  TLBindingUpdate,
  TLBookmarkAsset,
  TLCamera,
  TLCursor,
  TLDefaultColorStyle,
  TLDefaultDashStyle,
  TLDefaultFillStyle,
  TLDefaultFontStyle,
  TLDefaultHorizontalAlignStyle,
  TLDefaultSizeStyle,
  TLDefaultTextAlignStyle,
  TLDefaultVerticalAlignStyle,
  TLDocument,
  TLFrameShape,
  TLGeoShape,
  TLGroupShape,
  TLImageAsset,
  TLImageShape,
  TLInstance,
  TLInstancePageState,
  TLInstancePresence,
  TLLineShape,
  TLPage,
  TLPageId,
  TLParentId,
  TLPropsMigrations,
  TLRecord,
  TLRichText,
  TLSchema,
  TLScribble,
  TLShape,
  TLShapeId,
  TLShapePartial,
  TLStore,
  TLStoreSnapshot,
  TLTextShape,
  TLTheme,
  TLUser,
  TLUserId,
  VecModel,
  BoxModel,
}
```

### 13.10 `@tldraw/utils`

通过主入口继承导出。常用 API 包括：

```ts
export {
  debounce,
  dedupe,
  FileHelpers,
  FpsScheduler,
  getFirstFromIterable,
  getHashForBuffer,
  getHashForObject,
  getHashForString,
  getIndexAbove,
  getIndexBelow,
  getIndexBetween,
  getIndices,
  getIndicesAbove,
  getIndicesBelow,
  getIndicesBetween,
  invLerp,
  isDefined,
  isEqual,
  isEqualWith,
  isNonNull,
  isNonNullish,
  lerp,
  LruCache,
  MediaHelpers,
  modulate,
  PerformanceTracker,
  PngHelpers,
  Result,
  rng,
  rotateArray,
  safeParseUrl,
  sortById,
  sortByIndex,
  sortByMaybeIndex,
  structuredClone,
  throttle,
  Timers,
  uniqueId,
  WeakCache,
  ZERO_INDEX_KEY,
}

export type {
  Awaitable,
  Expand,
  IndexKey,
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  MakeUndefinedOptional,
  RecursivePartial,
  Result,
}
```

### 13.11 `@tldraw/validate`

通过主入口继承导出：

```ts
export { T }
export {
  ArrayOfValidator,
  DictValidator,
  ObjectValidator,
  UnionValidator,
  ValidationError,
  Validator,
}

export type {
  TypeOf,
  Validatable,
  ValidatorFn,
  ValidatorUsingKnownGoodVersionFn,
  UnionValidatorConfig,
}
```

常用验证器：

```ts
T.string
T.number
T.boolean
T.array
T.object({ ... })
T.arrayOf(T.string)
T.optional(T.number)
T.nullable(T.string)
T.literal('value')
T.literalEnum('a', 'b', 'c')
T.union('type', { ... })
```

## 14. 常见使用场景

### 14.1 获取编辑器并创建形状

```vue
<script setup lang="ts">
import {
  TldrawVue,
  createShapeId,
  type Editor,
  type VueTextShape,
} from 'tldraw-vue-phase-one'
import { shallowRef } from 'vue'

const editor = shallowRef<Editor | null>(null)

function onReady(nextEditor: Editor) {
  editor.value = nextEditor
}

function addText() {
  editor.value?.createShapes<VueTextShape>([
    {
      id: createShapeId(),
      type: 'vue-text',
      x: 100,
      y: 100,
      props: {
        w: 180,
        h: 44,
        text: 'Hello',
        color: 'black',
        font: 'sans',
        size: 'm',
        autoSize: true,
      },
    },
  ])
}
</script>

<template>
  <TldrawVue @ready="onReady" />
  <button @click="addText">Add text</button>
</template>
```

### 14.2 使用表达式打印

画布文本可以写：

```txt
姓名：{{name}}
编号：{{code}}
第 {{pageNo}} / {{total}} 页
```

调用：

```ts
const manager = new PrintManager(editor)

await manager.renderPages({
  data: [
    { name: '张三', code: 'A001' },
    { name: '李四', code: 'A002' },
  ],
  page: { widthMm: 80, heightMm: 80 },
  printer: { type: 'browser' },
})
```

### 14.3 保留默认扩展并追加工具

```ts
const extensions = [
  ...getDefaultVueEditorExtensions(),
  {
    id: 'extra-tools',
    toolbarTools: [
      {
        id: 'my-tool',
        label: 'My tool',
        icon: 'select',
        placement: { area: 'more', group: 'custom' },
        selection: { tool: 'my-tool' },
      },
    ],
  },
] satisfies VueEditorExtension[]
```

## 15. 开发命令

```sh
yarn dev
yarn typecheck
yarn build
yarn build:demo
yarn preview
```

| 命令 | 说明 |
| --- | --- |
| `yarn dev` | 启动 Vite 开发服务。 |
| `yarn typecheck` | 执行 `vue-tsc --noEmit`。 |
| `yarn build` | 类型检查、库构建、声明文件构建。 |
| `yarn build:demo` | 以 demo 模式构建。 |
| `yarn preview` | 预览构建结果。 |

## 16. 维护备注

- API 源头以 `src/index.ts` 和 `dist/types/src/index.d.ts` 为准。
- `packages/*/api-report.api.md` 是本地 tldraw 子包的 API Extractor 报告，可用于核对继承导出的 core API。
- 当前 root package 的 `exports` 未开放子路径，因此新增对外 API 时建议从 `src/index.ts` 显式导出。
- 外部用户可以从主包导入物料节点类型和 `materialExtension`；推荐通过 `tldraw-vue-phase-one-pro` 的 `createTldrawVueProPlugin()` 统一使用高级能力。
