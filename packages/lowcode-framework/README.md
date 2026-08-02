# @enlearn/lowcode-framework

EnLearn 低代码框架包，提供 Vue 3/Nuxt 3 场景下的页面运行时渲染器、可视化设计器、页面 Schema、物料注册表、表单字段物料、事件指令系统，以及可视化设计数据和运行时 Schema 的互转工具。

当前包名：`@enlearn/lowcode-framework`

当前版本：`0.1.0`

## 能力范围

- 运行时渲染：根据 `LowCodePageRecord` / `LowCodePageSchema` 渲染低代码页面。
- 可视化设计：提供页面设计器、设计器 Provider、设计器数据模型。
- Schema 工具：低代码页面 Schema 的规范化、迁移、校验和发布前准备。
- 物料体系：页面块物料、表单字段物料、可视化到运行时转换器。
- 事件系统：运行时事件总线、事件匹配、指令解析。
- 数据格式化：表格、详情、统计卡等运行时数据格式化辅助函数。

## 安装

```bash
pnpm add @enlearn/lowcode-framework
```

运行时依赖由宿主项目提供，建议在业务项目中安装：

```bash
pnpm add vue vue-router vxe-pc-ui vxe-table remixicon vuedraggable nanoid lodash-es dayjs monaco-editor @vueuse/core @vueuse/integrations
pnpm add -D @vitejs/plugin-vue-jsx sass vue-tsc typescript
```

## 宿主项目要求

推荐通过 `createLowCodePlugin({ serviceApi, router })` 注入宿主能力。Nuxt 自动导入的 `useRoute`、`useRouter`、`useServiceApi` 只作为仓库内历史兼容兜底，不作为发布后的稳定依赖。

宿主适配层最小接口：

```ts
type LowCodeHostServiceApi = {
  invoke<T = unknown>(
    serviceName: string,
    serviceMethod: string,
    payload?: Record<string, unknown>
  ): Promise<T>;
};

type LowCodeHostRouter = {
  push(to: string | Record<string, unknown>): Promise<unknown> | unknown;
};

type LowCodeHostRoute = {
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
  path?: string;
  fullPath?: string;
};
```

`LowCodePageRenderer`、`LowCodeVisualDesigner` 会通过宿主适配层加载数据源、保存页面、删除记录、跳转路由和调用指令服务。纯工具函数不依赖这些宿主能力。

Nuxt 示例：

```ts
export function useServiceApi() {
  async function invoke<TResponse = unknown>(
    serviceName: string,
    serviceMethod: string,
    postData: Record<string, unknown> = {}
  ) {
    return $fetch<TResponse>('/api/service', {
      method: 'POST',
      body: { serviceName, serviceMethod, postData },
    });
  }

  return { invoke };
}
```

推荐在 Vue/Nuxt 入口安装宿主适配插件，外部项目不需要依赖 Nuxt 自动导入：

```ts
import { createLowCodePlugin } from '@enlearn/lowcode-framework/core';

export default defineNuxtPlugin((nuxtApp) => {
  const serviceApi = {
    invoke<T = unknown>(
      serviceName: string,
      serviceMethod: string,
      postData: Record<string, unknown> = {}
    ) {
      return $fetch<T>('/api/service', {
        method: 'POST',
        body: { serviceName, serviceMethod, postData },
      });
    },
  };

  nuxtApp.vueApp.use(createLowCodePlugin({
    serviceApi,
    router: useRouter(),
    route: useRoute(),
    locale: 'zh-CN',
    messages: {
      'zh-CN': {
        'runtime.form.saved': '保存成功。',
      },
    },
    theme: {
      variables: {
        '--lc-color-primary': '#2563eb',
      },
    },
  }));
});
```

`createLowCodePlugin` 参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `serviceApi` | `LowCodeHostServiceApi` | 是 | 宿主服务调用适配器，框架只调用 `invoke()` |
| `router` | `LowCodeHostRouter` | 否 | 路由跳转适配器，运行时 `navigate` 指令和设计器返回会使用 |
| `route` | `LowCodeHostRoute` | 否 | 当前路由信息，运行时表达式和 watch 会读取 |
| `locale` | `string` | 否 | i18n locale，内置 `en-US` / `zh-CN` 消息 |
| `messages` | `LowCodeMessages` | 否 | 覆盖或扩展消息文案，支持直接 key map 或按 locale 分组 |
| `theme` | `LowCodeTheme` | 否 | 注入主题 class 和 CSS 变量 |

### 主题和 i18n

```ts
import {
  lowCodeBuiltinMessages,
  lowCodeDefaultMessages,
  lowCodeZhCNMessages,
  type LowCodeTheme,
} from '@enlearn/lowcode-framework/core';

const theme: LowCodeTheme = {
  className: 'my-lowcode-theme',
  variables: {
    '--lc-color-primary': '#2563eb',
    '--lc-color-surface': '#ffffff',
    '--lc-color-border': '#dbe3ef',
  },
};
```

| API / 类型 | 说明 |
| --- | --- |
| `LowCodeTheme` | `{ className?: string; variables?: Record<string, string \| number> }` |
| `applyLowCodeTheme(theme)` | 把主题 class 和 CSS 变量写入 `document.documentElement` |
| `LowCodeMessages` | 支持 `{ [messageKey]: text }` 或 `{ [locale]: { [messageKey]: text } }` |
| `lowCodeDefaultMessages` | 默认英文消息 |
| `lowCodeZhCNMessages` | 内置中文消息 |
| `lowCodeBuiltinMessages` | 内置 locale 消息表，目前包含 `en-US`、`zh-CN` |

VXE 组件和样式需要在宿主项目注册：

```ts
import { VxeUI } from 'vxe-pc-ui';
import VxeUITable from 'vxe-table';
import 'vxe-pc-ui/lib/style.css';
import 'vxe-table/lib/style.css';
import '@enlearn/lowcode-framework/styles/visual-editor-utilities.scss';

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(VxeUI);
  nuxtApp.vueApp.use(VxeUITable);
});
```

## 宿主服务接口

框架本身不直接绑定后端路由，而是统一通过宿主实现的 `serviceApi.invoke(serviceName, serviceMethod, postData)` 调用服务。当前项目里的低代码服务约定如下：

```ts
type ServiceInvokePayload = {
  serviceName: string;
  serviceMethod: string;
  postData?: Record<string, unknown>;
};

type ServiceInvoke = <T = unknown>(
  serviceName: string,
  serviceMethod: string,
  postData?: Record<string, unknown>
) => Promise<T>;
```

### `lowcode.listItems`

```ts
invoke<LowCodePageRecord[]>('lowcode', 'listItems', {
  tableName: 'lowcode_pages',
  sorts: [{ field: 'updated_at', direction: 'desc' }],
});
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| 无 | - | - | 当前实现忽略 `postData` |

返回值：`Promise<LowCodePageRecord[]>`。

说明：按 `updated_at` 倒序返回低代码页面列表。

### `lowcode.getPage`

```ts
invoke<LowCodePageRecord & { resolvedData: Record<string, unknown> }>(
  'lowcode',
  'getPage',
  {
    code: 'users',
    includeData: true,
  }
);
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `code` | `string` | 与 `route` 二选一 | 页面编码 |
| `route` | `string` | 与 `code` 二选一 | 页面路由 |
| `includeData` | `boolean` | 否 | 是否包含已解析数据，默认 `true` |

返回值：`Promise<LowCodePageRecord & { resolvedData: Record<string, unknown> }>`。

异常：`code` 和 `route` 都为空时返回参数错误；查不到页面时返回 not found。

### `lowcode.saveItem`

```ts
invoke<LowCodePageRecord>('lowcode', 'saveItem', {
  resource: 'pages',
  id: existingPage?.id,
  data: {
    code: schema.code,
    route: schema.route,
    title: schema.title,
    description: schema.description ?? null,
    layout: schema.layout ?? 'dashboard',
    status: schema.status ?? 'draft',
    keep_alive: schema.keepAlive ?? true,
    edit_page_id: existingPage?.edit_page_id ?? null,
    schema,
    version: (existingPage?.version ?? 0) + 1,
    published_at: schema.status === 'published'
      ? new Date().toISOString()
      : existingPage?.published_at ?? null,
  },
});
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `resource` | `'pages'` | 是 | 低代码页面资源 |
| `id` | `string` | 否 | 已有记录的 ID；传入时更新，否则新增 |
| `data` | `Record<string, unknown>` | 是 | `lowcode_pages` 的页面字段和 Schema |

返回值：`Promise<LowCodePageRecord>`。

说明：

- 调用方负责先用 `prepareLowCodePageSchema` 规范化 Schema。
- 已存在页面传入 `id` 后更新；不传 `id` 时新增。
- 调用方负责递增 `version`，发布时写入 `published_at`。
- 列表页通过 `lowcode_pages.edit_page_id` 指向编辑页，不使用独立关系表。

### Publish with `lowcode.saveItem`

```ts
invoke<LowCodePageRecord>('lowcode', 'saveItem', {
  resource: 'pages',
  id: page.id,
  data: {
    status: 'published',
    schema: { ...schema, status: 'published' },
    version: page.version + 1,
    published_at: new Date().toISOString(),
  },
});
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `resource` | `'pages'` | 是 | 低代码页面资源 |
| `id` | `string` | 是 | 页面记录 ID |
| `data` | `Record<string, unknown>` | 是 | 包含发布状态、Schema、版本号和发布时间 |

返回值：`Promise<LowCodePageRecord>`。

注意：设计器保存和发布都调用 `saveItem`；发布时把记录与 `schema.status` 同步设置为 `'published'`。

### Archive with `lowcode.updateItem`

```ts
invoke('lowcode', 'updateItem', {
  resource: 'pages',
  filters: { code: 'users' },
  data: { status: 'archived' },
});
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `code` | `string` | 是 | 页面编码 |

返回值：`Promise<LowCodePageRecord>`。

说明：把页面状态更新为 `'archived'`。

## 快速开始

渲染一个低代码页面：

```vue
<template>
  <LowCodePageRenderer :page="page" />
</template>

<script setup lang="ts">
import {
  LowCodePageRenderer,
  prepareLowCodePageSchema,
  type LowCodePageRecord,
} from '@enlearn/lowcode-framework';

const schema = prepareLowCodePageSchema({
  code: 'users',
  route: '/dashboard/low-code/users',
  title: '用户管理',
  layout: 'dashboard',
  dataSources: {
    records: {
      key: 'records',
      label: '用户列表',
      serviceName: 'admin',
      serviceMethod: 'listUsers',
      autoLoad: true,
    },
  },
  blocks: [
    {
      id: 'users-grid',
      kind: 'grid',
      title: '用户列表',
      sourceKey: 'records',
      schema: {
        grid: {
          border: true,
          stripe: true,
          columns: [
            { field: 'email', title: '邮箱', minWidth: 220 },
            { field: 'role', title: '角色', width: 120 },
          ],
        },
      },
    },
  ],
});

const page: LowCodePageRecord = {
  id: 'users',
  code: schema.code,
  route: schema.route,
  title: schema.title,
  description: schema.description ?? null,
  layout: schema.layout ?? 'dashboard',
  status: schema.status ?? 'draft',
  keep_alive: schema.keepAlive ?? true,
  schema,
  version: 1,
  published_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
</script>
```

使用可视化设计器：

```vue
<template>
  <LowCodeVisualDesigner code="users" />
</template>

<script setup lang="ts">
import { LowCodeVisualDesigner } from '@enlearn/lowcode-framework';
</script>
```

自定义保存逻辑时使用 `VisualEditorProvider`：

```vue
<template>
  <VisualEditorProvider ref="providerRef" :initial-data="model" @save="save">
    <template #actions>
      <button type="button" @click="manualSave">保存</button>
    </template>
  </VisualEditorProvider>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  VisualEditorProvider,
  convertVisualEditorToLowCode,
  type VisualEditorModelValue,
  type VisualEditorPage,
} from '@enlearn/lowcode-framework';

const model = ref<VisualEditorModelValue | null>(null);
const providerRef = ref<{
  getSnapshot(): {
    model: VisualEditorModelValue;
    currentPath: string;
    currentPage: VisualEditorPage;
  };
} | null>(null);

function save(payload: {
  model: VisualEditorModelValue;
  currentPath: string;
  currentPage: VisualEditorPage;
}) {
  const runtime = convertVisualEditorToLowCode(payload.model, payload.currentPage);
  console.log(runtime.blocks, runtime.dataSources);
}

function manualSave() {
  const snapshot = providerRef.value?.getSnapshot();
  if (snapshot) save(snapshot);
}
</script>
```

## 包导出

`package.json` 当前对外导出以下路径：

| 导入路径 | 用途 |
| --- | --- |
| `@enlearn/lowcode-framework` | 推荐主入口，聚合稳定的 core / runtime / designer / materials API |
| `@enlearn/lowcode-framework/core` | 宿主适配、Schema、事件、核心类型和通用低代码工具 |
| `@enlearn/lowcode-framework/runtime` | 运行时组件、运行时指令、内置页查找、运行时物料注册表 |
| `@enlearn/lowcode-framework/designer` | 可视化设计器组件、设计器转换、设计器 props helper 和设计器服务 |
| `@enlearn/lowcode-framework/materials` | 页面块物料、表单物料、物料插件、默认块、属性表单扩展 |
| `@enlearn/lowcode-framework/core/host` | 宿主适配层的独立入口 |
| `@enlearn/lowcode-framework/runtime/directives` | 运行时指令注册器的独立入口 |
| `@enlearn/lowcode-framework/styles/visual-editor-utilities.scss` | 低代码运行时和设计器辅助样式 |

不再对 npm 消费者承诺 `components/*`、`lowcode/*`、`visual-editor/*`、`packages/*`、`types/*`、`utils/*`、`hooks/*`、`enums/*` 这类内部源码子路径。仓库内 Nuxt 应用仍可能保留源码别名用于本地联调，但发布包的稳定 API 只以上表为准。

## 主入口组件 API

### `LowCodePageRenderer`

运行时页面渲染器。

```ts
type Props = {
  page: LowCodePageRecord & {
    resolvedData?: Record<string, unknown>;
  };
  serviceApi?: LowCodeHostServiceApi;
  router?: LowCodeHostRouter;
  route?: LowCodeHostRoute;
  locale?: string;
  messages?: LowCodeMessages;
  theme?: LowCodeTheme;
};
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | `LowCodePageRecord & { resolvedData?: Record<string, unknown> }` | 是 | 页面记录，核心字段是 `page.schema` |
| `serviceApi` | `LowCodeHostServiceApi` | 否 | 单组件覆盖宿主服务适配器 |
| `router` | `LowCodeHostRouter` | 否 | 单组件覆盖路由适配器 |
| `route` | `LowCodeHostRoute` | 否 | 单组件覆盖当前路由信息 |
| `locale` | `string` | 否 | 单组件覆盖 locale |
| `messages` | `LowCodeMessages` | 否 | 单组件覆盖 i18n 文案 |
| `theme` | `LowCodeTheme` | 否 | 单组件覆盖主题 class 和 CSS 变量 |

返回值：Vue 组件，无直接返回值。

运行时行为：

- 自动加载 `schema.dataSources` 中 `autoLoad !== false` 的数据源。
- 调用宿主 `serviceApi.invoke(serviceName, serviceMethod, postData)`。
- 渲染 `schema.blocks`。
- 执行表单提交、搜索、表格编辑/删除、工具栏动作和运行时指令。

### `LowCodeVisualDesigner`

完整低代码页面设计器，内置加载页面、保存、发布、页面信息编辑等流程。

```ts
type Props = {
  code?: string;
  serviceApi?: LowCodeHostServiceApi;
  router?: LowCodeHostRouter;
  locale?: string;
  messages?: LowCodeMessages;
  theme?: LowCodeTheme;
  backRoute?: string;
};
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `code` | `string` | 否 | 要加载的低代码页面编码。不传时创建空白页面 |
| `serviceApi` | `LowCodeHostServiceApi` | 否 | 单组件覆盖宿主服务适配器 |
| `router` | `LowCodeHostRouter` | 否 | 单组件覆盖路由适配器 |
| `locale` | `string` | 否 | 单组件覆盖 locale |
| `messages` | `LowCodeMessages` | 否 | 单组件覆盖 i18n 文案 |
| `theme` | `LowCodeTheme` | 否 | 单组件覆盖主题 class 和 CSS 变量 |
| `backRoute` | `string` | 否 | 设计器返回列表时的路由，默认 `/dashboard/low-code` |

返回值：Vue 组件，无直接返回值。

依赖服务方法：

| 服务 | 方法 | 参数 | 返回值 |
| --- | --- | --- | --- |
| `lowcode` | `getPage` | `{ code: string; includeData: boolean }` | `Promise<LowCodePageRecord>` |
| `lowcode` | `saveItem` | `{ resource: 'pages'; id?: string; data: Record<string, unknown> }` | `Promise<LowCodePageRecord>` |
| `lowcode` | `listPages` | 无 | `Promise<LowCodePageRecord[]>` |

### `VisualEditorProvider`

可视化设计器状态 Provider，用于更灵活地嵌入设计器。

```ts
type Props = {
  initialData?: VisualEditorModelValue | null;
  initialPath?: string;
  routePath?: string;
  showHeader?: boolean;
  leftExcludeLabels?: string[];
  leftWidth?: string;
  allowFormDesign?: boolean;
  showPageSetting?: boolean;
  workbenchMode?: 'page' | 'form';
  persistToSession?: boolean;
};

type Emits = {
  save: [{
    model: VisualEditorModelValue;
    currentPath: string;
    currentPage: VisualEditorPage;
  }];
};

type Exposed = {
  getSnapshot(): {
    model: VisualEditorModelValue;
    currentPath: string;
    currentPage: VisualEditorPage;
  };
};
```

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `initialData` | `VisualEditorModelValue \| null` | `null` | 初始设计器数据 |
| `initialPath` | `string` | `''` | 初始页面路径 |
| `routePath` | `string` | `''` | 宿主路由路径兜底；不传时使用 `/` |
| `showHeader` | `boolean` | `true` | 是否展示设计器头部 |
| `leftExcludeLabels` | `string[]` | `['页面']` | 左侧物料分组排除项 |
| `leftWidth` | `string` | `'340px'` | 左侧面板宽度 |
| `allowFormDesign` | `boolean` | `true` | 是否允许表单设计 |
| `showPageSetting` | `boolean` | `true` | 是否展示页面设置 |
| `workbenchMode` | `'page' \| 'form'` | `'page'` | 工作台模式 |
| `persistToSession` | `boolean` | `true` | 卸载/刷新前是否写入 `sessionStorage` |

事件：

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `save` | `{ model; currentPath; currentPage }` | 设计器触发保存时发出 |

暴露方法：

| 方法 | 参数 | 返回值 | 说明 |
| --- | --- | --- | --- |
| `getSnapshot` | 无 | `{ model: VisualEditorModelValue; currentPath: string; currentPage: VisualEditorPage }` | 获取当前设计器快照 |

### `VisualEditor`

裸设计器组件，通常由 `VisualEditorProvider` 包裹后使用。

```ts
type Props = {
  showHeader?: boolean;
  leftExcludeLabels?: string[];
  leftWidth?: string;
  allowFormDesign?: boolean;
  showPageSetting?: boolean;
  workbenchMode?: 'page' | 'form';
};
```

返回值：Vue 组件，无直接返回值。

### `LowCodeForm`

低代码表单渲染器。

```ts
type Props = {
  schema: LowCodeFormSchema;
  modelValue: Record<string, unknown>;
  optionSources?: Record<string, unknown>;
  loading?: boolean;
};

type Emits = {
  'update:modelValue': [Record<string, unknown>];
  submit: [Record<string, unknown>];
  action: [LowCodeAction, Record<string, unknown>];
  fieldChange: [{
    field: LowCodeField;
    value: unknown;
    previousValue: unknown;
    values: Record<string, unknown>;
  }];
};

type Exposed = {
  submit(): void;
  validate(): boolean;
  snapshot(): Record<string, unknown>;
};
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `schema` | `LowCodeFormSchema` | 是 | 表单 Schema |
| `modelValue` | `Record<string, unknown>` | 是 | 表单值 |
| `optionSources` | `Record<string, unknown>` | 否 | 动态选项数据源，配合字段 `optionsSourceKey` 使用 |
| `loading` | `boolean` | 否 | 提交按钮 loading 状态 |

### `LowCodeFormField`

单个低代码字段渲染器。

```ts
type Props = {
  field: LowCodeField;
  modelValue: any;
  options?: LowCodeResolvedOption[];
  error?: string;
};

type Emits = {
  'update:modelValue': [any];
  change: [{ field: LowCodeField; value: any; previousValue: any }];
};
```

返回值：Vue 组件，无直接返回值。

### `LowCodeFormLayout`

表单布局渲染器。

```ts
type Props = {
  nodes: LowCodeFormLayoutNode[];
  fieldsByKey: Record<string, LowCodeField>;
};

type Slots = {
  field(props: { field: LowCodeField }): unknown;
};
```

返回值：Vue 组件，无直接返回值。

### `LowCodeGrid`

低代码表格渲染器，底层基于 `vxe-grid`。

```ts
type Props = {
  schema: LowCodeGridSchema;
  rows: Record<string, unknown>[];
  loading?: boolean;
};

type LowCodeGridEventPayload = {
  key: string;
  row?: Record<string, unknown>;
  actionCode?: string;
  rawEvent: Record<string, unknown>;
};

type Emits = {
  toolbar: [code: string];
  edit: [row: Record<string, unknown>];
  delete: [row: Record<string, unknown>];
  rowCurrentChange: [{ row: Record<string, unknown>; rawEvent: Record<string, unknown> }];
  rowDblclick: [{ row: Record<string, unknown>; rawEvent: Record<string, unknown> }];
  cellDblclick: [{ row: Record<string, unknown>; rawEvent: Record<string, unknown> }];
  gridEvent: [LowCodeGridEventPayload];
};
```

返回值：Vue 组件，无直接返回值。

### `LowCodeBlockRenderer`

单个页面块渲染器，根据 `block.kind` 查找已注册页面物料。

```ts
type Props = LowCodeBlockMaterialProps;
type Emits = LowCodeBlockMaterialEmits;
```

返回值：Vue 组件，无直接返回值。

### `LowCodeBlockChildren`

子块渲染器，常用于容器、分区、Tabs、弹窗、抽屉等物料内部。

```ts
type Props = Omit<LowCodeBlockMaterialProps, 'block'> & {
  blocks: LowCodeRuntimeBlock[];
};

type Emits = LowCodeBlockMaterialEmits;
```

返回值：Vue 组件，无直接返回值。

### `LowCodeTreeItem`

树节点递归渲染器。

```ts
type Props = {
  row: Record<string, unknown>;
  titleField: string;
  childrenField: string;
};
```

返回值：Vue 组件，无直接返回值。

## Schema API

从主入口或子路径导入：

```ts
import {
  LOW_CODE_SCHEMA_VERSION,
  normalizeLowCodePageSchema,
  migrateLowCodePageSchema,
  validateLowCodePageSchema,
  assertValidLowCodePageSchema,
  prepareLowCodePageSchema,
  formatLowCodeSchemaIssue,
  formatLowCodeSchemaIssues,
  LowCodeSchemaValidationError,
} from '@enlearn/lowcode-framework';
```

### `LOW_CODE_SCHEMA_VERSION`

```ts
const LOW_CODE_SCHEMA_VERSION: 1;
```

当前低代码页面 Schema 版本号。

### `normalizeLowCodePageSchema(value, options?)`

```ts
type NormalizeOptions = {
  fallbackCode?: string;
  fallbackRoute?: string;
  fallbackTitle?: string;
};

function normalizeLowCodePageSchema(
  value: unknown,
  options?: NormalizeOptions
): LowCodePageSchema;
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `value` | `unknown` | 是 | 待规范化的原始 Schema |
| `options` | `NormalizeOptions` | 否 | 缺省字段兜底值 |

返回值：`LowCodePageSchema`。

异常：当 `value` 不是对象时抛出 `LowCodeSchemaValidationError`。

规范化行为：

- `schemaVersion` 默认补为 `1`。
- `layout` 默认补为 `'dashboard'`。
- `status` 默认补为 `'draft'`。
- `keepAlive` 默认补为 `true`。
- `dataSources`、`eventHandlers`、`blocks` 会转为框架期望结构。
- `kind: 'search-form'` 会兼容为 `kind: 'searchForm'`。
- 已注册物料的 `materialVersion` 会自动补齐。

### `migrateLowCodePageSchema(value, options?)`

```ts
function migrateLowCodePageSchema(
  value: unknown,
  options?: NormalizeOptions
): LowCodePageSchema;
```

按 `schemaVersion` 依次执行已注册的迁移，再进入规范化流程。没有匹配迁移时会保留可识别字段并规范化到当前 `LOW_CODE_SCHEMA_VERSION`。

### `registerLowCodeSchemaMigration(migration)`

```ts
type LowCodeSchemaMigration = {
  from: number;
  to: number;
  migrate: (schema: Record<string, unknown>) => Record<string, unknown>;
};

function registerLowCodeSchemaMigration(
  migration: LowCodeSchemaMigration
): void;

function getLowCodeSchemaMigrations(): LowCodeSchemaMigration[];
```

用于在包升级时注册 Schema 版本迁移：

```ts
import { registerLowCodeSchemaMigration } from '@enlearn/lowcode-framework/core';

registerLowCodeSchemaMigration({
  from: 1,
  to: 2,
  migrate(schema) {
    return {
      ...schema,
      schemaVersion: 2,
    };
  },
});
```

### `validateLowCodePageSchema(schema)`

```ts
function validateLowCodePageSchema(schema: LowCodePageSchema): LowCodeSchemaIssue[];
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `schema` | `LowCodePageSchema` | 是 | 已规范化或待校验的页面 Schema |

返回值：`LowCodeSchemaIssue[]`。

校验内容包括：

- 页面 `schemaVersion`、`code`、`route`、`title`。
- 数据源 `key`、`serviceName`、`serviceMethod`。
- 事件处理器 `event`、`directives`。
- 块 `id`、`kind`、重复 ID、物料注册状态、物料版本。
- 表单字段、表格列、Tabs 面板、嵌套块。
- `sourceKey`、`targetSourceKey`、`submitSourceKey`、`deleteSourceKey` 是否引用已存在数据源。

### `assertValidLowCodePageSchema(schema)`

```ts
function assertValidLowCodePageSchema(
  schema: LowCodePageSchema
): LowCodeSchemaIssue[];
```

返回值：全部 issue，包括 warning。

异常：存在 `level === 'error'` 的问题时抛出 `LowCodeSchemaValidationError`。

### `prepareLowCodePageSchema(value, options?)`

```ts
function prepareLowCodePageSchema(
  value: unknown,
  options?: NormalizeOptions
): LowCodePageSchema;
```

先迁移/规范化，再执行阻断性校验。保存页面或发布 npm 示例时建议使用这个方法作为入口。

### `formatLowCodeSchemaIssue(issue)`

```ts
function formatLowCodeSchemaIssue(issue: LowCodeSchemaIssue): string;
```

返回值：`"${issue.path}: ${issue.message}"`。

### `formatLowCodeSchemaIssues(issues)`

```ts
function formatLowCodeSchemaIssues(issues: LowCodeSchemaIssue[]): string;
```

返回值：多行错误摘要，最多展示前 6 条阻断问题。

### `LowCodeSchemaValidationError`

```ts
class LowCodeSchemaValidationError extends Error {
  issues: LowCodeSchemaIssue[];
}
```

用于包装 Schema 校验错误。

## 类型 API

主入口导出 `src/types/lowcode.ts` 中的全部核心类型。

### 基础类型

```ts
type LowCodeOption = {
  label: string;
  value: string | number;
  rawValue?: unknown;
  disabled?: boolean;
};

type LowCodeRule = {
  required?: boolean;
  min?: number;
  message: string;
};
```

### 字段类型

```ts
type LowCodeBuiltInFieldComponent =
  | 'vxe-input'
  | 'vxe-textarea'
  | 'vxe-select'
  | 'vxe-switch'
  | 'vxe-password-input'
  | 'vxe-checkbox-group'
  | 'vxe-radio-group'
  | 'vxe-tree-select'
  | 'lc-cascader'
  | 'lc-array-table'
  | 'lc-color-picker'
  | 'lc-json-editor'
  | 'lc-number-input'
  | 'lc-option-select'
  | 'lc-sub-form';

type LowCodeField = {
  field: string;
  label: string;
  component: LowCodeFieldComponent;
  help?: string;
  props?: Record<string, unknown>;
  options?: LowCodeOption[];
  optionsSourceKey?: string;
  optionProps?: Record<string, unknown>;
  rules?: LowCodeRule[];
  span?: number;
  events?: Record<string, LowCodeRuntimeDirective[]>;
};
```

内置字段物料和别名：

| 类型 | 别名 | 说明 |
| --- | --- | --- |
| `vxe-input` | `input` | 单行输入 |
| `vxe-textarea` | `textarea` | 多行文本 |
| `vxe-select` | `select` | 下拉选择 |
| `vxe-switch` | `switch` | 开关 |
| `vxe-password-input` | `password` | 密码输入 |
| `vxe-checkbox-group` | `checkbox`, `checkbox-group` | 多选框组 |
| `vxe-radio-group` | `radio`, `radio-group` | 单选框组 |
| `vxe-tree-select` | `tree-select` | 树形选择 |
| `lc-cascader` | 无 | 级联选择 |
| `lc-array-table` | 无 | 数组表格 |
| `lc-color-picker` | 无 | 颜色选择 |
| `lc-json-editor` | 无 | JSON 编辑 |
| `lc-number-input` | 无 | 数字输入 |
| `lc-option-select` | 无 | 选项选择 |
| `lc-sub-form` | 无 | 子表单 |

### 表单 Schema

```ts
type LowCodeFormSchema = {
  title?: string;
  columns?: number;
  fields: LowCodeField[];
  layout?: LowCodeFormLayoutNode[];
  actions: LowCodeAction[];
};

type LowCodeFormLayoutNode =
  | { kind: 'field'; field: string }
  | { kind: 'row'; gutter?: number | string; columns: LowCodeFormLayoutColumn[] }
  | { kind: 'stack'; blocks: LowCodeFormLayoutNode[] };
```

### 表格 Schema

```ts
type LowCodeGridFormatter =
  | { type: 'text'; emptyText?: string }
  | { type: 'date'; locale?: string; options?: Intl.DateTimeFormatOptions; emptyText?: string }
  | { type: 'datetime'; locale?: string; options?: Intl.DateTimeFormatOptions; emptyText?: string }
  | { type: 'currency'; locale?: string; currency?: string; options?: Intl.NumberFormatOptions; emptyText?: string }
  | { type: 'number'; locale?: string; options?: Intl.NumberFormatOptions; emptyText?: string }
  | { type: 'enum'; map: Record<string, string>; emptyText?: string };

type LowCodeGridColumn = {
  field?: string;
  title: string;
  width?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
  fixed?: 'left' | 'right' | '';
  align?: 'left' | 'center' | 'right' | '';
  headerAlign?: 'left' | 'center' | 'right' | '';
  footerAlign?: 'left' | 'center' | 'right' | '';
  type?: string;
  sortable?: boolean;
  resizable?: boolean;
  visible?: boolean;
  formatter?: LowCodeGridFormatter | string | ((params: { cellValue: unknown }) => string);
  [key: string]: unknown;
};

type LowCodeGridSchema = {
  title?: string;
  toolbar?: LowCodeGridAction[];
  grid: Record<string, unknown> & {
    columns?: LowCodeGridColumn[];
    rowConfig?: Record<string, unknown>;
  };
  rowActions?: {
    edit?: boolean;
    editLabel?: string;
    editRoute?: string;
    delete?: boolean;
    deleteLabel?: string;
  };
  events?: Record<string, LowCodeRuntimeDirective[]>;
  eventNames?: Record<string, string>;
};
```

### 页面 Schema

```ts
type LowCodePageSchema = {
  schemaVersion?: number;
  code: string;
  route: string;
  title: string;
  description?: string;
  layout?: 'default' | 'dashboard' | 'blank';
  status?: 'draft' | 'published' | 'archived';
  keepAlive?: boolean;
  visualEditor?: Record<string, unknown>;
  config?: {
    bgColor?: string;
    bgImage?: string;
  };
  dataSources?: Record<string, LowCodePageDataSource>;
  eventHandlers?: LowCodeEventHandler[];
  blocks: LowCodePageBlock[];
};
```

### 页面块类型

`LowCodePageBlock` 是以下块类型的联合：

| `kind` | 类型 | 关键字段 |
| --- | --- | --- |
| `text` | `LowCodePageTextBlock` | `content`, `tone` |
| `container` | `LowCodePageContainerBlock` | `columns`, `gap`, `panel`, `blocks` |
| `section` | `LowCodePageSectionBlock` | `panel`, `blocks` |
| `tabs` | `LowCodePageTabsBlock` | `defaultKey`, `tabs` |
| `toolbar` | `LowCodePageToolbarBlock` | `actions` |
| `buttonGroup` | `LowCodePageButtonGroupBlock` | `align`, `gap`, `actions` |
| `form` | `LowCodePageFormBlock` | `schema`, `sourceKey`, `submitSourceKey`, `initialValues` |
| `searchForm` | `LowCodePageSearchFormBlock` | `schema`, `targetSourceKey`, `initialValues` |
| `grid` | `LowCodePageGridBlock` | `schema`, `sourceKey`, `editorBlockId`, `editRoute`, `deleteSourceKey`, `rows` |
| `detail` | `LowCodePageDetailBlock` | `sourceKey`, `record`, `fields` |
| `modal` | `LowCodePageModalBlock` | `open`, `width`, `blocks` |
| `drawer` | `LowCodePageDrawerBlock` | `open`, `width`, `placement`, `blocks` |
| `statCard` | `LowCodePageStatCardBlock` | `sourceKey`, `items` |
| `tree` | `LowCodePageTreeBlock` | `sourceKey`, `rows`, `keyField`, `titleField`, `childrenField` |

### 数据源类型

```ts
type LowCodePageDataSource = {
  key: string;
  label?: string;
  serviceName: string;
  serviceMethod: string;
  saveMethod?: string;
  deleteMethod?: string;
  postData?: Record<string, unknown>;
  autoLoad?: boolean;
};
```

### 动作和事件类型

```ts
type LowCodeAction = {
  code: string;
  label: string;
  type?: 'submit' | 'reset' | 'button';
  status?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  route?: string;
  disabled?: boolean;
  eventName?: string;
  directives?: LowCodeRuntimeDirective[];
};

type LowCodeRuntimeEvent = {
  name: string;
  blockId?: string;
  blockKind?: string;
  timestamp?: number;
  payload?: Record<string, unknown>;
};

type LowCodeEventHandler = {
  id?: string;
  event: string;
  blockId?: string;
  blockKind?: string;
  actionCode?: string;
  field?: string;
  disabled?: boolean;
  directives: LowCodeRuntimeDirective[];
};
```

### 页面记录类型

```ts
type LowCodePageRecord = {
  id: string;
  code: string;
  route: string;
  title: string;
  description: string | null;
  layout: 'default' | 'dashboard' | 'blank';
  status: 'draft' | 'published' | 'archived';
  keep_alive: boolean;
  schema: LowCodePageSchema;
  version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type LowCodePageSummary = Pick<
  LowCodePageRecord,
  'id' | 'code' | 'route' | 'title' | 'description' | 'layout' | 'status' | 'keep_alive' | 'version' | 'published_at' | 'created_at' | 'updated_at'
>;
```

## 工具函数 API

### `formatLowCodeGridValue(value, formatter?)`

```ts
function formatLowCodeGridValue(
  value: unknown,
  formatter?:
    | LowCodeGridFormatter
    | string
    | ((params: { cellValue: unknown }) => string)
): unknown;
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `value` | `unknown` | 是 | 原始单元格值 |
| `formatter` | `LowCodeGridFormatter \| string \| Function` | 否 | 格式化配置 |

返回值：

- 未配置 formatter 时返回 `value ?? ''`。
- formatter 为函数时返回函数执行结果。
- formatter 为字符串时当前返回 `value ?? ''`。
- formatter 为对象时按 `text/date/datetime/currency/number/enum` 格式化。

### `normalizeLowCodeGridColumns(columns)`

```ts
function normalizeLowCodeGridColumns(
  columns: LowCodeGridColumn[]
): LowCodeGridColumn[];
```

把对象形式的 `column.formatter` 转为 `vxe-grid` 可执行 formatter 函数。返回新的列数组，原有函数或字符串 formatter 保持不变。

### `convertVisualEditorToLowCode(model, currentPage)`

```ts
function convertVisualEditorToLowCode(
  model: VisualEditorModelValue,
  currentPage: VisualEditorPage
): VisualToLowCodeConversionResult;
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `model` | `VisualEditorModelValue` | 是 | 设计器完整数据 |
| `currentPage` | `VisualEditorPage` | 是 | 当前设计页 |

返回值：

```ts
type VisualToLowCodeConversionResult = {
  blocks: LowCodePageBlock[];
  dataSources: Record<string, LowCodePageDataSource>;
};
```

### `convertVisualBlocks(blocks, dataSources)`

```ts
function convertVisualBlocks(
  blocks?: VisualEditorBlockData[],
  dataSources: Record<string, LowCodePageDataSource>
): LowCodePageBlock[];
```

将设计器块数组转换为运行时页面块数组。

## 物料注册 API

### 物料插件

单个物料仍可直接注册；如果要给用户分发一组物料、转换器和属性表单，推荐封装为物料插件：

```ts
import {
  installLowCodeMaterialPlugin,
  type LowCodeMaterialPlugin,
} from '@enlearn/lowcode-framework/materials';

export const adminMaterials: LowCodeMaterialPlugin = {
  name: 'admin-materials',
  install(context) {
    context.registerBlockMaterial(userTableMaterial);
    context.registerFormMaterial(jsonFieldMaterial);
    context.registerVisualConverter(userTableConverter);
    context.registerMaterialPropForm(userTablePropForm);
  },
};

installLowCodeMaterialPlugin(adminMaterials);
```

| API | 参数 | 返回值 | 说明 |
| --- | --- | --- | --- |
| `installLowCodeMaterialPlugin` | `LowCodeMaterialPlugin` | `void` | 安装一组物料扩展，同名插件只安装一次 |
| `getInstalledLowCodeMaterialPlugins` | 无 | `(string \| LowCodeMaterialPlugin)[]` | 查看已安装插件 |
| `lowCodeMaterialPluginContext` | 无 | `LowCodeMaterialPluginContext` | 默认插件上下文，包含四类注册能力 |

### 页面块物料

```ts
type LowCodeBlockMaterial<T extends LowCodeRuntimeBlock = LowCodeRuntimeBlock> = {
  type: string;
  label?: string;
  component: import('vue').Component;
  designer?: VisualEditorComponent | (() => Promise<VisualEditorComponent>);
  propsSchema?: Record<string, unknown>;
  materialVersion?: string;
  createDefaultBlock?: (overrides?: Partial<T>) => T;
  converter?: VisualToLowCodeConverter;
  validate?: (block: T) => LowCodeBlockValidationIssue[];
  aliases?: string[];
  order?: number;
};
```

#### `registerLowCodeBlockMaterial(material)`

```ts
function registerLowCodeBlockMaterial(material: LowCodeBlockMaterial): void;
```

注册或覆盖页面块物料。`type` 和 `aliases` 都会写入查找表，同 `type` 会替换列表中的旧物料。

#### `getLowCodeBlockMaterial(type?)`

```ts
function getLowCodeBlockMaterial(type?: string): LowCodeBlockMaterial | undefined;
```

按类型或别名获取页面块物料。

#### `getLowCodeBlockMaterials()`

```ts
function getLowCodeBlockMaterials(): LowCodeBlockMaterial[];
```

返回按 `order` 升序排列的页面块物料副本。

#### `getLowCodeBlockMaterialConverters()`

```ts
function getLowCodeBlockMaterialConverters(): VisualToLowCodeConverter[];
```

返回已注册页面物料上挂载的转换器。

#### `createDefaultLowCodeBlock(type, overrides?)`

```ts
function createDefaultLowCodeBlock(
  type: string,
  overrides?: Record<string, unknown>
): LowCodeRuntimeBlock | undefined;
```

调用目标物料的 `createDefaultBlock` 创建默认块。

#### `lowCodeBlockMaterialMap`

```ts
const lowCodeBlockMaterialMap: Record<string, LowCodeBlockMaterial>;
```

页面块物料查找表。

### 内置页面块物料

| type | aliases | 默认创建函数 |
| --- | --- | --- |
| `container` | 无 | `createDefaultContainerBlock` |
| `section` | 无 | `createDefaultSectionBlock` |
| `text` | 无 | `createDefaultTextBlock` |
| `tabs` | 无 | `createDefaultTabsBlock` |
| `toolbar` | 无 | `createDefaultToolbarBlock` |
| `buttonGroup` | 无 | `createDefaultButtonGroupBlock` |
| `form` | 无 | `createDefaultFormBlock` |
| `searchForm` | `search-form` | `createDefaultSearchFormBlock` |
| `grid` | 无 | `createDefaultGridBlock` |
| `detail` | 无 | `createDefaultDetailBlock` |
| `modal` | 无 | `createDefaultModalBlock` |
| `drawer` | 无 | `createDefaultDrawerBlock` |
| `statCard` | `stat-card` | `createDefaultStatCardBlock` |
| `tree` | 无 | `createDefaultTreeBlock` |

默认块创建函数位于子路径：

```ts
import {
  createDefaultGridBlock,
  createDefaultFormBlock,
} from '@enlearn/lowcode-framework/materials';
```

这些函数签名均为：

```ts
function createDefaultXxxBlock(
  overrides?: Partial<SpecificBlockType>
): SpecificBlockType;
```

### 表单字段物料

```ts
type LowCodeFormMaterial = {
  type: string;
  label?: string;
  component: import('vue').Component;
  aliases?: string[];
  order?: number;
};
```

#### `registerLowCodeFormMaterial(material)`

```ts
function registerLowCodeFormMaterial(material: LowCodeFormMaterial): void;
```

注册或覆盖表单字段物料。

#### `getLowCodeFormMaterial(type?)`

```ts
function getLowCodeFormMaterial(type?: string): LowCodeFormMaterial;
```

返回指定字段物料。未传类型时默认使用 `vxe-input`。如果没有任何字段物料已注册，会抛出错误。

#### `getLowCodeFormMaterials()`

```ts
function getLowCodeFormMaterials(): LowCodeFormMaterial[];
```

返回按 `order` 升序排列的字段物料副本。

#### `lowCodeFormMaterialMap`

```ts
const lowCodeFormMaterialMap: Record<string, LowCodeFormMaterial>;
```

字段物料查找表。

#### `useLowCodeFormMaterialModel(props, emit)`

该 hook 未从主入口导出，请使用子路径导入：

```ts
import { useLowCodeFormMaterialModel } from '@enlearn/lowcode-framework/materials';
```

```ts
function useLowCodeFormMaterialModel(
  props: Readonly<Pick<LowCodeFormMaterialProps, 'modelValue'>>,
  emit: (event: 'update:modelValue', value: any) => void
): import('vue').ComputedRef<any>;
```

字段物料内部使用的 `v-model` 辅助 hook。

## 可视化转换器 API

主入口导出 `registerVisualToLowCodeConverter`、`getVisualToLowCodeConverter`、`convertVisualBlock` 和 `visualToLowCodeConverterMap`。完整互转函数请从子路径导入：

```ts
import {
  convertLowCodeBlocksToVisualBlocks,
  convertLowCodePageSchemaToVisualEditor,
} from '@enlearn/lowcode-framework/designer';
```

```ts
type VisualToLowCodeConverter = {
  type: string;
  componentKey?: string;
  componentKeys?: string[];
  order?: number;
  match?: (block: VisualEditorBlockData) => boolean;
  defaultProps?: VisualBlockProps | (() => VisualBlockProps);
  validate?: (block: VisualEditorBlockData) => string[];
  toRuntimeBlock?: (
    block: VisualEditorBlockData,
    context: VisualToLowCodeContext
  ) => LowCodePageBlock | null;
  fromRuntimeBlock?: (
    block: LowCodePageBlock,
    context: VisualToLowCodeContext
  ) => VisualEditorBlockData | null;
  convert?: (
    block: VisualEditorBlockData,
    context: VisualToLowCodeContext
  ) => LowCodePageBlock | null;
};
```

### `registerVisualToLowCodeConverter(converter)`

```ts
function registerVisualToLowCodeConverter(
  converter: VisualToLowCodeConverter
): void;
```

注册可视化块到运行时块的转换器。`type`、`componentKey`、`componentKeys` 都会写入查找表。

### `getVisualToLowCodeConverter(block)`

```ts
function getVisualToLowCodeConverter(
  block: VisualEditorBlockData
): VisualToLowCodeConverter | undefined;
```

按 `block.componentKey` 或 converter 的 `match(block)` 查找转换器。

### `convertVisualBlock(block, context)`

```ts
function convertVisualBlock(
  block: VisualEditorBlockData,
  context: VisualToLowCodeContext
): LowCodePageBlock | null;
```

转换单个设计器块。优先调用 `toRuntimeBlock`，其次调用旧字段 `convert`。

### `convertLowCodeBlocksToVisualBlocks(blocks?, dataSources?)`

```ts
function convertLowCodeBlocksToVisualBlocks(
  blocks?: LowCodePageBlock[],
  dataSources?: Record<string, LowCodePageDataSource>
): VisualEditorBlockData[];
```

把运行时页面块转换回设计器块。

### `convertLowCodePageSchemaToVisualEditor(schema)`

```ts
function convertLowCodePageSchemaToVisualEditor(
  schema: LowCodePageSchema
): VisualEditorModelValue;
```

把运行时页面 Schema 转换为设计器模型。

### `visualToLowCodeConverterMap`

```ts
const visualToLowCodeConverterMap: Record<string, VisualToLowCodeConverter>;
```

转换器查找表。

## 事件系统 API

### `createLowCodeEventBus()`

```ts
type LowCodeEventSubscriber = (
  event: LowCodeRuntimeEvent
) => void | Promise<void>;

function createLowCodeEventBus(): {
  subscribe(subscriber: LowCodeEventSubscriber): () => boolean;
  publish(event: LowCodeRuntimeEvent): Promise<void>;
  clear(): void;
};
```

| 方法 | 参数 | 返回值 | 说明 |
| --- | --- | --- | --- |
| `subscribe` | `LowCodeEventSubscriber` | `() => boolean` | 订阅事件，返回取消订阅函数 |
| `publish` | `LowCodeRuntimeEvent` | `Promise<void>` | 发布事件，会补齐 `timestamp` 和空 `payload` |
| `clear` | 无 | `void` | 清空订阅者 |

### `normalizeLowCodeDirectives(value)`

```ts
function normalizeLowCodeDirectives(value: unknown): LowCodeRuntimeDirective[];
```

只保留对象且 `type` 为字符串的指令。

### `runtimeEventMatchesHandler(event, handler)`

```ts
function runtimeEventMatchesHandler(
  event: LowCodeRuntimeEvent,
  handler: LowCodeEventHandler
): boolean;
```

匹配规则：

- `handler.disabled` 为 true 时不匹配。
- `handler.event` 为 `'*'` 或等于 `event.name`。
- 如果配置了 `blockId`、`blockKind`，必须与事件一致。
- 如果配置了 `actionCode`，必须等于 `event.payload.actionCode`。
- 如果配置了 `field`，必须等于 `event.payload.field`。

### `resolveEventDirectives(event, handlers?)`

```ts
function resolveEventDirectives(
  event: LowCodeRuntimeEvent,
  handlers?: LowCodeEventHandler[]
): LowCodeRuntimeDirective[];
```

返回事件内联指令 `event.payload.directives` 和匹配的 `schema.eventHandlers` 指令合并后的列表，并过滤 `disabled` 指令。

## 运行时指令

`LowCodePageRenderer` 当前支持以下指令类型：

| 指令 | 关键参数 | 说明 |
| --- | --- | --- |
| `setDataSource` / `updateDataSource` | `sourceKey`, `value`/`values`/`rows`/`row`, `mode` | 更新 `resolvedData[sourceKey]` |
| `setGridRows` / `updateGridRows` | `blockId`, `rows`/`row`/`value`, `mode`, `rowKey` | 更新指定表格块行数据 |
| `setFormValues` / `updateFormModel` / `setFormData` / `updateFormData` | `blockId`, `values`/`value`, `mode` | 更新表单模型 |
| `setFormField` / `updateFormField` | `blockId`, `field`, `value` | 更新单个表单字段 |
| `setSearchFilters` / `updateSearchFilters` | `sourceKey`, `values`/`value`, `mode` | 更新搜索过滤条件 |
| `refreshDataSource` / `refreshDataSources` | `sourceKey` 或 `sourceKeys` | 重新加载一个或多个数据源 |
| `refreshPage` | 无 | 重新加载整个页面数据 |
| `invokeService` | `sourceKey`, `serviceName`, `serviceMethod`, `postData`, `assignTo`, `refreshSourceKeys` | 调用宿主服务，并可写回数据源 |
| `navigate` / `routePush` | `route` 或 `value` | 调用 `router.push()` |
| `showMessage` | `message` 或 `value`, `status` | 设置页面提示信息 |
| `emitEvent` | `event`, `payload` | 发布新的运行时事件 |
| `openBlock` | `blockId` | 设置弹窗/抽屉类块 `open = true` |
| `closeBlock` | `blockId` | 设置弹窗/抽屉类块 `open = false` |

指令通用字段：

```ts
type LowCodeDirectiveMode =
  | 'replace'
  | 'merge'
  | 'append'
  | 'prepend'
  | 'patch'
  | 'remove';

type LowCodeRuntimeDirective = {
  type: string;
  disabled?: boolean;
  when?: string | boolean;
  mode?: LowCodeDirectiveMode;
  sourceKey?: string;
  sourceKeys?: string[];
  blockId?: string;
  field?: string;
  value?: unknown;
  values?: Record<string, unknown>;
  rows?: Record<string, unknown>[];
  row?: Record<string, unknown>;
  rowKey?: string;
  route?: string;
  event?: string;
  payload?: Record<string, unknown>;
  message?: string;
  status?: 'success' | 'error' | 'info' | 'warning';
  serviceName?: string;
  serviceMethod?: string;
  postData?: Record<string, unknown>;
  assignTo?: string;
  refreshSourceKeys?: string[];
  [key: string]: unknown;
};
```

`mode` 语义：

| mode | 说明 |
| --- | --- |
| `replace` | 用新值替换旧值，默认行为 |
| `merge` | 对对象做浅合并 |
| `append` | 把新行追加到数组尾部 |
| `prepend` | 把新行插入数组头部 |
| `patch` | 按 `rowKey` 合并数组中的行，不存在则追加 |
| `remove` | 按 `rowKey` 从数组中移除行 |

### 指令注册器

运行时指令已经从组件内部 `switch` 收敛为注册器，可从 `@enlearn/lowcode-framework/runtime/directives` 或 `@enlearn/lowcode-framework/runtime` 导入：

```ts
import {
  registerLowCodeRuntimeDirective,
  registerLowCodeRuntimeDirectiveAliases,
  getLowCodeRuntimeDirectiveTypes,
} from '@enlearn/lowcode-framework/runtime/directives';

registerLowCodeRuntimeDirective('trackAnalytics', async (directive, event, context) => {
  const name = context.resolveDirectiveString(directive.event, event, 'lowcode.event');
  await context.invokeServiceDirective(
    {
      type: 'invokeService',
      serviceName: 'analytics',
      serviceMethod: 'track',
      postData: {
        name,
        payload: event.payload,
      },
    },
    event
  );
});
```

| API | 参数 | 返回值 | 说明 |
| --- | --- | --- | --- |
| `registerLowCodeRuntimeDirective` | `type`, `handler` | `void` | 注册或覆盖单个指令处理器 |
| `registerLowCodeRuntimeDirectiveAliases` | `types`, `handler` | `void` | 为同一个处理器注册多个指令名 |
| `getLowCodeRuntimeDirective` | `type?` | `LowCodeRuntimeDirectiveHandler \| undefined` | 获取已注册处理器 |
| `getLowCodeRuntimeDirectiveTypes` | 无 | `string[]` | 获取全部已注册指令名 |
| `executeLowCodeRuntimeDirective` | `directive`, `event`, `context` | `Promise<void>` | 执行指令，通常由渲染器内部调用 |

表达式语法：

```ts
{
  type: 'navigate',
  route: '/dashboard/users/{{ row.id }}'
}
```

支持的表达式根对象：

| 根对象 | 说明 |
| --- | --- |
| `row` | 当前行 |
| `route.query` / `route.params` / `route.path` / `route.fullPath` | 当前路由 |
| `data` | 页面已解析数据源 |
| `form` | 当前事件块对应表单模型 |
| `forms` | 所有表单模型 |
| `search` | 搜索过滤条件 |
| `event` | 当前事件 payload 和事件元信息 |
| `value` | 当前事件值 |
| `values` | 当前事件表单值 |

## 设计器模型 API

从 `@enlearn/lowcode-framework/designer` 导出设计器模型、hook 和转换相关核心 API。

### `createNewBlock(component)`

```ts
function createNewBlock(
  component: VisualEditorComponent
): VisualEditorBlockData;
```

根据已注册的设计器组件定义创建新的设计器块。

### `VisualDragProvider`

```ts
const VisualDragProvider: {
  provide(data: VisualDragEvent): void;
  inject(): VisualDragEvent;
};
```

拖拽事件注入工具。

### `createVisualEditorConfig()`

```ts
function createVisualEditorConfig(): {
  componentModules: ComponentModules;
  componentMap: Record<string, VisualEditorComponent>;
  registry(
    moduleName: keyof ComponentModules,
    key: string,
    component: {
      label: string;
      preview: () => JSX.Element;
      render: (data: {
        props: Record<string, any>;
        model: Record<string, any>;
        styles: import('vue').CSSProperties;
        block: VisualEditorBlockData;
        custom: Record<string, any>;
      }) => () => JSX.Element;
      props?: Record<string, VisualEditorProps>;
      model?: Record<string, string>;
      styles?: import('vue').CSSProperties;
    }
  ): void;
};
```

用于创建可视化设计器组件注册中心。

### `createNewPage({ title, path })`

```ts
function createNewPage(options: {
  title?: string;
  path?: string;
}): VisualEditorPage;
```

创建空白设计器页面。

### `initVisualData(options?)`

```ts
type InitVisualDataOptions = {
  initialData?: VisualEditorModelValue | null;
  initialPath?: string;
  routePath?: string;
};

function initVisualData(options?: InitVisualDataOptions): {
  visualConfig: VisualEditorConfig;
  currentPath: Readonly<import('vue').ComputedRef<string>>;
  jsonData: Readonly<VisualEditorModelValue>;
  currentPage: Readonly<import('vue').ComputedRef<VisualEditorPage>>;
  currentBlock: Readonly<import('vue').ComputedRef<VisualEditorBlockData>>;
  historyState: Readonly<{
    current: number;
    snapshots: unknown[];
    restoring: boolean;
  }>;
  canUndo: import('vue').ComputedRef<boolean>;
  canRedo: import('vue').ComputedRef<boolean>;
  undoHistory(): boolean;
  redoHistory(): boolean;
  overrideProject(jsonData: string | VisualEditorModelValue): void;
  incrementFetchApi(api: FetchApiItem): void;
  deleteFetchApi(key: string): void;
  updateFetchApi(api: FetchApiItem | FetchApiItem[], isCover?: boolean): void;
  incrementModel(model: VisualEditorModel): void;
  deleteModel(key: string): void;
  updateModel(model: VisualEditorModel | VisualEditorModel[], isCover?: boolean): void;
  setCurrentPage(path?: string): void;
  setCurrentBlock(block: VisualEditorBlockData): void;
  updatePage(args: { newPath?: string; oldPath: string; page: VisualEditorPage }): void;
  incrementPage(path: string, page: VisualEditorPage): void;
  deletePage(path?: string, redirectPath?: string): void;
  updatePageBlock(path?: string, blocks?: VisualEditorBlockData[]): void;
};
```

初始化设计器状态。`VisualEditorProvider` 内部已经调用，一般业务无需直接使用。

### `useVisualData()`

```ts
function useVisualData(): ReturnType<typeof initVisualData>;
```

从 Vue inject 中读取设计器状态。

### `localKey`

```ts
const localKey: string;
```

设计器写入 `sessionStorage` 时使用的 key，当前值来自 `CacheEnum.PAGE_DATA_KEY`。

### `injectKey`

```ts
const injectKey: import('vue').InjectionKey<ReturnType<typeof initVisualData>>;
```

设计器状态的 Vue provide/inject key。一般由 `VisualEditorProvider` 内部使用。

### `fieldTypes`

```ts
const fieldTypes: { label: string; value: string }[];
```

设计器实体字段类型选项。

### `provideVisualEditorPersistence(persistence)`

```ts
type VisualEditorPersistence = {
  saveProject?: () => Promise<void> | void;
};

function provideVisualEditorPersistence(
  persistence: VisualEditorPersistence
): void;
```

向设计器注入保存能力。

### `useVisualEditorPersistence()`

```ts
function useVisualEditorPersistence(): VisualEditorPersistence;
```

读取已注入的保存能力。

## 设计器属性配置 API

子路径导入：

```ts
import {
  VisualEditorPropsType,
  createEditorInputProp,
  createEditorInputNumberProp,
  createEditorColorProp,
  createEditorSelectProp,
  createEditorSwitchProp,
  createEditorModelBindProp,
  createEditorTableProp,
  createEditorCrossSortableProp,
} from '@enlearn/lowcode-framework/designer';
```

| API | 参数 | 返回值 |
| --- | --- | --- |
| `createEditorModelBindProp` | `{ label?: string; defaultValue?: any; tips?: string }` | `VisualEditorProps` |
| `createEditorSwitchProp` | `{ label: string; defaultValue?: boolean; tips?: string }` | `VisualEditorProps` |
| `createEditorInputProp` | `{ label: string; defaultValue?: any; tips?: string }` | `VisualEditorProps` |
| `createEditorInputNumberProp` | `{ label: string; defaultValue?: any; tips?: string; max?: number; min?: number }` | `VisualEditorProps` |
| `createEditorColorProp` | `{ label: string; defaultValue?: string }` | `VisualEditorProps` |
| `createEditorSelectProp` | `{ label: string; options: VisualEditorSelectOptions; defaultValue?: any; multiple?: boolean; tips?: string }` | `VisualEditorProps` |
| `createEditorTableProp` | `{ label: string; option: VisualEditorTableOption; defaultValue?: Record<string, any>[] }` | `VisualEditorProps` |
| `createEditorCrossSortableProp` | `{ label: string; labelPosition: 'top' \| ''; multiple?: boolean; showItemPropsConfig?: boolean; defaultValue?: string[] \| VisualEditorSelectOptions }` | `VisualEditorProps` |

## 物料属性表单 API

注册表和运行时映射函数从 index 子路径导入：

```ts
import {
  registerMaterialPropForm,
  getMaterialPropFormDefinition,
  getMaterialPropFormDefinitions,
  createMaterialPropForm,
  createMaterialPropModel,
  createMaterialPropOptionSources,
  applyMaterialPropFieldValue,
  getVisualModelsSourceKey,
  type MaterialPropFormDefinition,
  type MaterialPropFormField,
  type MaterialPropFormSchema,
} from '@enlearn/lowcode-framework/materials';
```

helper 创建函数从 `helpers` 子路径导入：

```ts
import {
  defineMaterialPropForm,
  defineMaterialPropForms,
  propField,
  jsonPropField,
  switchPropField,
  option,
} from '@enlearn/lowcode-framework/materials';
```

| API | 参数 | 返回值 | 说明 |
| --- | --- | --- | --- |
| `registerMaterialPropForm` | `MaterialPropFormDefinition` | `void` | 注册物料属性表单 |
| `getMaterialPropFormDefinition` | `componentKey?: string` | `MaterialPropFormDefinition \| undefined` | 获取指定组件属性表单 |
| `getMaterialPropFormDefinitions` | 无 | `Record<string, MaterialPropFormDefinition>` | 获取全部属性表单映射 |
| `getVisualModelsSourceKey` | 无 | `string` | 返回设计器模型选项源 key |
| `createMaterialPropForm` | `component: VisualEditorComponent \| undefined, block: VisualEditorBlockData` | `MaterialPropFormSchema` | 根据组件定义和当前块生成属性表单 Schema |
| `createMaterialPropModel` | `block: VisualEditorBlockData, fields: MaterialPropFormField[]` | `Record<string, unknown>` | 根据字段定义读取当前块的属性表单模型 |
| `createMaterialPropOptionSources` | `models: readonly unknown[]` | `Record<string, unknown>` | 生成属性表单动态选项源 |
| `applyMaterialPropFieldValue` | `block: VisualEditorBlockData, field: MaterialPropFormField, value: unknown` | `void` | 把属性表单字段值写回块的 `props`、`styles` 或块本身 |
| `defineMaterialPropForm` | `MaterialPropFormDefinition` | `MaterialPropFormDefinition` | 定义单个属性表单 |
| `defineMaterialPropForms` | `MaterialPropFormDefinition[]` | `MaterialPropFormDefinition[]` | 定义多个属性表单 |
| `propField` | `FieldInput` | `MaterialPropFormField` | 创建普通 props 字段 |
| `jsonPropField` | `FieldInput` | `MaterialPropFormField` | 创建 JSON props 字段 |
| `switchPropField` | `FieldInput` | `MaterialPropFormField` | 创建开关 props 字段 |
| `option` | `(label: string, rawValue: unknown, value?: string \| number)` | `LowCodeOption` | 创建保留 `rawValue` 的选项 |

## 内置页面 API

子路径导入：

```ts
import {
  builtinLowCodePages,
  getBuiltinLowCodePageByCode,
  getBuiltinLowCodePageByRoute,
} from '@enlearn/lowcode-framework/runtime';
```

| API | 参数 | 返回值 |
| --- | --- | --- |
| `builtinLowCodePages` | 无 | `LowCodePageRecord[]` |
| `getBuiltinLowCodePageByCode` | `code: string` | `LowCodePageRecord \| null` |
| `getBuiltinLowCodePageByRoute` | `route: string` | `LowCodePageRecord \| null` |

当前内置页面包括：用户角色管理页。

## 扩展示例

### 注册自定义页面块物料

```ts
import {
  registerLowCodeBlockMaterial,
  type LowCodeBlockMaterial,
} from '@enlearn/lowcode-framework';
import MyChartBlock from './MyChartBlock.vue';

const material: LowCodeBlockMaterial = {
  type: 'chart',
  label: '图表',
  component: MyChartBlock,
  materialVersion: '1.0.0',
  createDefaultBlock: (overrides = {}) => ({
    id: 'chart-block',
    kind: 'chart',
    title: '图表',
    sourceKey: 'records',
    ...overrides,
  }),
  validate: (block) => (block.id ? [] : [{ path: 'id', message: 'Block ID is required.' }]),
  order: 200,
};

registerLowCodeBlockMaterial(material);
```

### 注册自定义表单字段物料

```ts
import {
  registerLowCodeFormMaterial,
  type LowCodeFormMaterial,
} from '@enlearn/lowcode-framework';
import MyField from './MyField.vue';

const material: LowCodeFormMaterial = {
  type: 'my-field',
  label: '自定义字段',
  component: MyField,
  aliases: ['myField'],
  order: 200,
};

registerLowCodeFormMaterial(material);
```

自定义字段组件约定：

```ts
type Props = {
  field: LowCodeField;
  modelValue: any;
  options?: LowCodeResolvedOption[];
};

type Emits = {
  'update:modelValue': [any];
};
```

## npm 发布前检查

当前 `package.json` 是源码直出：

```json
{
  "main": "./src/index.ts",
  "module": "./src/index.ts",
  "types": "./src/index.ts",
  "files": ["src"]
}
```

发布到 npm 前建议确认：

- 是否继续源码直出，要求消费方支持 Vue SFC、TS、TSX、SCSS 和 `import.meta.glob`。
- 或改为构建产物发布，输出 `dist/index.mjs`、`dist/index.d.ts`、组件类型和样式文件。
- 当前源码内部 import 已改为相对路径，不再要求消费方配置 `@/`、`~/` alias；发布构建仍可进一步改为 Vite library build。
- 当前运行时组件优先依赖 `createLowCodePlugin({ serviceApi, router, route })` 或组件 props 注入宿主能力；Nuxt 自动导入只保留为仓库内兼容兜底。
- `peerDependencies` 中 `vxe-pc-ui`、`vxe-table` 使用 `latest`，发布稳定包前建议锁定兼容版本范围。
- `files` 当前只包含 `src`，README/LICENSE/package.json 会由 npm 自动包含；如发布 dist，需要同步调整 `files`。
- 建议发布前运行：

```bash
pnpm --dir packages/lowcode-framework typecheck
npm pack --dry-run
```

## 推荐稳定 API 清单

对外稳定使用建议优先承诺以下 API：

- 组件：`LowCodePageRenderer`、`LowCodeVisualDesigner`、`VisualEditorProvider`、`LowCodeForm`、`LowCodeGrid`。
- 宿主适配：`createLowCodePlugin`、`provideLowCodeHost`、`useLowCodeHost`、`applyLowCodeTheme`。
- Schema：`prepareLowCodePageSchema`、`validateLowCodePageSchema`、`assertValidLowCodePageSchema`、`registerLowCodeSchemaMigration`、`getLowCodeSchemaMigrations`、`LowCodeSchemaValidationError`。
- 类型：`LowCodePageSchema`、`LowCodePageRecord`、`LowCodePageBlock`、`LowCodeFormSchema`、`LowCodeGridSchema`、`LowCodeRuntimeDirective`。
- 指令扩展：`registerLowCodeRuntimeDirective`、`registerLowCodeRuntimeDirectiveAliases`、`getLowCodeRuntimeDirectiveTypes`。
- 物料扩展：`installLowCodeMaterialPlugin`、`registerLowCodeBlockMaterial`、`registerLowCodeFormMaterial`、`registerMaterialPropForm`、`createDefaultLowCodeBlock`。
- 主题/i18n：`LowCodeTheme`、`LowCodeMessages`、`lowCodeDefaultMessages`、`lowCodeZhCNMessages`、`lowCodeBuiltinMessages`。
- 转换：`convertVisualEditorToLowCode`、`convertLowCodePageSchemaToVisualEditor`。
- 事件：`createLowCodeEventBus`、`resolveEventDirectives`。
