import type {
  LowCodeField,
  LowCodeGridColumn,
  LowCodePageButtonGroupBlock,
  LowCodePageGridBlock,
  LowCodePageRecord,
  LowCodePageSchema,
  LowCodePageTabsBlock,
  LowCodeRuntimeDirective,
} from '../../types/lowcode';
import { createBuiltinLowCodePageRecord } from './user-role-management';

const textFormatter = { type: 'text' as const, emptyText: '-' };
const numberFormatter = { type: 'number' as const, locale: 'zh-CN', emptyText: '0' };
const datetimeFormatter = { type: 'datetime' as const, locale: 'zh-CN', emptyText: '-' };
const statusFormatter = {
  type: 'enum' as const,
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
  type: 'enum' as const,
  map: { true: '是', false: '否' },
  emptyText: '-',
};

const statusOptions = [
  { label: '启用', value: 'active' },
  { label: '停用', value: 'inactive' },
];

const resourceTypeOptions = [
  { label: '页面', value: 'page' },
  { label: '路由', value: 'route' },
  { label: '实体', value: 'entity' },
  { label: '接口', value: 'api' },
  { label: '菜单', value: 'menu' },
  { label: '操作', value: 'action' },
];

const routeTypeOptions = [
  { label: '分组', value: 'group' },
  { label: '页面', value: 'page' },
  { label: '外链', value: 'link' },
];

const layoutOptions = [
  { label: '仪表盘', value: 'dashboard' },
  { label: '默认', value: 'default' },
  { label: '空白', value: 'blank' },
];

function gridConfig(columns: LowCodeGridColumn[], height: number | string = 420) {
  return {
    border: true,
    stripe: true,
    showOverflow: true,
    height,
    rowConfig: {
      keyField: 'id',
      isCurrent: true,
    },
    columns,
  };
}

function resetFormDirective(blockId: string, values: Record<string, unknown>): LowCodeRuntimeDirective {
  return {
    type: 'setFormValues',
    blockId,
    mode: 'replace',
    values,
  };
}

function searchActions() {
  return [
    { code: 'submit', label: '筛选', type: 'submit' as const, status: 'primary' as const },
    { code: 'reset', label: '重置', type: 'reset' as const },
  ];
}

function saveActions(label = '保存') {
  return [
    { code: 'submit', label, type: 'submit' as const, status: 'primary' as const },
    { code: 'reset', label: '重置', type: 'reset' as const },
  ];
}

function required(message: string) {
  return [{ required: true, message }];
}

function disabledInput(field: string, label: string): LowCodeField {
  return {
    field,
    label,
    component: 'vxe-input',
    props: { disabled: true },
  };
}

function createCrudGrid(
  id: string,
  sourceKey: string,
  editorBlockId: string,
  columns: LowCodeGridColumn[],
  emptyValues: Record<string, unknown>,
  title: string
): LowCodePageGridBlock {
  return {
    id,
    kind: 'grid',
    sourceKey,
    editorBlockId,
    schema: {
      title,
      toolbar: [
        {
          code: 'create',
          label: '新建',
          status: 'primary',
          directives: [resetFormDirective(editorBlockId, emptyValues)],
        },
        {
          code: 'refresh',
          label: '刷新',
          directives: [{ type: 'refreshDataSource', sourceKeys: [sourceKey] }],
        },
      ],
      grid: gridConfig([
        ...columns,
        { title: '操作', width: 150, fixed: 'right', slots: { default: 'actions' } },
      ]),
      rowActions: {
        edit: true,
        editLabel: '编辑',
        delete: true,
        deleteLabel: '删除',
      },
    },
  };
}

type ListChildTabConfig = {
  key: string;
  label: string;
  sourceKey: string;
  columns: LowCodeGridColumn[];
  keyField?: string;
};

type ListLayoutConfig = {
  mainGridId: string;
  actions: LowCodePageButtonGroupBlock['actions'];
  rowCurrentChange: LowCodeRuntimeDirective[];
  childTabs: ListChildTabConfig[];
};

function cloneSchemaValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stripDataSourceMutations(schema: LowCodePageSchema) {
  return Object.fromEntries(
    Object.entries(schema.dataSources ?? {}).map(([key, source]) => [
      key,
      {
        ...source,
        saveMethod: undefined,
        deleteMethod: undefined,
      },
    ])
  );
}

function stripActionColumns(columns: LowCodeGridColumn[] = []) {
  return columns.filter(
    (column) =>
      !column.slots?.default &&
      !['操作', 'Actions'].includes(String(column.title ?? '').trim())
  );
}

function findGridBlock(blocks: LowCodePageSchema['blocks'], blockId: string) {
  for (const block of blocks) {
    if (block.kind === 'grid' && block.id === blockId) return block;
    if ('blocks' in block && Array.isArray(block.blocks)) {
      const found = findGridBlock(block.blocks, blockId);
      if (found) return found;
    }
    if (block.kind === 'tabs') {
      for (const tab of block.tabs) {
        const found = findGridBlock(tab.blocks, blockId);
        if (found) return found;
      }
    }
  }

  return null;
}

function createFilterAction(
  sourceKey: string,
  code: string,
  label: string,
  values: Record<string, unknown>,
  status?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
) {
  return {
    code,
    label,
    ...(status ? { status } : {}),
    directives: [
      {
        type: 'setSearchFilters',
        sourceKey,
        mode: 'replace' as const,
        values,
      },
    ],
  };
}

function createRefreshAction(sourceKey: string) {
  return {
    code: 'refresh',
    label: '刷新',
    icon: 'ri-refresh-line',
    directives: [{ type: 'refreshDataSource', sourceKeys: [sourceKey] }],
  };
}

function createListLayoutSchema(
  schema: LowCodePageSchema,
  config: ListLayoutConfig
): LowCodePageSchema {
  const mainGrid = findGridBlock(schema.blocks, config.mainGridId);
  if (!mainGrid) return schema;

  const listGrid = cloneSchemaValue(mainGrid);
  delete listGrid.editorBlockId;
  delete listGrid.editRoute;
  delete listGrid.deleteSourceKey;
  listGrid.schema = {
    ...listGrid.schema,
    grid: {
      ...listGrid.schema.grid,
      columns: stripActionColumns(listGrid.schema.grid.columns),
    },
    rowActions: {
      edit: false,
      delete: false,
    },
    events: {
      ...(listGrid.schema.events ?? {}),
      rowCurrentChange: config.rowCurrentChange,
    },
  };
  delete listGrid.schema.toolbar;

  const actionBlock: LowCodePageButtonGroupBlock = {
    id: `${config.mainGridId}-actions`,
    kind: 'buttonGroup',
    align: 'left',
    gap: 8,
    actions: config.actions,
  };

  const childTabs: LowCodePageTabsBlock = {
    id: `${config.mainGridId}-child-tabs`,
    kind: 'tabs',
    defaultKey: config.childTabs[0]?.key,
    tabs: config.childTabs.map((tab) => ({
      key: tab.key,
      label: tab.label,
      blocks: [
        {
          id: `${config.mainGridId}-${tab.key}-grid`,
          kind: 'grid',
          sourceKey: tab.sourceKey,
          schema: {
            grid: {
              ...gridConfig(tab.columns, 240),
              rowConfig: {
                keyField: tab.keyField ?? 'id',
                isCurrent: true,
              },
            },
            rowActions: {
              edit: false,
              delete: false,
            },
          },
        },
      ],
    })),
  };

  return {
    ...schema,
    dataSources: stripDataSourceMutations(schema),
    blocks: [actionBlock, listGrid, childTabs],
  };
}

const rolePermissionChildColumns: LowCodeGridColumn[] = [
  { field: 'permission_code', title: '权限编码', minWidth: 220, fixed: 'left', showOverflow: 'tooltip' },
  { field: 'permission_name', title: '权限名称', minWidth: 180, showOverflow: 'tooltip' },
  { field: 'resource_type', title: '资源类型', width: 110, align: 'center', formatter: textFormatter },
  { field: 'resource_key', title: '资源键', minWidth: 180, showOverflow: 'tooltip', formatter: textFormatter },
  { field: 'action_code', title: '动作', width: 120, formatter: textFormatter },
  { field: 'status', title: '状态', width: 100, align: 'center', formatter: statusFormatter },
];

const permissionRoleChildColumns: LowCodeGridColumn[] = [
  { field: 'role_code', title: '角色编码', minWidth: 180, fixed: 'left', showOverflow: 'tooltip' },
  { field: 'role_name', title: '角色名称', minWidth: 180, showOverflow: 'tooltip' },
  { field: 'role_status', title: '角色状态', width: 110, align: 'center', formatter: statusFormatter },
  { field: 'is_system', title: '系统内置', width: 100, align: 'center', formatter: booleanFormatter },
  { field: 'sort_order', title: '排序', width: 90, align: 'center', formatter: numberFormatter },
];

const routeChildColumns: LowCodeGridColumn[] = [
  { field: 'title', title: '子菜单名称', minWidth: 220, fixed: 'left', showOverflow: 'tooltip' },
  { field: 'code', title: '编码', minWidth: 180, showOverflow: 'tooltip' },
  { field: 'path', title: '路径', minWidth: 260, showOverflow: 'tooltip' },
  { field: 'route_type', title: '类型', width: 92, align: 'center', formatter: textFormatter },
  { field: 'page_code', title: '页面', minWidth: 190, showOverflow: 'tooltip', formatter: textFormatter },
  { field: 'permission_code', title: '权限码', minWidth: 220, showOverflow: 'tooltip', formatter: textFormatter },
  { field: 'visible', title: '可见', width: 86, align: 'center', formatter: booleanFormatter },
  { field: 'status', title: '状态', width: 92, align: 'center', formatter: statusFormatter },
];

const entityPermissionChildColumns: LowCodeGridColumn[] = [
  { field: 'permission_code', title: '权限编码', minWidth: 220, fixed: 'left', showOverflow: 'tooltip' },
  { field: 'permission_name', title: '权限名称', minWidth: 180, showOverflow: 'tooltip' },
  { field: 'resource_type', title: '资源类型', width: 110, align: 'center', formatter: textFormatter },
  { field: 'resource_key', title: '资源键', minWidth: 180, showOverflow: 'tooltip', formatter: textFormatter },
  { field: 'action_code', title: '动作', width: 120, formatter: textFormatter },
  { field: 'status', title: '状态', width: 100, align: 'center', formatter: statusFormatter },
];

const entityRouteChildColumns: LowCodeGridColumn[] = [
  { field: 'route_code', title: '菜单编码', minWidth: 180, fixed: 'left', showOverflow: 'tooltip' },
  { field: 'route_title', title: '菜单名称', minWidth: 180, showOverflow: 'tooltip' },
  { field: 'route_path', title: '路径', minWidth: 240, showOverflow: 'tooltip' },
  { field: 'route_type', title: '类型', width: 100, align: 'center', formatter: textFormatter },
  { field: 'status', title: '状态', width: 100, align: 'center', formatter: statusFormatter },
];

export const roleManagementSchema: LowCodePageSchema = createListLayoutSchema({
  schemaVersion: 1,
  code: 'admin-system-roles',
  route: '/dashboard/system/roles',
  title: '角色管理',
  description: '维护应用角色，并通过多选权限字段编辑 admin_role_permissions 关系。',
  layout: 'dashboard',
  status: 'published',
  keepAlive: true,
  dataSources: {
    roles: {
      key: 'roles',
      label: '角色',
      serviceName: 'admin',
      serviceMethod: 'listRoles',
      saveMethod: 'saveRole',
      deleteMethod: 'deleteRole',
      autoLoad: true,
    },
    permissions: {
      key: 'permissions',
      label: '权限',
      serviceName: 'admin',
      serviceMethod: 'listPermissions',
      autoLoad: true,
    },
  },
  blocks: [
    {
      id: 'role-search',
      kind: 'searchForm',
      targetSourceKey: 'roles',
      schema: {
        columns: 4,
        fields: [
          { field: 'code', label: '角色编码', component: 'vxe-input', props: { clearable: true } },
          { field: 'name', label: '角色名称', component: 'vxe-input', props: { clearable: true } },
          { field: 'status', label: '状态', component: 'vxe-select', options: statusOptions, props: { clearable: true } },
        ],
        actions: searchActions(),
      },
    },
    createCrudGrid(
      'role-grid',
      'roles',
      'role-form',
      [
        { field: 'code', title: '角色编码', minWidth: 180, fixed: 'left', showOverflow: 'tooltip' },
        { field: 'name', title: '角色名称', minWidth: 160, fixed: 'left', showOverflow: 'tooltip' },
        { field: 'permission_names', title: '已绑定权限', minWidth: 360, showOverflow: 'tooltip', formatter: textFormatter },
        { field: 'permission_count', title: '权限数', width: 100, align: 'center', formatter: numberFormatter },
        { field: 'status', title: '状态', width: 100, align: 'center', formatter: statusFormatter },
        { field: 'is_system', title: '系统内置', width: 100, align: 'center', formatter: booleanFormatter },
        { field: 'sort_order', title: '排序', width: 90, align: 'center', formatter: numberFormatter },
        { field: 'updated_at', title: '更新时间', width: 180, formatter: datetimeFormatter },
      ],
      {
        id: '',
        code: '',
        name: '',
        description: '',
        status: 'active',
        sort_order: 0,
        is_system: false,
        permission_codes: [],
      },
      '角色列表'
    ),
    {
      id: 'role-form',
      kind: 'form',
      title: '角色编辑',
      submitSourceKey: 'roles',
      initialValues: {
        id: '',
        code: '',
        name: '',
        description: '',
        status: 'active',
        sort_order: 0,
        is_system: false,
        permission_codes: [],
      },
      schema: {
        columns: 4,
        fields: [
          disabledInput('id', 'ID'),
          { field: 'code', label: '角色编码', component: 'vxe-input', rules: required('请输入角色编码') },
          { field: 'name', label: '角色名称', component: 'vxe-input', rules: required('请输入角色名称') },
          { field: 'status', label: '状态', component: 'vxe-select', options: statusOptions, props: { clearable: true } },
          { field: 'sort_order', label: '排序', component: 'lc-number-input' },
          { field: 'is_system', label: '系统内置', component: 'vxe-switch' },
          { field: 'description', label: '描述', component: 'vxe-textarea', props: { rows: 3, resize: 'vertical' }, span: 2 },
          {
            field: 'permission_codes',
            label: '绑定权限',
            component: 'vxe-select',
            optionsSourceKey: 'permissions',
            optionProps: { label: 'name', value: 'code' },
            props: { multiple: true, filterable: true, clearable: true },
            span: 2,
          },
        ],
        actions: saveActions('保存角色'),
      },
    },
  ],
}, {
  mainGridId: 'role-grid',
  actions: [
    createFilterAction('roles', 'show-all-roles', '全部角色', {}, 'primary'),
    createFilterAction('roles', 'show-system-roles', '系统角色', { is_system: true }),
    createFilterAction('roles', 'show-business-roles', '业务角色', { is_system: false }),
    createRefreshAction('roles'),
  ],
  rowCurrentChange: [
    { type: 'setDataSource', sourceKey: 'selectedRoleRows', value: ['{{ event.row }}'] },
    { type: 'setDataSource', sourceKey: 'selectedRolePermissionRows', value: '{{ event.row.permission_rows }}' },
  ],
  childTabs: [
    {
      key: 'permissions',
      label: '权限明细',
      sourceKey: 'selectedRolePermissionRows',
      columns: rolePermissionChildColumns,
      keyField: 'permission_id',
    },
  ],
});

export const permissionManagementSchema: LowCodePageSchema = createListLayoutSchema({
  schemaVersion: 1,
  code: 'admin-system-permissions',
  route: '/dashboard/system/permissions',
  title: '权限管理',
  description: '维护权限编码，并绑定到页面、路由、实体或接口资源。',
  layout: 'dashboard',
  status: 'published',
  keepAlive: true,
  dataSources: {
    permissions: {
      key: 'permissions',
      label: '权限',
      serviceName: 'admin',
      serviceMethod: 'listPermissions',
      saveMethod: 'savePermission',
      deleteMethod: 'deletePermission',
      autoLoad: true,
    },
    pages: {
      key: 'pages',
      label: '低代码页面',
      serviceName: 'lowcode',
      serviceMethod: 'listPages',
      autoLoad: true,
    },
    entities: {
      key: 'entities',
      label: '实体',
      serviceName: 'admin',
      serviceMethod: 'listEntities',
      autoLoad: true,
    },
  },
  blocks: [
    {
      id: 'permission-search',
      kind: 'searchForm',
      targetSourceKey: 'permissions',
      schema: {
        columns: 4,
        fields: [
          { field: 'code', label: '权限编码', component: 'vxe-input', props: { clearable: true } },
          { field: 'name', label: '权限名称', component: 'vxe-input', props: { clearable: true } },
          { field: 'resource_type', label: '资源类型', component: 'vxe-select', options: resourceTypeOptions, props: { clearable: true } },
          { field: 'status', label: '状态', component: 'vxe-select', options: statusOptions, props: { clearable: true } },
        ],
        actions: searchActions(),
      },
    },
    createCrudGrid(
      'permission-grid',
      'permissions',
      'permission-form',
      [
        { field: 'code', title: '权限编码', minWidth: 220, fixed: 'left', showOverflow: 'tooltip' },
        { field: 'name', title: '权限名称', minWidth: 180, fixed: 'left', showOverflow: 'tooltip' },
        { field: 'resource_type', title: '资源类型', width: 110, align: 'center', formatter: textFormatter },
        { field: 'resource_key', title: '资源键', minWidth: 180, showOverflow: 'tooltip', formatter: textFormatter },
        { field: 'action_code', title: '动作', width: 120, formatter: textFormatter },
        { field: 'route_path', title: '路由', minWidth: 220, showOverflow: 'tooltip', formatter: textFormatter },
        { field: 'page_code', title: '页面', minWidth: 180, showOverflow: 'tooltip', formatter: textFormatter },
        { field: 'entity_code', title: '实体', minWidth: 160, showOverflow: 'tooltip', formatter: textFormatter },
        { field: 'status', title: '状态', width: 100, align: 'center', formatter: statusFormatter },
        { field: 'sort_order', title: '排序', width: 90, align: 'center', formatter: numberFormatter },
      ],
      {
        id: '',
        code: '',
        name: '',
        description: '',
        resource_type: 'page',
        resource_key: '',
        action_code: 'manage',
        route_path: '',
        page_code: '',
        entity_code: '',
        status: 'active',
        sort_order: 0,
      },
      '权限列表'
    ),
    {
      id: 'permission-form',
      kind: 'form',
      title: '权限编辑',
      submitSourceKey: 'permissions',
      initialValues: {
        id: '',
        code: '',
        name: '',
        description: '',
        resource_type: 'page',
        resource_key: '',
        action_code: 'manage',
        route_path: '',
        page_code: '',
        entity_code: '',
        status: 'active',
        sort_order: 0,
      },
      schema: {
        columns: 4,
        fields: [
          disabledInput('id', 'ID'),
          { field: 'code', label: '权限编码', component: 'vxe-input', rules: required('请输入权限编码') },
          { field: 'name', label: '权限名称', component: 'vxe-input', rules: required('请输入权限名称') },
          { field: 'resource_type', label: '资源类型', component: 'vxe-select', options: resourceTypeOptions },
          { field: 'resource_key', label: '资源键', component: 'vxe-input' },
          { field: 'action_code', label: '动作编码', component: 'vxe-input' },
          { field: 'route_path', label: '路由路径', component: 'vxe-input' },
          {
            field: 'page_code',
            label: '低代码页面',
            component: 'vxe-select',
            optionsSourceKey: 'pages',
            optionProps: { label: 'title', value: 'code' },
            props: { filterable: true, clearable: true },
          },
          {
            field: 'entity_code',
            label: '实体',
            component: 'vxe-select',
            optionsSourceKey: 'entities',
            optionProps: { label: 'title', value: 'code' },
            props: { filterable: true, clearable: true },
          },
          { field: 'status', label: '状态', component: 'vxe-select', options: statusOptions },
          { field: 'sort_order', label: '排序', component: 'lc-number-input' },
          { field: 'description', label: '描述', component: 'vxe-textarea', props: { rows: 3, resize: 'vertical' }, span: 2 },
        ],
        actions: saveActions('保存权限'),
      },
    },
  ],
}, {
  mainGridId: 'permission-grid',
  actions: [
    createFilterAction('permissions', 'show-all-permissions', '全部权限', {}, 'primary'),
    createFilterAction('permissions', 'show-page-permissions', '页面资源', { resource_type: 'page' }),
    createFilterAction('permissions', 'show-route-permissions', '路由资源', { resource_type: 'route' }),
    createFilterAction('permissions', 'show-entity-permissions', '实体资源', { resource_type: 'entity' }),
    createRefreshAction('permissions'),
  ],
  rowCurrentChange: [
    { type: 'setDataSource', sourceKey: 'selectedPermissionRows', value: ['{{ event.row }}'] },
    { type: 'setDataSource', sourceKey: 'selectedPermissionRoleRows', value: '{{ event.row.role_rows }}' },
  ],
  childTabs: [
    {
      key: 'roles',
      label: '角色引用',
      sourceKey: 'selectedPermissionRoleRows',
      columns: permissionRoleChildColumns,
      keyField: 'role_id',
    },
  ],
});

const routeEditorInitialValues = {
  id: '',
  code: '',
  title: '',
  path: '',
  parent_id: '',
  route_type: 'page',
  icon: '',
  page_code: '',
  permission_code: '',
  visible: true,
  keep_alive: true,
  layout: 'dashboard',
  status: 'active',
  sort_order: 0,
  metadata_json: {},
};

export const routeManagementSchema: LowCodePageSchema = createListLayoutSchema({
  schemaVersion: 1,
  code: 'admin-system-routes',
  route: '/dashboard/system/routes',
  title: '动态路由',
  description: '维护数据库中的菜单树、页面路由、可见状态与权限码绑定关系。',
  layout: 'dashboard',
  status: 'published',
  keepAlive: true,
  dataSources: {
    routeTree: {
      key: 'routeTree',
      label: '菜单树',
      serviceName: 'admin',
      serviceMethod: 'listRouteManageTree',
      autoLoad: true,
    },
    permissions: {
      key: 'permissions',
      label: '权限',
      serviceName: 'admin',
      serviceMethod: 'listPermissions',
      autoLoad: true,
    },
    pages: {
      key: 'pages',
      label: '低代码页面',
      serviceName: 'lowcode',
      serviceMethod: 'listPages',
      autoLoad: true,
    },
  },
  blocks: [
    {
      id: 'route-actions',
      kind: 'buttonGroup',
      title: '菜单操作',
      align: 'left',
      gap: 8,
      actions: [
        {
          code: 'create-root',
          label: '新增菜单',
          status: 'primary',
          icon: 'ri-add-line',
          eventName: 'routeTree.createRoot',
          directives: [
            {
              type: 'setFormValues',
              blockId: 'route-form',
              mode: 'replace',
              values: routeEditorInitialValues,
            },
            { type: 'openBlock', blockId: 'route-editor-modal' },
          ],
        },
        {
          code: 'refresh',
          label: '刷新',
          icon: 'ri-refresh-line',
          eventName: 'routeTree.refresh',
          directives: [{ type: 'refreshDataSource', sourceKeys: ['routeTree'] }],
        },
      ],
    },
    {
      id: 'route-tree-grid',
      kind: 'grid',
      title: '菜单路由树',
      sourceKey: 'routeTree',
      schema: {
        title: '菜单路由树',
        grid: {
          border: true,
          stripe: true,
          showOverflow: true,
          height: 520,
          rowConfig: { keyField: 'id', isCurrent: true },
          treeConfig: {
            transform: false,
            rowField: 'id',
            parentField: 'parent_id',
            childrenField: 'children',
            expandAll: true,
          },
          columns: [
            { type: 'seq', title: '序号', width: 64, align: 'center' },
            { field: 'title', title: '菜单名称', minWidth: 220, fixed: 'left', treeNode: true, showOverflow: 'tooltip' },
            { field: 'code', title: '编码', minWidth: 180, showOverflow: 'tooltip' },
            { field: 'path', title: '路径', minWidth: 260, showOverflow: 'tooltip' },
            { field: 'route_type', title: '类型', width: 92, align: 'center', formatter: textFormatter },
            { field: 'page_code', title: '页面', minWidth: 190, showOverflow: 'tooltip', formatter: textFormatter },
            { field: 'permission_code', title: '权限码', minWidth: 220, showOverflow: 'tooltip', formatter: textFormatter },
            { field: 'visible', title: '可见', width: 86, align: 'center', formatter: booleanFormatter },
            { field: 'status', title: '状态', width: 92, align: 'center', formatter: statusFormatter },
            { field: 'sort_order', title: '排序', width: 82, align: 'center', formatter: numberFormatter },
            { title: '操作', width: 260, fixed: 'right', slots: { default: 'actions' } },
          ],
        },
        rowActions: {
          edit: false,
          delete: false,
          actions: [
            {
              code: 'edit',
              label: '修改',
              status: 'primary',
              eventName: 'routeTree.edit',
              directives: [
                {
                  type: 'setFormValues',
                  blockId: 'route-form',
                  mode: 'replace',
                  value: '{{ row }}',
                },
                { type: 'openBlock', blockId: 'route-editor-modal' },
              ],
            },
            {
              code: 'create-child',
              label: '新增子菜单',
              eventName: 'routeTree.createChild',
              directives: [
                {
                  type: 'setFormValues',
                  blockId: 'route-form',
                  mode: 'replace',
                  values: {
                    ...routeEditorInitialValues,
                    parent_id: '{{ row.id }}',
                    layout: '{{ row.layout }}',
                    metadata_json: '{{ row.metadata_json }}',
                  },
                },
                { type: 'openBlock', blockId: 'route-editor-modal' },
              ],
            },
            {
              code: 'hide',
              label: '隐藏',
              status: 'warning',
              eventName: 'routeTree.hide',
              directives: [
                {
                  type: 'invokeService',
                  serviceName: 'admin',
                  serviceMethod: 'hideRoute',
                  postData: '{{ row }}',
                },
                { type: 'refreshDataSource', sourceKeys: ['routeTree'] },
                { type: 'dispatchWindowEvent', event: 'enlearn:admin-routes-updated' },
                { type: 'showMessage', message: '菜单已隐藏。' },
              ],
            },
          ],
        },
      },
    },
    {
      id: 'route-editor-modal',
      kind: 'modal',
      title: '菜单编辑',
      description: '新增、修改或隐藏后的菜单会立即写入 admin_routes 表。',
      open: false,
      width: 900,
      blocks: [
        {
          id: 'route-form',
          kind: 'form',
          title: '菜单信息',
          initialValues: routeEditorInitialValues,
          schema: {
            columns: 2,
            fields: [
              disabledInput('id', 'ID'),
              { field: 'code', label: '菜单编码', component: 'vxe-input', props: { clearable: true, placeholder: 'system-users' }, rules: required('请输入菜单编码') },
              { field: 'title', label: '菜单名称', component: 'vxe-input', props: { clearable: true, placeholder: '用户角色' }, rules: required('请输入菜单名称') },
              { field: 'path', label: '路径', component: 'vxe-input', props: { clearable: true, placeholder: '/dashboard/system/users' }, rules: required('请输入路径') },
              {
                field: 'parent_id',
                label: '父级菜单',
                component: 'vxe-tree-select',
                optionsSourceKey: 'routeTree',
                optionProps: { label: 'title', value: 'id', children: 'children' },
                props: { clearable: true, filterable: true, placeholder: '不选则为顶级菜单' },
              },
              { field: 'route_type', label: '菜单类型', component: 'vxe-radio-group', options: routeTypeOptions, props: { type: 'button' } },
              { field: 'icon', label: '图标', component: 'vxe-input', props: { clearable: true, placeholder: 'ri-route-line' } },
              {
                field: 'page_code',
                label: '低代码页面',
                component: 'vxe-select',
                optionsSourceKey: 'pages',
                optionProps: { label: 'title', value: 'code' },
                props: { clearable: true, filterable: true, placeholder: '绑定低代码页面' },
              },
              {
                field: 'permission_code',
                label: '权限码',
                component: 'vxe-select',
                optionsSourceKey: 'permissions',
                optionProps: { label: 'name', value: 'code' },
                props: { clearable: true, filterable: true, placeholder: '绑定访问权限' },
              },
              { field: 'visible', label: '菜单可见', component: 'vxe-switch' },
              { field: 'keep_alive', label: '缓存页面', component: 'vxe-switch' },
              { field: 'layout', label: '布局', component: 'vxe-select', options: layoutOptions },
              { field: 'status', label: '状态', component: 'vxe-select', options: statusOptions },
              { field: 'sort_order', label: '排序', component: 'lc-number-input' },
              { field: 'metadata_json', label: '元数据 JSON', component: 'lc-json-editor', props: { rows: 6, resize: 'vertical' }, span: 2 },
            ],
            actions: [
              {
                code: 'submit',
                label: '保存菜单',
                type: 'submit',
                status: 'primary',
                eventName: 'routeEditor.submit',
                directives: [
                  {
                    type: 'invokeService',
                    serviceName: 'admin',
                    serviceMethod: 'saveRoute',
                    postData: '{{ values }}',
                  },
                  { type: 'refreshDataSource', sourceKeys: ['routeTree'] },
                  { type: 'dispatchWindowEvent', event: 'enlearn:admin-routes-updated' },
                  { type: 'closeBlock', blockId: 'route-editor-modal' },
                  { type: 'showMessage', message: '菜单已保存。' },
                ],
              },
              {
                code: 'reset',
                label: '重置',
                type: 'reset',
              },
              {
                code: 'cancel',
                label: '取消',
                type: 'button',
                eventName: 'routeEditor.cancel',
                directives: [{ type: 'closeBlock', blockId: 'route-editor-modal' }],
              },
            ],
          },
        },
      ],
    },
  ],
}, {
  mainGridId: 'route-tree-grid',
  actions: [
    createFilterAction('routeTree', 'show-all-routes', '全部菜单', {}, 'primary'),
    createFilterAction('routeTree', 'show-groups', '分组菜单', { route_type: 'group' }),
    createFilterAction('routeTree', 'show-pages', '页面菜单', { route_type: 'page' }),
    createRefreshAction('routeTree'),
  ],
  rowCurrentChange: [
    { type: 'setDataSource', sourceKey: 'selectedRouteRows', value: ['{{ event.row }}'] },
    { type: 'setDataSource', sourceKey: 'selectedRouteChildRows', value: '{{ event.row.children }}' },
  ],
  childTabs: [
    {
      key: 'children',
      label: '子菜单',
      sourceKey: 'selectedRouteChildRows',
      columns: routeChildColumns,
      keyField: 'id',
    },
  ],
});

export const entityManagementSchema: LowCodePageSchema = {
  schemaVersion: 1,
  code: 'admin-system-entities',
  route: '/dashboard/system/entities',
  title: '实体管理',
  description: '维护可配置实体元数据，并把实体绑定到低代码页面。',
  layout: 'dashboard',
  status: 'published',
  keepAlive: true,
  dataSources: {
    entities: {
      key: 'entities',
      label: '实体',
      serviceName: 'admin',
      serviceMethod: 'listEntities',
      saveMethod: 'saveEntity',
      deleteMethod: 'deleteEntity',
      autoLoad: true,
    },
    pages: {
      key: 'pages',
      label: '低代码页面',
      serviceName: 'lowcode',
      serviceMethod: 'listPages',
      autoLoad: true,
    },
  },
  blocks: [
    {
      id: 'entity-search',
      kind: 'searchForm',
      targetSourceKey: 'entities',
      schema: {
        columns: 4,
        fields: [
          { field: 'code', label: '实体编码', component: 'vxe-input', props: { clearable: true } },
          { field: 'title', label: '标题', component: 'vxe-input', props: { clearable: true } },
          { field: 'table_name', label: '表/函数', component: 'vxe-input', props: { clearable: true } },
          { field: 'status', label: '状态', component: 'vxe-select', options: statusOptions, props: { clearable: true } },
        ],
        actions: searchActions(),
      },
    },
    createCrudGrid(
      'entity-grid',
      'entities',
      'entity-form',
      [
        { field: 'code', title: '实体编码', minWidth: 180, fixed: 'left', showOverflow: 'tooltip' },
        { field: 'title', title: '标题', minWidth: 180, fixed: 'left', showOverflow: 'tooltip' },
        { field: 'table_name', title: '表/函数', minWidth: 260, showOverflow: 'tooltip' },
        { field: 'route_path', title: '页面路径', minWidth: 220, showOverflow: 'tooltip' },
        { field: 'page_code', title: '低代码页面', minWidth: 190, showOverflow: 'tooltip', formatter: textFormatter },
        { field: 'primary_key', title: '主键', width: 120, formatter: textFormatter },
        { field: 'status', title: '状态', width: 100, align: 'center', formatter: statusFormatter },
        { field: 'sort_order', title: '排序', width: 90, align: 'center', formatter: numberFormatter },
      ],
      {
        id: '',
        code: '',
        title: '',
        table_name: '',
        route_path: '',
        page_code: '',
        icon: '',
        description: '',
        primary_key: 'id',
        status: 'active',
        sort_order: 0,
        schema_json: {},
      },
      '实体列表'
    ),
    {
      id: 'entity-form',
      kind: 'form',
      title: '实体编辑',
      submitSourceKey: 'entities',
      initialValues: {
        id: '',
        code: '',
        title: '',
        table_name: '',
        route_path: '',
        page_code: '',
        icon: '',
        description: '',
        primary_key: 'id',
        status: 'active',
        sort_order: 0,
        schema_json: {},
      },
      schema: {
        columns: 4,
        fields: [
          disabledInput('id', 'ID'),
          { field: 'code', label: '实体编码', component: 'vxe-input', rules: required('请输入实体编码') },
          { field: 'title', label: '标题', component: 'vxe-input', rules: required('请输入标题') },
          { field: 'table_name', label: '表/函数', component: 'vxe-input', rules: required('请输入表或函数名') },
          { field: 'route_path', label: '页面路径', component: 'vxe-input', rules: required('请输入页面路径') },
          {
            field: 'page_code',
            label: '低代码页面',
            component: 'vxe-select',
            optionsSourceKey: 'pages',
            optionProps: { label: 'title', value: 'code' },
            props: { filterable: true, clearable: true },
          },
          { field: 'icon', label: '图标', component: 'vxe-input' },
          { field: 'primary_key', label: '主键', component: 'vxe-input' },
          { field: 'status', label: '状态', component: 'vxe-select', options: statusOptions },
          { field: 'sort_order', label: '排序', component: 'lc-number-input' },
          { field: 'description', label: '描述', component: 'vxe-textarea', props: { rows: 3, resize: 'vertical' }, span: 2 },
          { field: 'schema_json', label: '实体 Schema JSON', component: 'lc-json-editor', props: { rows: 8 }, span: 2 },
        ],
        actions: saveActions('保存实体'),
      },
    },
  ],
};

export const permissionSystemPages: LowCodePageRecord[] = [
  roleManagementSchema,
  permissionManagementSchema,
  routeManagementSchema,
  entityManagementSchema,
].map(createBuiltinLowCodePageRecord);
