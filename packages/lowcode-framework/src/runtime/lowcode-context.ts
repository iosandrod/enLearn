import type {
  LowCodeField,
  LowCodePageBlock,
  LowCodePageRecord,
} from '../types/lowcode';
import {
  getLowCodeScriptApiDefinitions,
  type LowCodeScriptCapabilityName,
} from './scripts';
import { getBuiltinLowCodePageFunctions } from './page-function';
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

export type LowCodeContextNodeMethod = {
  id: string;
  method: string;
  label: string;
  description: string;
  insertText: string;
  parameters: Array<{
    name: string;
    type: string;
    required?: boolean;
    description: string;
  }>;
  returns: string;
};

export type LowCodeContextSource = {
  page?: Pick<LowCodePageRecord, 'id' | 'code' | 'route' | 'title' | 'schema'> & {
    page_type?: LowCodePageRecord['page_type'];
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

type ScriptFunctionDefinition = {
  key: string;
  capability?: LowCodeScriptCapabilityName;
  group: string;
  label: string;
  description: string;
  signature: string;
  insertText: string;
};

const scriptFunctionDefinitions: ScriptFunctionDefinition[] = [
  {
    key: 'action.execute',
    capability: 'action.execute',
    group: '统一调用',
    label: '执行节点动作',
    description: '通过节点动作白名单调用页面节点',
    signature: 'this.executeAction({ node, method, data })',
    insertText: 'await this.executeAction({\n  node: "nodeId",\n  method: "setData",\n  data: {},\n});',
  },
  {
    key: 'http.execute',
    capability: 'http.execute',
    group: '统一调用',
    label: '调用页面 API',
    description: '调用当前页面声明的安全 API 别名',
    signature: 'this.executeHttp({ api, method, body })',
    insertText: 'const result = await this.executeHttp({\n  api: "apiName",\n  method: "POST",\n  body: {},\n});',
  },
  {
    key: 'pageFunction.execute',
    capability: 'pageFunction.execute',
    group: '统一调用',
    label: '调用页面函数',
    description: '按名称调用当前页面声明的可复用函数',
    signature: 'this.executeFunction({ name, args })',
    insertText: 'const result = await this.executeFunction({\n  name: "functionName",\n  args: {},\n});',
  },
  {
    key: 'source.refresh',
    capability: 'source.refresh',
    group: '数据源',
    label: '刷新数据源',
    description: '重新请求指定页面数据源',
    signature: 'this.$source.refresh(sourceKey)',
    insertText: 'await this.$source.refresh("sourceKey");',
  },
  {
    key: 'source.refreshAll',
    capability: 'source.refreshAll',
    group: '数据源',
    label: '刷新全部数据源',
    description: '重新请求当前页面的全部数据源',
    signature: 'this.$source.refreshAll()',
    insertText: 'await this.$source.refreshAll();',
  },
  {
    key: 'source.set',
    capability: 'source.set',
    group: '数据源',
    label: '设置数据源值',
    description: '通过受控能力替换指定数据源',
    signature: 'this.$source.set(sourceKey, value)',
    insertText: 'await this.$source.set("sourceKey", value);',
  },
  {
    key: 'source.get',
    group: '数据源',
    label: '读取数据源',
    description: '读取脚本开始执行时的数据源快照',
    signature: 'this.$source.get(sourceKey)',
    insertText: 'const sourceValue = this.$source.get("sourceKey");',
  },
  {
    key: 'form.get',
    group: '表单',
    label: '读取表单',
    description: '读取脚本开始执行时的表单快照',
    signature: 'this.$form.get(blockId)',
    insertText: 'const formValues = this.$form.get("formBlockId");',
  },
  {
    key: 'form.patch',
    capability: 'form.patch',
    group: '表单',
    label: '更新表单字段',
    description: '合并更新指定表单的字段值',
    signature: 'this.$form.patch(blockId, values)',
    insertText: 'await this.$form.patch("formBlockId", { field: value });',
  },
  {
    key: 'form.replace',
    capability: 'form.replace',
    group: '表单',
    label: '替换表单值',
    description: '完整替换指定表单的数据',
    signature: 'this.$form.replace(blockId, values)',
    insertText: 'await this.$form.replace("formBlockId", { field: value });',
  },
  {
    key: 'search.get',
    group: '查询',
    label: '读取查询条件',
    description: '读取脚本开始执行时的查询条件快照',
    signature: 'this.$search.get(sourceKey)',
    insertText: 'const searchValues = this.$search.get("sourceKey");',
  },
  {
    key: 'search.patch',
    capability: 'search.patch',
    group: '查询',
    label: '更新查询条件',
    description: '合并更新数据源的查询条件',
    signature: 'this.$search.patch(sourceKey, values)',
    insertText: 'await this.$search.patch("sourceKey", { field: value });',
  },
  {
    key: 'search.replace',
    capability: 'search.replace',
    group: '查询',
    label: '替换查询条件',
    description: '完整替换数据源的查询条件',
    signature: 'this.$search.replace(sourceKey, values)',
    insertText: 'await this.$search.replace("sourceKey", { field: value });',
  },
  {
    key: 'grid.get',
    group: '表格',
    label: '读取表格状态',
    description: '读取当前行、选中行和上下文行等表格快照',
    signature: 'this.$grid.get(blockId)',
    insertText: 'const gridState = this.$grid.get("gridBlockId");',
  },
  {
    key: 'grid.setRows',
    capability: 'grid.setRows',
    group: '表格',
    label: '设置表格行',
    description: '通过受控能力替换表格行数据',
    signature: 'this.$grid.setRows(blockId, rows)',
    insertText: 'await this.$grid.setRows("gridBlockId", rows);',
  },
  {
    key: 'page.refresh',
    capability: 'page.refresh',
    group: '页面',
    label: '刷新页面',
    description: '重新加载当前低代码页面数据',
    signature: 'this.$page.refresh()',
    insertText: 'await this.$page.refresh();',
  },
  {
    key: 'router.push',
    capability: 'router.push',
    group: '页面',
    label: '页面跳转',
    description: '通过宿主路由跳转到受支持的目标',
    signature: 'this.$router.push(target)',
    insertText: 'await this.$router.push("/dashboard/path");',
  },
  {
    key: 'message.success',
    capability: 'message.success',
    group: '交互',
    label: '成功消息',
    description: '显示成功状态消息',
    signature: 'this.$message.success(message)',
    insertText: 'await this.$message.success("操作成功");',
  },
  {
    key: 'message.info',
    capability: 'message.info',
    group: '交互',
    label: '提示消息',
    description: '显示普通提示消息',
    signature: 'this.$message.info(message)',
    insertText: 'await this.$message.info("提示内容");',
  },
  {
    key: 'message.warning',
    capability: 'message.warning',
    group: '交互',
    label: '警告消息',
    description: '显示警告状态消息',
    signature: 'this.$message.warning(message)',
    insertText: 'await this.$message.warning("请检查输入");',
  },
  {
    key: 'message.error',
    capability: 'message.error',
    group: '交互',
    label: '错误消息',
    description: '显示错误状态消息',
    signature: 'this.$message.error(message)',
    insertText: 'await this.$message.error("操作失败");',
  },
  {
    key: 'dialog.open',
    capability: 'dialog.open',
    group: '交互',
    label: '打开弹框',
    description: '通过受控配置打开全局低代码弹框',
    signature: 'this.$dialog.open(config)',
    insertText: 'const result = await this.$dialog.open({\n  title: "标题",\n  model: {},\n});',
  },
  {
    key: 'event.emit',
    capability: 'event.emit',
    group: '事件',
    label: '发送页面事件',
    description: '向当前页面事件总线发送序列化事件',
    signature: 'this.$events.emit(name, payload)',
    insertText: 'await this.$events.emit("custom.event", { value });',
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readBlockString(block: LowCodePageBlock, key: string, fallback = '') {
  return readString((block as unknown as Record<string, unknown>)[key], fallback);
}

function jsString(value: string) {
  return JSON.stringify(value);
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.filter((value): value is string =>
    typeof value === 'string' && Boolean(value.trim()),
  ).map((value) => value.trim()))];
}

function fieldsFromValue(value: unknown) {
  if (Array.isArray(value)) {
    return uniqueStrings(
      value.slice(0, 10).flatMap((item) => isRecord(item) ? Object.keys(item) : []),
    );
  }
  return isRecord(value) ? Object.keys(value) : [];
}

function createDataFieldAccess(sourceKey: string, field: string, value: unknown) {
  const root = `this.data[${jsString(sourceKey)}]`;
  return Array.isArray(value)
    ? `${root}?.[0]?.[${jsString(field)}]`
    : `${root}?.[${jsString(field)}]`;
}

function readBlockFields(block: LowCodePageBlock): LowCodeField[] {
  if (block.kind === 'form' || block.kind === 'searchForm') {
    return Array.isArray(block.schema.fields) ? block.schema.fields : [];
  }
  return [];
}

function readGridColumnFields(block: LowCodePageBlock) {
  if (block.kind !== 'grid' || !Array.isArray(block.schema.grid.columns)) return [];
  return block.schema.grid.columns
    .map((column) => ({
      field: readString(column.field),
      label: readString(column.title, readString(column.field)),
    }))
    .filter((column) => column.field);
}

function readGridSampleFields(source: LowCodeContextSource, block: LowCodePageBlock) {
  if (block.kind !== 'grid') return [];
  const rawGrid = source.grids?.[block.id];
  const grid: Record<string, unknown> = isRecord(rawGrid) ? rawGrid : {};
  const gridRecords = [
    isRecord(grid.currentRow) ? grid.currentRow : undefined,
    isRecord(grid.contextRow) ? grid.contextRow : undefined,
    Array.isArray(grid.selectedRows) && isRecord(grid.selectedRows[0])
      ? grid.selectedRows[0]
      : undefined,
    Array.isArray(grid.rows) && isRecord(grid.rows[0]) ? grid.rows[0] : undefined,
  ].filter(isRecord);
  const sourceKey = readBlockString(block, 'sourceKey');
  const sourceRows = sourceKey ? source.data?.[sourceKey] : undefined;
  const sourceRecord = Array.isArray(sourceRows)
    ? sourceRows.find(isRecord)
    : isRecord(sourceRows) ? sourceRows : undefined;
  return uniqueStrings([
    ...gridRecords.flatMap((record) => Object.keys(record)),
    ...(sourceRecord ? Object.keys(sourceRecord) : []),
  ]);
}

function readDetailFields(block: LowCodePageBlock) {
  if (block.kind !== 'detail' || !Array.isArray(block.fields)) return [];
  return block.fields
    .map((field) => ({
      field: readString(field.field),
      label: readString(field.label, readString(field.field)),
    }))
    .filter((field) => field.field);
}

function childBlocks(block: LowCodePageBlock) {
  const children: LowCodePageBlock[] = [];
  if ('blocks' in block && Array.isArray(block.blocks)) children.push(...block.blocks);
  if (block.kind === 'tabs') {
    block.tabs.forEach((tab) => children.push(...tab.blocks));
  }
  if ((block.kind === 'modal' || block.kind === 'drawer') && block.overlays) {
    children.push(...block.overlays);
  }
  return children;
}

function flattenBlocks(blocks: LowCodePageBlock[]): LowCodePageBlock[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(childBlocks(block))]);
}

function createFieldEntry(options: {
  id: string;
  group: string;
  label: string;
  field?: string;
  sourceKey?: string;
  blockId?: string;
  description: string;
  insertText: string;
  badge: string;
}): LowCodeContextEntry {
  return {
    id: options.id,
    category: 'fields',
    group: options.group,
    label: options.label,
    field: options.field,
    sourceKey: options.sourceKey,
    blockId: options.blockId,
    description: options.description,
    insertText: options.insertText,
    badge: options.badge,
    icon: 'ri-braces-line',
  };
}

function createFieldEntries(source: LowCodeContextSource) {
  const entries: LowCodeContextEntry[] = [];
  const schema = source.page?.schema;
  const blocks = schema
    ? flattenBlocks([...schema.blocks, ...(schema.overlays ?? [])])
    : [];
  const dataKeys = uniqueStrings([
    ...Object.keys(schema?.dataSources ?? {}),
    ...Object.keys(source.data ?? {}),
  ]);

  dataKeys.forEach((sourceKey) => {
    const sourceFields = fieldsFromValue(source.data?.[sourceKey]);
    sourceFields.forEach((field) => {
      entries.push(createFieldEntry({
        id: `data:${sourceKey}:${field}`,
        group: `数据源 · ${sourceKey}`,
        label: field,
        field,
        sourceKey,
        description: `数据源 ${sourceKey} 的绑定字段`,
        insertText: createDataFieldAccess(sourceKey, field, source.data?.[sourceKey]),
        badge: 'DATA',
      }));
    });
    if (!sourceFields.length) {
      entries.push(createFieldEntry({
        id: `data:${sourceKey}`,
        group: '数据源',
        label: sourceKey,
        sourceKey,
        description: '当前页面绑定的数据源',
        insertText: `this.$source.get(${jsString(sourceKey)})`,
        badge: 'SOURCE',
      }));
    }
  });

  blocks.forEach((block) => {
    readBlockFields(block).forEach((field) => {
      const label = readString(field.label, field.field);
      if (block.kind === 'searchForm') {
        const sourceKey = readString(block.targetSourceKey, block.id);
        entries.push(createFieldEntry({
          id: `search:${block.id}:${field.field}`,
          group: `查询表单 · ${block.title ?? block.id}`,
          label,
          field: field.field,
          sourceKey,
          blockId: block.id,
          description: field.field,
          insertText: `this.searches[${jsString(sourceKey)}]?.[${jsString(field.field)}]`,
          badge: 'SEARCH',
        }));
        return;
      }
      entries.push(createFieldEntry({
        id: `form:${block.id}:${field.field}`,
        group: `表单 · ${block.title ?? block.id}`,
        label,
        field: field.field,
        sourceKey: readBlockString(
          block,
          'sourceKey',
          readBlockString(block, 'submitSourceKey'),
        ),
        blockId: block.id,
        description: field.field,
        insertText: `this.forms[${jsString(block.id)}]?.[${jsString(field.field)}]`,
        badge: 'FORM',
      }));
    });

    const gridColumns = readGridColumnFields(block);
    gridColumns.forEach((column) => {
      entries.push(createFieldEntry({
        id: `grid:${block.id}:${column.field}`,
        group: `表格 · ${block.title ?? block.id}`,
        label: column.label,
        field: column.field,
        sourceKey: block.kind === 'grid' ? readBlockString(block, 'sourceKey') : '',
        blockId: block.id,
        description: column.field,
        insertText: `this.grids[${jsString(block.id)}]?.currentRow?.[${jsString(column.field)}]`,
        badge: 'GRID',
      }));
    });
    if (block.kind === 'grid') {
      const configuredFields = new Set(gridColumns.map((column) => column.field));
      readGridSampleFields(source, block)
        .filter((field) => !configuredFields.has(field))
        .forEach((field) => {
          entries.push(createFieldEntry({
            id: `grid:${block.id}:${field}`,
            group: `表格 · ${block.title ?? block.id}`,
            label: field,
            field,
            sourceKey: readBlockString(block, 'sourceKey'),
            blockId: block.id,
            description: '由当前表格运行数据识别的字段',
            insertText: `this.grids[${jsString(block.id)}]?.currentRow?.[${jsString(field)}]`,
            badge: 'GRID',
          }));
        });
    }

    readDetailFields(block).forEach((field) => {
      const sourceKey = block.kind === 'detail'
        ? readString(block.sourceKey, block.id)
        : block.id;
      entries.push(createFieldEntry({
        id: `detail:${block.id}:${field.field}`,
        group: `详情 · ${block.title ?? block.id}`,
        label: field.label,
        field: field.field,
        sourceKey,
        blockId: block.id,
        description: field.field,
        insertText: createDataFieldAccess(sourceKey, field.field, source.data?.[sourceKey]),
        badge: 'DETAIL',
      }));
    });
  });

  return entries;
}

type FieldTreeOwner = {
  id: string;
  label: string;
  role: string;
  sourceKey: string;
  blockId: string;
  tableType: 'main' | 'detail' | 'default';
  block?: LowCodePageBlock;
  entryBadges: Set<string>;
  entries: LowCodeContextEntry[];
};

function readGridTableType(block: LowCodePageBlock): FieldTreeOwner['tableType'] {
  if (block.kind !== 'grid') return 'default';
  return block.tableType === 'main' || block.tableType === 'detail'
    ? block.tableType
    : 'default';
}

function ownerRole(tableType: FieldTreeOwner['tableType'], kind: LowCodePageBlock['kind']) {
  if (tableType === 'main') return '主表';
  if (tableType === 'detail') return '明细 Grid';
  if (kind === 'form') return '主表';
  return '其他 Grid';
}

function preferredFieldEntry(
  owner: FieldTreeOwner,
  candidates: LowCodeContextEntry[],
) {
  const preferredBadges = owner.role === '主表'
    ? ['FORM', 'GRID', 'DATA', 'DETAIL']
    : ['GRID', 'DATA', 'FORM', 'DETAIL'];
  const badgeRank = (entry: LowCodeContextEntry) => {
    const index = preferredBadges.indexOf(entry.badge ?? '');
    return index < 0 ? preferredBadges.length : index;
  };
  return [...candidates].sort((left, right) => badgeRank(left) - badgeRank(right))[0];
}

function fieldNode(owner: FieldTreeOwner, entry: LowCodeContextEntry) {
  const field = readString(entry.field, entry.label);
  return {
    id: `${owner.id}/field:${field}`,
    type: 'field' as const,
    label: entry.label,
    field,
    sourceKey: owner.sourceKey || entry.sourceKey,
    blockId: owner.blockId || entry.blockId,
    description: entry.description,
    icon: entry.icon,
    badge: entry.badge,
    entry,
    children: [],
  } satisfies LowCodeContextFieldTreeNode;
}

function createFieldTree(
  source: LowCodeContextSource,
  fields: LowCodeContextEntry[],
): LowCodeContextFieldTreeNode[] {
  const schema = source.page?.schema;
  const blocks = schema
    ? flattenBlocks([...schema.blocks, ...(schema.overlays ?? [])])
    : [];
  const grids = blocks.filter(
    (block): block is Extract<LowCodePageBlock, { kind: 'grid' }> => block.kind === 'grid',
  );
  const forms = blocks.filter(
    (block): block is Extract<LowCodePageBlock, { kind: 'form' }> => block.kind === 'form',
  );
  const searchForms = blocks.filter(
    (block): block is Extract<LowCodePageBlock, { kind: 'searchForm' }> =>
      block.kind === 'searchForm',
  );
  const owners: FieldTreeOwner[] = [];
  const claimedSourceKeys = new Set<string>();
  const gridSourceKeys = new Set(
    grids.map((block) => readBlockString(block, 'sourceKey')).filter(Boolean),
  );

  grids.filter((block) => block.tableType === 'main')
    .forEach((block) => {
      const sourceKey = readBlockString(block, 'sourceKey');
      if (sourceKey) claimedSourceKeys.add(sourceKey);
      owners.push({
        id: `table:grid:${block.id}`,
        label: readString(block.title, block.id),
        role: '主表',
        sourceKey,
        blockId: block.id,
        tableType: 'main',
        block,
        entryBadges: new Set(['FORM', 'GRID', 'DATA', 'SOURCE']),
        entries: [],
      });
    });

  forms.forEach((block) => {
    const sourceKey = readString(block.sourceKey, readString(block.submitSourceKey));
    if (sourceKey && gridSourceKeys.has(sourceKey)) return;
    if (sourceKey) claimedSourceKeys.add(sourceKey);
    owners.push({
      id: `table:form:${block.id}`,
      label: readString(block.title, block.id),
      role: '主表',
      sourceKey,
      blockId: block.id,
      tableType: 'main',
      block,
      entryBadges: new Set(['FORM', 'DATA', 'SOURCE']),
      entries: [],
    });
  });

  grids.filter((block) => block.tableType !== 'main')
    .forEach((block) => {
      const sourceKey = readBlockString(block, 'sourceKey');
      if (sourceKey) claimedSourceKeys.add(sourceKey);
      const tableType = readGridTableType(block);
      owners.push({
        id: `table:grid:${block.id}`,
        label: readString(block.title, block.id),
        role: ownerRole(tableType, block.kind),
        sourceKey,
        blockId: block.id,
        tableType,
        block,
        entryBadges: new Set(['FORM', 'GRID', 'DATA', 'SOURCE']),
        entries: [],
      });
    });

  searchForms.forEach((block) => {
    const sourceKey = readString(block.targetSourceKey, block.id);
    owners.push({
      id: `table:search:${block.id}`,
      label: readString(block.title, block.id),
      role: '查询表单',
      sourceKey,
      blockId: block.id,
      tableType: 'default',
      block,
      entryBadges: new Set(['SEARCH']),
      entries: [],
    });
  });

  uniqueStrings([
    ...Object.keys(schema?.dataSources ?? {}),
    ...Object.keys(source.data ?? {}),
  ]).filter((sourceKey) => !claimedSourceKeys.has(sourceKey)).forEach((sourceKey) => {
    owners.push({
      id: `table:source:${sourceKey}`,
      label: readString(schema?.dataSources?.[sourceKey]?.label, sourceKey),
      role: '数据源',
      sourceKey,
      blockId: '',
      tableType: 'default',
      entryBadges: new Set(['DATA', 'SOURCE', 'DETAIL']),
      entries: [],
    });
  });

  const unclaimedEntries: LowCodeContextEntry[] = [];
  fields.forEach((entry) => {
    const candidates = owners.filter((owner) => {
      if (entry.blockId && owner.blockId === entry.blockId) return true;
      return Boolean(entry.sourceKey && owner.sourceKey === entry.sourceKey);
    });
    const owner = candidates.find((candidate) => candidate.entryBadges.has(entry.badge ?? ''));
    if (owner) owner.entries.push(entry);
    else unclaimedEntries.push(entry);
  });

  const claimedEntryIds = new Set(
    owners.flatMap((owner) => owner.entries.map((entry) => entry.id)),
  );
  const remainingEntries = unclaimedEntries.filter((entry) => !claimedEntryIds.has(entry.id));

  if (remainingEntries.length) {
    owners.push({
      id: 'table:other-context',
      label: '其他页面字段',
      role: '其他',
      sourceKey: '',
      blockId: '',
      tableType: 'default',
      entryBadges: new Set(),
      entries: remainingEntries,
    });
  }

  return owners.map((owner) => {
    const entriesByField = new Map<string, LowCodeContextEntry[]>();
    owner.entries.forEach((entry) => {
      const field = readString(entry.field);
      if (!field) return;
      entriesByField.set(field, [...(entriesByField.get(field) ?? []), entry]);
    });
    const fieldEntries = [...entriesByField.values()]
      .map((entries) => preferredFieldEntry(owner, entries))
      .filter(Boolean);
    const sourceEntry = owner.entries.find((entry) => entry.badge === 'SOURCE');
    const children = fieldEntries.map((entry) => fieldNode(owner, entry));

    return {
      id: owner.id,
      type: 'table',
      label: owner.label,
      role: owner.role,
      sourceKey: owner.sourceKey,
      blockId: owner.blockId,
      tableType: owner.tableType,
      description: owner.block ? readBlockString(owner.block, 'description') : '',
      icon: owner.role === '主表' ? 'ri-table-2' : 'ri-table-line',
      badge: owner.role,
      entry: children.length ? undefined : sourceEntry,
      children,
    } satisfies LowCodeContextFieldTreeNode;
  }).filter((owner) => owner.children.length || owner.entry);
}

function createApiEntries(source: LowCodeContextSource) {
  const allowedNames = source.apiNames ?? [];
  const capabilities = source.capabilities;
  if (capabilities && !capabilities.includes('api.invoke')) return [];
  return getLowCodeScriptApiDefinitions()
    .filter((api) => allowedNames.includes(api.name))
    .map<LowCodeContextEntry>((api) => ({
      id: `api:${api.name}`,
      category: 'apis',
      group: '已注册 API',
      label: api.name,
      description: api.description || '由宿主注册并进行权限校验的业务 API',
      insertText: api.insertText || `await this.$api.invoke(${jsString(api.name)}, {});`,
      badge: 'API',
      icon: 'ri-shield-keyhole-line',
      keywords: api.signature ? [api.signature] : undefined,
    }));
}

function createFunctionEntries(source: LowCodeContextSource) {
  const capabilities = Array.isArray(source.capabilities)
    ? source.capabilities
    : [];
  const builtInEntries = scriptFunctionDefinitions
    .filter((definition) =>
      !definition.capability ||
      capabilities.includes(definition.capability),
    )
    .map<LowCodeContextEntry>((definition) => ({
      id: `function:${definition.key}`,
      category: 'functions',
      group: definition.group,
      label: definition.label,
      description: definition.description,
      insertText: definition.insertText,
      badge: definition.capability ?? 'readonly',
      icon: 'ri-function-line',
      keywords: [definition.signature],
    }));
  const customPageFunctionEntries = capabilities.includes('pageFunction.execute')
    ? (source.page?.schema.functions ?? [])
        .filter((pageFunction) => pageFunction.enabled !== false)
        .map<LowCodeContextEntry>((pageFunction) => ({
          id: `function:page:${pageFunction.name}`,
          category: 'functions',
          group: '页面函数',
          label: pageFunction.label || pageFunction.name,
          description: pageFunction.description || `调用页面函数 ${pageFunction.name}`,
          insertText: `const result = await this.executeFunction({\n  name: ${jsString(pageFunction.name)},\n  args: {},\n});`,
          badge: 'PAGE',
          icon: 'ri-function-line',
          keywords: [pageFunction.name],
        }))
    : [];
  const customNames = new Set(customPageFunctionEntries.map((entry) =>
    entry.id.replace('function:page:', ''),
  ));
  const builtinPageFunctionEntries = capabilities.includes('pageFunction.execute')
    ? getBuiltinLowCodePageFunctions(
        source.page?.page_type ?? source.page?.schema.pageType,
      )
        .filter((pageFunction) => !customNames.has(pageFunction.name))
        .map<LowCodeContextEntry>((pageFunction) => ({
          id: `function:builtin:${pageFunction.id}`,
          category: 'functions',
          group: '内置页面函数',
          label: pageFunction.label,
          description: pageFunction.description,
          insertText: pageFunction.insertText,
          badge: source.page?.page_type === 'edit' ? 'EDIT' : 'LIST',
          icon: 'ri-function-line',
          keywords: [pageFunction.name, pageFunction.id],
        }))
    : [];
  return [
    ...customPageFunctionEntries,
    ...builtinPageFunctionEntries,
    ...builtInEntries,
  ];
}

function blockNode(block: LowCodePageBlock, path: string): LowCodeContextNode {
  const typeDefinition = getLowCodeNodeTypeDefinition(block.kind);
  return {
    id: path,
    blockId: block.id,
    label: readString(block.title, block.id),
    kind: block.kind,
    kindLabel: typeDefinition?.label ?? block.kind,
    icon: typeDefinition?.icon ?? 'ri-box-3-line',
    description: readString('description' in block ? block.description : undefined, block.id),
    insertText: jsString(block.id),
    methods: getLowCodeNodeActionMethods(block.kind).map((method) => ({
      id: `${path}/method:${method.method}`,
      method: method.method,
      label: method.label,
      description: method.description,
      insertText: method.createInsertText(block.id),
      parameters: method.parameters,
      returns: method.returns,
    })),
    children: childBlocks(block).map((child, index) =>
      blockNode(child, `${path}/${index}:${child.id || child.kind}`),
    ),
  };
}

export function createLowCodeContextCatalog(
  source: LowCodeContextSource = {},
): LowCodeContextCatalog {
  const extraEntries = source.entries ?? [];
  const schema = source.page?.schema;
  const fields = [
    ...createFieldEntries(source),
    ...extraEntries.filter((entry) => entry.category === 'fields'),
  ];
  return {
    fields,
    fieldTree: createFieldTree(source, fields),
    apis: [
      ...createApiEntries(source),
      ...extraEntries.filter((entry) => entry.category === 'apis'),
    ],
    functions: [
      ...createFunctionEntries(source),
      ...extraEntries.filter((entry) => entry.category === 'functions'),
    ],
    nodes: schema
      ? [...schema.blocks, ...(schema.overlays ?? [])].map((block, index) =>
          blockNode(block, `root/${index}:${block.id || block.kind}`),
        )
      : [],
  };
}

export function cloneLowCodeContextSource(
  source: LowCodeContextSource,
): LowCodeContextSource {
  try {
    return JSON.parse(JSON.stringify(source)) as LowCodeContextSource;
  } catch {
    return {};
  }
}
