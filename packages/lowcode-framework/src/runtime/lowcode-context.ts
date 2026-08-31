import type {
  LowCodeEditPageMode,
  LowCodeField,
  LowCodePageBlock,
  LowCodePageRecord,
} from '../types/lowcode';
import {
  getLowCodeScriptApiDefinitions,
  type LowCodeScriptCapabilityName,
} from './scripts';
import {
  getLowCodeNodeActionMethods,
  getLowCodeNodeTypeDefinition,
} from './node-action-registry';

export type LowCodeContextCategory = 'fields' | 'apis' | 'functions' | 'nodes';

export type LowCodeContextEntry = {
  id: string;
  category: Exclude<LowCodeContextCategory, 'nodes'>;
  group: string;
  label: string;
  field?: string;
  sourceKey?: string;
  blockId?: string;
  description?: string;
  insertText: string;
  icon?: string;
  badge?: string;
  keywords?: string[];
};

export type LowCodeContextFieldTreeNode = {
  id: string;
  type: 'table' | 'field';
  label: string;
  role?: string;
  field?: string;
  sourceKey?: string;
  blockId?: string;
  tableType?: 'main' | 'detail' | 'default';
  description?: string;
  icon?: string;
  badge?: string;
  entry?: LowCodeContextEntry;
  children: LowCodeContextFieldTreeNode[];
};

export type LowCodeContextNodeMethod = {
  id: string;
  method: string;
  label: string;
  description: string;
  insertText: string;
  parameters: Array<{ name: string; type: string; required?: boolean; description: string }>;
  returns: string;
};

export type LowCodeContextNode = {
  id: string;
  blockId: string;
  label: string;
  kind: string;
  kindLabel: string;
  icon: string;
  description?: string;
  insertText: string;
  methods: LowCodeContextNodeMethod[];
  children: LowCodeContextNode[];
};

export type LowCodeContextSource = {
  page?: Pick<LowCodePageRecord, 'id' | 'code' | 'route' | 'title' | 'schema' | 'node_actions' | 'runtime_functions'> & {
    page_type?: LowCodePageRecord['page_type'];
    mode?: LowCodeEditPageMode;
  };
  data?: Record<string, unknown>;
  forms?: Record<string, Record<string, unknown>>;
  searches?: Record<string, Record<string, unknown>>;
  grids?: Record<string, unknown>;
  apiNames?: string[];
  capabilities?: LowCodeScriptCapabilityName[];
  entries?: LowCodeContextEntry[];
};

export type LowCodeContextCatalog = {
  fields: LowCodeContextEntry[];
  fieldTree: LowCodeContextFieldTreeNode[];
  apis: LowCodeContextEntry[];
  functions: LowCodeContextEntry[];
  nodes: LowCodeContextNode[];
};

const SCRIPT_ENTRIES: Array<[
  string, LowCodeScriptCapabilityName | undefined, string, string, string, string
]> = [
  ['action.execute', 'action.execute', '统一调用', '执行节点动作', '通过节点动作白名单调用页面节点', 'await this.executeAction({ node: "nodeId", method: "setData", data: {} });'],
  ['http.execute', 'http.execute', '统一调用', '调用页面 API', '调用当前页面声明的安全 API 别名', 'const result = await this.executeHttp({ api: "apiName", method: "POST", body: {} });'],
  ['pageFunction.execute', 'pageFunction.execute', '统一调用', '调用页面函数', '调用当前页面声明的可复用函数', 'const result = await this.executeFunction({ name: "functionName", args: {} });'],
  ['source.refresh', 'source.refresh', '数据源', '刷新数据源', '重新请求指定页面数据源', 'await this.$source.refresh("sourceKey");'],
  ['source.refreshAll', 'source.refreshAll', '数据源', '刷新全部数据源', '重新请求当前页面的全部数据源', 'await this.$source.refreshAll();'],
  ['source.set', 'source.set', '数据源', '设置数据源值', '通过受控能力替换指定数据源', 'await this.$source.set("sourceKey", value);'],
  ['source.get', undefined, '数据源', '读取数据源', '读取脚本开始执行时的数据源快照', 'const value = this.$source.get("sourceKey");'],
  ['form.get', undefined, '表单', '读取表单', '读取脚本开始执行时的表单快照', 'const value = this.$form.get("formBlockId");'],
  ['form.patch', 'form.patch', '表单', '更新表单字段', '合并更新指定表单的字段值', 'await this.$form.patch("formBlockId", { field: value });'],
  ['form.replace', 'form.replace', '表单', '替换表单值', '完整替换指定表单的数据', 'await this.$form.replace("formBlockId", { field: value });'],
  ['search.get', undefined, '查询', '读取查询条件', '读取脚本开始执行时的查询条件快照', 'const value = this.$search.get("sourceKey");'],
  ['search.patch', 'search.patch', '查询', '更新查询条件', '合并更新数据源的查询条件', 'await this.$search.patch("sourceKey", { field: value });'],
  ['search.replace', 'search.replace', '查询', '替换查询条件', '完整替换数据源的查询条件', 'await this.$search.replace("sourceKey", { field: value });'],
  ['grid.get', undefined, '表格', '读取表格状态', '读取当前行、选中行和上下文行等表格快照', 'const value = this.$grid.get("gridBlockId");'],
  ['grid.setRows', 'grid.setRows', '表格', '设置表格行', '通过受控能力替换表格行数据', 'await this.$grid.setRows("gridBlockId", rows);'],
  ['page.refresh', 'page.refresh', '页面', '刷新页面', '重新加载当前低代码页面数据', 'await this.$page.refresh();'],
  ['router.push', 'router.push', '页面', '页面跳转', '通过受控路由跳转到目标', 'await this.$router.push("/dashboard/path");'],
  ['message.success', 'message.success', '交互', '成功消息', '显示成功状态消息', 'await this.$message.success("操作成功");'],
  ['message.info', 'message.info', '交互', '提示消息', '显示普通提示消息', 'await this.$message.info("提示内容");'],
  ['message.warning', 'message.warning', '交互', '警告消息', '显示警告状态消息', 'await this.$message.warning("请检查输入");'],
  ['message.error', 'message.error', '交互', '错误消息', '显示错误状态消息', 'await this.$message.error("操作失败");'],
  ['dialog.open', 'dialog.open', '交互', '打开弹框', '通过受控配置打开全局低代码弹框', 'const result = await this.$dialog.open({ title: "标题", model: {} });'],
  ['event.emit', 'event.emit', '事件', '发送页面事件', '向当前页面事件总线发送序列化事件', 'await this.$events.emit("custom.event", { value });'],
];

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function quote(value: string) {
  return JSON.stringify(value);
}

function childBlocks(block: LowCodePageBlock): LowCodePageBlock[] {
  const value = block as any;
  return [
    ...(Array.isArray(value.blocks) ? value.blocks : []),
    ...(Array.isArray(value.tabs) ? value.tabs.flatMap((tab: any) => Array.isArray(tab?.blocks) ? tab.blocks : []) : []),
    ...(Array.isArray(value.overlays) ? value.overlays : []),
  ];
}

function flatten(blocks: LowCodePageBlock[]): LowCodePageBlock[] {
  return blocks.flatMap((block) => [block, ...flatten(childBlocks(block))]);
}

function fieldEntry(
  id: string,
  group: string,
  label: string,
  access: string,
  options: Partial<LowCodeContextEntry> = {},
): LowCodeContextEntry {
  return {
    id, category: 'fields', group, label,
    description: options.description ?? label,
    insertText: access, icon: 'ri-braces-line', badge: options.badge ?? 'DATA',
    ...options,
  };
}

function fieldNames(value: unknown): string[] {
  const rows = Array.isArray(value) ? value : [value];
  return [...new Set(rows.slice(0, 10).flatMap((row) => isRecord(row) ? Object.keys(row) : []))];
}

function blockFields(block: LowCodePageBlock): Array<{ field: string; label: string; badge: string; sourceKey: string }> {
  const value = block as any;
  const result: Array<{ field: string; label: string; badge: string; sourceKey: string }> = [];
  const fields: LowCodeField[] = Array.isArray(value.schema?.fields) ? value.schema.fields : [];
  fields.forEach((field) => result.push({
    field: text(field.field), label: text(field.label, text(field.field)),
    badge: block.kind === 'searchForm' ? 'SEARCH' : 'FORM',
    sourceKey: block.kind === 'searchForm' ? text(value.targetSourceKey, block.id) : block.id,
  }));
  const columns = Array.isArray(value.schema?.grid?.columns) ? value.schema.grid.columns : [];
  columns.forEach((column: any) => {
    const field = text(column?.field);
    if (field) result.push({ field, label: text(column?.title, field), badge: 'GRID', sourceKey: text(value.sourceKey) });
  });
  return result.filter((entry) => entry.field);
}

function createFields(source: LowCodeContextSource, blocks: LowCodePageBlock[]) {
  const entries: LowCodeContextEntry[] = [];
  const data = source.data ?? {};
  const keys = [...new Set([...Object.keys(source.page?.schema.dataSources ?? {}), ...Object.keys(data)])];
  keys.forEach((key) => {
    const names = fieldNames(data[key]);
    if (!names.length) {
      entries.push(fieldEntry(`data:${key}`, '数据源', key, `this.$source.get(${quote(key)})`, {
        sourceKey: key, badge: 'SOURCE', description: `数据源 ${key}`,
      }));
      return;
    }
    names.forEach((field) => entries.push(fieldEntry(
      `data:${key}:${field}`, `数据源 · ${key}`, field,
      `${Array.isArray(data[key]) ? `this.data[${quote(key)}]?.[0]` : `this.data[${quote(key)}]` }?.[${quote(field)}]`,
      { field, sourceKey: key },
    )));
  });
  blocks.forEach((block) => blockFields(block).forEach(({ field, label, badge, sourceKey }) => {
    const root = badge === 'GRID' ? `this.grids[${quote(block.id)}]?.currentRow` :
      badge === 'SEARCH' ? `this.searches[${quote(sourceKey)}]` : `this.forms[${quote(block.id)}]`;
    entries.push(fieldEntry(`${badge.toLowerCase()}:${block.id}:${field}`, `${badge} · ${text((block as any).title, block.id)}`, label,
      `${root}?.[${quote(field)}]`, { field, sourceKey, blockId: block.id, badge }));
  }));
  return entries;
}

function createFieldTree(source: LowCodeContextSource, entries: LowCodeContextEntry[], blocks: LowCodePageBlock[]) {
  const owners = new Map<string, LowCodeContextFieldTreeNode>();
  const blockKey = (blockId: string) => {
    const block = blocks.find((candidate) => candidate.id === blockId) as any;
    if (block?.kind === 'grid') return `grid:${blockId}`;
    if (block?.kind === 'searchForm') return `search:${blockId}`;
    return `form:${blockId}`;
  };
  const ensure = (key: string, label: string, sourceKey = '', blockId = '', tableType: 'main' | 'detail' | 'default' = 'default', role = '') => {
    const existing = owners.get(key);
    if (existing) return existing;
    const owner: LowCodeContextFieldTreeNode = {
      id: `table:${key}`, type: 'table', label, sourceKey, blockId, tableType,
      role: role || (tableType === 'main' ? '主表' : tableType === 'detail' ? '明细 Grid' : ''),
      icon: 'ri-table-line', children: [],
    };
    owners.set(key, owner);
    return owner;
  };
  const orderedBlocks = [
    ...blocks.filter((block) => block.kind === 'grid' && (block as any).tableType === 'main'),
    ...blocks.filter((block) => block.kind === 'form'),
    ...blocks.filter((block) => block.kind === 'grid' && (block as any).tableType !== 'main'),
    ...blocks.filter((block) => block.kind === 'searchForm'),
  ];
  orderedBlocks.forEach((block) => {
    const value = block as any;
    const type = value.tableType === 'main' || value.tableType === 'detail' ? value.tableType : 'default';
    const sourceKey = block.kind === 'searchForm' ? text(value.targetSourceKey, block.id) : text(value.sourceKey, block.kind === 'form' ? block.id : '');
    const role = block.kind === 'searchForm' ? '查询表单' : type === 'main' || block.kind === 'form' ? '主表' : type === 'detail' ? '明细 Grid' : '';
    ensure(blockKey(block.id), text(value.title, block.id), sourceKey, block.id, type, role);
  });
  const sourceOwners = new Map<string, LowCodeContextFieldTreeNode>();
  owners.forEach((owner) => {
    if (owner.sourceKey && owner.role !== '查询表单') sourceOwners.set(owner.sourceKey, owner);
  });
  entries.forEach((entry) => {
    const owner = entry.blockId
      ? owners.get(blockKey(entry.blockId))
      : entry.sourceKey ? sourceOwners.get(entry.sourceKey) : undefined;
    const target = owner ?? ensure(`source:${entry.sourceKey || entry.id}`, entry.group?.split(' · ')[1] ?? entry.label, entry.sourceKey, '', 'default', '数据源');
    const field = entry.field ?? entry.label;
    const preferred = target.children.find((item) => item.field === field);
    const priority = (badge: string | undefined, table: LowCodeContextFieldTreeNode) => {
      const order = table.role === '主表' ? ['FORM', 'GRID', 'DATA', 'DETAIL'] : ['GRID', 'FORM', 'DATA', 'DETAIL'];
      const index = order.indexOf(badge ?? '');
      return index < 0 ? order.length : index;
    };
    const node = {
      id: `${target.id}/field:${entry.field ?? entry.label}`, type: 'field', label: entry.label,
      field: entry.field, sourceKey: entry.sourceKey, blockId: entry.blockId,
      description: entry.description, icon: entry.icon, badge: entry.badge, entry, children: [],
    } satisfies LowCodeContextFieldTreeNode;
    if (!preferred) target.children.push(node);
    else if (priority(entry.badge, target) < priority(preferred.badge, target)) target.children[target.children.indexOf(preferred)] = node;
  });
  return [...owners.values()].filter((owner) => owner.children.length);
}

function createFunctions(source: LowCodeContextSource): LowCodeContextEntry[] {
  const capabilities = new Set(source.capabilities ?? []);
  const result = SCRIPT_ENTRIES
    .filter(([, capability]) => !capability || capabilities.has(capability))
    .map(([key, capability, group, label, description, insertText]) => ({
      id: `function:${key}`, category: 'functions' as const, group, label, description, insertText,
      badge: capability ?? 'readonly', icon: 'ri-function-line', keywords: [key],
    }));
  const database = (source.page?.runtime_functions ?? [])
    .filter((fn) => fn.function_type === 'page_function' && fn.enabled !== false && (!fn.page_type || fn.page_type === source.page?.page_type))
    .map((fn) => ({
      id: `function:database:${fn.runtime_key}`, category: 'functions' as const,
      group: fn.page_id ? '页面数据库函数' : '系统数据库函数', label: fn.label || fn.function_name,
      description: fn.description || `调用页面函数 ${fn.function_name}`,
      insertText: `const result = await this.executeFunction({ name: ${quote(fn.function_name)}, args: {} });`,
      badge: fn.page_id ? 'PAGE' : 'SYSTEM', icon: 'ri-function-line', keywords: [fn.function_name, fn.runtime_key],
    }));
  const custom = capabilities.has('pageFunction.execute')
    ? (source.page?.schema.functions ?? []).filter((fn) => fn.enabled !== false && !database.some((item) => item.label === (fn.label || fn.name)))
      .map((fn) => ({ id: `function:page:${fn.name}`, category: 'functions' as const, group: '页面函数', label: fn.label || fn.name,
        description: fn.description || `调用页面函数 ${fn.name}`, insertText: `const result = await this.executeFunction({ name: ${quote(fn.name)}, args: {} });`,
        badge: 'PAGE', icon: 'ri-function-line', keywords: [fn.name] }))
    : [];
  return [...database, ...custom, ...result];
}

function blockNode(block: LowCodePageBlock, path: string, actions: NonNullable<LowCodePageRecord['node_actions']>): LowCodeContextNode {
  const value = block as any;
  const definition = getLowCodeNodeTypeDefinition(block.kind, actions);
  return {
    id: path, blockId: block.id, label: text(value.title, block.id), kind: block.kind,
    kindLabel: definition?.label ?? block.kind, icon: definition?.icon ?? 'ri-box-3-line',
    description: text(value.description), insertText: quote(block.id),
    methods: getLowCodeNodeActionMethods(block.kind, block, actions).map((action) => ({
      id: `${path}/method:${action.method}`, method: action.method, label: action.label,
      description: action.description, insertText: action.createInsertText(block.id),
      parameters: action.parameters, returns: action.returns,
    })),
    children: childBlocks(block).map((child, index) => blockNode(child, `${path}/${index}:${child.id || child.kind}`, actions)),
  };
}

export function createLowCodeContextCatalog(source: LowCodeContextSource = {}): LowCodeContextCatalog {
  const schema = source.page?.schema;
  const blocks = schema ? flatten([...(schema.blocks ?? []), ...(schema.overlays ?? [])]) : [];
  const extra = source.entries ?? [];
  const fields = [...createFields(source, blocks), ...extra.filter((entry) => entry.category === 'fields')];
  const capabilities = source.capabilities ?? [];
  const apis = capabilities.includes('api.invoke') ? getLowCodeScriptApiDefinitions()
    .filter((api) => (source.apiNames ?? []).includes(api.name))
    .map((api) => ({ id: `api:${api.name}`, category: 'apis' as const, group: '已注册 API', label: api.name,
      description: api.description || '由宿主注册并进行权限校验的业务 API', insertText: api.insertText || `await this.$api.invoke(${quote(api.name)}, {});`,
      badge: 'API', icon: 'ri-shield-keyhole-line' })) : [];
  return {
    fields,
    fieldTree: createFieldTree(source, fields, blocks),
    apis: [...apis, ...extra.filter((entry) => entry.category === 'apis')],
    functions: [...createFunctions(source), ...extra.filter((entry) => entry.category === 'functions')],
    nodes: schema
      ? [...(schema.blocks ?? []), ...(schema.overlays ?? [])].filter((block) => block.id)
        .map((block, index) => blockNode(block, `root/${index}:${block.id}`, source.page?.node_actions ?? []))
      : [],
  };
}

export function cloneLowCodeContextSource(source: LowCodeContextSource): LowCodeContextSource {
  try { return JSON.parse(JSON.stringify(source)) as LowCodeContextSource; } catch { return {}; }
}
