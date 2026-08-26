# 低代码 Node 可执行 Action 清单

> 本文依据当前低代码运行时与数据库定义整理，更新于 2026-08-26。
>
> 脚本公共 API 的目标边界参见：[低代码脚本三入口架构](./lowcode-three-entry-script-architecture.md)。

## 1. Action 的三种含义

项目中与 Action 有关的能力分为三层，配置时不要混用：

1. **节点方法（Node Action）**  
   在按钮脚本或页面函数中通过 `this.executeAction({ node, method, ... })` 直接调用。合法方法、参数元数据和 QuickJS 源码统一保存在全局表 `lowcode_node_actions`；页面记录不保存 Action，也不关联页面 ID。
2. **交互动作（Runtime Event）**  
   用户点击按钮、提交表单、选择表格行等操作会发布运行时事件。事件可执行 `directives`、按钮 `script`，也可匹配页面级 `eventHandlers`。
3. **页面内置动作（Page Function）**  
   列表页和编辑页的常用按钮通过 `this.executeFunction()` 调用 `create`、`edit`、`save`、`approve` 等内置页面函数。

因此，下列调用只有注册为节点方法时才合法：

```js
async function main() {
  return this.executeAction({
    node: "student-grid",
    method: "loadData",
    filters: { status: "active" },
  });
}
```

`grid.editClick`、`form.submit` 等是**事件名**，不能作为 `method` 传给 `executeAction()`。

## 2. Node Action 总表

| Node `kind` | 节点名称 | `executeAction()` 方法 | 运行时交互动作/事件 |
| --- | --- | --- | --- |
| `text` | 文本 | 无 | 无 |
| `container` | 容器 | 无 | 透传子节点动作和事件 |
| `section` | 分区 | 无 | 透传子节点动作和事件 |
| `tabs` | 标签页 | 无 | 页签切换会派发浏览器事件 `lowcode:tab-activated`，不是低代码运行时事件 |
| `toolbar` | 工具栏 | 无 | 工具栏按钮点击、路由跳转、脚本、指令、刷新 |
| `buttonGroup` | 按钮组 | 无 | 普通按钮和下拉按钮点击、路由跳转、脚本、指令、页面内置动作 |
| `form` | 表单 | `loadData`（仅编辑表单）、`setData`、`validate`、`getData`、`refreshOptions`、`resetData` | 提交、普通动作、字段变化、保存完成 |
| `searchForm` | 查询表单 | `setData`、`validate`、`getData`、`refreshOptions`、`resetData` | 查询、重置、普通动作、字段变化 |
| `grid` | 表格 | `loadData`、`reloadData`、`getChanges`、`validate`、`addRow`、`deleteCurrentRow` | 工具栏、编辑、删除、行按钮、选择、双击、VXE 表格事件、右键菜单 |
| `detail` | 详情 | 无 | 无 |
| `modal` | 弹框 | `open` | 关闭、透传子节点动作和事件 |
| `drawer` | 抽屉 | `open` | 透传子节点动作和事件 |
| `statCard` | 指标卡 | 无 | 无 |
| `tree` | 树 | 无 | 当前通用树仅展示，不发布节点选择事件 |
| `planningFlow` | 工艺路线 | 无 | 工序节点选择；适应视图、缩放仅为组件本地操作 |
| `planningGantt` | 排产甘特图 | 无 | 计划任务选择 |
| `planningBom` | 工艺 BOM | 无 | BOM 节点选择 |

“无”表示当前没有注册可供 `this.executeAction()` 调用的方法；该节点仍可能被通用指令更新，或通过页面级 `eventHandlers` 响应事件。

## 3. 已注册的节点方法

### 3.1 `form` / `searchForm`: `setData`

合并或替换表单运行时数据。

```js
await this.executeAction({
  node: "student-form",
  method: "setData",
  data: {
    name: "张三",
    status: "draft",
  },
  mode: "merge",
});
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `node` | `string` | 是 | 表单或查询表单节点 ID |
| `method` | `"setData"` | 是 | 节点方法 |
| `data` | `object` | 是 | 写入的字段和值 |
| `mode` | `"merge" \| "replace"` | 否 | 默认 `merge`；`replace` 完整替换表单对象 |

返回更新后的完整表单对象。数组字段在写入时整体替换。

#### 表单其他 Method

| Method | 参数 | 返回值 | 说明 |
| --- | --- | --- | --- |
| `validate` | 无 | `boolean` | 执行字段规则校验并显示校验状态 |
| `getData` | 无 | `object` | 返回当前绑定数据的深拷贝 |
| `refreshOptions` | `codes?: string[]`、`sourceKeys?: string[]` | `{ codes, sourceKeys }` | 刷新字段绑定的 `optionsCode` 和 `optionsSourceKey`；省略参数时刷新该表单的全部下拉绑定 |
| `resetData` | 无 | `object` | 恢复页面最近一次加载完成时的表单基线，并清除校验状态 |

```js
const valid = await this.executeAction({
  node: "student-form",
  method: "validate",
});
const data = await this.executeAction({
  node: "student-form",
  method: "getData",
});
await this.executeAction({
  node: "student-form",
  method: "refreshOptions",
});
await this.executeAction({
  node: "student-form",
  method: "resetData",
});
```

### 3.2 `grid`: `loadData`

按照表格的数据源配置请求数据，并同步数据源和表格运行时状态。

```js
const rows = await this.executeAction({
  node: "order-detail-grid",
  method: "loadData",
  filters: { enabled: true },
  postData: { pageSize: 100 },
  mainGrid: "order-main-grid",
  filterMap: { order_id: "id" },
});
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `node` | `string` | 是 | 表格节点 ID |
| `method` | `"loadData"` | 是 | 节点方法 |
| `filters` | `object` | 否 | 附加过滤条件，覆盖数据源中的同名条件 |
| `postData` | `object` | 否 | 附加请求参数 |
| `mainGrid` | `string` | 否 | 明细表关联的主表节点 ID；省略时查找 `tableType="main"` 的表格 |
| `filterMap` | `Record<string, string>` | 否 | 明细字段到主表字段的映射，如 `{ order_id: "id" }` |

行为说明：

- 普通表和主表会合并查询表单中的搜索条件。
- 明细表会从主表的 `currentRow`、`selectedRows[0]` 或 `contextRow` 取得关联值。
- 明细表缺少必需关联条件时返回空数组，不会退化为无条件全表查询。
- 返回服务端结果，同时更新绑定的 `sourceKey`。

### 3.3 `grid`: `reloadData`

使用本地数组直接覆盖当前表格数据，不请求服务端。

```js
const rows = await this.executeAction({
  node: "student-grid",
  method: "reloadData",
  data: [
    { id: 1, name: "张三" },
    { id: 2, name: "李四" },
  ],
});
```

`data` 可传 `object[]` 或 `{ rows: object[] }`。如果表格绑定了 `sourceKey`，会覆盖该数据源；否则只更新该表格的运行时行数据。返回规范化后的行数组。

### 3.4 `grid`: 行编辑 Action

| Method | 参数 | 返回值 | 说明 |
| --- | --- | --- | --- |
| `validate` | 无 | `boolean` | 使用 VXE Grid 的 `editRules` 校验当前全部行，并显示单元格校验状态 |
| `addRow` | `data?: object` | `object` | 深拷贝初始数据并追加到末尾，再将新增行设为当前行；`data` 默认 `{}` |
| `deleteCurrentRow` | 无 | `object \| null` | 删除当前行并返回其深拷贝；没有当前行时返回 `null` |

```js
const valid = await this.executeAction({
  node: "order-lines-grid",
  method: "validate",
});

const row = await this.executeAction({
  node: "order-lines-grid",
  method: "addRow",
  data: { quantity: 1 },
});

const deleted = await this.executeAction({
  node: "order-lines-grid",
  method: "deleteCurrentRow",
});
```

`deleteCurrentRow` 按 `currentRow`、`selectedRows[0]`、`contextRow` 的顺序解析当前行。它只修改前端绑定数据，不调用数据源的删除接口。

### 3.5 `modal` / `drawer`: `open`

打开交互层，并在用户确认后返回结果表单数据。

```js
const result = await this.executeAction({
  node: "student-editor-modal",
  method: "open",
  data: { id: 1001 },
  resultNode: "student-editor-form",
});

if (result) {
  // 用户确认，result 是结果表单对象
}
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `node` | `string` | 是 | `modal` 或 `drawer` 节点 ID |
| `method` | `"open"` | 是 | 节点方法 |
| `data` | `object` | 否 | 结果表单的初始数据 |
| `resultNode` | `string` | 否 | 结果表单节点 ID；默认读取节点的 `resultNode` 配置 |

确认时返回表单对象，取消或关闭时返回 `null`。结果节点必须是 `form`。

## 4. 各 Node 的交互动作

### 4.1 `toolbar`

`actions[]` 中每个按钮支持：

- `eventName`：默认事件名为 `toolbar.click`。
- `route`：事件指令和脚本执行后跳转。
- `directives`：点击时依次执行运行时指令。
- `script`：在隔离脚本运行时执行。
- `code: "refresh"`：没有自定义刷新指令或脚本时，自动重新加载页面数据。

事件 payload 包含 `action`、`actionCode`、`script` 和 `directives`。

### 4.2 `buttonGroup`

根按钮和下拉子按钮使用相同执行链：

- 默认事件名：`buttonGroup.click`。
- 支持 `eventName`、`route`、`directives`、`script`。
- `disabled: true` 时不执行。
- 带 `children` 的根按钮只展开菜单，实际动作由子按钮触发。
- `permissionCode` 会传给 VXE Button；后端接口仍需执行最终鉴权。

常用按钮预设及页面函数见“第 6 节”。

### 4.3 `form`

| 事件 | 触发条件 | 关键 payload |
| --- | --- | --- |
| `form.submit` | 提交按钮或表单提交 | `actionCode`、`values` |
| `form.action` | 非提交表单按钮 | `actionCode`、`values` |
| `form.fieldChange` | 字段值变化 | `field`、`value`、`previousValue`、`values` |
| `form.saved` | 数据源保存成功 | `sourceKey`、`values` |

事件名可由 Action 的 `eventName` 覆盖。内置行为：

- `route` 存在时跳转，并可在路由模板中读取表单值。
- `code: "submit"` 或 `type: "submit"` 会保存 `submitSourceKey ?? sourceKey` 对应的数据源。
- 保存成功后重新加载页面数据并发布 `form.saved`。
- 字段指令来自 `field.events.change ?? field.events.onChange`。

### 4.4 `searchForm`

| 事件 | 触发条件 | 关键 payload |
| --- | --- | --- |
| `searchForm.submit` | 查询提交 | `actionCode`、`values` |
| `searchForm.action` | 其他查询表单按钮 | `actionCode`、`values` |
| `searchForm.fieldChange` | 查询字段变化 | `field`、`value`、`previousValue`、`values` |

内置行为：

- 提交时把查询值写入 `targetSourceKeys`，或兼容字段 `targetSourceKey`，然后刷新这些数据源。
- `type: "reset"` 清空目标数据源的搜索条件并刷新。
- 字段变化指令与普通表单一致。

### 4.5 `grid`

#### 业务动作

| 动作/事件 | 默认事件名 | 内置行为 |
| --- | --- | --- |
| 工具栏按钮 | `grid.toolbarClick` | 执行按钮的 `script` 和 `directives` |
| 编辑按钮 | `grid.editClick` | 优先打开关联编辑页，其次使用 `editRoute`，最后把行数据写入关联表单 |
| 删除按钮 | `grid.deleteClick` | 调用数据源 `deleteMethod`，成功后重新加载页面 |
| 自定义行按钮 | `grid.rowAction` | 执行该行按钮的 `script` 和 `directives` |

`editClick` 和 `deleteClick` 可通过 `schema.eventNames` 改名，通过 `schema.events` 附加指令。

#### 表格事件

表格可发布下列 `grid.<key>` 事件：

```text
rowCurrentChange  cellClick        cellMenu
cellDblclick      rowDblclick      radioChange
checkboxChange    checkboxAll      sortChange
filterChange      pageChange       toolbarButtonClick
toolbarToolClick  proxyQuery       proxyDelete
proxySave         formSubmit       formReset
zoom              headerMenuClick  bodyMenuClick
footerMenuClick   menuClick
```

- 事件名可由 `schema.eventNames[key]` 覆盖。
- 指令读取 `schema.events[key]`；`rowCurrentChange` 兼容旧键 `currentRowChange`。
- 事件 payload 通常包含 `key`、`row`、`actionCode` 和原始 VXE 事件 `rawEvent`。
- 选择事件会同步表格运行时的 `currentRow`、`selectedRows`、`contextRow` 和 `currentCell`。
- 右键菜单 `tableInfoDesign` 在编辑环境打开表格设计器；`editCurrentRow` 进入同一套编辑行为。其他菜单项默认只发布事件，需要通过事件指令或脚本实现业务。

### 4.6 `modal`

- 点击关闭按钮或遮罩发布 `modal.close`。
- 事件内置 `closeBlock` 指令，将当前弹框的 `open` 设为 `false`。
- 弹框内部子节点的表单、表格、按钮动作全部向上透传。

### 4.7 `drawer`

抽屉本身当前没有关闭按钮事件，但会透传所有子节点动作。可用 `closeBlock` / `closeModal` 指令关闭，也可通过 `executeAction({ method: "open" })` 以带结果的交互方式打开。

### 4.8 `container` / `section` / `tabs`

- `container`、`section` 只负责布局并透传子节点动作。
- `tabs` 也透传子节点动作。
- 页签切换派发原生浏览器事件 `lowcode:tab-activated`，payload 为 `{ blockId, tabKey }`；该事件主要用于让甘特图、流程图重新测量，不进入低代码 `eventHandlers`。

### 4.9 规划类节点

| Node | 事件 | payload |
| --- | --- | --- |
| `planningFlow` | `planningFlow.nodeSelect` | `id`、`value`、`row` |
| `planningGantt` | `planningGantt.taskSelect` | `id`、`value`、`row` |
| `planningBom` | `planningBom.nodeSelect` | `id`、`value`、`row` |

这些节点没有内联 `directives` 字段，但可在页面 `eventHandlers` 中按事件名、`blockId` 或 `blockKind` 绑定指令。

### 4.10 纯展示节点

`text`、`detail`、`statCard` 当前只展示数据，没有直接节点方法或运行时交互事件。通用 `tree` 目前也只展示树结构；如需选择行为，应新增树选择事件后再进入事件系统。

## 5. 所有交互节点可执行的 Runtime Directive

只要节点能够发布 Runtime Event，就可以通过 Action 的 `directives` 或页面 `eventHandlers` 使用以下指令。别名共用同一处理器。

| 能力 | 指令名及别名 |
| --- | --- |
| 设置数据源 | `setDataSource`、`updateDataSource` |
| 设置表格行 | `setGridRows`、`updateGridRows` |
| 设置表单对象 | `setFormValues`、`updateFormModel`、`setFormData`、`updateFormData` |
| 设置单个表单字段 | `setFormField`、`updateFormField` |
| 设置搜索条件 | `setSearchFilters`、`updateSearchFilters` |
| 刷新数据源 | `refreshDataSource`、`refreshDataSources` |
| 刷新整页 | `refreshPage` |
| 调用服务 | `invokeService` |
| 路由跳转 | `navigate`、`routePush` |
| 显示消息 | `showMessage` |
| 发布低代码事件 | `emitEvent` |
| 派发浏览器事件 | `dispatchWindowEvent`、`dispatchBrowserEvent` |
| 打开 Overlay | `openBlock`、`openModal` |
| 关闭 Overlay | `closeBlock`、`closeModal` |
| 切换 Overlay | `toggleModal` |
| 打开全局弹框 | `openGlobalDialog`、`openDialog` |
| 打开页面引用弹框 | `openPageReferenceDialog`、`openLowCodePageReferenceDialog`、`openReferenceDialog` |

指令支持 `disabled` 和 `when`。字符串值可以读取以下表达式作用域：

```text
row.*            当前事件行
event.*          当前事件 payload
value / values   当前值或表单值
data.*           页面数据源
form.* / forms.* 表单状态
search.*         搜索条件
grids.*          表格运行时状态
route.*          当前路由
```

示例：选择 BOM 节点后写入表单并打开弹框。

```json
{
  "event": "planningBom.nodeSelect",
  "blockId": "bom-tree",
  "directives": [
    {
      "type": "setFormValues",
      "blockId": "bom-form",
      "mode": "merge",
      "values": {
        "item_id": "{{ row.id }}",
        "item_name": "{{ row.title }}"
      }
    },
    {
      "type": "openBlock",
      "blockId": "bom-editor-modal"
    }
  ]
}
```

## 6. `buttonGroup` 页面内置动作

动作预设保存在 `lowcode/actions/builtins.ts`，生成的按钮脚本通过 `this.executeFunction()` 调用内置页面函数。

### 6.1 列表页 `pageType: "list"`

| Action Key | 按钮 code | 页面函数 | 选择要求 | 行为 |
| --- | --- | --- | --- | --- |
| `record.create` | `create` | `create` | 无 | 打开关联编辑页 |
| `record.edit` | `edit` | `edit` | 单选 | 携带选中行打开关联编辑页 |
| `record.approve` | `approve` | `approve` | 多选 | 审核选中数据 |
| `record.unapprove` | `unapprove` | `unapprove` | 多选 | 反审选中数据 |
| `record.close` | `close` | `close` | 多选 | 关闭选中数据 |
| `record.open` | `open` | `open` | 多选 | 重新打开选中数据 |
| `page.refresh` | `refresh` | `refresh` | 无 | 刷新全部数据源 |
| `print.page` | `print` | `print` | 无 | 调用浏览器打印 |
| `page.exit` | `exit` | `exit` | 无 | 退出当前页面 |
| `data.import` | `import` | 无 | 无 | 只发布按钮事件，由页面配置具体导入行为 |
| `data.export` | `export` | 无 | 无 | 只发布按钮事件，由页面配置具体导出行为 |
| `group.more` | `more` | 无 | 无 | 下拉容器，默认包含导入和导出 |

### 6.2 编辑页 `pageType: "edit"`

| Action Key | 按钮 code | 页面函数 | 行为 |
| --- | --- | --- | --- |
| `record.duplicate` | `duplicate` | `copy` | 复制当前表单并清除主键和审计字段 |
| `record.create` | `create` | `create` | 按初始值进入新增状态 |
| `record.modify` | `modify` | `modify` | 进入修改状态 |
| `record.save` | `save` | `save` | 保存所有绑定保存数据源的表单 |
| `record.approve` | `approve` | `approve` | 更新审核状态并保存 |
| `record.unapprove` | `unapprove` | `unapprove` | 恢复未审核状态并保存 |
| `record.close` | `close` | `close` | 更新关闭状态并保存 |
| `record.open` | `open` | `open` | 恢复打开状态并保存 |
| `page.refresh` | `refresh` | `refresh` | 刷新全部数据源 |
| `page.exit` | `exit` | `exit` | 返回来源列表页或指定路由 |

审核、反审、关闭、打开可通过函数 `args.values` 或 `args.field` / `args.value` 覆盖默认状态字段，也可配置 `serviceName` 和 `serviceMethod` 调用专用业务接口。

## 7. 运行顺序

按钮、表单和表格业务动作采用以下执行顺序：

1. Node 发布 Runtime Event。
2. 执行 Action 内联 `directives`。
3. 执行匹配的页面级 `schema.eventHandlers`。
4. 执行 Action 的隔离 `script`。
5. 等待上述步骤完成后，再执行内置行为，例如路由跳转、表单保存、查询刷新或默认刷新。

页面级事件处理器可按以下条件过滤：

```ts
type LowCodeEventHandler = {
  event: string;       // 可使用 "*"
  blockId?: string;
  blockKind?: string;
  actionCode?: string;
  field?: string;
  disabled?: boolean;
  directives: LowCodeRuntimeDirective[];
};
```

## 8. 维护入口

- 数据表、内置 Action 和旧选项源清理：[`20260826220000_database_node_actions.sql`](../supabase/migrations/20260826220000_database_node_actions.sql)
- CRUD 资源与权限：[`lowcode.resources.ts`](../api/src/lowcode-service/lowcode.resources.ts)
- 运行页面附加全局 Action：[`lowcode.service.ts`](../api/src/lowcode-service/lowcode.service.ts)
- 数据库 Action 查询与适用条件：[`node-action-registry.ts`](../packages/lowcode-framework/src/runtime/node-action-registry.ts)
- QuickJS 执行与通用 Node Host Bridge：[`lowcode-page-script-runtime.ts`](../packages/lowcode-framework/src/runtime/lowcode-page-script-runtime.ts)
- Worker 的 `$node.call` 能力：[`script-runtime.worker.ts`](../packages/lowcode-framework/src/runtime/script-runtime.worker.ts)
- Runtime Directive 注册表：[`directives.ts`](../packages/lowcode-framework/src/runtime/directives.ts)
- Runtime Event 匹配和指令合并：[`event-system.ts`](../packages/lowcode-framework/src/lowcode/event-system.ts)
- 常用按钮动作预设：[`builtins.ts`](../packages/lowcode-framework/src/lowcode/actions/builtins.ts)
- 列表页/编辑页内置页面函数：[`page-function/`](../packages/lowcode-framework/src/runtime/page-function/index.ts)
- 各 Node 的交互实现：[`block-materials`](../packages/lowcode-framework/src/lowcode/block-materials)

新增节点方法时，直接向 `lowcode_node_actions` 写入 Node 类型、方法元数据和 `source_code`。脚本只能通过 `$node.call(command, payload)` 使用通用 Host Bridge；不要在前端新增某个 Action 专用的 TypeScript executor。
