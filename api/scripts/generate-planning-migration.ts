import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  PLANNING_MODEL_BY_KEY,
  PLANNING_MODEL_DEFINITIONS,
  type PlanningFieldDefinition,
  type PlanningModelDefinition
} from '../src/planning-service/planning.models';

const MIGRATION_FILE = 'supabase/migrations/20260810210000_planning_master_categories.sql';

const CORE_MODEL_KEYS = new Set([
  'planning_calendar', 'planning_calendarbucket', 'planning_location', 'planning_customer',
  'planning_item', 'planning_supplier', 'planning_itemsupplier', 'planning_itemdistribution',
  'planning_buffer', 'planning_setupmatrix', 'planning_resource', 'planning_skill',
  'planning_resourceskill', 'planning_setuprule', 'planning_operation',
  'planning_operationmaterial', 'planning_operationresource', 'planning_suboperation',
  'planning_operation_dependency', 'planning_demand', 'planning_operationplan',
  'planning_operationplanresource', 'planning_operationplanmaterial'
]);

const EXTENDED_MODEL_DEFINITIONS = PLANNING_MODEL_DEFINITIONS.filter(
  (model) => !CORE_MODEL_KEYS.has(model.key)
);

const CATEGORY_TARGETS = [
  ['planning_item', 'item'],
  ['planning_customer', 'customer'],
  ['planning_supplier', 'supplier']
] as const;

const CATEGORY_MODEL = PLANNING_MODEL_BY_KEY.get('planning_category');
if (!CATEGORY_MODEL) throw new Error('planning_category model is not registered.');

const CATEGORY_AFFECTED_MODEL_KEYS = new Set([
  'planning_category',
  ...CATEGORY_TARGETS.map(([table]) => table)
]);
const CATEGORY_AFFECTED_MODELS = PLANNING_MODEL_DEFINITIONS.filter(
  (model) => CATEGORY_AFFECTED_MODEL_KEYS.has(model.key)
);

const uniqueConstraints: Record<string, string[][]> = {
  planning_category: [['target_type', 'code']],
  planning_calendarbucket: [['calendar_id', 'startdate', 'enddate', 'priority']],
  planning_itemsupplier: [['item_id', 'location_id', 'supplier_id', 'effective_start']],
  planning_itemdistribution: [['item_id', 'location_id', 'origin_id', 'effective_start']],
  planning_buffer: [['item_id', 'location_id', 'batch']],
  planning_resourceskill: [['resource_id', 'skill_id']],
  planning_setuprule: [['setupmatrix_id', 'priority']],
  planning_operationmaterial: [['operation_id', 'item_id', 'effective_start']],
  planning_operationresource: [['operation_id', 'resource_id', 'effective_start']],
  planning_suboperation: [['operation_id', 'suboperation_id', 'effective_start']],
  planning_operation_dependency: [['operation_id', 'blockedby_id']],
  planning_operationplanresource: [['resource_id', 'operationplan_id']]
  ,planning_forecast: [['item_id', 'location_id', 'customer_id']]
  ,planning_forecastplan: [['item_id', 'location_id', 'customer_id', 'startdate']]
  ,planning_resourceplan: [['resource_id', 'startdate']]
  ,planning_schedule: [['name']]
  ,planning_export: [['name']]
  ,planning_bucketdetail: [['bucket_id', 'startdate']]
  ,planning_attribute: [['model', 'name']]
  ,planning_archive_manager: [['snapshot_date']]
  ,planning_source_mapping: [['source_system', 'entity_type', 'source_key']]
  ,planning_plan_version: [['scenario_id', 'version_no']]
  ,planning_demand_sync_state: [['source_system', 'source_type', 'source_key']]
};

const listFieldLimit = 9;

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function jsonSql(value: unknown) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

function sqlIdentifier(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`Invalid SQL identifier: ${value}`);
  return `"${value}"`;
}

function fieldSqlType(field: PlanningFieldDefinition) {
  switch (field.kind) {
    case 'number': return 'numeric(30, 8)';
    case 'integer': return 'integer';
    case 'boolean': return 'boolean';
    case 'uuid': return 'uuid';
    case 'date': return 'date';
    case 'datetime': return 'timestamptz';
    case 'time': return 'time';
    case 'interval': return 'interval';
    case 'json': return 'jsonb';
    case 'relation': return 'uuid';
    default: return 'text';
  }
}

function defaultSql(field: PlanningFieldDefinition) {
  if (!Object.prototype.hasOwnProperty.call(field, 'default')) return '';
  const value = field.default;
  if (value === null) return ' default null';
  if (typeof value === 'boolean' || typeof value === 'number') return ` default ${String(value)}`;
  if (field.kind === 'json') return ` default ${jsonSql(value)}`;
  if (field.kind === 'datetime') return ` default ${sqlString(String(value))}::timestamptz`;
  if (field.kind === 'date') return ` default ${sqlString(String(value))}::date`;
  if (field.kind === 'time') return ` default ${sqlString(String(value))}::time`;
  if (field.kind === 'interval') return ` default ${sqlString(String(value))}::interval`;
  return ` default ${sqlString(String(value))}`;
}

function checkSql(field: PlanningFieldDefinition) {
  if (!field.options?.length) return '';
  return ` check (${sqlIdentifier(field.name)} in (${field.options.map((option) => sqlString(option.value)).join(', ')}))`;
}

function tableSql(model: PlanningModelDefinition) {
  const columns = [
    '  id uuid primary key default gen_random_uuid()',
    '  account_id uuid not null references basejump.accounts(id) on delete cascade',
    ...model.fields.map((field) => {
      const required = field.required ? ' not null' : '';
      return `  ${sqlIdentifier(field.name)} ${fieldSqlType(field)}${required}${defaultSql(field)}${checkSql(field)}`;
    }),
    '  created_by uuid references auth.users(id) on delete set null',
    '  updated_by uuid references auth.users(id) on delete set null',
    "  created_at timestamptz not null default timezone('utc'::text, now())",
    "  updated_at timestamptz not null default timezone('utc'::text, now())",
    '  unique (account_id, id)',
    ...(model.businessKey && model.businessKeyUnique !== false
      ? [`  unique (account_id, ${sqlIdentifier(model.businessKey)})`]
      : []),
    ...(uniqueConstraints[model.key] ?? []).map((fields) => `  unique (account_id, ${fields.map(sqlIdentifier).join(', ')})`)
  ];

  return `create table if not exists public.${model.key} (\n${columns.join(',\n')}\n);`;
}

function existingTableColumnsSql() {
  const addedColumns: Record<string, PlanningFieldDefinition[]> = {
    planning_item: [
      { name: 'category_id', label: '类别', kind: 'relation', relation: 'planning_category' }
    ],
    planning_customer: [
      { name: 'category_id', label: '类别', kind: 'relation', relation: 'planning_category' }
    ],
    planning_supplier: [
      { name: 'category_id', label: '类别', kind: 'relation', relation: 'planning_category' }
    ],
    planning_demand: [
      { name: 'source_type', label: '来源类型', kind: 'text', default: 'manual', options: [
        { label: 'manual', value: 'manual' },
        { label: 'sales_order_line', value: 'sales_order_line' },
        { label: 'forecast', value: 'forecast' },
        { label: 'external', value: 'external' }
      ] },
      { name: 'source_system', label: '来源系统', kind: 'text', default: 'enlearn' },
      { name: 'source_key', label: '来源唯一键', kind: 'text' },
      { name: 'source_order_id', label: '来源订单编号', kind: 'uuid' },
      { name: 'source_line_id', label: '来源明细编号', kind: 'uuid' },
      { name: 'source_doc_no', label: '来源单号', kind: 'text' },
      { name: 'source_line_no', label: '来源行号', kind: 'text' },
      { name: 'source_updated_at', label: '来源更新时间', kind: 'datetime' },
      { name: 'sync_status', label: '同步状态', kind: 'text', default: 'manual', options: [
        { label: 'manual', value: 'manual' },
        { label: 'pending', value: 'pending' },
        { label: 'synced', value: 'synced' },
        { label: 'ignored', value: 'ignored' },
        { label: 'error', value: 'error' }
      ] },
      { name: 'sync_message', label: '同步消息', kind: 'text' }
    ],
    planning_operationplan: [
      { name: 'plan_version_id', label: '计划版本', kind: 'relation', relation: 'planning_plan_version' }
    ],
    planning_operationplanresource: [
      { name: 'plan_version_id', label: '计划版本', kind: 'relation', relation: 'planning_plan_version', readOnly: true }
    ],
    planning_operationplanmaterial: [
      { name: 'plan_version_id', label: '计划版本', kind: 'relation', relation: 'planning_plan_version', readOnly: true }
    ],
    planning_problem: [
      { name: 'plan_version_id', label: '计划版本', kind: 'relation', relation: 'planning_plan_version', readOnly: true }
    ],
    planning_constraint: [
      { name: 'plan_version_id', label: '计划版本', kind: 'relation', relation: 'planning_plan_version', readOnly: true }
    ],
    planning_resourceplan: [
      { name: 'plan_version_id', label: '计划版本', kind: 'relation', relation: 'planning_plan_version', readOnly: true }
    ]
  };

  return Object.entries(addedColumns).flatMap(([table, fields]) => fields.map((field) => {
    const constraintName = `${table}_${field.name}_check`;
    const column = `alter table public.${table} add column if not exists ${sqlIdentifier(field.name)} ${fieldSqlType(field)}${defaultSql(field)};`;
    if (!field.options?.length) return column;
    return `${column}\nalter table public.${table} drop constraint if exists ${constraintName};\nalter table public.${table} add constraint ${constraintName} check (${sqlIdentifier(field.name)} in (${field.options.map((option) => sqlString(option.value)).join(', ')}));`;
  })).join('\n\n');
}

function existingTableForeignKeysSql() {
  const relations: Array<[string, string, string, string]> = [
    ['planning_item', 'category_id', 'planning_category', 'restrict'],
    ['planning_customer', 'category_id', 'planning_category', 'restrict'],
    ['planning_supplier', 'category_id', 'planning_category', 'restrict'],
    ['planning_operationplan', 'plan_version_id', 'planning_plan_version', 'set null'],
    ['planning_operationplanresource', 'plan_version_id', 'planning_plan_version', 'set null'],
    ['planning_operationplanmaterial', 'plan_version_id', 'planning_plan_version', 'set null'],
    ['planning_problem', 'plan_version_id', 'planning_plan_version', 'set null'],
    ['planning_constraint', 'plan_version_id', 'planning_plan_version', 'set null'],
    ['planning_resourceplan', 'plan_version_id', 'planning_plan_version', 'set null']
  ];
  return relations.map(([table, field, target, onDelete]) => {
    const constraint = `${table}_${field}_account_fk`;
    return `alter table public.${table} drop constraint if exists ${constraint};\nalter table public.${table} add constraint ${constraint}\n  foreign key (account_id, ${sqlIdentifier(field)}) references public.${target}(account_id, id)\n  on delete ${onDelete} deferrable initially deferred;`;
  }).join('\n\n');
}

function categoryColumnsSql() {
  return CATEGORY_TARGETS.map(([table]) => `alter table public.${table}
  add column if not exists category_id uuid;
create index if not exists idx_${table}_category
  on public.${table}(account_id, category_id);`).join('\n\n');
}

function categoryForeignKeysSql() {
  const categoryParent = foreignKeySql(CATEGORY_MODEL);
  const categoryAssignments = CATEGORY_TARGETS.map(([table]) => {
    const constraint = `${table}_category_id_account_fk`;
    return `alter table public.${table} drop constraint if exists ${constraint};
alter table public.${table} add constraint ${constraint}
  foreign key (account_id, category_id)
  references public.planning_category(account_id, id)
  on delete restrict deferrable initially deferred;`;
  }).join('\n\n');
  return [categoryParent, categoryAssignments].filter(Boolean).join('\n\n');
}

function foreignKeySql(model: PlanningModelDefinition) {
  return model.fields
    .filter((field) => field.kind === 'relation' && field.relation)
    .map((field) => {
      const target = PLANNING_MODEL_BY_KEY.get(field.relation!);
      if (!target) throw new Error(`Unknown relation target: ${field.relation}`);
      const constraint = `${model.key}_${field.name}_account_fk`;
      const onDelete = field.relationOnDelete ?? (
        model.key === 'planning_operationplanmaterial' || model.key === 'planning_operationplanresource'
          ? 'cascade'
          : field.required
            ? 'restrict'
            : 'set null'
      );
      return [
        `alter table public.${model.key} drop constraint if exists ${constraint};`,
        `alter table public.${model.key} add constraint ${constraint}`,
        `  foreign key (account_id, ${sqlIdentifier(field.name)}) references public.${target.key}(account_id, id)`,
        `  on delete ${onDelete} deferrable initially deferred;`
      ].join('\n');
    })
    .join('\n\n');
}

function choiceLabel(field: PlanningFieldDefinition, value: string) {
  return field.options?.find((option) => option.value === value)?.label ?? value;
}

function relationLabelField(field: PlanningFieldDefinition) {
  if (field.relationLabelField) return field.relationLabelField;
  const target = field.relation ? PLANNING_MODEL_BY_KEY.get(field.relation) : undefined;
  return target?.labelField ?? target?.businessKey ?? 'id';
}

function relationSourceKey(field: PlanningFieldDefinition) {
  return field.relation ? `${field.relation}Options` : '';
}

export function planningRelationOptionSourceCode(
  model: PlanningModelDefinition,
  field: PlanningFieldDefinition
) {
  if (
    field.kind !== 'relation' ||
    !field.relation ||
    field.relation === model.key ||
    field.relationTree ||
    Object.keys(field.relationFilters ?? {}).length ||
    Object.keys(field.relationFilterBindings ?? {}).length
  ) {
    return '';
  }
  return `${field.relation}_options_source`;
}

function relationFilterBindingEvents(
  model: PlanningModelDefinition,
  field: PlanningFieldDefinition
) {
  if (!field.relationFilterBindings) return {};
  const sourceKey = relationSourceKey(field);
  const blockId = `${model.key}_edit_form`;
  return Object.values(field.relationFilterBindings).reduce<Record<string, unknown[]>>(
    (events, sourceField) => {
      events[sourceField] = [
        { type: 'setFormField', blockId, field: field.name, value: '' },
        { type: 'refreshDataSources', sourceKeys: [sourceKey] }
      ];
      return events;
    },
    {}
  );
}

function formField(model: PlanningModelDefinition, field: PlanningFieldDefinition) {
  const props: Record<string, unknown> = {
    clearable: field.kind !== 'boolean',
    placeholder: field.kind === 'relation' ? `请选择${field.label}` : `请输入${field.label}`
  };
  let component = 'vxe-input';
  if (field.options?.length) component = 'vxe-select';
  if (field.kind === 'relation') component = 'vxe-select';
  if (field.kind === 'number' || field.kind === 'integer') {
    // The shared lc-number-input normalizes an empty value to 0. Planning has
    // many nullable numeric columns, so use the native numeric input here and
    // let PlanningService normalize an empty string to null.
    component = 'vxe-input';
    props.type = 'number';
  }
  if (field.kind === 'boolean') component = 'vxe-switch';
  if (field.kind === 'json') component = 'lc-json-editor';
  if (field.kind === 'date' || field.kind === 'datetime') component = 'vxe-date-picker';
  if (field.kind === 'time') component = 'vxe-time-picker';
  if (field.readOnly) props.disabled = true;

  const result: Record<string, unknown> = {
    field: field.name,
    label: field.label,
    component,
    span: field.kind === 'json' ? 4 : field.name === 'description' ? 4 : 2,
    props
  };
  if (field.options?.length) result.options = field.options;
  if (field.kind === 'relation') {
    props.filterable = true;
    if (field.relationTree) result.component = 'vxe-tree-select';
    const optionsCode = planningRelationOptionSourceCode(model, field);
    if (optionsCode) result.optionsCode = optionsCode;
    else result.optionsSourceKey = relationSourceKey(field);
    result.optionProps = field.relationTree
      ? { label: 'label', value: 'id', children: 'children' }
      : { label: 'label', value: 'id' };
  }
  const bindingEvents = relationFilterBindingEvents(model, field);
  if (bindingEvents[field.name]) result.events = { change: bindingEvents[field.name] };
  if (field.required) {
    result.rules = [{ required: true, message: `请输入${field.label}` }];
  }
  if (field.kind === 'interval') {
    result.help = '使用 PostgreSQL interval 格式，例如 2 hours、3 days。';
  }
  return result;
}

function columnForField(field: PlanningFieldDefinition) {
  const column: Record<string, unknown> = {
    field: field.kind === 'relation' ? `${field.name}_label` : field.name,
    title: field.label,
    minWidth: field.kind === 'relation' ? 230 : field.kind === 'date' || field.kind === 'datetime' ? 180 : 140,
    showOverflow: 'tooltip'
  };
  if (field.kind === 'number' || field.kind === 'integer') {
    column.formatter = { type: 'number', locale: 'zh-CN', emptyText: '0' };
    column.align = 'right';
  } else if (field.kind === 'boolean') {
    column.formatter = { type: 'enum', map: { true: '是', false: '否' }, emptyText: '-' };
    column.width = 90;
    column.align = 'center';
  } else if (field.kind === 'date' || field.kind === 'datetime') {
    column.formatter = { type: 'datetime', locale: 'zh-CN', emptyText: '-' };
  } else if (field.options?.length) {
    column.formatter = {
      type: 'enum',
      map: Object.fromEntries(field.options.map((option) => [option.value, option.label])),
      emptyText: '-'
    };
  } else {
    column.formatter = { type: 'text', emptyText: '-' };
  }
  return column;
}

function initialValues(model: PlanningModelDefinition) {
  return Object.fromEntries([
    ['id', ''],
    ...model.fields
      .filter((field) => !field.readOnly)
      .map((field) => [
        field.name,
        Object.prototype.hasOwnProperty.call(field, 'default')
          ? field.default
          : field.kind === 'boolean'
            ? false
            : field.kind === 'json'
              ? {}
              : ''
      ] as const)
  ]);
}

function dataSource(model: PlanningModelDefinition, edit: boolean) {
  const sourceKey = `${model.key}Rows`;
  const relationSources = Object.fromEntries(
    model.fields
      .filter((field) => field.kind === 'relation' && field.relation)
      .filter((field, index, fields) =>
        fields.findIndex((candidate) => candidate.relation === field.relation) === index
      )
      .map((field) => {
        const key = relationSourceKey(field);
        return [key, {
          key,
          label: `${field.label}选项`,
          serviceName: 'planning',
          serviceMethod: 'listRelationOptions',
          postData: {
            resource: field.relation,
            labelField: relationLabelField(field),
            ...(edit && field.relation === model.key
              ? { excludeId: `{{ forms.${model.key}_edit_form.id }}` }
              : {}),
            ...(field.relationFilters || field.relationFilterBindings ? {
              filters: {
                ...(field.relationFilters ?? {}),
                ...Object.fromEntries(Object.entries(field.relationFilterBindings ?? {}).map(
                  ([targetField, sourceField]) => [
                    targetField,
                    `{{ forms.${model.key}_edit_form.${sourceField} }}`
                  ]
                ))
              }
            } : {}),
            ...(field.relationTree ? { tree: true } : {})
          },
          ...(edit && field.relationFilterBindings
            ? { loadAfterSourceKeys: [sourceKey] }
            : {}),
          autoLoad: true
        }];
      })
  );
  return {
    [sourceKey]: {
      key: sourceKey,
      label: `${model.title}数据`,
      serviceName: 'planning',
      serviceMethod: 'listItems',
      saveMethod: 'saveItem',
      deleteMethod: 'deleteItem',
      tableName: model.key,
      postData: {
        resource: model.key,
        tableName: model.key,
        ...(edit
          ? { filters: { id: '{{ route.query.id }}' }, requiredFilters: ['id'], limit: 1 }
          : { limit: 300, orderBy: model.businessKey ?? 'updated_at', orderDirection: model.businessKey ? 'asc' : 'desc' })
      },
      autoLoad: true
    },
    ...relationSources
  };
}

export function buildPlanningListSchema(model: PlanningModelDefinition) {
  const route = `/dashboard/planning/${model.sourceTable.replace(/_/g, '-')}`;
  const sourceKey = `${model.key}Rows`;
  const searchable = model.fields.filter((field) =>
    ['name', 'display_name', 'reference', 'description', 'category', 'status', 'type'].includes(field.name)
  ).slice(0, 4);
  const visibleFields = [
    ...model.fields.filter((field) => field.required || field.name === model.businessKey),
    ...model.fields.filter((field) => !field.readOnly && !field.required),
    ...model.fields.filter((field) => field.readOnly)
  ].filter((field, index, fields) => fields.findIndex((candidate) => candidate.name === field.name) === index)
    .slice(0, listFieldLimit);

  return {
    schemaVersion: 1,
    code: `${model.key}-list`,
    route,
    title: model.title,
    description: model.description,
    layout: 'dashboard',
    status: 'published',
    keepAlive: true,
    pageType: 'list',
    dataSources: dataSource(model, false),
    blocks: [
      {
        id: `${model.key}-actions`, kind: 'buttonGroup', align: 'left', gap: 8,
        actions: [
          ...(model.access === 'view' ? [] : [{ code: 'create', label: '新增', type: 'button', mode: 'button', status: 'primary', icon: 'ri-add-line', permissionCode: 'planning.models.manage', route: `${route}/edit` }]),
          ...(model.key === 'planning_plan_version' ? [{
            code: 'publish', label: '发布选中版本', type: 'button', mode: 'button', status: 'primary',
            icon: 'ri-send-plane-line', permissionCode: 'planning.models.manage',
            directives: [
              {
                type: 'invokeService', serviceName: 'planning', serviceMethod: 'publishPlanVersion',
                postData: { id: `{{ grids.${model.key}-grid.currentRow.id }}` }, assignTo: 'planningPlanVersionPublished'
              },
              { type: 'refreshDataSource', sourceKeys: [sourceKey] },
              { type: 'showMessage', status: 'success', message: '计划版本已发布。' }
            ]
          }] : []),
          { code: 'refresh', label: '刷新', type: 'button', mode: 'button', icon: 'ri-refresh-line', directives: [{ type: 'refreshDataSource', sourceKeys: [sourceKey] }] }
        ]
      },
      ...(searchable.length ? [{
        id: `${model.key}-search`, kind: 'searchForm', targetSourceKey: sourceKey,
        schema: {
          columns: 4,
          fields: searchable.map((field) => ({
            field: field.name,
            label: field.label,
            component: field.options?.length ? 'vxe-select' : 'vxe-input',
            ...(field.options?.length ? { options: field.options } : {}),
            props: { clearable: true }
          })),
          actions: [
            { code: 'submit', label: '筛选', type: 'submit', status: 'primary' },
            { code: 'reset', label: '重置', type: 'reset' }
          ]
        }
      }] : []),
      {
        id: `${model.key}-grid`, kind: 'grid', title: `${model.title}列表`, sourceKey,
        sourceType: 'custom', tableName: model.key,
        schema: {
          grid: {
            border: true, stripe: true, showOverflow: 'tooltip', height: 520,
            rowConfig: { keyField: 'id', isCurrent: true },
            columnConfig: { resizable: true },
            columns: [
              { type: 'seq', title: '序号', width: 64, align: 'center' },
              ...visibleFields.map(columnForField),
              { field: 'updated_at', title: '更新时间', width: 180, formatter: { type: 'datetime', locale: 'zh-CN', emptyText: '-' } },
              { title: '操作', width: 150, fixed: 'right', slots: { default: 'actions' } }
            ]
          },
          rowActions: model.access === 'view'
            ? { edit: false, delete: false, actions: [] }
            : { edit: true, editLabel: '编辑', delete: true, deleteLabel: '删除' }
        }
      }
    ]
  };
}

export function buildPlanningEditSchema(model: PlanningModelDefinition) {
  const route = `/dashboard/planning/${model.sourceTable.replace(/_/g, '-')}`;
  const sourceKey = `${model.key}Rows`;
  return {
    schemaVersion: 1,
    code: `${model.key}-edit`,
    route: `${route}/edit`,
    title: `${model.title}编辑`,
    description: model.description,
    layout: 'dashboard',
    status: 'published',
    keepAlive: false,
    pageType: 'edit',
    dataSources: dataSource(model, true),
    blocks: [
      {
        id: `${model.key}-edit-actions`, kind: 'buttonGroup', align: 'left', gap: 8,
        actions: [
          { code: 'back', label: '返回列表', type: 'button', mode: 'button', icon: 'ri-arrow-left-line', route },
          { code: 'refresh', label: '重新载入', type: 'button', mode: 'button', icon: 'ri-refresh-line', directives: [{ type: 'refreshDataSource', sourceKeys: [sourceKey] }] },
          ...(model.access === 'view' ? [] : [{
            code: 'save', label: '保存', type: 'button', mode: 'button', status: 'primary', icon: 'ri-save-3-line',
            permissionCode: 'planning.models.manage',
            directives: [
              {
                type: 'invokeService', sourceKey, serviceMethod: 'saveItem',
                postData: {
                  resource: model.key,
                  id: `{{ forms.${model.key}_edit_form.id }}`,
                  data: Object.fromEntries(
                    model.fields
                      .filter((field) => !field.readOnly)
                      .map((field) => [field.name, `{{ forms.${model.key}_edit_form.${field.name} }}`])
                  )
                },
                assignTo: `${model.key}Saved`
              },
              { type: 'navigate', route: `${route}/edit?id={{ data.${model.key}Saved.id }}&fromPage=${model.key}-list` },
              { type: 'showMessage', status: 'success', message: `${model.title}已保存。` }
            ]
          }])
        ]
      },
      {
        id: `${model.key}-edit-tabs`, kind: 'tabs', defaultKey: 'basic',
        tabs: [{
          key: 'basic', label: '基础信息', blocks: [{
            id: `${model.key}_edit_form`, kind: 'form', title: `${model.title}信息`, sourceKey, submitSourceKey: sourceKey,
            initialValues: initialValues(model),
            schema: {
              columns: 4,
              fields: model.fields.map((field) => {
                const result = formField(model, field);
                const dependentEvents = model.fields.flatMap((candidate) =>
                  relationFilterBindingEvents(model, candidate)[field.name] ?? []
                );
                return dependentEvents.length
                  ? { ...result, events: { ...((result.events as Record<string, unknown>) ?? {}), change: dependentEvents } }
                  : result;
              }),
              actions: []
            }
          }]
        }]
      }
    ]
  };
}

function permissionsSql() {
  return `insert into public.admin_permissions (
  code, name, description, resource_type, resource_key, action_code, status, sort_order
) values
  ('planning.models.view', '查看排产数据', '查看排产基础数据、工艺、需求和计划结果。', 'menu', 'planning', 'view', 'active', 310),
  ('planning.models.manage', '维护排产数据', '新增、修改和删除排产模型数据。', 'action', 'planning', 'manage', 'active', 311)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  resource_type = excluded.resource_type,
  resource_key = excluded.resource_key,
  action_code = excluded.action_code,
  status = excluded.status,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc'::text, now());

insert into public.admin_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.admin_roles roles
join public.admin_permissions permissions
  on permissions.code in ('planning.models.view', 'planning.models.manage')
where roles.code in ('system_admin', 'operations_admin')
on conflict do nothing;`;
}

function workflowPlanningBridgeSql() {
  return `create or replace function public.planning_sync_schedule_to_workflow()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  workflow_status text;
  workflow_type text;
  workflow_code text;
  workflow_row public.wf_job%rowtype;
begin
  if to_regclass('public.wf_job') is null then return new; end if;
  workflow_status := case when new.enabled then 'enabled' else 'disabled' end;
  workflow_type := case when new.cron_expr is null then 'manual' else 'cron' end;
  workflow_code := 'planning.' || new.id::text;

  insert into public.wf_job (
    account_id, code, name, type, status, trigger_task_id, schedule_id,
    cron_expr, timezone, payload, retry_policy, created_by, updated_at
  ) values (
    new.account_id, workflow_code, new.name, workflow_type, workflow_status,
    coalesce(nullif(new.trigger_task_id, ''), 'planning.run'), new.schedule_id,
    new.cron_expr, coalesce(new.timezone, 'Asia/Shanghai'),
    coalesce(new.data, '{}'::jsonb) || jsonb_build_object(
      'planningScheduleId', new.id,
      'planningJobType', new.job_type,
      'planningScenarioId', new.scenario_id
    ),
    '{"maxAttempts":3}'::jsonb, new.created_by, timezone('utc'::text, now())
  )
  on conflict (account_id, code) do update set
    name = excluded.name,
    type = excluded.type,
    status = excluded.status,
    trigger_task_id = excluded.trigger_task_id,
    cron_expr = excluded.cron_expr,
    timezone = excluded.timezone,
    payload = excluded.payload,
    updated_at = excluded.updated_at
  returning * into workflow_row;

  new.schedule_id := coalesce(new.schedule_id, workflow_row.schedule_id);
  return new;
end;
$function$;

drop trigger if exists planning_schedule_workflow_bridge on public.planning_schedule;
create trigger planning_schedule_workflow_bridge
before insert or update of name, job_type, scenario_id, cron_expr, timezone, enabled, data, trigger_task_id
on public.planning_schedule
for each row execute function public.planning_sync_schedule_to_workflow();

create or replace function public.planning_sync_workflow_run()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  planning_schedule_id uuid;
  planning_scenario_id uuid;
  planning_status text;
begin
  if new.job_id is null then return new; end if;
  select nullif(job.payload->>'planningScheduleId', '')::uuid,
         nullif(job.payload->>'planningScenarioId', '')::uuid
    into planning_schedule_id, planning_scenario_id
  from public.wf_job job
  where job.id = new.job_id
    and job.account_id = new.account_id;
  if planning_schedule_id is null then return new; end if;

  planning_status := case new.status
    when 'queued' then 'queued'
    when 'running' then 'running'
    when 'succeeded' then 'succeeded'
    when 'failed' then 'failed'
    when 'canceled' then 'canceled'
    else 'running'
  end;

  insert into public.planning_run (
    id, account_id, scenario_id, workflow_job_id, name, submitted, started, finished,
    arguments, status, message, trigger_run_id, progress
  )
  select new.id, new.account_id, planning_scenario_id, planning_schedule_id, job.name, new.created_at,
         new.started_at, new.finished_at, coalesce(new.input, '{}'::jsonb),
         planning_status, new.error_message, new.trigger_run_id,
         case planning_status when 'succeeded' then 100 when 'failed' then 100 when 'canceled' then 100 when 'running' then 50 else 0 end
  from public.wf_job job
  where job.id = new.job_id
  on conflict (id) do update set
    started = excluded.started,
    finished = excluded.finished,
    status = excluded.status,
    message = excluded.message,
    trigger_run_id = excluded.trigger_run_id,
    progress = excluded.progress,
    updated_at = timezone('utc'::text, now());

  if planning_status in ('queued', 'running') and planning_scenario_id is not null then
    perform set_config('planning.system_version_write', 'on', true);
    insert into public.planning_plan_version (
      account_id, code, name, scenario_id, run_id, status, input_cutoff,
      solver, parameters, input_snapshot, started_at
    )
    select new.account_id,
           'RUN-' || upper(left(replace(new.id::text, '-', ''), 12)),
           job.name || ' ' || to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
           planning_scenario_id, new.id,
           case planning_status when 'running' then 'running' else 'draft' end,
           new.created_at,
           coalesce(nullif(job.payload->>'solver', ''), 'external'),
           coalesce(job.payload, '{}'::jsonb),
           jsonb_build_object('workflowInput', coalesce(new.input, '{}'::jsonb)),
           new.started_at
    from public.wf_job job
    where job.id = new.job_id
    on conflict (account_id, run_id) where run_id is not null do update set
      status = excluded.status,
      started_at = coalesce(public.planning_plan_version.started_at, excluded.started_at),
      updated_at = timezone('utc'::text, now());
    perform set_config('planning.system_version_write', '', true);
  elsif planning_status in ('succeeded', 'failed', 'canceled') then
    select id into planning_schedule_id
    from public.planning_plan_version
    where account_id = new.account_id and run_id = new.id;
    if planning_schedule_id is not null then
      perform public.planning_finish_plan_version(
        new.account_id,
        planning_schedule_id,
        case planning_status when 'succeeded' then 'completed' when 'failed' then 'failed' else 'canceled' end,
        coalesce(new.output, '{}'::jsonb)
      );
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists planning_workflow_run_bridge on public.wf_job_run;
create trigger planning_workflow_run_bridge
after insert or update of status, started_at, finished_at, error_message, trigger_run_id
on public.wf_job_run
for each row execute function public.planning_sync_workflow_run();`;
}

export function buildPlanningDynamicCrudConfig(model: PlanningModelDefinition) {
  const writable = model.fields.filter((field) => !field.readOnly).map((field) => field.name);
  const required = model.fields.filter((field) => field.required).map((field) => field.name);
  const managedCreate = ['account_id', 'created_at', 'updated_at', 'created_by', 'updated_by'];
  const managedUpdate = ['account_id', 'updated_at', 'updated_by'];
  const actionConfig = (allowedFields: string[], requiredFields: string[], managedFields: string[], timestamp = true) => ({
    allowed_fields: [...new Set([...allowedFields, ...managedFields])],
    input_allowed_fields: allowedFields,
    managed_fields: managedFields,
    hook_input_fields: [],
    required_fields: requiredFields,
    timestamp
  });
  const resource = {
    code: model.key,
    table_name: model.key,
    primary_key: 'id',
    owner_field: null,
    account_field: 'account_id',
    client_mode: 'user',
    hooks: {},
    create: model.access === 'view' ? null : actionConfig(writable, required, managedCreate),
    update: model.access === 'view' ? null : actionConfig(writable, [], managedUpdate),
    delete: model.access === 'view' ? null : {
      ...actionConfig([], [], [], false),
      soft_delete: false,
      deleted_at_field: 'deleted_at',
      status_field: null,
      deleted_status: null,
      deleted_by_field: null
    }
  };
  return {
    resource_name: model.key,
    resources: { [model.key]: resource },
    detail_relations: {},
    after_save_relations: {}
  };
}

function dynamicCrudRegistrySql() {
  return EXTENDED_MODEL_DEFINITIONS.map((model) => {
    const config = buildPlanningDynamicCrudConfig(model);
    return `select public.register_dynamic_crud_resource(
  ${sqlString(model.key)},
  ${sqlString(model.key)},
  encode(digest(convert_to(${sqlString(JSON.stringify(config))}, 'UTF8'), 'sha256'), 'hex'),
  ${jsonSql(config)}
);`;
  }).join('\n\n');
}

function commonFunctionsSql() {
  return `create or replace function public.planning_set_audit_fields()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at := timezone('utc'::text, now());
  if to_jsonb(new) ? 'lastmodified' then
    new := jsonb_populate_record(new, jsonb_build_object('lastmodified', timezone('utc'::text, now())));
  end if;
  if to_jsonb(new) ? 'attempted_at' and (to_jsonb(new)->>'attempted_at') is null then
    new := jsonb_populate_record(new, jsonb_build_object('attempted_at', timezone('utc'::text, now())));
  end if;
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, new.updated_at);
  end if;
  return new;
end;
$function$;

create or replace function public.planning_assert_operation_shape()
returns trigger
language plpgsql
as $function$
declare
  owner_type text;
begin
  if new.owner_id is null then return new; end if;
  if new.owner_id = new.id then
    raise exception 'Operation cannot own itself.' using errcode = '23514';
  end if;
  select type into owner_type
  from public.planning_operation
  where account_id = new.account_id and id = new.owner_id;
  if owner_type in ('time_per', 'fixed_time') then
    raise exception 'An operation owner cannot be time_per or fixed_time.' using errcode = '23514';
  end if;
  if owner_type = 'routing' and new.type not in ('time_per', 'fixed_time') then
    raise exception 'A routing owner only accepts time_per or fixed_time children.' using errcode = '23514';
  end if;
  if new.type in ('alternate', 'split') and owner_type in ('alternate', 'split') then
    raise exception 'Alternate and split operations cannot own alternate or split children.' using errcode = '23514';
  end if;
  return new;
end;
$function$;

create or replace function public.planning_sync_suboperation()
returns trigger
language plpgsql
as $function$
begin
  if new.operation_id = new.suboperation_id then
    raise exception 'A suboperation must differ from its parent operation.' using errcode = '23514';
  end if;
  update public.planning_operation
  set owner_id = new.operation_id,
      priority = new.priority,
      effective_start = new.effective_start,
      effective_end = new.effective_end,
      item_id = null,
      updated_at = timezone('utc'::text, now()),
      lastmodified = timezone('utc'::text, now())
  where account_id = new.account_id and id = new.suboperation_id;
  return new;
end;
$function$;

create or replace function public.planning_invalidate_hierarchy()
returns trigger
language plpgsql
as $function$
begin
  new.lft := null;
  new.rght := null;
  new.lvl := null;
  return new;
end;
$function$;`;
}

function policiesAndTriggersSql() {
  const hierarchyTables = new Set(['planning_location', 'planning_customer', 'planning_item', 'planning_supplier', 'planning_resource']);
  return EXTENDED_MODEL_DEFINITIONS.map((model) => {
    const parts = [
      `create index if not exists idx_${model.key}_account on public.${model.key}(account_id);`,
      `create index if not exists idx_${model.key}_updated on public.${model.key}(account_id, updated_at desc);`,
      `alter table public.${model.key} enable row level security;`,
      `drop policy if exists "Planning viewers can read ${model.key}" on public.${model.key};`,
      `create policy "Planning viewers can read ${model.key}" on public.${model.key}\n  for select to authenticated\n  using (public.has_account_permission(account_id, 'planning.models.view') or public.has_account_permission(account_id, 'planning.models.manage'));`,
      `drop policy if exists "Planning managers can insert ${model.key}" on public.${model.key};`,
      `drop policy if exists "Planning managers can update ${model.key}" on public.${model.key};`,
      `drop policy if exists "Planning managers can delete ${model.key}" on public.${model.key};`,
      ...(model.access === 'view' ? [
        `revoke insert, update, delete on public.${model.key} from authenticated;`,
        `grant select on public.${model.key} to authenticated;`,
        `grant select, insert, update, delete on public.${model.key} to service_role;`
      ] : [
        `create policy "Planning managers can insert ${model.key}" on public.${model.key}\n  for insert to authenticated\n  with check (public.has_account_permission(account_id, 'planning.models.manage'));`,
        `create policy "Planning managers can update ${model.key}" on public.${model.key}\n  for update to authenticated\n  using (public.has_account_permission(account_id, 'planning.models.manage'))\n  with check (public.has_account_permission(account_id, 'planning.models.manage'));`,
        `create policy "Planning managers can delete ${model.key}" on public.${model.key}\n  for delete to authenticated\n  using (public.has_account_permission(account_id, 'planning.models.manage'));`,
        `grant select, insert, update, delete on public.${model.key} to authenticated, service_role;`
      ]),
      `drop trigger if exists ${model.key}_audit on public.${model.key};`,
      `create trigger ${model.key}_audit before insert or update on public.${model.key}\n  for each row execute function public.planning_set_audit_fields();`
    ];
    if (hierarchyTables.has(model.key)) {
      parts.push(
        `drop trigger if exists ${model.key}_hierarchy on public.${model.key};`,
        `create trigger ${model.key}_hierarchy before insert or update of owner_id on public.${model.key}\n  for each row execute function public.planning_invalidate_hierarchy();`
      );
    }
    return parts.join('\n');
  }).join('\n\n');
}

function modelConstraintsSql() {
  return `create unique index if not exists planning_itemsupplier_any_location_key
  on public.planning_itemsupplier(account_id, item_id, supplier_id, effective_start)
  where location_id is null;

alter table public.planning_buffer
  drop constraint if exists planning_buffer_batch_not_null;
alter table public.planning_buffer
  add constraint planning_buffer_batch_not_null check (batch is not null);

alter table public.planning_operation_dependency
  drop constraint if exists planning_operation_dependency_distinct_check;
alter table public.planning_operation_dependency
  add constraint planning_operation_dependency_distinct_check check (operation_id <> blockedby_id);

drop trigger if exists planning_operation_shape on public.planning_operation;
create trigger planning_operation_shape
before insert or update of owner_id, type on public.planning_operation
for each row execute function public.planning_assert_operation_shape();

drop trigger if exists planning_suboperation_sync on public.planning_suboperation;
create trigger planning_suboperation_sync
after insert or update of operation_id, suboperation_id, priority, effective_start, effective_end
on public.planning_suboperation
for each row execute function public.planning_sync_suboperation();`;
}

function extendedConstraintsSql() {
  return `alter table public.planning_forecastplan
  drop constraint if exists planning_forecastplan_dates_check;
alter table public.planning_forecastplan
  add constraint planning_forecastplan_dates_check check (enddate > startdate);

alter table public.planning_bucketdetail
  drop constraint if exists planning_bucketdetail_dates_check;
alter table public.planning_bucketdetail
  add constraint planning_bucketdetail_dates_check check (enddate > startdate);

alter table public.planning_problem
  drop constraint if exists planning_problem_dates_check;
alter table public.planning_problem
  add constraint planning_problem_dates_check check (enddate >= startdate);

alter table public.planning_constraint
  drop constraint if exists planning_constraint_dates_check;
alter table public.planning_constraint
  add constraint planning_constraint_dates_check check (enddate >= startdate);

alter table public.planning_run
  drop constraint if exists planning_run_progress_check;
alter table public.planning_run
  add constraint planning_run_progress_check check (progress between 0 and 100);

alter table public.planning_schedule
  drop constraint if exists planning_schedule_cron_check;
alter table public.planning_schedule
  add constraint planning_schedule_cron_check check (not enabled or cron_expr is not null or next_run is not null);

alter table public.planning_export
  drop constraint if exists planning_export_definition_check;
alter table public.planning_export
  add constraint planning_export_definition_check check (sql is not null or report is not null);

alter table public.planning_attribute
  drop constraint if exists planning_attribute_name_check;
alter table public.planning_attribute
  add constraint planning_attribute_name_check check (name ~ '^[a-z][a-z0-9_]*$');

create index if not exists idx_planning_problem_run on public.planning_problem(account_id, run_id, startdate);
create index if not exists idx_planning_constraint_run on public.planning_constraint(account_id, run_id, startdate);
create index if not exists idx_planning_resourceplan_run on public.planning_resourceplan(account_id, run_id, startdate);
create index if not exists idx_planning_run_status on public.planning_run(account_id, status, submitted desc);
create index if not exists idx_planning_schedule_next_run on public.planning_schedule(account_id, enabled, next_run);
create index if not exists idx_planning_archive_snapshot on public.planning_archive_manager(account_id, snapshot_date desc);`;
}

function coreCrudRegistryRefreshSql() {
  const refreshedKeys = new Set([
    'planning_demand',
    'planning_operationplan',
    'planning_operationplanresource',
    'planning_operationplanmaterial',
    'planning_problem',
    'planning_constraint',
    'planning_resourceplan'
  ]);
  return PLANNING_MODEL_DEFINITIONS
    .filter((model) => refreshedKeys.has(model.key))
    .map((model) => {
      const config = buildPlanningDynamicCrudConfig(model);
      return `select public.register_dynamic_crud_resource(
  ${sqlString(model.key)},
  ${sqlString(model.key)},
  encode(digest(convert_to(${sqlString(JSON.stringify(config))}, 'UTF8'), 'sha256'), 'hex'),
  ${jsonSql(config)}
);`;
    })
    .join('\n\n');
}

function integrationAndVersionSql() {
  return `alter table public.planning_demand
  drop constraint if exists planning_demand_source_shape_check;
alter table public.planning_demand
  add constraint planning_demand_source_shape_check check (
    (source_type = 'manual' and source_key is null and source_line_id is null)
    or (source_type <> 'manual' and source_key is not null)
  );

create unique index if not exists planning_demand_source_key
  on public.planning_demand(account_id, source_system, source_type, source_key)
  where source_key is not null;
create unique index if not exists planning_demand_sales_order_line_key
  on public.planning_demand(account_id, source_line_id)
  where source_type = 'sales_order_line' and source_line_id is not null;
create index if not exists idx_planning_demand_sync_status
  on public.planning_demand(account_id, sync_status, source_updated_at desc);

alter table public.planning_source_mapping
  drop constraint if exists planning_source_mapping_target_check;
alter table public.planning_source_mapping
  add constraint planning_source_mapping_target_check check (
    num_nonnulls(item_id, customer_id, location_id, supplier_id, resource_id, operation_id) = 1
    and case entity_type
      when 'item' then item_id is not null
      when 'customer' then customer_id is not null
      when 'location' then location_id is not null
      when 'supplier' then supplier_id is not null
      when 'resource' then resource_id is not null
      when 'operation' then operation_id is not null
      else false
    end
  );
create index if not exists idx_planning_source_mapping_lookup
  on public.planning_source_mapping(account_id, source_system, entity_type, source_key)
  where status = 'active';

alter table public.planning_plan_version
  drop constraint if exists planning_plan_version_horizon_check;
alter table public.planning_plan_version
  add constraint planning_plan_version_horizon_check check (
    horizon_start is null or horizon_end is null or horizon_end > horizon_start
  );
alter table public.planning_plan_version
  drop constraint if exists planning_plan_version_parent_check;
alter table public.planning_plan_version
  add constraint planning_plan_version_parent_check check (parent_version_id is null or parent_version_id <> id);
create unique index if not exists planning_plan_version_run_key
  on public.planning_plan_version(account_id, run_id)
  where run_id is not null;
create unique index if not exists planning_plan_version_current_key
  on public.planning_plan_version(account_id, scenario_id)
  where is_current;
create index if not exists idx_planning_plan_version_status
  on public.planning_plan_version(account_id, scenario_id, status, version_no desc);

alter table public.planning_demand_sync_state
  drop constraint if exists planning_demand_sync_state_source_check;
alter table public.planning_demand_sync_state
  add constraint planning_demand_sync_state_source_check check (
    source_type <> 'sales_order_line' or source_line_id is not null
  );
create unique index if not exists planning_demand_sync_state_line_key
  on public.planning_demand_sync_state(account_id, source_line_id)
  where source_line_id is not null;
create index if not exists idx_planning_demand_sync_state_status
  on public.planning_demand_sync_state(account_id, status, attempted_at desc);

create index if not exists idx_planning_operationplan_version
  on public.planning_operationplan(account_id, plan_version_id, type, status);
alter table public.planning_operationplan
  drop constraint if exists planning_operationplan_account_id_reference_key;
create unique index if not exists planning_operationplan_manual_reference_key
  on public.planning_operationplan(account_id, reference)
  where plan_version_id is null;
create unique index if not exists planning_operationplan_version_reference_key
  on public.planning_operationplan(account_id, plan_version_id, reference)
  where plan_version_id is not null;
create index if not exists idx_planning_operationplanresource_version
  on public.planning_operationplanresource(account_id, plan_version_id);
create index if not exists idx_planning_operationplanmaterial_version
  on public.planning_operationplanmaterial(account_id, plan_version_id, flowdate);
create index if not exists idx_planning_problem_version
  on public.planning_problem(account_id, plan_version_id, startdate);
create index if not exists idx_planning_constraint_version
  on public.planning_constraint(account_id, plan_version_id, startdate);
create index if not exists idx_planning_resourceplan_version
  on public.planning_resourceplan(account_id, plan_version_id, startdate);
alter table public.planning_resourceplan
  drop constraint if exists planning_resourceplan_account_id_resource_id_startdate_key;
create unique index if not exists planning_resourceplan_legacy_bucket_key
  on public.planning_resourceplan(account_id, resource_id, startdate)
  where plan_version_id is null;
create unique index if not exists planning_resourceplan_version_bucket_key
  on public.planning_resourceplan(account_id, plan_version_id, resource_id, startdate)
  where plan_version_id is not null;

create or replace function public.planning_assign_version_number()
returns trigger
language plpgsql
as $function$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.account_id::text || ':' || new.scenario_id::text, 0));
  if new.version_no is null then
    select coalesce(max(version_no), 0) + 1
      into new.version_no
    from public.planning_plan_version
    where account_id = new.account_id and scenario_id = new.scenario_id;
  elsif exists (
    select 1 from public.planning_plan_version
    where account_id = new.account_id and scenario_id = new.scenario_id and version_no = new.version_no
  ) then
    raise exception 'Plan version number already exists in this scenario.' using errcode = '23505';
  end if;
  return new;
end;
$function$;

drop trigger if exists planning_plan_version_number on public.planning_plan_version;
create trigger planning_plan_version_number
before insert on public.planning_plan_version
for each row execute function public.planning_assign_version_number();

create or replace function public.planning_guard_plan_version()
returns trigger
language plpgsql
as $function$
declare
  system_write boolean := coalesce(current_setting('planning.system_version_write', true), '') = 'on';
begin
  if tg_op = 'INSERT' and not system_write then
    new.status := 'draft';
    new.is_current := false;
    new.started_at := null;
    new.completed_at := null;
    new.published_at := null;
    new.published_by := null;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not system_write
       and current_setting('planning.publish_version_id', true) is distinct from new.id::text then
      raise exception 'Plan version status is maintained by the planning execution lifecycle.' using errcode = '42501';
    end if;
    if not (
      (old.status = 'draft' and new.status in ('running', 'completed', 'failed', 'canceled'))
      or (old.status = 'running' and new.status in ('completed', 'failed', 'canceled'))
      or (old.status = 'completed' and new.status in ('published', 'failed', 'canceled'))
      or (old.status = 'published' and new.status = 'superseded')
    ) then
      raise exception 'Invalid plan version status transition: % -> %.', old.status, new.status using errcode = '23514';
    end if;

  end if;

  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and old.status not in ('published', 'superseded') then
    new.is_current := old.is_current;
  end if;

  if tg_op = 'UPDATE' and not system_write
     and current_setting('planning.publish_version_id', true) is distinct from new.id::text
     and (
       new.is_current is distinct from old.is_current
       or new.result_summary is distinct from old.result_summary
       or new.started_at is distinct from old.started_at
       or new.completed_at is distinct from old.completed_at
       or new.published_at is distinct from old.published_at
       or new.published_by is distinct from old.published_by
     ) then
    raise exception 'Plan version execution fields are system maintained.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.status in ('published', 'superseded') then
    if new.code is distinct from old.code
       or new.scenario_id is distinct from old.scenario_id
       or new.run_id is distinct from old.run_id
       or new.parent_version_id is distinct from old.parent_version_id
       or new.version_no is distinct from old.version_no
       or new.input_cutoff is distinct from old.input_cutoff
       or new.horizon_start is distinct from old.horizon_start
       or new.horizon_end is distinct from old.horizon_end
       or new.solver is distinct from old.solver
       or new.parameters is distinct from old.parameters
       or new.input_snapshot is distinct from old.input_snapshot then
      raise exception 'Published or superseded plan versions are immutable.' using errcode = '23514';
    end if;
  end if;

  if new.status = 'published' then
    if tg_op = 'INSERT' or new.status is distinct from old.status then
      if current_setting('planning.publish_version_id', true) is distinct from new.id::text then
        raise exception 'Use planning_publish_plan_version to publish a plan version.' using errcode = '42501';
      end if;
      if new.completed_at is null then
        raise exception 'Only a completed plan version can be published.' using errcode = '23514';
      end if;
      perform pg_advisory_xact_lock(hashtextextended(new.account_id::text || ':' || new.scenario_id::text || ':publish', 0));
      perform set_config('planning.system_version_write', 'on', true);
      update public.planning_plan_version
      set status = 'superseded', is_current = false, updated_at = timezone('utc'::text, now())
      where account_id = new.account_id
        and scenario_id = new.scenario_id
        and id <> new.id
        and is_current;
      new.is_current := true;
      new.published_at := coalesce(new.published_at, timezone('utc'::text, now()));
      new.published_by := coalesce(new.published_by, auth.uid());
    elsif new.is_current is distinct from old.is_current
       or new.published_at is distinct from old.published_at
       or new.published_by is distinct from old.published_by then
      raise exception 'Published plan version metadata is immutable.' using errcode = '23514';
    end if;
  elsif tg_op = 'INSERT' or new.status is distinct from old.status then
    new.is_current := false;
  end if;

  return new;
end;
$function$;

drop trigger if exists planning_plan_version_guard on public.planning_plan_version;
create trigger planning_plan_version_guard
before insert or update on public.planning_plan_version
for each row execute function public.planning_guard_plan_version();

create or replace function public.planning_publish_plan_version(p_account_id uuid, p_version_id uuid)
returns public.planning_plan_version
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  version_row public.planning_plan_version;
begin
  if auth.uid() is not null and not public.has_account_permission(p_account_id, 'planning.models.manage') then
    raise exception 'Planning manage permission required.' using errcode = '42501';
  end if;
  if auth.uid() is not null and not exists (
    select 1 from basejump.account_user membership
    where membership.account_id = p_account_id and membership.user_id = auth.uid()
  ) then
    raise exception 'Account membership required.' using errcode = '42501';
  end if;

  select * into version_row
  from public.planning_plan_version
  where account_id = p_account_id and id = p_version_id
  for update;
  if not found then
    raise exception 'Plan version not found.' using errcode = 'P0002';
  end if;
  if version_row.status <> 'completed' then
    raise exception 'Only a completed plan version can be published.' using errcode = '23514';
  end if;

  perform set_config('planning.publish_version_id', p_version_id::text, true);
  perform set_config('planning.system_version_write', 'on', true);
  update public.planning_plan_version
  set status = 'published', published_by = coalesce(auth.uid(), published_by)
  where account_id = p_account_id and id = p_version_id
  returning * into version_row;
  perform set_config('planning.publish_version_id', '', true);
  perform set_config('planning.system_version_write', '', true);
  return version_row;
end;
$function$;

revoke all on function public.planning_publish_plan_version(uuid, uuid) from public, anon;
grant execute on function public.planning_publish_plan_version(uuid, uuid) to authenticated, service_role;

create or replace function public.planning_finish_plan_version(
  p_account_id uuid,
  p_version_id uuid,
  p_status text,
  p_result_summary jsonb default '{}'::jsonb
)
returns public.planning_plan_version
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  version_row public.planning_plan_version;
begin
  if p_status not in ('completed', 'failed', 'canceled') then
    raise exception 'Invalid terminal plan version status.' using errcode = '22023';
  end if;
  perform set_config('planning.system_version_write', 'on', true);
  update public.planning_plan_version
  set status = p_status,
      completed_at = timezone('utc'::text, now()),
      result_summary = coalesce(p_result_summary, '{}'::jsonb)
  where account_id = p_account_id and id = p_version_id
  returning * into version_row;
  perform set_config('planning.system_version_write', '', true);
  if version_row.id is null then
    raise exception 'Plan version not found.' using errcode = 'P0002';
  end if;
  return version_row;
end;
$function$;

revoke all on function public.planning_finish_plan_version(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.planning_finish_plan_version(uuid, uuid, text, jsonb) to service_role;

create or replace function public.planning_sync_result_version()
returns trigger
language plpgsql
as $function$
declare
  parent_version_id uuid;
begin
  select plan_version_id into parent_version_id
  from public.planning_operationplan
  where account_id = new.account_id and id = new.operationplan_id;
  if new.plan_version_id is not null and new.plan_version_id is distinct from parent_version_id then
    raise exception 'Plan result detail version must match its plan order.' using errcode = '23514';
  end if;
  new.plan_version_id := parent_version_id;
  return new;
end;
$function$;

drop trigger if exists planning_operationplanresource_version_sync on public.planning_operationplanresource;
create trigger planning_operationplanresource_version_sync
before insert or update of operationplan_id, plan_version_id on public.planning_operationplanresource
for each row execute function public.planning_sync_result_version();

drop trigger if exists planning_operationplanmaterial_version_sync on public.planning_operationplanmaterial;
create trigger planning_operationplanmaterial_version_sync
before insert or update of operationplan_id, plan_version_id on public.planning_operationplanmaterial
for each row execute function public.planning_sync_result_version();

create or replace function public.planning_protect_published_results()
returns trigger
language plpgsql
as $function$
declare
  old_version_id uuid;
  new_version_id uuid;
  parent_version_id uuid;
begin
  if tg_op <> 'INSERT' then
    old_version_id := old.plan_version_id;
  end if;
  if tg_op <> 'DELETE' then
    new_version_id := new.plan_version_id;
    if tg_table_name in ('planning_operationplanmaterial', 'planning_operationplanresource') then
      select plan_version_id into parent_version_id
      from public.planning_operationplan
      where account_id = new.account_id and id = new.operationplan_id;
      new_version_id := coalesce(parent_version_id, new_version_id);
    end if;
  end if;

  if (old_version_id is not null and exists (
    select 1 from public.planning_plan_version version
    where version.account_id = old.account_id
      and version.id = old_version_id
      and version.status in ('published', 'superseded', 'canceled')
  )) or (new_version_id is not null and exists (
    select 1 from public.planning_plan_version version
    where version.account_id = new.account_id
      and version.id = new_version_id
      and version.status in ('published', 'superseded', 'canceled')
  )) then
    raise exception 'Terminal plan results are immutable.' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop trigger if exists planning_operationplan_published_guard on public.planning_operationplan;
create trigger planning_operationplan_published_guard
before insert or update or delete on public.planning_operationplan
for each row execute function public.planning_protect_published_results();

drop trigger if exists planning_problem_published_guard on public.planning_problem;
create trigger planning_problem_published_guard
before insert or update or delete on public.planning_problem
for each row execute function public.planning_protect_published_results();

drop trigger if exists planning_constraint_published_guard on public.planning_constraint;
create trigger planning_constraint_published_guard
before insert or update or delete on public.planning_constraint
for each row execute function public.planning_protect_published_results();

drop trigger if exists planning_resourceplan_published_guard on public.planning_resourceplan;
create trigger planning_resourceplan_published_guard
before insert or update or delete on public.planning_resourceplan
for each row execute function public.planning_protect_published_results();

drop trigger if exists planning_operationplanresource_published_guard on public.planning_operationplanresource;
create trigger planning_operationplanresource_published_guard
before insert or update or delete on public.planning_operationplanresource
for each row execute function public.planning_protect_published_results();

drop trigger if exists planning_operationplanmaterial_published_guard on public.planning_operationplanmaterial;
create trigger planning_operationplanmaterial_published_guard
before insert or update or delete on public.planning_operationplanmaterial
for each row execute function public.planning_protect_published_results();

create or replace function public.planning_sync_sales_order_line(p_line_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  source_row record;
  mapped_item uuid;
  mapped_customer uuid;
  mapped_location uuid;
  missing_mappings text[] := array[]::text[];
  target_status text;
  target_due timestamptz;
  target_quantity numeric;
  target_demand_id uuid;
  v_sync_status text;
  v_sync_message text;
  snapshot jsonb;
begin
  select orders.account_id, orders.id order_id, orders.doc_no, orders.status order_status,
         orders.customer_code, orders.customer_id, orders.customer_name,
         lines.id line_id, lines.line_no, lines.status line_status,
         lines.item_code, lines.item_id source_item_id, lines.item_name, lines.warehouse_code,
         lines.ordered_qty, lines.open_qty, lines.need_date, lines.promise_date, lines.delivery_date,
         lines.project_code, lines.updated_at line_updated_at
  into source_row
  from public.sales_order_lines lines
  join public.sales_orders orders on orders.id = lines.order_id and orders.account_id = lines.account_id
  where lines.id = p_line_id;
  if not found then
    return jsonb_build_object('status', 'missing', 'sourceLineId', p_line_id);
  end if;

  snapshot := to_jsonb(source_row);
  target_due := coalesce(source_row.need_date, source_row.promise_date, source_row.delivery_date)::timestamptz;
  target_quantity := greatest(coalesce(source_row.open_qty, source_row.ordered_qty, 0), 0);

  select mapping.item_id into mapped_item
  from public.planning_source_mapping mapping
  where mapping.account_id = source_row.account_id and mapping.source_system = 'enlearn'
    and mapping.entity_type = 'item' and mapping.status = 'active'
    and mapping.source_key in (source_row.source_item_id, source_row.item_code)
  order by case when mapping.source_key = source_row.source_item_id then 0 else 1 end limit 1;
  if mapped_item is null then
    select planning_item.id into mapped_item from public.planning_item planning_item
    where planning_item.account_id = source_row.account_id and planning_item.name = source_row.item_code limit 1;
  end if;

  select mapping.customer_id into mapped_customer
  from public.planning_source_mapping mapping
  where mapping.account_id = source_row.account_id and mapping.source_system = 'enlearn'
    and mapping.entity_type = 'customer' and mapping.status = 'active'
    and mapping.source_key in (source_row.customer_id, source_row.customer_code)
  order by case when mapping.source_key = source_row.customer_id then 0 else 1 end limit 1;
  if mapped_customer is null then
    select planning_customer.id into mapped_customer from public.planning_customer planning_customer
    where planning_customer.account_id = source_row.account_id
      and planning_customer.name in (source_row.customer_code, source_row.customer_name)
    order by case when planning_customer.name = source_row.customer_code then 0 else 1 end limit 1;
  end if;

  select mapping.location_id into mapped_location
  from public.planning_source_mapping mapping
  where mapping.account_id = source_row.account_id and mapping.source_system = 'enlearn'
    and mapping.entity_type = 'location' and mapping.status = 'active'
    and mapping.source_key = source_row.warehouse_code limit 1;
  if mapped_location is null then
    select planning_location.id into mapped_location from public.planning_location planning_location
    where planning_location.account_id = source_row.account_id and planning_location.name = source_row.warehouse_code limit 1;
  end if;

  if mapped_item is null then missing_mappings := array_append(missing_mappings, 'item:' || coalesce(source_row.item_code, '(empty)')); end if;
  if mapped_customer is null then missing_mappings := array_append(missing_mappings, 'customer:' || coalesce(source_row.customer_code, source_row.customer_name, '(empty)')); end if;
  if mapped_location is null then missing_mappings := array_append(missing_mappings, 'location:' || coalesce(source_row.warehouse_code, '(empty)')); end if;

  target_status := case
    when lower(coalesce(source_row.order_status, '')) in ('canceled', 'cancelled', 'void', 'rejected') then 'canceled'
    when lower(coalesce(source_row.order_status, '')) in ('closed', 'close')
      or lower(coalesce(source_row.line_status, '')) in ('canceled', 'cancelled', 'closed')
      or target_quantity <= 0 then 'closed'
    else 'open'
  end;

  if target_status in ('closed', 'canceled') and target_demand_id is null then
    select demand.id into target_demand_id
    from public.planning_demand demand
    where demand.account_id = source_row.account_id and demand.source_system = 'enlearn'
      and demand.source_type = 'sales_order_line' and demand.source_key = source_row.line_id::text;
  end if;

  if target_status in ('closed', 'canceled') then
    v_sync_status := 'ignored';
    v_sync_message := case target_status
      when 'canceled' then 'Sales order or line is canceled.'
      else 'Sales order line is closed or has no open quantity.'
    end;
  elsif cardinality(missing_mappings) > 0 then
    v_sync_status := 'error';
    v_sync_message := 'Missing mappings: ' || array_to_string(missing_mappings, ', ');
  elsif target_due is null then
    v_sync_status := 'error';
    v_sync_message := 'Missing demand date.';
  elsif lower(coalesce(source_row.order_status, '')) in ('on_hold', 'hold', 'held') then
    v_sync_status := 'ignored';
    v_sync_message := 'Sales order is on hold.';
  elsif lower(coalesce(source_row.order_status, '')) not in (
    'open', 'approved', 'approve', 'passed', 'confirmed', 'processing', 'completed'
  ) then
    v_sync_status := 'pending';
    v_sync_message := 'Sales order is not approved.';
  else
    v_sync_status := 'synced';
    v_sync_message := null;
  end if;

  if v_sync_status = 'ignored' and target_status = 'open' then
    target_status := 'closed';
  end if;

  if v_sync_status = 'synced' then
    insert into public.planning_demand (
      account_id, name, owner, customer_id, item_id, location_id, due, status, quantity, priority,
      batch, source_type, source_system, source_key, source_order_id, source_line_id,
      source_doc_no, source_line_no, source_updated_at, sync_status, sync_message, source
    ) values (
      source_row.account_id, source_row.doc_no || '-' || source_row.line_no::text, source_row.doc_no,
      mapped_customer, mapped_item, mapped_location, target_due, target_status, target_quantity, 10,
      nullif(source_row.project_code, ''), 'sales_order_line', 'enlearn', source_row.line_id::text,
      source_row.order_id, source_row.line_id, source_row.doc_no, source_row.line_no::text,
      source_row.line_updated_at, 'synced', null, 'sales_order_line:' || source_row.line_id::text
    )
    on conflict (account_id, source_system, source_type, source_key) where source_key is not null
    do update set
      name = excluded.name, owner = excluded.owner, customer_id = excluded.customer_id,
      item_id = excluded.item_id, location_id = excluded.location_id, due = excluded.due,
      status = excluded.status, quantity = excluded.quantity, batch = excluded.batch,
      source_order_id = excluded.source_order_id, source_line_id = excluded.source_line_id,
      source_doc_no = excluded.source_doc_no, source_line_no = excluded.source_line_no,
      source_updated_at = excluded.source_updated_at, sync_status = 'synced', sync_message = null,
      updated_at = timezone('utc'::text, now())
    returning id into target_demand_id;
  else
    select demand.id into target_demand_id
    from public.planning_demand demand
    where demand.account_id = source_row.account_id and demand.source_system = 'enlearn'
      and demand.source_type = 'sales_order_line' and demand.source_key = source_row.line_id::text;
    if target_demand_id is not null then
      update public.planning_demand
      set sync_status = v_sync_status, sync_message = v_sync_message,
          status = case
            when target_status = 'canceled' then 'canceled'
            when v_sync_status = 'ignored' then 'closed'
            when v_sync_status = 'pending' then 'closed'
            else status
          end,
          quantity = case when v_sync_status = 'ignored' then target_quantity else quantity end,
          source_order_id = source_row.order_id, source_line_id = source_row.line_id,
          source_doc_no = source_row.doc_no, source_line_no = source_row.line_no::text,
          source_updated_at = source_row.line_updated_at, updated_at = timezone('utc'::text, now())
      where account_id = source_row.account_id and id = target_demand_id;
    end if;
  end if;

  insert into public.planning_demand_sync_state (
    account_id, source_type, source_system, source_key, source_order_id, source_line_id,
    source_doc_no, source_line_no, demand_id, status, message, source_updated_at, attempted_at, payload
  ) values (
    source_row.account_id, 'sales_order_line', 'enlearn', source_row.line_id::text,
    source_row.order_id, source_row.line_id, source_row.doc_no, source_row.line_no::text,
    target_demand_id, v_sync_status, v_sync_message, source_row.line_updated_at,
    timezone('utc'::text, now()), snapshot
  )
  on conflict (account_id, source_system, source_type, source_key) do update set
    source_order_id = excluded.source_order_id, source_line_id = excluded.source_line_id,
    source_doc_no = excluded.source_doc_no, source_line_no = excluded.source_line_no,
    demand_id = excluded.demand_id, status = excluded.status, message = excluded.message,
    source_updated_at = excluded.source_updated_at, attempted_at = excluded.attempted_at,
    payload = excluded.payload, updated_at = timezone('utc'::text, now());

  return jsonb_build_object('status', v_sync_status, 'message', v_sync_message, 'demandId', target_demand_id, 'sourceLineId', p_line_id);
end;
$function$;

create or replace function public.planning_sync_sales_order_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  row_id uuid;
  deleted_account_id uuid;
  deleted_order_id uuid;
  sync_result jsonb;
begin
  if tg_table_name = 'sales_order_lines' then
    if tg_op = 'DELETE' then
      update public.planning_demand
      set status = 'canceled', quantity = 0, sync_status = 'ignored',
          sync_message = 'Source sales order line was deleted.',
          source_updated_at = timezone('utc'::text, now()), updated_at = timezone('utc'::text, now())
      where account_id = old.account_id and source_system = 'enlearn'
        and source_type = 'sales_order_line' and source_line_id = old.id;
      update public.planning_demand_sync_state
      set status = 'ignored', message = 'Source sales order line was deleted.',
          source_updated_at = timezone('utc'::text, now()), attempted_at = timezone('utc'::text, now()),
          payload = payload || jsonb_build_object('deletedAt', timezone('utc'::text, now())),
          updated_at = timezone('utc'::text, now())
      where account_id = old.account_id and source_system = 'enlearn'
        and source_type = 'sales_order_line' and source_line_id = old.id;
      return old;
    end if;
    begin
      sync_result := public.planning_sync_sales_order_line(new.id);
    exception when others then
      insert into public.planning_demand_sync_state (
        account_id, source_type, source_system, source_key, source_order_id, source_line_id,
        source_doc_no, source_line_no, status, message, source_updated_at, attempted_at, payload
      )
      select new.account_id, 'sales_order_line', 'enlearn', new.id::text, new.order_id, new.id,
             orders.doc_no, new.line_no::text, 'error', left(sqlerrm, 4000), new.updated_at,
             timezone('utc'::text, now()), jsonb_build_object('triggerError', sqlerrm)
      from public.sales_orders orders
      where orders.account_id = new.account_id and orders.id = new.order_id
      on conflict (account_id, source_system, source_type, source_key) do update set
        status = 'error', message = excluded.message, attempted_at = excluded.attempted_at,
        payload = excluded.payload, updated_at = timezone('utc'::text, now());
    end;
  else
    deleted_account_id := case when tg_op = 'DELETE' then old.account_id else new.account_id end;
    deleted_order_id := case when tg_op = 'DELETE' then old.id else new.id end;
    if tg_op = 'DELETE' then
      update public.planning_demand
      set status = 'canceled', quantity = 0, sync_status = 'ignored',
          sync_message = 'Source sales order was deleted.',
          source_updated_at = timezone('utc'::text, now()), updated_at = timezone('utc'::text, now())
      where account_id = deleted_account_id and source_system = 'enlearn'
        and source_type = 'sales_order_line' and source_order_id = deleted_order_id;
      update public.planning_demand_sync_state
      set status = 'ignored', message = 'Source sales order was deleted.',
          source_updated_at = timezone('utc'::text, now()), attempted_at = timezone('utc'::text, now()),
          payload = payload || jsonb_build_object('deletedAt', timezone('utc'::text, now())),
          updated_at = timezone('utc'::text, now())
      where account_id = deleted_account_id and source_system = 'enlearn'
        and source_type = 'sales_order_line' and source_order_id = deleted_order_id;
      return old;
    end if;
    for row_id in select id from public.sales_order_lines where account_id = new.account_id and order_id = new.id loop
      begin
        sync_result := public.planning_sync_sales_order_line(row_id);
      exception when others then
        insert into public.planning_demand_sync_state (
          account_id, source_type, source_system, source_key, source_order_id, source_line_id,
          source_doc_no, source_line_no, status, message, source_updated_at, attempted_at, payload
        )
        select lines.account_id, 'sales_order_line', 'enlearn', lines.id::text, lines.order_id, lines.id,
               new.doc_no, lines.line_no::text, 'error', left(sqlerrm, 4000), lines.updated_at,
               timezone('utc'::text, now()), jsonb_build_object('triggerError', sqlerrm)
        from public.sales_order_lines lines
        where lines.account_id = new.account_id and lines.id = row_id
        on conflict (account_id, source_system, source_type, source_key) do update set
          status = 'error', message = excluded.message, attempted_at = excluded.attempted_at,
          payload = excluded.payload, updated_at = timezone('utc'::text, now());
      end;
    end loop;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop trigger if exists planning_sales_order_line_sync on public.sales_order_lines;
create trigger planning_sales_order_line_sync
after insert or delete or update of status, item_id, item_code, item_name, ordered_qty, open_qty,
  need_date, promise_date, delivery_date, warehouse_code, project_code
on public.sales_order_lines
for each row execute function public.planning_sync_sales_order_trigger();

drop trigger if exists planning_sales_order_sync on public.sales_orders;
create trigger planning_sales_order_sync
after delete or update of status, customer_id, customer_code, customer_name
on public.sales_orders
for each row execute function public.planning_sync_sales_order_trigger();

create or replace function public.planning_resync_sales_orders(p_account_id uuid, p_line_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  row_id uuid;
  result jsonb;
  synced integer := 0;
  pending integer := 0;
  ignored integer := 0;
  errors integer := 0;
begin
  if auth.uid() is not null and not public.has_account_permission(p_account_id, 'planning.models.manage') then
    raise exception 'Planning manage permission required.' using errcode = '42501';
  end if;
  if auth.uid() is not null and not exists (
    select 1 from basejump.account_user membership
    where membership.account_id = p_account_id and membership.user_id = auth.uid()
  ) then
    raise exception 'Account membership required.' using errcode = '42501';
  end if;
  for row_id in
    select lines.id from public.sales_order_lines lines
    where lines.account_id = p_account_id and (p_line_ids is null or lines.id = any(p_line_ids))
    order by lines.updated_at, lines.id
  loop
    result := public.planning_sync_sales_order_line(row_id);
    case result->>'status'
      when 'synced' then synced := synced + 1;
      when 'pending' then pending := pending + 1;
      when 'ignored' then ignored := ignored + 1;
      else errors := errors + 1;
    end case;
  end loop;
  return jsonb_build_object('synced', synced, 'pending', pending, 'ignored', ignored, 'errors', errors);
end;
$function$;

revoke all on function public.planning_sync_sales_order_line(uuid) from public, anon, authenticated;
grant execute on function public.planning_sync_sales_order_line(uuid) to service_role;
revoke all on function public.planning_resync_sales_orders(uuid, uuid[]) from public, anon;
grant execute on function public.planning_resync_sales_orders(uuid, uuid[]) to authenticated, service_role;`;
}

function seedExtendedPlanningDataSql() {
  const parameters = [
    ['currentdate', 'now', '当前计划日期。可填写 now 或日期时间值。'],
    ['last_currentdate', '', '上次完成计划运行的日期。'],
    ['plan.administrativeLeadtime', '0', '管理提前期，单位为天。'],
    ['plan.minimumdelay', '3600', '最小交付日期增量，单位为秒。'],
    ['plan.loglevel', '0', '计划日志详细级别。'],
    ['plan.rotateResources', 'true', '在备用资源之间分配需求。'],
    ['plan.individualPoolResources', 'false', '将资源池数量解释为单个成员。'],
    ['plan.move_approved_early', '0', '控制已批准订单的提前重排。'],
    ['plan.autoFenceOperations', '999', '等待已确认补给的天数。'],
    ['plan.deliveryDuration', '0', '最终发货持续时间，单位为工作小时。'],
    ['plan.fixBrokenSupplyPath', 'true', '为中断的供应路径创建备用来源。'],
    ['plan.solver', 'heuristic', '求解器选择：heuristic 或 heuristic_2。'],
    ['plan.iterationmax', '0', '求解器最大迭代次数。'],
    ['plan.resourceiterationmax', '500', '资源搜索最大迭代次数。'],
    ['forecast.calendar', 'month', '预测时间桶日历。'],
    ['forecast.Horizon_future', '365', '预测未来范围，单位为天。'],
    ['forecast.Horizon_history', '1095', '预测历史范围，单位为天。'],
    ['forecast.populateForecastTable', 'true', '填充缺失的预测组合。'],
    ['forecast.runnetting', 'true', '将销售订单与预测进行净额计算。']
  ];
  const parameterValues = parameters.map(([name, value, description]) =>
    `(${sqlString(name)}, ${sqlString(value)}, ${sqlString(description)})`
  ).join(',\n  ');

  const measures = [
    ['forecastbaseline', 'forecast baseline', 'aggregate', 'view', 'hide', 'number', '0'],
    ['forecastoverride', 'forecast override', 'aggregate', 'edit', 'view', 'number', '-1'],
    ['forecasttotal', 'total forecast', 'computed', 'view', 'view', 'number', '0'],
    ['forecastconsumed', 'forecast consumed', 'aggregate', 'view', 'hide', 'number', '0'],
    ['forecastnet', 'forecast net', 'aggregate', 'view', 'hide', 'number', '0'],
    ['orderstotal', 'total orders', 'aggregate', 'view', 'view', 'number', '0'],
    ['ordersadjustment', 'orders adjustment', 'aggregate', 'hide', 'edit', 'number', '0'],
    ['ordersopen', 'open orders', 'aggregate', 'view', 'view', 'number', '0'],
    ['ordersplanned', 'planned orders', 'aggregate', 'view', 'hide', 'number', '0'],
    ['forecastplanned', 'planned forecast', 'aggregate', 'view', 'hide', 'number', '0']
  ];
  const measureValues = measures.map(([name, label, type, future, past, formatter, defaultValue]) =>
    `(${sqlString(name)}, ${sqlString(label)}, ${sqlString(type)}, ${sqlString(future)}, ${sqlString(past)}, ${sqlString(formatter)}, ${defaultValue})`
  ).join(',\n  ');

  return `insert into public.planning_parameter (account_id, name, value, description, source)
select accounts.id, seeded.name, seeded.value, seeded.description, 'frepple-default'
from basejump.accounts accounts
cross join (values
  ${parameterValues}
) seeded(name, value, description)
where accounts.status = 'active'
on conflict (account_id, name) do nothing;

insert into public.planning_measure (
  account_id, name, label, type, mode_future, mode_past, formatter, defaultvalue, source
)
select accounts.id, seeded.name, seeded.label, seeded.type, seeded.mode_future,
       seeded.mode_past, seeded.formatter, seeded.defaultvalue, 'frepple-default'
from basejump.accounts accounts
cross join (values
  ${measureValues}
) seeded(name, label, type, mode_future, mode_past, formatter, defaultvalue)
where accounts.status = 'active'
on conflict (account_id, name) do nothing;

insert into public.planning_scenario (account_id, name, description, status, info, source)
select accounts.id, 'baseline', 'Production baseline scenario', 'in use', '{}'::jsonb, 'enlearn-default'
from basejump.accounts accounts
where accounts.status = 'active'
on conflict (account_id, name) do nothing;`;
}

function legacyCategorySourceSql() {
  return CATEGORY_TARGETS.map(([table, targetType]) => `select account_id, ${sqlString(targetType)}::text as target_type,
         nullif(btrim(category), '') as category_name,
         nullif(btrim(subcategory), '') as subcategory_name
  from public.${table}`).join('\n  union all\n  ');
}

function categoryPoliciesAndAuditSql() {
  return `create or replace function public.planning_set_audit_fields()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at := timezone('utc'::text, now());
  if to_jsonb(new) ? 'lastmodified' then
    new := jsonb_populate_record(new, jsonb_build_object('lastmodified', timezone('utc'::text, now())));
  end if;
  if to_jsonb(new) ? 'attempted_at' and (to_jsonb(new)->>'attempted_at') is null then
    new := jsonb_populate_record(new, jsonb_build_object('attempted_at', timezone('utc'::text, now())));
  end if;
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, new.updated_at);
  end if;
  return new;
end;
$function$;

create index if not exists idx_planning_category_account
  on public.planning_category(account_id);
create index if not exists idx_planning_category_updated
  on public.planning_category(account_id, updated_at desc);
create index if not exists idx_planning_category_tree
  on public.planning_category(account_id, target_type, parent_id, sort_order, code);

alter table public.planning_category enable row level security;

drop policy if exists "Planning viewers can read planning_category" on public.planning_category;
create policy "Planning viewers can read planning_category" on public.planning_category
  for select to authenticated
  using (
    public.has_account_permission(account_id, 'planning.models.view')
    or public.has_account_permission(account_id, 'planning.models.manage')
  );

drop policy if exists "Planning managers can insert planning_category" on public.planning_category;
create policy "Planning managers can insert planning_category" on public.planning_category
  for insert to authenticated
  with check (public.has_account_permission(account_id, 'planning.models.manage'));

drop policy if exists "Planning managers can update planning_category" on public.planning_category;
create policy "Planning managers can update planning_category" on public.planning_category
  for update to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'))
  with check (public.has_account_permission(account_id, 'planning.models.manage'));

drop policy if exists "Planning managers can delete planning_category" on public.planning_category;
create policy "Planning managers can delete planning_category" on public.planning_category
  for delete to authenticated
  using (public.has_account_permission(account_id, 'planning.models.manage'));

grant select, insert, update, delete on public.planning_category to authenticated, service_role;

drop trigger if exists planning_category_audit on public.planning_category;
create trigger planning_category_audit
before insert or update on public.planning_category
for each row execute function public.planning_set_audit_fields();`;
}

function categoryLegacyBackfillSql() {
  const sourceCategories = legacyCategorySourceSql();
  return `drop trigger if exists planning_item_category_clear on public.planning_item;
drop trigger if exists planning_customer_category_clear on public.planning_customer;
drop trigger if exists planning_supplier_category_clear on public.planning_supplier;

alter table public.planning_category
  drop constraint if exists planning_category_parent_not_self_check;
alter table public.planning_category
  add constraint planning_category_parent_not_self_check
  check (parent_id is null or parent_id <> id);

create or replace function public.planning_normalize_category_code(p_value text)
returns text
language sql
immutable
strict
as $function$
  select coalesce(
    nullif(upper(trim(both '_' from regexp_replace(btrim(p_value), '[^A-Za-z0-9]+', '_', 'g'))), ''),
    'CAT_' || upper(left(md5(btrim(p_value)), 12))
  )
$function$;

with source_categories as (
  ${sourceCategories}
), root_categories as (
  select account_id, target_type, category_name
  from source_categories
  where category_name is not null
  group by account_id, target_type, category_name
), normalized_roots as (
  select *, public.planning_normalize_category_code(category_name) as base_code
  from root_categories
), ranked_roots as (
  select *, row_number() over (
    partition by account_id, target_type, base_code
    order by category_name
  ) as code_rank
  from normalized_roots
)
insert into public.planning_category (
  account_id, target_type, code, name, status, sort_order, source
)
select account_id, target_type,
       base_code || case when code_rank = 1 then '' else '_' || code_rank::text end,
       category_name, 'active', 0, 'legacy-category-migration'
from ranked_roots
on conflict (account_id, target_type, code) do nothing;

with source_categories as (
  ${sourceCategories}
), child_categories as (
  select account_id, target_type, category_name, subcategory_name
  from source_categories
  where category_name is not null and subcategory_name is not null
  group by account_id, target_type, category_name, subcategory_name
), resolved_children as (
  select source.*, parent.id as parent_id, parent.code as parent_code
  from child_categories source
  join public.planning_category parent
    on parent.account_id = source.account_id
   and parent.target_type = source.target_type
   and parent.parent_id is null
   and parent.name = source.category_name
), normalized_children as (
  select *, parent_code || '_' ||
    public.planning_normalize_category_code(subcategory_name) as base_code
  from resolved_children
), ranked_children as (
  select *, row_number() over (
    partition by account_id, target_type, base_code
    order by parent_id, subcategory_name
  ) as code_rank
  from normalized_children
)
insert into public.planning_category (
  account_id, target_type, code, name, parent_id, status, sort_order, source
)
select account_id, target_type,
       base_code || case when code_rank = 1 then '' else '_' || code_rank::text end,
       subcategory_name, parent_id, 'active', 0, 'legacy-category-migration'
from ranked_children
on conflict (account_id, target_type, code) do nothing;

${CATEGORY_TARGETS.map(([table, targetType]) => `update public.${table} record
set category_id = coalesce(
  (
    select child.id
    from public.planning_category parent
    join public.planning_category child
      on child.account_id = parent.account_id
     and child.target_type = parent.target_type
     and child.parent_id = parent.id
     and child.name = nullif(btrim(record.subcategory), '')
    where parent.account_id = record.account_id
      and parent.target_type = ${sqlString(targetType)}
      and parent.parent_id is null
      and parent.name = nullif(btrim(record.category), '')
    order by child.code
    limit 1
  ),
  (
    select parent.id
    from public.planning_category parent
    where parent.account_id = record.account_id
      and parent.target_type = ${sqlString(targetType)}
      and parent.parent_id is null
      and parent.name = nullif(btrim(record.category), '')
    order by parent.code
    limit 1
  )
)
where record.category_id is null
  and nullif(btrim(record.category), '') is not null;`).join('\n\n')}`;
}

function categoryIntegrityTriggersSql() {
  return `create or replace function public.planning_validate_category_parent()
returns trigger
language plpgsql
as $function$
declare
  parent_category public.planning_category%rowtype;
  cursor_id uuid;
begin
  if new.parent_id is null then return new; end if;

  select * into parent_category
  from public.planning_category
  where account_id = new.account_id and id = new.parent_id;
  if not found or parent_category.target_type <> new.target_type then
    raise exception 'Category parent must use the same account and target type.' using errcode = '23514';
  end if;

  cursor_id := new.parent_id;
  while cursor_id is not null loop
    if cursor_id = new.id then
      raise exception 'Category hierarchy cannot contain a cycle.' using errcode = '23514';
    end if;
    select parent_id into cursor_id
    from public.planning_category
    where account_id = new.account_id and id = cursor_id;
  end loop;
  return new;
end;
$function$;

drop trigger if exists planning_category_parent_guard on public.planning_category;
create trigger planning_category_parent_guard
before insert or update of account_id, target_type, parent_id on public.planning_category
for each row execute function public.planning_validate_category_parent();

create or replace function public.planning_protect_category_change()
returns trigger
language plpgsql
as $function$
begin
  if new.account_id is distinct from old.account_id
     or new.target_type is distinct from old.target_type
  then
    if exists (
      select 1 from public.planning_category child
      where child.account_id = old.account_id and child.parent_id = old.id
    ) or exists (
      select 1 from public.planning_item record
      where record.account_id = old.account_id and record.category_id = old.id
    ) or exists (
      select 1 from public.planning_customer record
      where record.account_id = old.account_id and record.category_id = old.id
    ) or exists (
      select 1 from public.planning_supplier record
      where record.account_id = old.account_id and record.category_id = old.id
    ) then
      raise exception 'A referenced category cannot change account or target type.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists planning_category_change_guard on public.planning_category;
create trigger planning_category_change_guard
before update of account_id, target_type on public.planning_category
for each row execute function public.planning_protect_category_change();

${CATEGORY_TARGETS.map(([table, targetType]) => `create or replace function public.${table}_sync_category()
returns trigger
language plpgsql
as $function$
declare
  selected_category public.planning_category%rowtype;
  root_category public.planning_category%rowtype;
begin
  if new.category_id is null then
    return new;
  end if;

  select * into selected_category
  from public.planning_category
  where account_id = new.account_id and id = new.category_id;
  if not found then
    raise exception 'Category does not belong to this account.' using errcode = '23503';
  end if;
  if selected_category.target_type <> ${sqlString(targetType)} then
    raise exception 'Category target type % cannot be assigned to ${targetType}.', selected_category.target_type using errcode = '23514';
  end if;
  if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and selected_category.status <> 'active' then
    raise exception 'Inactive categories cannot be newly assigned.' using errcode = '23514';
  end if;

  with recursive ancestors(id, parent_id, depth) as (
    select selected_category.id, selected_category.parent_id, 0
    union all
    select parent.id, parent.parent_id, ancestors.depth + 1
    from public.planning_category parent
    join ancestors on ancestors.parent_id = parent.id
    where parent.account_id = new.account_id
      and parent.target_type = selected_category.target_type
  )
  select category.* into root_category
  from ancestors
  join public.planning_category category
    on category.account_id = new.account_id and category.id = ancestors.id
  order by ancestors.depth desc
  limit 1;

  new.category := root_category.name;
  new.subcategory := case
    when root_category.id = selected_category.id then null
    else selected_category.name
  end;
  return new;
end;
$function$;

drop trigger if exists ${table}_category_sync on public.${table};
create trigger ${table}_category_sync
before insert or update of category_id on public.${table}
for each row execute function public.${table}_sync_category();`).join('\n\n')}

${CATEGORY_TARGETS.map(([table]) => `create or replace function public.${table}_clear_category()
returns trigger
language plpgsql
as $function$
begin
  new.category := null;
  new.subcategory := null;
  return new;
end;
$function$;`).join('\n\n')}`;
}

function categoryPostBackfillTriggersSql() {
  return `create or replace function public.planning_resync_category_assignments()
returns trigger
language plpgsql
as $function$
declare
  category_ids uuid[];
begin
  if new.name is not distinct from old.name
     and new.parent_id is not distinct from old.parent_id then
    return new;
  end if;

  with recursive subtree(id) as (
    select new.id
    union all
    select child.id
    from public.planning_category child
    join subtree parent on child.parent_id = parent.id
    where child.account_id = new.account_id
      and child.target_type = new.target_type
  )
  select array_agg(id) into category_ids from subtree;

  if new.target_type = 'item' then
    update public.planning_item record
    set category_id = record.category_id
    where record.account_id = new.account_id
      and record.category_id = any(category_ids);
  elsif new.target_type = 'customer' then
    update public.planning_customer record
    set category_id = record.category_id
    where record.account_id = new.account_id
      and record.category_id = any(category_ids);
  elsif new.target_type = 'supplier' then
    update public.planning_supplier record
    set category_id = record.category_id
    where record.account_id = new.account_id
      and record.category_id = any(category_ids);
  end if;
  return new;
end;
$function$;

drop trigger if exists planning_category_assignment_resync on public.planning_category;
create trigger planning_category_assignment_resync
after update of name, parent_id on public.planning_category
for each row execute function public.planning_resync_category_assignments();

${CATEGORY_TARGETS.map(([table]) => `drop trigger if exists ${table}_category_clear on public.${table};
create trigger ${table}_category_clear
before update of category_id on public.${table}
for each row
when (old.category_id is not null and new.category_id is null)
execute function public.${table}_clear_category();`).join('\n\n')}

${CATEGORY_TARGETS.map(([table]) => `drop trigger if exists ${table}_category_legacy_fields_sync on public.${table};
create trigger ${table}_category_legacy_fields_sync
before update of category, subcategory on public.${table}
for each row
when (new.category_id is not null)
execute function public.${table}_sync_category();`).join('\n\n')}`;
}

function categoryCrudRegistrySql() {
  return CATEGORY_AFFECTED_MODELS.map((model) => {
    const config = buildPlanningDynamicCrudConfig(model);
    return `select public.register_dynamic_crud_resource(
  ${sqlString(model.key)},
  ${sqlString(model.key)},
  encode(digest(convert_to(${sqlString(JSON.stringify(config))}, 'UTF8'), 'sha256'), 'hex'),
  ${jsonSql(config)}
);`;
  }).join('\n\n');
}

function planningEntitySortOrder(model: PlanningModelDefinition) {
  if (model.key === 'planning_category') return 319;
  const categoryIndex = PLANNING_MODEL_DEFINITIONS.findIndex(
    (candidate) => candidate.key === 'planning_category'
  );
  const modelIndex = PLANNING_MODEL_DEFINITIONS.indexOf(model);
  return 320 + modelIndex - (modelIndex > categoryIndex ? 1 : 0);
}

function pagesSql(models?: readonly PlanningModelDefinition[]) {
  const refreshedKeys = new Set([
    'planning_demand',
    'planning_operationplan',
    'planning_operationplanresource',
    'planning_operationplanmaterial',
    'planning_problem',
    'planning_constraint',
    'planning_resourceplan'
  ]);
  const pageModels = models ?? PLANNING_MODEL_DEFINITIONS.filter(
    (model) => !CORE_MODEL_KEYS.has(model.key) || refreshedKeys.has(model.key)
  );
  return pageModels.map((model) => {
    const list = buildPlanningListSchema(model);
    const edit = buildPlanningEditSchema(model);
    const route = list.route;
    const listCode = list.code;
    const editCode = edit.code;
    return `insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive, schema, version, published_at
) values
  (${sqlString(listCode)}, ${sqlString(route)}, ${sqlString(model.title)}, ${sqlString(model.description)}, 'list', 'dashboard', 'published', true, ${jsonSql(list)}, 1, timezone('utc'::text, now())),
  (${sqlString(editCode)}, ${sqlString(`${route}/edit`)}, ${sqlString(`${model.title}编辑`)}, ${sqlString(model.description)}, 'edit', 'dashboard', 'published', false, ${jsonSql(edit)}, 1, timezone('utc'::text, now()))
on conflict (code) do update set
  route = excluded.route,
  title = excluded.title,
  description = excluded.description,
  page_type = excluded.page_type,
  layout = excluded.layout,
  status = excluded.status,
  keep_alive = excluded.keep_alive,
  schema = excluded.schema,
  version = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.page_type is distinct from excluded.page_type
      or public.lowcode_pages.layout is distinct from excluded.layout
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then public.lowcode_pages.version + 1
    else public.lowcode_pages.version
  end,
  published_at = case
    when public.lowcode_pages.schema is distinct from excluded.schema
    then excluded.published_at
    else public.lowcode_pages.published_at
  end,
  updated_at = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.page_type is distinct from excluded.page_type
      or public.lowcode_pages.layout is distinct from excluded.layout
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then timezone('utc'::text, now())
    else public.lowcode_pages.updated_at
  end;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in (${sqlString(listCode)}, ${sqlString(editCode)})
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = ${sqlString(listCode)}
  and edit_page.code = ${sqlString(editCode)}
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  ${sqlString(model.key)}, ${sqlString(model.title)}, ${sqlString(`public.${model.key}`)},
  ${sqlString(route)}, ${sqlString(listCode)}, ${sqlString(model.icon)}, ${sqlString(model.description)},
  'id', 'active', ${planningEntitySortOrder(model)}, ${jsonSql({
    sourceTable: model.sourceTable,
    freppleModel: model.key.replace(/^planning_/, ''),
    service: 'planning',
    listMethod: 'listItems',
    saveMethod: 'saveItem',
    deleteMethod: 'deleteItem',
    accountScoped: true,
    fields: model.fields
  })}
)
on conflict (code) do update set
  title = excluded.title,
  table_name = excluded.table_name,
  route_path = excluded.route_path,
  page_code = excluded.page_code,
  icon = excluded.icon,
  description = excluded.description,
  primary_key = excluded.primary_key,
  status = excluded.status,
  sort_order = excluded.sort_order,
  schema = excluded.schema,
  updated_at = timezone('utc'::text, now());`;
  }).join('\n\n');
}

function routesSql() {
  const groups = [...new Set(PLANNING_MODEL_DEFINITIONS.map((model) => model.group))];
  const groupCodes = new Map(groups.map((group) => [group, `planning-${groups.indexOf(group) + 1}`]));
  const routeRows = PLANNING_MODEL_DEFINITIONS.map((model, index) => `(
    ${sqlString(`planning-${model.sourceTable.replace(/_/g, '-')}`)}, ${sqlString(model.title)},
    ${sqlString(`/dashboard/planning/${model.sourceTable.replace(/_/g, '-')}`)},
    (select id from public.admin_routes where code = ${sqlString(groupCodes.get(model.group)!)}),
    'page', ${sqlString(model.icon)}, ${sqlString(`${model.key}-list`)}, 'planning.models.view',
    true, true, 'dashboard', 'active', ${(index + 1) * 10},
    ${jsonSql({ module: 'planning', group: model.group, sourceTable: model.sourceTable })}
  )`).join(',\n');

  const groupUpserts = groups.map((group, index) => `insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
)
select
  ${sqlString(groupCodes.get(group)!)}, ${sqlString(group)}, ${sqlString(`/dashboard/planning/${index + 1}`)}, root.id,
  'group', ${sqlString([
    'ri-database-2-line', 'ri-truck-line', 'ri-settings-3-line', 'ri-file-list-3-line', 'ri-line-chart-line',
    'ri-equalizer-2-line', 'ri-line-chart-line', 'ri-error-warning-line', 'ri-play-circle-line',
    'ri-git-branch-line', 'ri-calendar-2-line', 'ri-list-settings-line', 'ri-archive-line'
  ][index] ?? 'ri-folder-line')},
  null, 'planning.models.view', true, true, 'dashboard', 'active', ${(index + 1) * 10},
  '{"module":"planning"}'::jsonb
from public.admin_routes root
where root.code = 'planning-root'
on conflict (code) do update set
  title = excluded.title,
  path = excluded.path,
  parent_id = excluded.parent_id,
  route_type = excluded.route_type,
  icon = excluded.icon,
  page_code = excluded.page_code,
  permission_code = excluded.permission_code,
  visible = excluded.visible,
  keep_alive = excluded.keep_alive,
  layout = excluded.layout,
  status = excluded.status,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());`).join('\n\n');

  return `insert into public.admin_routes (
  code, title, path, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
) values (
  'planning-root', '排产管理', '/dashboard/planning', 'group', 'ri-calendar-schedule-line', null,
  'planning.models.view', true, true, 'dashboard', 'active', 40,
  '{"navigation":"sidebar","module":"planning"}'::jsonb
)
on conflict (code) do update set
  title = excluded.title,
  path = excluded.path,
  route_type = excluded.route_type,
  icon = excluded.icon,
  page_code = excluded.page_code,
  permission_code = excluded.permission_code,
  visible = excluded.visible,
  keep_alive = excluded.keep_alive,
  layout = excluded.layout,
  status = excluded.status,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

${groupUpserts}

insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
) values
${routeRows}
on conflict (code) do update set
  title = excluded.title,
  path = excluded.path,
  parent_id = excluded.parent_id,
  route_type = excluded.route_type,
  icon = excluded.icon,
  page_code = excluded.page_code,
  permission_code = excluded.permission_code,
  visible = excluded.visible,
  keep_alive = excluded.keep_alive,
  layout = excluded.layout,
  status = excluded.status,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());`;
}

function reconcileObsoleteRoutesSql() {
  const activeGroupCodes = new Set(
    [...new Set(PLANNING_MODEL_DEFINITIONS.map((model) => model.group))]
      .map((_group, index) => `planning-${index + 1}`)
  );
  const activeRouteCodes = new Set([
    'planning-root',
    'planning-console',
    'planning-routing-view',
    'planning-bom-view',
    ...activeGroupCodes,
    ...PLANNING_MODEL_DEFINITIONS.map((model) => `planning-${model.sourceTable.replace(/_/g, '-')}`)
  ]);
  return `update public.admin_routes
set status = 'inactive', visible = false, updated_at = timezone('utc'::text, now())
where (code = 'planning-root' or code like 'planning-%')
  and code not in (${[...activeRouteCodes].map(sqlString).join(', ')});`;
}

export function buildPlanningRoutesSql() {
  return [routesSql(), reconcileObsoleteRoutesSql()].join('\n\n');
}

function categoryRouteSql() {
  const model = CATEGORY_MODEL;
  const routeCode = `planning-${model.sourceTable.replace(/_/g, '-')}`;
  const routePath = `/dashboard/planning/${model.sourceTable.replace(/_/g, '-')}`;
  return `insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
)
select
  ${sqlString(routeCode)}, ${sqlString(model.title)}, ${sqlString(routePath)}, parent.id,
  'page', ${sqlString(model.icon)}, ${sqlString(`${model.key}-list`)}, 'planning.models.view',
  true, true, 'dashboard', 'active', 35,
  ${jsonSql({ module: 'planning', group: model.group, sourceTable: model.sourceTable })}
from public.admin_routes parent
where parent.code = 'planning-1'
on conflict (code) do update set
  title = excluded.title,
  path = excluded.path,
  parent_id = excluded.parent_id,
  route_type = excluded.route_type,
  icon = excluded.icon,
  page_code = excluded.page_code,
  permission_code = excluded.permission_code,
  visible = excluded.visible,
  keep_alive = excluded.keep_alive,
  layout = excluded.layout,
  status = excluded.status,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());`;
}

function categoryCommentsSql() {
  const assignmentTableComments: Record<string, [string, string]> = {
    planning_item: [
      '计划物料',
      '维护原料、半成品和成品的成本、单位、层级、统一类别及需求特征，是供需计划的物料主数据。'
    ],
    planning_customer: [
      '计划客户',
      '维护计划需求和预测引用的客户主数据、层级及统一类别，用于客户维度的供需分析。'
    ],
    planning_supplier: [
      '计划供应商',
      '维护采购来源、供应商层级、统一类别和可用日历，为物料供应规则和采购计划提供主数据。'
    ]
  };
  const tableMetadata = {
    planning_category: [
      '主数据类别',
      '统一维护物料、客户和供应商的账套级层级类别；类别用于归类、筛选和分析，不直接改变排产约束。'
    ],
    ...assignmentTableComments
  };
  const tableComments = `do $comments$
declare
  table_metadata jsonb := ${jsonSql(tableMetadata)};
  table_name text;
  metadata jsonb;
  relations jsonb;
begin
  foreach table_name in array array[
    'planning_category', 'planning_item', 'planning_customer', 'planning_supplier'
  ] loop
    metadata := table_metadata -> table_name;
    select coalesce(jsonb_agg(relation order by relation->>'table', relation->>'type'), '[]'::jsonb)
    into relations
    from (
      select jsonb_build_object(
        'table', related_namespace.nspname || '.' || related_table.relname,
        'type', 'references',
        'localColumns', (
          select jsonb_agg(local_attribute.attname order by local_key.ordinality)
          from unnest(constraint_meta.conkey) with ordinality local_key(attnum, ordinality)
          join pg_attribute local_attribute
            on local_attribute.attrelid = constraint_meta.conrelid
           and local_attribute.attnum = local_key.attnum
        ),
        'relatedColumns', (
          select jsonb_agg(related_attribute.attname order by related_key.ordinality)
          from unnest(constraint_meta.confkey) with ordinality related_key(attnum, ordinality)
          join pg_attribute related_attribute
            on related_attribute.attrelid = constraint_meta.confrelid
           and related_attribute.attnum = related_key.attnum
        ),
        'constraint', constraint_meta.conname,
        'onDelete', case constraint_meta.confdeltype
          when 'c' then 'CASCADE' when 'r' then 'RESTRICT' when 'n' then 'SET NULL'
          when 'd' then 'SET DEFAULT' else 'NO ACTION'
        end
      ) as relation
      from pg_constraint constraint_meta
      join pg_class related_table on related_table.oid = constraint_meta.confrelid
      join pg_namespace related_namespace on related_namespace.oid = related_table.relnamespace
      where constraint_meta.contype = 'f'
        and constraint_meta.conrelid = ('public.' || table_name)::regclass

      union all

      select jsonb_build_object(
        'table', related_namespace.nspname || '.' || related_table.relname,
        'type', 'referenced_by',
        'localColumns', (
          select jsonb_agg(local_attribute.attname order by local_key.ordinality)
          from unnest(constraint_meta.confkey) with ordinality local_key(attnum, ordinality)
          join pg_attribute local_attribute
            on local_attribute.attrelid = constraint_meta.confrelid
           and local_attribute.attnum = local_key.attnum
        ),
        'relatedColumns', (
          select jsonb_agg(related_attribute.attname order by related_key.ordinality)
          from unnest(constraint_meta.conkey) with ordinality related_key(attnum, ordinality)
          join pg_attribute related_attribute
            on related_attribute.attrelid = constraint_meta.conrelid
           and related_attribute.attnum = related_key.attnum
        ),
        'constraint', constraint_meta.conname,
        'onDelete', case constraint_meta.confdeltype
          when 'c' then 'CASCADE' when 'r' then 'RESTRICT' when 'n' then 'SET NULL'
          when 'd' then 'SET DEFAULT' else 'NO ACTION'
        end
      ) as relation
      from pg_constraint constraint_meta
      join pg_class related_table on related_table.oid = constraint_meta.conrelid
      join pg_namespace related_namespace on related_namespace.oid = related_table.relnamespace
      where constraint_meta.contype = 'f'
        and constraint_meta.confrelid = ('public.' || table_name)::regclass
    ) relation_rows;

    execute format(
      'comment on table public.%I is %L',
      table_name,
      json_build_object(
        'title', metadata ->> 0,
        'description', metadata ->> 1,
        'relation', relations
      )::text
    );
  end loop;
end
$comments$;`;
  const columnComments: Array<[string, string, string, string, string]> = [
    ['planning_category', 'target_type', '类别对象', 'text', '标识类别适用于物料、客户或供应商。'],
    ['planning_category', 'code', '类别编码', 'text', '类别在账套和对象类型内的稳定唯一编码。'],
    ['planning_category', 'name', '类别名称', 'text', '类别的业务显示名称。'],
    ['planning_category', 'parent_id', '上级类别', 'text', '关联同账套、同对象类型的上级类别。'],
    ['planning_category', 'description', '说明', 'text', '类别的业务用途说明。'],
    ['planning_category', 'status', '状态', 'enum', '控制类别是否允许被新分配。'],
    ['planning_category', 'sort_order', '排序', 'number', '同级类别的显示顺序。'],
    ['planning_category', 'metadata', '扩展信息', 'json', '以 JSON 结构保存类别扩展信息。'],
    ['planning_category', 'source', '数据来源', 'text', '记录类别的数据来源。'],
    ['planning_category', 'lastmodified', '最后修改', 'datetime', '记录类别最后修改时间。'],
    ...CATEGORY_TARGETS.map(([table]) => [
      table, 'category_id', '类别', 'text', '关联统一主数据类别表中的类别。'
    ] as [string, string, string, string, string])
  ];
  const commonCategoryColumns: Array<[string, string, string, string]> = [
    ['id', '主键', 'text', '当前类别记录的唯一标识。'],
    ['account_id', '账套', 'text', '类别所属账套的唯一标识。'],
    ['created_by', '创建人', 'text', '创建类别记录的用户。'],
    ['updated_by', '更新人', 'text', '最后更新类别记录的用户。'],
    ['created_at', '创建时间', 'datetime', '类别记录的创建时间。'],
    ['updated_at', '更新时间', 'datetime', '类别记录的更新时间。']
  ];
  const comments = [
    ...columnComments,
    ...commonCategoryColumns.map(([column, title, type, description]) => [
      'planning_category', column, title, type, description
    ] as [string, string, string, string, string])
  ].map(([table, column, title, type, description]) =>
    `comment on column public.${table}.${column} is ${sqlString(JSON.stringify({
      title,
      type,
      align: type === 'number' ? 'right' : type === 'datetime' || type === 'enum' ? 'center' : 'left',
      description
    }))};`
  );
  return [tableComments, ...comments].join('\n\n');
}

export function buildPlanningCategoryMigrationSql() {
  const header = `-- Unified master-data categories for planning.
-- Scope: planning_category plus category assignments for items, customers and suppliers.

begin;`;
  return [
    header,
    tableSql(CATEGORY_MODEL),
    categoryColumnsSql(),
    categoryForeignKeysSql(),
    categoryPoliciesAndAuditSql(),
    categoryIntegrityTriggersSql(),
    categoryLegacyBackfillSql(),
    'set constraints all immediate;',
    categoryPostBackfillTriggersSql(),
    categoryCrudRegistrySql(),
    pagesSql(CATEGORY_AFFECTED_MODELS),
    categoryRouteSql(),
    categoryCommentsSql(),
    "select pg_notify('pgrst', 'reload schema');",
    'commit;'
  ].join('\n\n');
}

export async function generatePlanningMigration() {
  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const target = resolve(repoRoot, MIGRATION_FILE);
  const sql = buildPlanningCategoryMigrationSql();
  await writeFile(target, sql, 'utf8');
  console.log(JSON.stringify({
    target,
    totalModels: PLANNING_MODEL_DEFINITIONS.length,
    categoryModels: CATEGORY_AFFECTED_MODELS.length,
    bytes: Buffer.byteLength(sql)
  }));
}

if (require.main === module) {
  void generatePlanningMigration();
}
