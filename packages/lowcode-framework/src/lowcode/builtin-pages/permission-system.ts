import type {
  LowCodeField,
  LowCodeGridColumn,
  LowCodePageGridBlock,
  LowCodePageRecord,
  LowCodePageSchema,
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

export const roleManagementSchema: LowCodePageSchema = {
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
};

export const permissionManagementSchema: LowCodePageSchema = {
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
};

export const routeManagementSchema: LowCodePageSchema = {
  schemaVersion: 1,
  code: 'admin-system-routes',
  route: '/dashboard/system/routes',
  title: '动态路由',
  description: '维护菜单树、页面路由与权限码之间的绑定关系。',
  layout: 'dashboard',
  status: 'published',
  keepAlive: true,
  dataSources: {
    routes: {
      key: 'routes',
      label: '路由',
      serviceName: 'admin',
      serviceMethod: 'listRoutes',
      saveMethod: 'saveRoute',
      deleteMethod: 'deleteRoute',
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
      id: 'route-search',
      kind: 'searchForm',
      targetSourceKey: 'routes',
      schema: {
        columns: 4,
        fields: [
          { field: 'code', label: '路由编码', component: 'vxe-input', props: { clearable: true } },
          { field: 'title', label: '标题', component: 'vxe-input', props: { clearable: true } },
          { field: 'path', label: '路径', component: 'vxe-input', props: { clearable: true } },
          { field: 'permission_code', label: '权限码', component: 'vxe-input', props: { clearable: true } },
        ],
        actions: searchActions(),
      },
    },
    createCrudGrid(
      'route-grid',
      'routes',
      'route-form',
      [
        { field: 'code', title: '路由编码', minWidth: 180, fixed: 'left', showOverflow: 'tooltip' },
        { field: 'title', title: '标题', minWidth: 160, fixed: 'left', showOverflow: 'tooltip' },
        { field: 'path', title: '路径', minWidth: 240, showOverflow: 'tooltip' },
        { field: 'route_type', title: '类型', width: 100, align: 'center', formatter: textFormatter },
        { field: 'page_code', title: '页面', minWidth: 190, showOverflow: 'tooltip', formatter: textFormatter },
        { field: 'permission_code', title: '权限码', minWidth: 220, showOverflow: 'tooltip', formatter: textFormatter },
        { field: 'visible', title: '可见', width: 90, align: 'center', formatter: booleanFormatter },
        { field: 'status', title: '状态', width: 100, align: 'center', formatter: statusFormatter },
        { field: 'sort_order', title: '排序', width: 90, align: 'center', formatter: numberFormatter },
      ],
      {
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
      },
      '路由列表'
    ),
    {
      id: 'route-form',
      kind: 'form',
      title: '路由编辑',
      submitSourceKey: 'routes',
      initialValues: {
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
      },
      schema: {
        columns: 4,
        fields: [
          disabledInput('id', 'ID'),
          { field: 'code', label: '路由编码', component: 'vxe-input', rules: required('请输入路由编码') },
          { field: 'title', label: '标题', component: 'vxe-input', rules: required('请输入标题') },
          { field: 'path', label: '路径', component: 'vxe-input', rules: required('请输入路径') },
          {
            field: 'parent_id',
            label: '父级路由',
            component: 'vxe-select',
            optionsSourceKey: 'routes',
            optionProps: { label: 'title', value: 'id' },
            props: { filterable: true, clearable: true },
          },
          { field: 'route_type', label: '路由类型', component: 'vxe-select', options: routeTypeOptions },
          { field: 'icon', label: '图标', component: 'vxe-input' },
          {
            field: 'page_code',
            label: '低代码页面',
            component: 'vxe-select',
            optionsSourceKey: 'pages',
            optionProps: { label: 'title', value: 'code' },
            props: { filterable: true, clearable: true },
          },
          {
            field: 'permission_code',
            label: '权限码',
            component: 'vxe-select',
            optionsSourceKey: 'permissions',
            optionProps: { label: 'name', value: 'code' },
            props: { filterable: true, clearable: true },
          },
          { field: 'visible', label: '菜单可见', component: 'vxe-switch' },
          { field: 'keep_alive', label: '缓存页面', component: 'vxe-switch' },
          { field: 'layout', label: '布局', component: 'vxe-select', options: layoutOptions },
          { field: 'status', label: '状态', component: 'vxe-select', options: statusOptions },
          { field: 'sort_order', label: '排序', component: 'lc-number-input' },
          { field: 'metadata_json', label: '元数据 JSON', component: 'lc-json-editor', props: { rows: 6 }, span: 2 },
        ],
        actions: saveActions('保存路由'),
      },
    },
  ],
};

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
