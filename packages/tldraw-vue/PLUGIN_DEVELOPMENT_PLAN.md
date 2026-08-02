# 插件化阶段开发验证

本文记录“高级功能统一拆入 Pro npm 包，再通过插件注入主库”的阶段验证结果和后续拆分计划。

## 阶段 1：主库插件内核验证

已完成：

- 新增 `VueEditorPlugin` 插件接口。
- 新增 `VueEditorCommandDefinition` 命令接口。
- 新增 `VueEditorShortcutDefinition` 快捷键接口。
- 新增 `VueEditorPluginHost`，负责插件生命周期、命令执行和快捷键分发。
- `TldrawVue` 新增 `plugins` prop。
- `TldrawVue` 组件实例新增：
  - `canRunCommand(commandId)`
  - `runCommand(commandId, event?)`
  - `getPluginIds()`
- `VueCanvas` 和 `VueEditorController` 已接入插件快捷键分发，插件快捷键优先于内置快捷键。
- 新增 `historyValidationPlugin`，用撤销/重做命令和快捷键验证“高级操作插件化”路径。

当前验证插件：

```ts
export const historyValidationPlugin = defineVueEditorPlugin({
  id: 'validation.history',
  commands: [
    {
      id: 'history.undo',
      label: 'Undo',
      isEnabled: ({ editor }) => editor.getCanUndo(),
      run: ({ editor }) => editor.undo(),
    },
    {
      id: 'history.redo',
      label: 'Redo',
      isEnabled: ({ editor }) => editor.getCanRedo(),
      run: ({ editor }) => editor.redo(),
    },
  ],
  shortcuts: [
    { command: 'history.undo', key: 'z', accel: true, priority: 100 },
    { command: 'history.redo', key: 'z', accel: true, shift: true, priority: 100 },
    { command: 'history.redo', key: 'y', accel: true, priority: 100 },
  ],
})
```

验证结论：

- 高级操作可以作为命令插件注入。
- 快捷键可以由插件注册，并通过 `priority` 覆盖内置逻辑。
- 二维码、物料表格等形状类能力可以通过插件的 `extensions` 字段注入。
- 主库仍兼容原有 `extensions` prop。

## 推荐拆包结构

```txt
tldraw-vue-phase-one
tldraw-vue-phase-one-pro
```

主包 `tldraw-vue-phase-one` 建议保留：

- 核心画布。
- 基础编辑器实例。
- 基础形状和基础工具。
- 插件系统。
- 本地模板能力。

Pro 包 `tldraw-vue-phase-one-pro` 建议统一承载：

- 二维码高级配置。
- 物料表格与分页打印。
- 打印预览。
- 网络打印/蓝牙打印。
- 快捷键增强。
- 团队模板库。
- PDF 高清导出。
- 权限、审计和授权校验。

说明：不再把二维码、物料、打印预览等能力各自发布为独立 npm 包。它们作为 Pro 包内部模块维护，对外通过一个或多个 Pro 插件工厂暴露。

## 阶段 2：Pro 形状能力拆分验证

目标：

- 把 `qrExtension` 迁移到 `tldraw-vue-phase-one-pro` 内部。
- 验证插件通过 `extensions` 注入 shape util、Vue shape component 和 toolbar tool。
- 保留主库默认功能兼容，或者改成主库不默认包含二维码，由 demo 显式注入。

建议 API：

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

验证点：

- 不安装插件时，主库可以正常运行。
- 安装插件后，toolbar 出现二维码工具。
- 创建、编辑、导出二维码形状正常。
- 类型可以从 Pro 包导入。

## 阶段 3：打印预览插件拆分验证

目标：

- 从 `VueTopLeftMenu` 抽离打印预览逻辑，迁移到 `tldraw-vue-phase-one-pro`。
- 插件注册 `print.preview`、`print.browser` 等命令。
- 主库提供菜单/面板注入点，或者由宿主应用通过 `runCommand()` 触发。

当前缺口：

- 插件系统还没有 UI 面板、菜单按钮、modal slot 的标准注入接口。
- `VueTopLeftMenu` 中打印预览仍是硬编码逻辑。

下一步建议新增：

```ts
interface VueEditorPanelDefinition {
  id: string
  component: Component
  placement: 'modal' | 'side-panel' | 'top-menu'
}

interface VueEditorPlugin {
  panels?: readonly VueEditorPanelDefinition[]
}
```

## 阶段 4：商业化验证

建议优先放入 Pro 包的收费模块：

| Pro 模块 | 收费理由 |
| --- | --- |
| `print-preview` | 直接关联生产打印工作流。 |
| `material` | 物料表格、分页、区域模板属于业务价值高的行业能力。 |
| `network-printer` | 涉及设备接入、桥接服务和售后支持。 |
| `team-templates` | 多人协作、模板库和权限适合 SaaS 套餐。 |
| `pdf-export` | 高清导出是明确高级能力。 |

不建议收费或不建议从免费版移除：

- 基础撤销/重做能力。
- 基础选择、移动、缩放和删除。
- 基础文本和图片。

撤销/重做更适合作为插件化技术验证，而不是实际付费墙。

## 当前风险

- 插件在第一阶段按编辑器创建时注册，不支持运行时热切换。后续如需动态启停，需要设计 store/shape util 重建，或只允许命令类插件动态启停。
- 前端 Pro npm 包无法提供强授权保护。商业授权、打印页数、模板数量和团队权限等需要服务端校验。
- 主入口仍 `export * from '@tldraw/editor'`，公开 API 面很大。商业化前建议收窄稳定 API，或明确标为高级/底层 API。
