import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  PLANNING_MODEL_BY_KEY,
  PLANNING_MODEL_DEFINITIONS,
  type PlanningFieldDefinition,
  type PlanningModelDefinition
} from '../src/planning-service/planning.models';

const MIGRATION_FILE = 'supabase/migrations/20260808160000_planning_extended_models.sql';

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

const uniqueConstraints: Record<string, string[][]> = {
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
    ...(model.businessKey ? [`  unique (account_id, ${sqlIdentifier(model.businessKey)})`] : []),
    ...(uniqueConstraints[model.key] ?? []).map((fields) => `  unique (account_id, ${fields.map(sqlIdentifier).join(', ')})`)
  ];

  return `create table if not exists public.${model.key} (\n${columns.join(',\n')}\n);`;
}

function foreignKeySql(model: PlanningModelDefinition) {
  return model.fields
    .filter((field) => field.kind === 'relation' && field.relation)
    .map((field) => {
      const target = PLANNING_MODEL_BY_KEY.get(field.relation!);
      if (!target) throw new Error(`Unknown relation target: ${field.relation}`);
      const constraint = `${model.key}_${field.name}_account_fk`;
      const onDelete = model.key === 'planning_operationplanmaterial' || model.key === 'planning_operationplanresource'
        ? 'cascade'
        : field.required
          ? 'restrict'
          : 'set null';
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
  const target = field.relation ? PLANNING_MODEL_BY_KEY.get(field.relation) : undefined;
  return target?.businessKey ?? 'id';
}

function relationSourceKey(field: PlanningFieldDefinition) {
  return field.relation ? `${field.relation}Options` : '';
}

function formField(field: PlanningFieldDefinition) {
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
    result.optionsSourceKey = relationSourceKey(field);
    result.optionProps = { label: 'label', value: 'id' };
  }
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
            labelField: relationLabelField(field)
          },
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
    ['name', 'reference', 'description', 'category', 'status', 'type'].includes(field.name)
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
              fields: model.fields.map(formField),
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
  return new;
end;
$function$;

drop trigger if exists planning_workflow_run_bridge on public.wf_job_run;
create trigger planning_workflow_run_bridge
after insert or update of status, started_at, finished_at, error_message, trigger_run_id
on public.wf_job_run
for each row execute function public.planning_sync_workflow_run();`;
}

function dynamicCrudConfig(model: PlanningModelDefinition) {
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
    create: actionConfig(writable, required, managedCreate),
    update: actionConfig(writable, [], managedUpdate),
    delete: {
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
    const config = dynamicCrudConfig(model);
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
      `create policy "Planning managers can insert ${model.key}" on public.${model.key}\n  for insert to authenticated\n  with check (public.has_account_permission(account_id, 'planning.models.manage'));`,
      `drop policy if exists "Planning managers can update ${model.key}" on public.${model.key};`,
      `create policy "Planning managers can update ${model.key}" on public.${model.key}\n  for update to authenticated\n  using (public.has_account_permission(account_id, 'planning.models.manage'))\n  with check (public.has_account_permission(account_id, 'planning.models.manage'));`,
      `drop policy if exists "Planning managers can delete ${model.key}" on public.${model.key};`,
      `create policy "Planning managers can delete ${model.key}" on public.${model.key}\n  for delete to authenticated\n  using (public.has_account_permission(account_id, 'planning.models.manage'));`,
      `grant select, insert, update, delete on public.${model.key} to authenticated, service_role;`,
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

function seedExtendedPlanningDataSql() {
  const parameters = [
    ['currentdate', 'now', 'Current date of the plan. Use now or a date-time value.'],
    ['last_currentdate', '', 'Date of the last completed plan execution.'],
    ['plan.administrativeLeadtime', '0', 'Administrative lead time in days.'],
    ['plan.minimumdelay', '3600', 'Minimum delivery-date increment in seconds.'],
    ['plan.loglevel', '0', 'Planning log verbosity.'],
    ['plan.rotateResources', 'true', 'Distribute demand across alternate resources.'],
    ['plan.individualPoolResources', 'false', 'Interpret pool quantities as individual members.'],
    ['plan.move_approved_early', '0', 'Controls early rescheduling of approved orders.'],
    ['plan.autoFenceOperations', '999', 'Days to wait for confirmed replenishment.'],
    ['plan.deliveryDuration', '0', 'Final shipment duration in working hours.'],
    ['plan.fixBrokenSupplyPath', 'true', 'Create fallback sourcing for broken supply paths.'],
    ['plan.solver', 'heuristic', 'Solver selection: heuristic or heuristic_2.'],
    ['plan.iterationmax', '0', 'Maximum solver iterations.'],
    ['plan.resourceiterationmax', '500', 'Maximum resource-search iterations.'],
    ['forecast.calendar', 'month', 'Forecast bucket calendar.'],
    ['forecast.Horizon_future', '365', 'Forecast future horizon in days.'],
    ['forecast.Horizon_history', '1095', 'Forecast history horizon in days.'],
    ['forecast.populateForecastTable', 'true', 'Populate missing forecast combinations.'],
    ['forecast.runnetting', 'true', 'Net sales orders against forecast.']
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

function pagesSql() {
  return EXTENDED_MODEL_DEFINITIONS.map((model, index) => {
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

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = ${sqlString(listCode)}
  and edit_page.code = ${sqlString(editCode)}
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in (${sqlString(listCode)}, ${sqlString(editCode)})
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  ${sqlString(model.key)}, ${sqlString(model.title)}, ${sqlString(`public.${model.key}`)},
  ${sqlString(route)}, ${sqlString(listCode)}, ${sqlString(model.icon)}, ${sqlString(model.description)},
  'id', 'active', ${320 + index}, ${jsonSql({
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

export function buildPlanningRoutesSql() {
  return routesSql();
}

function migrationSql() {
  const header = `-- frePPLe-compatible planning data service for enLearn.
-- Scope: extended configuration, forecast, diagnostic, execution, scenario,
-- time-bucket, attribute and archive models. The C++ solver remains external.

begin;`;
  const tables = EXTENDED_MODEL_DEFINITIONS.map(tableSql).join('\n\n');
  const foreignKeys = EXTENDED_MODEL_DEFINITIONS.map(foreignKeySql).filter(Boolean).join('\n\n');
  return [
    header,
    permissionsSql(),
    tables,
    foreignKeys,
    commonFunctionsSql(),
    policiesAndTriggersSql(),
    extendedConstraintsSql(),
    workflowPlanningBridgeSql(),
    seedExtendedPlanningDataSql(),
    dynamicCrudRegistrySql(),
    pagesSql(),
    routesSql(),
    "select pg_notify('pgrst', 'reload schema');",
    'commit;',
    ''
  ].join('\n\n');
}

export async function generatePlanningMigration() {
  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const target = resolve(repoRoot, MIGRATION_FILE);
  const sql = migrationSql();
  await writeFile(target, sql, 'utf8');
  console.log(JSON.stringify({
    target,
    totalModels: PLANNING_MODEL_DEFINITIONS.length,
    extendedModels: EXTENDED_MODEL_DEFINITIONS.length,
    bytes: Buffer.byteLength(sql)
  }));
}

if (require.main === module) {
  void generatePlanningMigration();
}
