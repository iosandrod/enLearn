import fs from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { builtinLowCodePages } from '../../packages/lowcode-framework/src/lowcode/builtin-pages/index.ts';
import { migrateLowCodePageSchema } from '../src/lowcode/lowcode.schema.ts';

type JsonRecord = Record<string, any>;

const textFormatter = { type: 'text', emptyText: '-' };
const numberFormatter = { type: 'number', locale: 'zh-CN', emptyText: '0' };
const datetimeFormatter = { type: 'datetime', locale: 'zh-CN', emptyText: '-' };
const statusFormatter = {
  type: 'enum',
  map: {
    active: '启用',
    inactive: '停用',
    draft: '草稿',
    published: '已发布',
    archived: '已归档',
  },
  emptyText: '-',
};
const booleanFormatter = {
  type: 'enum',
  map: { true: '是', false: '否' },
  emptyText: '-',
};

const rolePermissionColumns = [
  { field: 'permission_code', title: '权限编码', minWidth: 220, fixed: 'left', showOverflow: 'tooltip' },
  { field: 'permission_name', title: '权限名称', minWidth: 180, showOverflow: 'tooltip' },
  { field: 'resource_type', title: '资源类型', width: 110, align: 'center', formatter: textFormatter },
  { field: 'resource_key', title: '资源键', minWidth: 180, showOverflow: 'tooltip', formatter: textFormatter },
  { field: 'action_code', title: '动作', width: 120, formatter: textFormatter },
  { field: 'status', title: '状态', width: 100, align: 'center', formatter: statusFormatter },
];

const permissionRoleColumns = [
  { field: 'role_code', title: '角色编码', minWidth: 180, fixed: 'left', showOverflow: 'tooltip' },
  { field: 'role_name', title: '角色名称', minWidth: 180, showOverflow: 'tooltip' },
  { field: 'role_status', title: '角色状态', width: 110, align: 'center', formatter: statusFormatter },
  { field: 'is_system', title: '系统内置', width: 100, align: 'center', formatter: booleanFormatter },
  { field: 'sort_order', title: '排序', width: 90, align: 'center', formatter: numberFormatter },
];

const routeChildColumns = [
  { field: 'title', title: '子菜单名称', minWidth: 220, fixed: 'left', showOverflow: 'tooltip' },
  { field: 'code', title: '编码', minWidth: 180, showOverflow: 'tooltip' },
  { field: 'path', title: '路径', minWidth: 260, showOverflow: 'tooltip' },
  { field: 'route_type', title: '类型', width: 92, align: 'center', formatter: textFormatter },
  { field: 'page_code', title: '页面', minWidth: 190, showOverflow: 'tooltip', formatter: textFormatter },
  { field: 'permission_code', title: '权限码', minWidth: 220, showOverflow: 'tooltip', formatter: textFormatter },
  { field: 'visible', title: '可见', width: 86, align: 'center', formatter: booleanFormatter },
  { field: 'status', title: '状态', width: 92, align: 'center', formatter: statusFormatter },
];

const entityPermissionColumns = [
  { field: 'permission_code', title: '权限编码', minWidth: 220, fixed: 'left', showOverflow: 'tooltip' },
  { field: 'permission_name', title: '权限名称', minWidth: 180, showOverflow: 'tooltip' },
  { field: 'resource_type', title: '资源类型', width: 110, align: 'center', formatter: textFormatter },
  { field: 'resource_key', title: '资源键', minWidth: 180, showOverflow: 'tooltip', formatter: textFormatter },
  { field: 'action_code', title: '动作', width: 120, formatter: textFormatter },
  { field: 'status', title: '状态', width: 100, align: 'center', formatter: statusFormatter },
];

const entityRouteColumns = [
  { field: 'route_code', title: '菜单编码', minWidth: 180, fixed: 'left', showOverflow: 'tooltip' },
  { field: 'route_title', title: '菜单名称', minWidth: 180, showOverflow: 'tooltip' },
  { field: 'route_path', title: '路径', minWidth: 240, showOverflow: 'tooltip' },
  { field: 'route_type', title: '类型', width: 100, align: 'center', formatter: textFormatter },
  { field: 'status', title: '状态', width: 100, align: 'center', formatter: statusFormatter },
];

function readDotEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return {};

  const text = fs.readFileSync(filePath, 'utf8');
  const env: Record<string, string> = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getNestedBlocks(block: JsonRecord) {
  if (Array.isArray(block.blocks)) return block.blocks;
  if (Array.isArray(block.tabs)) return block.tabs.flatMap((tab: JsonRecord) => tab.blocks ?? []);
  return [];
}

function flattenBlocks(blocks: JsonRecord[]): JsonRecord[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(getNestedBlocks(block))]);
}

function findMainGrid(blocks: JsonRecord[]) {
  return flattenBlocks(blocks).find((block) => block.kind === 'grid') ?? null;
}

function hasGrid(schema: JsonRecord) {
  return Boolean(findMainGrid(Array.isArray(schema.blocks) ? schema.blocks : []));
}

function stripDataSourceMutations(dataSources: JsonRecord = {}) {
  return Object.fromEntries(
    Object.entries(dataSources)
      .filter(([, source]) => isRecord(source))
      .map(([key, source]) => {
        const { saveMethod: _saveMethod, deleteMethod: _deleteMethod, ...rest } = source as JsonRecord;
        return [key, rest];
      })
  );
}

function stripActionColumns(columns: JsonRecord[] = []) {
  return columns.filter((column) => {
    const title = String(column.title ?? '').trim();
    return !column.slots?.default && !['操作', 'Actions'].includes(title);
  });
}

function normalizeIdentifier(value: string, fallback: string) {
  const normalized = value
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
  return normalized || fallback;
}

function createGridConfig(columns: JsonRecord[], keyField = 'id', height: number | string = 240) {
  return {
    border: true,
    stripe: true,
    showOverflow: true,
    height,
    rowConfig: { keyField, isCurrent: true },
    columns,
  };
}

function allAction(sourceKey?: string) {
  return {
    code: sourceKey ? `show-all-${sourceKey}` : 'show-all',
    label: '全部',
    status: 'primary',
    icon: 'ri-list-check-2',
    directives: sourceKey
      ? [{ type: 'setSearchFilters', sourceKey, mode: 'replace', values: {} }]
      : [],
  };
}

function refreshAction(sourceKey?: string) {
  return {
    code: sourceKey ? `reload-${sourceKey}` : 'refresh',
    label: '刷新',
    icon: 'ri-refresh-line',
    directives: sourceKey
      ? [{ type: 'refreshDataSource', sourceKeys: [sourceKey] }]
      : [{ type: 'refreshPage' }],
  };
}

function statusActions(sourceKey: string, columns: JsonRecord[]) {
  if (!columns.some((column) => column.field === 'status')) return [];
  return [
    {
      code: `show-active-${sourceKey}`,
      label: '启用',
      directives: [{ type: 'setSearchFilters', sourceKey, mode: 'replace', values: { status: 'active' } }],
    },
    {
      code: `show-inactive-${sourceKey}`,
      label: '停用',
      directives: [{ type: 'setSearchFilters', sourceKey, mode: 'replace', values: { status: 'inactive' } }],
    },
  ];
}

function childTabsFor(pageCode: string, sourceKey: string | undefined, mainColumns: JsonRecord[]) {
  const code = pageCode.toLowerCase();
  const source = String(sourceKey ?? '').toLowerCase();
  const base = normalizeIdentifier(sourceKey ?? pageCode, 'list');

  if (source.includes('role') && !source.includes('permission')) {
    return {
      directives: [
        { type: 'setDataSource', sourceKey: `selected_${base}_rows`, value: ['{{ event.row }}'] },
        { type: 'setDataSource', sourceKey: `selected_${base}_permission_rows`, value: '{{ event.row.permission_rows }}' },
      ],
      tabs: [
        {
          key: 'permissions',
          label: '权限明细',
          sourceKey: `selected_${base}_permission_rows`,
          columns: rolePermissionColumns,
          keyField: 'permission_id',
        },
      ],
    };
  }

  if (source.includes('permission')) {
    return {
      directives: [
        { type: 'setDataSource', sourceKey: `selected_${base}_rows`, value: ['{{ event.row }}'] },
        { type: 'setDataSource', sourceKey: `selected_${base}_role_rows`, value: '{{ event.row.role_rows }}' },
      ],
      tabs: [
        {
          key: 'roles',
          label: '角色引用',
          sourceKey: `selected_${base}_role_rows`,
          columns: permissionRoleColumns,
          keyField: 'role_id',
        },
      ],
    };
  }

  if (source.includes('route') || source.includes('tree') || code.includes('route')) {
    return {
      directives: [
        { type: 'setDataSource', sourceKey: `selected_${base}_rows`, value: ['{{ event.row }}'] },
        { type: 'setDataSource', sourceKey: `selected_${base}_child_rows`, value: '{{ event.row.children }}' },
      ],
      tabs: [
        {
          key: 'children',
          label: '子菜单',
          sourceKey: `selected_${base}_child_rows`,
          columns: routeChildColumns,
          keyField: 'id',
        },
      ],
    };
  }

  if (source.includes('entity') || code.includes('entit')) {
    return {
      directives: [
        { type: 'setDataSource', sourceKey: `selected_${base}_rows`, value: ['{{ event.row }}'] },
        { type: 'setDataSource', sourceKey: `selected_${base}_permission_rows`, value: '{{ event.row.permission_rows }}' },
        { type: 'setDataSource', sourceKey: `selected_${base}_route_rows`, value: '{{ event.row.route_rows }}' },
      ],
      tabs: [
        {
          key: 'permissions',
          label: '权限明细',
          sourceKey: `selected_${base}_permission_rows`,
          columns: entityPermissionColumns,
          keyField: 'permission_id',
        },
        {
          key: 'routes',
          label: '菜单引用',
          sourceKey: `selected_${base}_route_rows`,
          columns: entityRouteColumns,
          keyField: 'route_id',
        },
      ],
    };
  }

  return {
    directives: [{ type: 'setDataSource', sourceKey: `selected_${base}_rows`, value: ['{{ event.row }}'] }],
    tabs: [
      {
        key: 'fields',
        label: '字段明细',
        sourceKey: `selected_${base}_rows`,
        columns: mainColumns.length
          ? mainColumns
          : [
              { field: 'id', title: 'ID', minWidth: 220, fixed: 'left', showOverflow: 'tooltip' },
              { field: 'updated_at', title: '更新时间', width: 180, formatter: datetimeFormatter },
            ],
        keyField: 'id',
      },
    ],
  };
}

function normalizeListPageSchema(page: JsonRecord) {
  const schema = clone(page.schema ?? {});
  const blocks = Array.isArray(schema.blocks) ? schema.blocks : [];
  const mainGrid = findMainGrid(blocks);
  if (!mainGrid) return null;

  const nextGrid = clone(mainGrid);
  const gridSchema = isRecord(nextGrid.schema) ? nextGrid.schema : {};
  const gridConfig = isRecord(gridSchema.grid) ? gridSchema.grid : {};
  const mainColumns = stripActionColumns(Array.isArray(gridConfig.columns) ? gridConfig.columns : []);
  const sourceKey = typeof nextGrid.sourceKey === 'string' ? nextGrid.sourceKey : undefined;
  const childConfig = childTabsFor(String(page.code ?? schema.code ?? ''), sourceKey, mainColumns);

  delete nextGrid.editorBlockId;
  delete nextGrid.editRoute;
  delete nextGrid.deleteSourceKey;
  nextGrid.schema = {
    ...gridSchema,
    grid: {
      ...gridConfig,
      rowConfig: {
        ...(isRecord(gridConfig.rowConfig) ? gridConfig.rowConfig : {}),
        isCurrent: true,
      },
      columns: mainColumns,
    },
    rowActions: { edit: false, delete: false },
    events: {
      ...(isRecord(gridSchema.events) ? gridSchema.events : {}),
      rowCurrentChange: childConfig.directives,
    },
  };
  delete nextGrid.schema.toolbar;

  return migrateLowCodePageSchema({
    ...schema,
    code: schema.code ?? page.code,
    route: schema.route ?? page.route,
    title: schema.title ?? page.title,
    description: schema.description ?? page.description ?? undefined,
    layout: schema.layout ?? page.layout ?? 'dashboard',
    status: 'published',
    keepAlive: schema.keepAlive ?? page.keep_alive ?? true,
    dataSources: stripDataSourceMutations(schema.dataSources ?? {}),
    blocks: [
      {
        id: `${nextGrid.id}-actions`,
        kind: 'buttonGroup',
        align: 'left',
        gap: 8,
        actions: [
          allAction(sourceKey),
          ...statusActions(sourceKey ?? '', mainColumns),
          refreshAction(sourceKey),
        ],
      },
      nextGrid,
      {
        id: `${nextGrid.id}-child-tabs`,
        kind: 'tabs',
        layout: { fillRemaining: true },
        defaultKey: childConfig.tabs[0]?.key,
        tabs: childConfig.tabs.map((tab) => ({
          key: tab.key,
          label: tab.label,
          blocks: [
            {
              id: `${nextGrid.id}-${tab.key}-grid`,
              kind: 'grid',
              layout: { fillRemaining: true },
              sourceKey: tab.sourceKey,
              schema: {
                grid: createGridConfig(tab.columns, tab.keyField, '100%'),
                rowActions: { edit: false, delete: false },
              },
            },
          ],
        })),
      },
    ],
  });
}

async function main() {
  const workspaceRoot = path.resolve(process.cwd(), '..');
  const env = {
    ...readDotEnv(path.join(workspaceRoot, '.env')),
    ...readDotEnv(path.join(workspaceRoot, '.env.local')),
    ...process.env,
  };
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY in .env/.env.local');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const builtinByCode = new Map(builtinLowCodePages.map((page) => [page.code, page]));
  const { data: pages, error } = await supabase
    .from('lowcode_pages')
    .select('*')
    .order('code');

  if (error) throw error;

  const now = new Date().toISOString();
  const updated = [];
  const skipped = [];

  for (const page of pages ?? []) {
    const builtinPage = builtinByCode.get(page.code);
    const nextSchema = builtinPage
      ? builtinPage.schema
      : hasGrid(page.schema)
        ? normalizeListPageSchema(page)
        : null;

    if (!nextSchema) {
      skipped.push(page.code);
      continue;
    }

    const nextVersion = Number(page.version ?? 0) + 1;
    const { data: savedPage, error: updateError } = await supabase
      .from('lowcode_pages')
      .update({
        title: nextSchema.title,
        description: nextSchema.description ?? page.description ?? null,
        layout: nextSchema.layout ?? page.layout ?? 'dashboard',
        status: 'published',
        keep_alive: nextSchema.keepAlive !== false,
        schema: nextSchema,
        version: nextVersion,
        published_at: now,
        updated_at: now,
      })
      .eq('id', page.id)
      .select('id, code, version, schema')
      .single();

    if (updateError) throw updateError;

    const { error: versionError } = await supabase
      .from('lowcode_page_versions')
      .upsert(
        {
          page_id: savedPage.id,
          version: savedPage.version,
          schema: nextSchema,
          published_at: now,
        },
        { onConflict: 'page_id,version' }
      );

    if (versionError) throw versionError;

    updated.push({
      code: savedPage.code,
      version: savedPage.version,
      blocks: savedPage.schema.blocks.map((block: JsonRecord) => `${block.id}:${block.kind}`),
    });
  }

  console.log(JSON.stringify({ updated, skipped }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
