# TldrawVue API

本文档整理 `packages/tldraw-vue` 的公共接口。组件自身的实例方法通过 `defineExpose` 暴露，页面和 shape 的完整编辑能力通过 `getEditor()` 返回的底层 `Editor` 提供。

## 1. 组件 Props

```ts
type TldrawVueProps = {
  extensions?: readonly VueEditorExtension[]
  plugins?: readonly VueEditorPlugin[]
  createDefaultShapes?: boolean       // 默认 true
  loadTemplates?: VueTemplateLoadHandler
  saveTemplates?: VueTemplateSaveHandler
  showTemplateControls?: boolean      // 默认 true
  mode?: 'print' | 'presentation'      // 默认 print
  showModeControls?: boolean           // 默认 false
}
```

## 2. 组件事件

```ts
ready: [editor: Editor]
'content-change': []
'workspace-config-change': [config: VueTemplateWorkspaceConfig]
'mode-change': [mode: 'print' | 'presentation']
```

`ready` 事件触发后，才可以安全调用编辑器 API。

## 3. TldrawVue 实例接口

```ts
const designerRef = ref<InstanceType<typeof TldrawVue> | null>(null)
const editor = designerRef.value?.getEditor()
```

```ts
getEditor(): Editor | null
getWorkspaceTemplateConfig(): VueTemplateWorkspaceConfig
applyWorkspaceTemplateConfig(config: VueTemplateWorkspaceConfig): void
getDesignerMode(): 'print' | 'presentation'
setDesignerMode(mode: 'print' | 'presentation'): void
canRunCommand(commandId: string): boolean
runCommand(commandId: string, event?: Event): Promise<boolean>
getPluginIds(): string[]
previewPrint(): Promise<void>
printCurrentPage(): Promise<void>
getTemplateInfo(): Promise<TemplateInfo | null>
```

## 4. 模板信息

```ts
type TemplateInfo = {
  content: {
    pages: VueTemplatePage[]
    currentPageId: string
    workspace: VueTemplateWorkspaceConfig
  }
  pages: VueTemplatePage[]
  currentPageId: string
  workspace: VueTemplateWorkspaceConfig
}
```

多页模板首层只保存 `pages`、`currentPageId`、`workspace`。每一页的 `schema`、`shapes`、`bindings`、`assets` 位于 `page.content`。

## 5. 页面 API

```ts
editor.getPages(): TLPage[]
editor.getPage(pageId: TLPageId | TLPage): TLPage | undefined
editor.getCurrentPage(): TLPage
editor.getCurrentPageId(): TLPageId
editor.getPageShapeIds(pageId: TLPageId | TLPage): Set<TLShapeId>
editor.getCurrentPageShapeIds(): Set<TLShapeId>
editor.getCurrentPageShapeIdsSorted(): TLShapeId[]
```

### 新增页面

```ts
editor.createPage({
  id?: TLPageId
  name?: string
  index?: IndexKey
})
```

注意：`createPage()` 返回 `Editor`，不是新页面对象。指定 ID 后使用 `editor.getPage(id)` 获取页面。

```ts
const pageId = 'page:invoice-2' as TLPageId
editor.createPage({ id: pageId, name: '第二页' })
const page = editor.getPage(pageId)
```

### 页面操作

```ts
editor.setCurrentPage(pageId: TLPageId | TLPage): Editor
editor.renamePage(pageId: TLPageId | TLPage, name: string): Editor
editor.deletePage(pageId: TLPageId | TLPage): Editor
editor.duplicatePage(pageId?: TLPageId | TLPage, createId?: TLPageId): Editor
```

## 6. Shape API

### 查询 shape

```ts
editor.getShape<T extends TLShape = TLShape>(id: TLShapeId): T | undefined
editor.getCurrentPageShapes(): TLShape[]
editor.getCurrentPageShapesSorted(): TLShape[]
editor.getShapePageBounds(id: TLShapeId): Box | undefined
editor.getShapePageTransform(id: TLShapeId): Mat
editor.getSelectedShapes(): TLShape[]
editor.getSelectedShapeIds(): TLShapeId[]
```

### 新增 shape

```ts
editor.createShape<T extends TLShape>({
  id?: TLShapeId
  type: T['type']
  x?: number
  y?: number
  rotation?: number
  parentId?: TLParentId
  props: T['props']
  meta?: T['meta']
})

editor.createShapes([
  { type: 'vue-text', x: 40, y: 40, props: { /* shape props */ } },
])
```

`createShape` 和 `createShapes` 返回 `Editor`。如果需要稳定 ID，应在 partial 中提供 `id`。

### 更新、删除和选择

```ts
editor.updateShape({ id, type, x?, y?, rotation?, props? })
editor.updateShapes([{ id, type, props? }])
editor.deleteShape(shapeId)
editor.deleteShapes([shapeId1, shapeId2])

editor.select(...shapeIds)
editor.setSelectedShapes(shapeIds)
editor.selectAll()
editor.selectNone()
editor.getSelectedShapes()
```

### 分组、层级和布局

```ts
editor.groupShapes(shapeIds, { select?: boolean })
editor.ungroupShapes(shapeIds, { select?: boolean })
editor.reparentShapes(shapeIds, parentId, insertIndex?)
editor.duplicateShapes(shapeIds, offset?)
editor.toggleLock(shapeIds)
editor.sendToBack(shapeIds)
editor.sendBackward(shapeIds)
editor.bringForward(shapeIds)
editor.bringToFront(shapeIds)
editor.alignShapes(shapeIds, operation)
editor.distributeShapes(shapeIds, 'horizontal' | 'vertical')
editor.resizeToBounds(shapeIds, bounds)
editor.resizeShape(shapeId, scale, options?)
editor.rotateShapesBy(shapeIds, rotation)
editor.nudgeShapes(shapeIds, { x, y })
```

## 7. 页面内容导入导出

```ts
editor.getContentFromCurrentPage(
  shapeIds: TLShapeId[] | TLShape[],
  pageId?: TLPageId,
): TLContent | undefined

await editor.resolveAssetsInContent(content)

editor.putContentOntoCurrentPage(content, {
  point?: { x: number; y: number }
  select?: boolean
  preservePosition?: boolean
  preserveIds?: boolean
})
```

`putContentOntoCurrentPage` 只接受单页 `TLContent`。多页模板必须逐页导入：

```ts
for (const page of template.content.pages ?? []) {
  if (!editor.getPage(page.id)) editor.createPage({ id: page.id, name: page.name })
  editor.setCurrentPage(page.id)
  editor.deleteShapes([...editor.getPageShapeIds(page.id)])
  editor.putContentOntoCurrentPage(page.content, {
    preservePosition: true,
    preserveIds: false,
    select: false,
  })
}
```

## 8. 历史记录、事务和视图

```ts
editor.run(() => {
  editor.createPage({ name: '页面' })
  editor.createShape({ type: 'vue-text', props: { /* ... */ } })
}, { history: 'record' })

editor.undo()
editor.redo()
editor.clearHistory()
editor.markHistoryStoppingPoint('保存前')

editor.getCamera(): TLCamera
editor.setCamera({ x, y, z }, options?)
editor.zoomToFit(options?)
editor.zoomToSelection(options?)
editor.zoomIn(point?, options?)
editor.zoomOut(point?, options?)
editor.resetZoom(point?, options?)
editor.focus(options?)
```

## 9. 模板和工作区类型

```ts
interface VueTemplatePage {
  id: string
  name: string
  content: TLContent
}

type VueTemplateDocument = Partial<TLContent> & {
  pages?: VueTemplatePage[]
  currentPageId?: string
  workspace?: VueTemplateWorkspaceConfig
}

interface VueTemplateRecord {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  content: VueTemplateDocument
  workspace?: VueTemplateWorkspaceConfig
  metadata?: VueTemplateMetadata
}

interface VueTemplateWorkspaceConfig {
  designerMode?: 'print' | 'presentation'
  pageSizeMm?: { w: number; h: number }
  pageBounds?: { x: number; y: number; w: number; h: number }
  camera?: { x: number; y: number; z: number }
  guides?: WorkspaceGuide[]
  viewportSize?: { w: number; h: number }
  pxPerMm?: number
  printDataSource?: PrintDataSourceConfig
  background?: WorkspaceBackgroundConfig
  presentation?: PresentationConfig
}

interface WorkspaceBackgroundConfig {
  color: string
  imageUrl?: string
  imageSize: 'cover' | 'contain' | 'auto'
  imagePosition: string
}
```

模板回调：

```ts
type VueTemplateLoadHandler = () =>
  | readonly VueTemplateRecord[]
  | Promise<readonly VueTemplateRecord[]>

type VueTemplateSaveHandler = (
  templates: readonly VueTemplateRecord[],
) => void | Promise<void>
```

## 10. 自定义 shape 扩展

```ts
interface VueEditorExtension {
  id: string
  shapeUtils?: readonly TLShapeUtilConstructor[]
  bindingUtils?: readonly TLBindingUtilConstructor[]
  shapeComponents?: Readonly<Record<string, Component>>
  toolbarTools?: readonly VueToolbarToolDefinition[]
}

interface VueShapeCreateDefinition {
  shapeType: string
  defaultSize: { w: number; h: number }
  isAspectRatioLocked?: boolean
  createShape(context: VueShapeCreateContext): void
  updateShape?(context: VueShapeCreateContext): void
  onComplete?(context: VueShapeCreateCompleteContext): void
}

interface VueShapeCreateContext {
  editor: Editor
  id: TLShapeId
  point: Vec
  rect: { x: number; y: number; w: number; h: number }
  source: 'canvas' | 'toolbar'
}

interface VueShapeCreateCompleteContext extends VueShapeCreateContext {
  shape: TLShape
}
```

## 11. 插件和命令

```ts
interface VueEditorPlugin {
  id: string
  extensions?: readonly VueEditorExtension[]
  commands?: readonly VueEditorCommandDefinition[]
  shortcuts?: readonly VueEditorShortcutDefinition[]
  setup?(context: VueEditorPluginContext): void | (() => void)
}

interface VueEditorCommandDefinition {
  id: string
  label: string
  isEnabled?(context: VueEditorPluginContext): boolean
  run(context: VueEditorCommandContext): void | boolean | Promise<void | boolean>
}

interface VueEditorPluginContext {
  editor: Editor
  getContainer(): HTMLElement | null
  getWorkspaceTemplateConfig(): VueTemplateWorkspaceConfig | undefined
  applyWorkspaceTemplateConfig(config: VueTemplateWorkspaceConfig): void
  canRunCommand(commandId: string): boolean
  runCommand(commandId: string, event?: Event): Promise<boolean>
}
```

## 12. 内置 shape 类型

入口导出的主要 shape 类型：

- `VueBoxShape`
- `VueTextShape`
- `VueImageShape`
- `VueLineShape`
- `VueArrowShape`
- `VueDrawShape`
- `VueFrameShape`
- `VueTableShape`
- `VueQrShape`
- `VueBarcodeShape`
- `VueMaterialShape`
- `VueMaterialSectionShape`
- `VueResumeShape`
- `VueResumeSectionShape`

对应扩展包括：`frameExtension`、`materialExtension`、`resumeExtension`、`qrExtension`、`tableExtension`，以及默认扩展集合 `getDefaultVueEditorExtensions()`。

## 13. 示例：新增页面和 shape

```ts
import { createShapeId, type TLPageId } from '@enlearn/tldraw-vue'

const editor = designerRef.value?.getEditor()
if (!editor) throw new Error('设计器尚未就绪')

const pageId = 'page:shipping' as TLPageId
editor.createPage({ id: pageId, name: '发货单' })
editor.setCurrentPage(pageId)

editor.createShape({
  id: createShapeId(),
  type: 'vue-text',
  x: 40,
  y: 40,
  props: {
    text: '发货单',
    w: 240,
    h: 48,
    size: 'l',
    color: 'black',
    font: 'draw',
    autoSize: false,
    showBorder: false,
  },
})
```

## 14. 使用注意事项

1. 必须等待 `ready` 事件后再访问 `getEditor()`。
2. `createPage()` 返回 `Editor`，创建后使用 `getPage(pageId)` 读取页面。
3. `putContentOntoCurrentPage()` 只接受单页 `TLContent`，多页面模板必须逐页导入。
4. `preserveIds: true` 只适用于确认目标页面没有相同 shape ID 的场景；普通模板加载建议使用 `false`。
5. 页面和 shape 的组合修改建议放在 `editor.run()` 中，保证历史记录一致。
6. 只读模式下写操作会被编辑器忽略；创建 shape 前可用 `editor.canCreateShapes()` 检查容量。
