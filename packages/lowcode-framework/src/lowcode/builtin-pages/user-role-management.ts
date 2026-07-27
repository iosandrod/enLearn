import type {
  LowCodeGridColumn,
  LowCodePageRecord,
  LowCodePageSchema,
} from '../../types/lowcode';

const legacyProfileRoleFormatter = {
  type: 'enum' as const,
  map: {
    student: '学生',
    parent: '家长',
    teacher: '教师',
    consultant: '顾问',
    admin: '旧管理员',
  },
  emptyText: '-',
};

const leadStatusFormatter = {
  type: 'enum' as const,
  map: {
    new: '新线索',
    contacted: '已联系',
    trial_booked: '已预约试听',
    trial_done: '已试听',
    converted: '已转化',
    lost: '已流失',
  },
  emptyText: '-',
};

const ownershipFormatter = {
  type: 'enum' as const,
  map: {
    true: '是',
    false: '否',
  },
  emptyText: '否',
};

const textFormatter = {
  type: 'text' as const,
  emptyText: '-',
};

const numberFormatter = {
  type: 'number' as const,
  locale: 'zh-CN',
  emptyText: '0',
};

const datetimeFormatter = {
  type: 'datetime' as const,
  locale: 'zh-CN',
  emptyText: '-',
};

const userMainColumns: LowCodeGridColumn[] = [
  { type: 'seq', title: '序号', width: 64, align: 'center' },
  { field: 'user_id', title: '用户ID', minWidth: 260, fixed: 'left', showOverflow: 'tooltip' },
  { field: 'email', title: '邮箱', minWidth: 220, showOverflow: 'tooltip' },
  { field: 'full_name', title: '姓名', minWidth: 140, fixed: 'left', sortable: true },
  { field: 'nickname', title: '昵称', minWidth: 120, showOverflow: 'tooltip' },
  { field: 'phone', title: '手机号', width: 140, showOverflow: 'tooltip' },
  {
    field: 'app_role_names',
    title: '应用角色',
    minWidth: 220,
    showOverflow: 'tooltip',
    formatter: textFormatter,
  },
  {
    field: 'permission_count',
    title: '权限数',
    width: 100,
    align: 'center',
    formatter: numberFormatter,
  },
  {
    field: 'account_names',
    title: 'Basejump 账号',
    minWidth: 220,
    showOverflow: 'tooltip',
    formatter: textFormatter,
  },
  {
    field: 'account_roles',
    title: '账号身份',
    minWidth: 140,
    showOverflow: 'tooltip',
    formatter: textFormatter,
  },
  {
    field: 'lead_status',
    title: '线索状态',
    width: 120,
    align: 'center',
    formatter: leadStatusFormatter,
  },
  { field: 'city', title: '城市', width: 120, showOverflow: 'tooltip' },
  {
    field: 'updated_at',
    title: '更新时间',
    width: 180,
    formatter: datetimeFormatter,
  },
];

const userPermissionColumns: LowCodeGridColumn[] = [
  { field: 'user_id', title: '用户ID', minWidth: 260, fixed: 'left', showOverflow: 'tooltip' },
  { field: 'email', title: '邮箱', minWidth: 220, showOverflow: 'tooltip' },
  { field: 'full_name', title: '姓名', minWidth: 140, fixed: 'left' },
  {
    field: 'app_role_codes',
    title: '应用角色编码',
    minWidth: 260,
    showOverflow: 'tooltip',
    formatter: textFormatter,
  },
  {
    field: 'app_role_names',
    title: '应用角色名称',
    minWidth: 240,
    showOverflow: 'tooltip',
    formatter: textFormatter,
  },
  {
    field: 'permission_codes',
    title: '权限编码',
    minWidth: 320,
    showOverflow: 'tooltip',
    formatter: textFormatter,
  },
  {
    field: 'permission_names',
    title: '权限名称',
    minWidth: 320,
    showOverflow: 'tooltip',
    formatter: textFormatter,
  },
  {
    field: 'account_ids',
    title: '账号ID',
    minWidth: 260,
    showOverflow: 'tooltip',
    formatter: textFormatter,
  },
  {
    field: 'account_names',
    title: '账号名称',
    minWidth: 220,
    showOverflow: 'tooltip',
    formatter: textFormatter,
  },
  {
    field: 'account_roles',
    title: '账号身份',
    minWidth: 140,
    showOverflow: 'tooltip',
    formatter: textFormatter,
  },
  {
    field: 'personal_account_name',
    title: '个人账号',
    minWidth: 180,
    showOverflow: 'tooltip',
    formatter: textFormatter,
  },
  {
    field: 'is_primary_account_owner',
    title: '主账号所有者',
    width: 120,
    align: 'center',
    formatter: ownershipFormatter,
  },
  {
    field: 'legacy_profile_role',
    title: '旧档案角色',
    width: 120,
    align: 'center',
    formatter: legacyProfileRoleFormatter,
  },
  {
    field: 'assigned_consultant_id',
    title: '归属顾问ID',
    minWidth: 260,
    showOverflow: 'tooltip',
  },
  {
    field: 'updated_at',
    title: '更新时间',
    width: 180,
    formatter: datetimeFormatter,
  },
];

function createUserGridConfig(columns: LowCodeGridColumn[], height: number | string) {
  return {
    border: true,
    stripe: true,
    showOverflow: true,
    height,
    rowConfig: {
      keyField: 'user_id',
      isCurrent: true,
    },
    columns,
  };
}

export const userRoleManagementSchema: LowCodePageSchema = {
  schemaVersion: 1,
  code: 'admin-system-users',
  route: '/dashboard/system/users',
  title: '用户权限档案',
  description: '用户表字段来自应用角色、权限与 Basejump 账号成员关系。',
  layout: 'dashboard',
  status: 'published',
  keepAlive: true,
  dataSources: {
    users: {
      key: 'users',
      label: '用户权限档案',
      serviceName: 'admin',
      serviceMethod: 'listUsers',
      autoLoad: true,
    },
  },
  blocks: [
    {
      id: 'user-role-actions',
      kind: 'buttonGroup',
      align: 'left',
      gap: 8,
      actions: [
        {
          code: 'show-all-users',
          label: '全部用户',
          status: 'primary',
          icon: 'ri-list-check-2',
          eventName: 'userRole.actions.showAllUsers',
          directives: [
            {
              type: 'setSearchFilters',
              sourceKey: 'users',
              mode: 'replace',
              values: {},
            },
          ],
        },
        {
          code: 'show-system-admins',
          label: '系统管理员',
          icon: 'ri-shield-star-line',
          eventName: 'userRole.actions.showSystemAdmins',
          directives: [
            {
              type: 'setSearchFilters',
              sourceKey: 'users',
              mode: 'replace',
              values: {
                app_role_codes: 'system_admin',
              },
            },
          ],
        },
        {
          code: 'show-user-managers',
          label: '用户权限',
          icon: 'ri-key-2-line',
          eventName: 'userRole.actions.showUserManagers',
          directives: [
            {
              type: 'setSearchFilters',
              sourceKey: 'users',
              mode: 'replace',
              values: {
                permission_codes: 'admin.users.manage',
              },
            },
          ],
        },
        {
          code: 'show-account-owners',
          label: '账号所有者',
          icon: 'ri-user-star-line',
          eventName: 'userRole.actions.showAccountOwners',
          directives: [
            {
              type: 'setSearchFilters',
              sourceKey: 'users',
              mode: 'replace',
              values: {
                account_roles: 'owner',
              },
            },
          ],
        },
        {
          code: 'reload-users',
          label: '刷新',
          icon: 'ri-refresh-line',
          eventName: 'userRole.actions.reload',
          directives: [
            {
              type: 'refreshDataSource',
              sourceKeys: ['users'],
            },
          ],
        },
      ],
    },
    {
      id: 'user-role-main-grid',
      kind: 'grid',
      sourceKey: 'users',
      schema: {
        grid: createUserGridConfig(userMainColumns, 360),
        rowActions: {
          edit: false,
          delete: false,
        },
        events: {
          rowCurrentChange: [
            {
              type: 'setDataSource',
              sourceKey: 'selectedUser',
              value: '{{ event.row }}',
            },
            {
              type: 'setDataSource',
              sourceKey: 'selectedUserRows',
              value: ['{{ event.row }}'],
            },
          ],
        },
      },
    },
    {
      id: 'user-role-child-tabs',
      kind: 'tabs',
      defaultKey: 'permissions',
      tabs: [
        {
          key: 'permissions',
          label: '权限明细',
          blocks: [
            {
              id: 'user-role-permission-grid',
              kind: 'grid',
              sourceKey: 'selectedUserRows',
              schema: {
                grid: createUserGridConfig(userPermissionColumns, 240),
                rowActions: {
                  edit: false,
                  delete: false,
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export function createBuiltinLowCodePageRecord(
  schema: LowCodePageSchema
): LowCodePageRecord {
  const timestamp = '2026-07-26T00:00:00.000Z';

  return {
    id: `builtin:${schema.code}`,
    code: schema.code,
    route: schema.route,
    title: schema.title,
    description: schema.description ?? null,
    layout: schema.layout ?? 'dashboard',
    status: schema.status ?? 'published',
    keep_alive: schema.keepAlive !== false,
    schema,
    version: 1,
    published_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export const userRoleManagementPage = createBuiltinLowCodePageRecord(
  userRoleManagementSchema
);
