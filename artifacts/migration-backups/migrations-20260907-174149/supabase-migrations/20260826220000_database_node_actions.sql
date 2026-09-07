-- Make the database the only source of low-code node action definitions and implementations.

begin;

create table if not exists public.lowcode_node_actions (
  id uuid primary key default gen_random_uuid(),
  node_type text not null,
  node_label text not null,
  node_icon text not null default 'ri-box-3-line',
  action_code text not null,
  label text not null,
  description text not null default '',
  source_code text not null,
  parameters jsonb not null default '[]'::jsonb,
  returns text not null default '',
  insert_text_template text not null default '',
  applicable_when jsonb not null default '{}'::jsonb,
  is_data_source_loader boolean not null default false,
  enabled boolean not null default true,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  limits jsonb not null default '{"timeoutMs":5000,"maxApiCalls":100,"maxPayloadBytes":26214400}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint lowcode_node_actions_identity_unique unique (node_type, action_code),
  constraint lowcode_node_actions_node_type_check
    check (node_type ~ '^[A-Za-z][A-Za-z0-9]*$'),
  constraint lowcode_node_actions_action_code_check
    check (action_code ~ '^[A-Za-z_$][A-Za-z0-9_$]*$'),
  constraint lowcode_node_actions_source_code_check
    check (length(btrim(source_code)) > 0),
  constraint lowcode_node_actions_parameters_check
    check (jsonb_typeof(parameters) = 'array'),
  constraint lowcode_node_actions_applicable_when_check
    check (jsonb_typeof(applicable_when) = 'object'),
  constraint lowcode_node_actions_limits_check
    check (jsonb_typeof(limits) = 'object')
);

drop trigger if exists set_lowcode_node_actions_updated_at
  on public.lowcode_node_actions;
create trigger set_lowcode_node_actions_updated_at
before update on public.lowcode_node_actions
for each row execute function public.set_updated_at();

alter table public.lowcode_node_actions enable row level security;

drop policy if exists "Permission holders can manage low-code node actions"
  on public.lowcode_node_actions;
create policy "Permission holders can manage low-code node actions"
on public.lowcode_node_actions for all to authenticated
using (public.has_app_permission('lowcode.pages.manage'))
with check (public.has_app_permission('lowcode.pages.manage'));

drop policy if exists "Authenticated users can read enabled low-code node actions"
  on public.lowcode_node_actions;
create policy "Authenticated users can read enabled low-code node actions"
on public.lowcode_node_actions for select to authenticated
using (enabled);

grant select, insert, update, delete
  on public.lowcode_node_actions to authenticated, service_role;

-- The old option sources duplicated action metadata and are no longer used.
delete from public.system_option_items
where source_code in (
  'lowcode_node_action_method',
  'lowcode_node_action_form_method',
  'lowcode_node_action_search_form_method',
  'lowcode_node_action_grid_method',
  'lowcode_node_action_modal_method',
  'lowcode_node_action_drawer_method'
);
delete from public.system_option_sources
where code in (
  'lowcode_node_action_method',
  'lowcode_node_action_form_method',
  'lowcode_node_action_search_form_method',
  'lowcode_node_action_grid_method',
  'lowcode_node_action_modal_method',
  'lowcode_node_action_drawer_method'
);

insert into public.lowcode_node_actions (
  node_type, node_label, node_icon, action_code, label, description,
  source_code, parameters, returns, insert_text_template,
  applicable_when, is_data_source_loader, enabled, is_system, sort_order
)
select
  node_type, node_label, node_icon,
  'setData',
  case when node_type = 'searchForm' then '设置查询条件' else '设置表单数据' end,
  '合并或完整替换当前节点的数据。',
  $action$
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
async function main() {
  const action = this.event.payload.nodeAction;
  const data = action.options.data;
  if (!isRecord(data)) throw new Error('表单 setData 的 data 必须是对象。');
  const command = action.options.mode === 'replace' ? 'form.replace' : 'form.patch';
  return await this.$node.call(command, { values: clone(data) });
}
  $action$,
  '[{"name":"data","type":"object","required":true,"description":"需要写入的字段和值。"},{"name":"mode","type":"\"merge\" | \"replace\"","description":"默认 merge；replace 完整替换。"}]'::jsonb,
  '返回更新后的完整数据对象。',
  'await this.executeAction({\n  node: {{nodeId}},\n  method: "setData",\n  data: {},\n  mode: "merge",\n});',
  '{}'::jsonb, false, true, true, 20
from (values
  ('form', '表单', 'ri-survey-line'),
  ('searchForm', '查询表单', 'ri-filter-3-line')
) as nodes(node_type, node_label, node_icon)
on conflict (node_type, action_code) do update set
  node_label = excluded.node_label,
  node_icon = excluded.node_icon,
  label = excluded.label,
  description = excluded.description,
  source_code = excluded.source_code,
  parameters = excluded.parameters,
  returns = excluded.returns,
  insert_text_template = excluded.insert_text_template,
  applicable_when = excluded.applicable_when,
  is_data_source_loader = excluded.is_data_source_loader,
  enabled = excluded.enabled,
  is_system = excluded.is_system,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc'::text, now());

insert into public.lowcode_node_actions (
  node_type, node_label, node_icon, action_code, label, description,
  source_code, parameters, returns, insert_text_template,
  applicable_when, is_data_source_loader, enabled, is_system, sort_order
)
select
  node_type, node_label, node_icon,
  'validate',
  case when node_type = 'searchForm' then '校验查询条件' else '校验表单数据' end,
  '执行当前表单节点的字段规则校验。',
  $action$
async function main() {
  return await this.$node.call('form.validate');
}
  $action$,
  '[]'::jsonb,
  '校验通过返回 true，否则返回 false。',
  'const valid = await this.executeAction({\n  node: {{nodeId}},\n  method: "validate",\n});',
  '{}'::jsonb, false, true, true, 30
from (values
  ('form', '表单', 'ri-survey-line'),
  ('searchForm', '查询表单', 'ri-filter-3-line')
) as nodes(node_type, node_label, node_icon)
on conflict (node_type, action_code) do update set
  label = excluded.label, description = excluded.description,
  source_code = excluded.source_code, parameters = excluded.parameters,
  returns = excluded.returns, insert_text_template = excluded.insert_text_template,
  applicable_when = excluded.applicable_when,
  is_data_source_loader = excluded.is_data_source_loader,
  enabled = excluded.enabled, is_system = excluded.is_system,
  sort_order = excluded.sort_order, updated_at = timezone('utc'::text, now());

insert into public.lowcode_node_actions (
  node_type, node_label, node_icon, action_code, label, description,
  source_code, parameters, returns, insert_text_template,
  applicable_when, is_data_source_loader, enabled, is_system, sort_order
)
select
  node_type, node_label, node_icon,
  'getData',
  case when node_type = 'searchForm' then '获取查询条件' else '获取绑定数据' end,
  '获取当前表单节点的数据快照。',
  $action$
async function main() {
  return await this.$node.call('form.get');
}
  $action$,
  '[]'::jsonb,
  '返回当前节点数据的深拷贝。',
  'const data = await this.executeAction({\n  node: {{nodeId}},\n  method: "getData",\n});',
  '{}'::jsonb, false, true, true, 40
from (values
  ('form', '表单', 'ri-survey-line'),
  ('searchForm', '查询表单', 'ri-filter-3-line')
) as nodes(node_type, node_label, node_icon)
on conflict (node_type, action_code) do update set
  label = excluded.label, description = excluded.description,
  source_code = excluded.source_code, parameters = excluded.parameters,
  returns = excluded.returns, insert_text_template = excluded.insert_text_template,
  applicable_when = excluded.applicable_when,
  is_data_source_loader = excluded.is_data_source_loader,
  enabled = excluded.enabled, is_system = excluded.is_system,
  sort_order = excluded.sort_order, updated_at = timezone('utc'::text, now());

insert into public.lowcode_node_actions (
  node_type, node_label, node_icon, action_code, label, description,
  source_code, parameters, returns, insert_text_template,
  applicable_when, is_data_source_loader, enabled, is_system, sort_order
)
select
  node_type, node_label, node_icon,
  'refreshOptions', '刷新下拉数据',
  '重新请求当前表单节点字段绑定的下拉数据。',
  $action$
function readList(options, name) {
  if (!Object.prototype.hasOwnProperty.call(options, name)) return undefined;
  if (!Array.isArray(options[name])) {
    throw new Error(`表单 refreshOptions 的 ${name} 必须是字符串数组。`);
  }
  return [...new Set(options[name].map((item) =>
    typeof item === 'string' ? item.trim() : '').filter(Boolean))];
}
async function main() {
  const options = this.event.payload.nodeAction.options;
  const codes = readList(options, 'codes');
  const sourceKeys = readList(options, 'sourceKeys');
  return await this.$node.call('form.refreshOptions', {
    options: {
      ...(codes !== undefined ? { codes } : {}),
      ...(sourceKeys !== undefined ? { sourceKeys } : {}),
    },
  });
}
  $action$,
  '[{"name":"codes","type":"string[]","description":"需要刷新的 optionsCode。"},{"name":"sourceKeys","type":"string[]","description":"需要刷新的数据源键。"}]'::jsonb,
  '返回已刷新的 codes 和 sourceKeys。',
  'await this.executeAction({\n  node: {{nodeId}},\n  method: "refreshOptions",\n});',
  '{}'::jsonb, false, true, true, 50
from (values
  ('form', '表单', 'ri-survey-line'),
  ('searchForm', '查询表单', 'ri-filter-3-line')
) as nodes(node_type, node_label, node_icon)
on conflict (node_type, action_code) do update set
  label = excluded.label, description = excluded.description,
  source_code = excluded.source_code, parameters = excluded.parameters,
  returns = excluded.returns, insert_text_template = excluded.insert_text_template,
  applicable_when = excluded.applicable_when,
  is_data_source_loader = excluded.is_data_source_loader,
  enabled = excluded.enabled, is_system = excluded.is_system,
  sort_order = excluded.sort_order, updated_at = timezone('utc'::text, now());

insert into public.lowcode_node_actions (
  node_type, node_label, node_icon, action_code, label, description,
  source_code, parameters, returns, insert_text_template,
  applicable_when, is_data_source_loader, enabled, is_system, sort_order
)
select
  node_type, node_label, node_icon,
  'resetData', '重置表单数据',
  '恢复最近一次页面加载完成时的数据并清除校验状态。',
  $action$
async function main() {
  const baseline = await this.$node.call('form.baseline');
  const values = await this.$node.call('form.replace', { values: baseline });
  await this.$node.call('form.clearValidation');
  return values;
}
  $action$,
  '[]'::jsonb,
  '返回重置后的完整数据。',
  'const data = await this.executeAction({\n  node: {{nodeId}},\n  method: "resetData",\n});',
  '{}'::jsonb, false, true, true, 60
from (values
  ('form', '表单', 'ri-survey-line'),
  ('searchForm', '查询表单', 'ri-filter-3-line')
) as nodes(node_type, node_label, node_icon)
on conflict (node_type, action_code) do update set
  label = excluded.label, description = excluded.description,
  source_code = excluded.source_code, parameters = excluded.parameters,
  returns = excluded.returns, insert_text_template = excluded.insert_text_template,
  applicable_when = excluded.applicable_when,
  is_data_source_loader = excluded.is_data_source_loader,
  enabled = excluded.enabled, is_system = excluded.is_system,
  sort_order = excluded.sort_order, updated_at = timezone('utc'::text, now());

insert into public.lowcode_node_actions (
  node_type, node_label, node_icon, action_code, label, description,
  source_code, parameters, returns, insert_text_template,
  applicable_when, is_data_source_loader, enabled, is_system, sort_order
) values (
  'form', '表单', 'ri-survey-line', 'loadData', '获取编辑数据',
  '编辑表单从绑定数据源获取一条记录并加载关联明细表。',
  $action$
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function readString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function firstRecord(value) {
  if (Array.isArray(value)) return value.find(isRecord);
  if (!isRecord(value)) return undefined;
  for (const key of ['rows', 'items', 'records', 'data', 'result']) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const record = firstRecord(value[key]);
      if (record) return record;
    }
  }
  return value;
}
async function main() {
  const action = this.event.payload.nodeAction;
  const { block, options, blocks, dataSources } = action;
  const sourceKey = readString(block.sourceKey, readString(block.submitSourceKey, block.id));
  const source = dataSources[sourceKey];
  if (!source) throw new Error(`编辑表单 "${block.id}" 的数据源 "${sourceKey}" 不可用。`);
  const configured = isRecord(source.postData) ? source.postData : {};
  const supplied = isRecord(options.postData) ? options.postData : {};
  const filters = {
    ...(isRecord(configured.filters) ? configured.filters : {}),
    ...(isRecord(supplied.filters) ? supplied.filters : {}),
    ...(isRecord(options.filters) ? options.filters : {}),
  };
  const postData = {
    ...configured,
    ...supplied,
    ...(Object.keys(filters).length ? { filters } : {}),
    limit: 1,
  };
  const version = await this.$node.call('source.begin', { sourceKey });
  try {
    const value = await this.$node.call('source.invoke', { sourceKey, postData });
    if (!(await this.$node.call('source.isCurrent', { sourceKey, version }))) return null;
    await this.$node.call('source.set', {
      sourceKey,
      value,
      resetGridBaseline: true,
    });
    const record = firstRecord(value);
    if (record) {
      const current = await this.$node.call('form.get');
      await this.$node.call('form.replace', { values: { ...current, ...record } });
    }
    for (const grid of blocks.filter((candidate) =>
      candidate.kind === 'grid' && candidate.tableType === 'detail')) {
      await this.executeAction({ node: grid.id, method: 'loadData' });
    }
    return record ?? null;
  } finally {
    await this.$node.call('source.finish', { sourceKey, version });
  }
}
  $action$,
  '[{"name":"filters","type":"object","description":"附加过滤条件。"},{"name":"postData","type":"object","description":"附加请求参数。"}]'::jsonb,
  '返回第一条记录；没有匹配记录时返回 null。',
  'const data = await this.executeAction({\n  node: {{nodeId}},\n  method: "loadData",\n});',
  '{"formType":["edit"]}'::jsonb, true, true, true, 10
)
on conflict (node_type, action_code) do update set
  label = excluded.label, description = excluded.description,
  source_code = excluded.source_code, parameters = excluded.parameters,
  returns = excluded.returns, insert_text_template = excluded.insert_text_template,
  applicable_when = excluded.applicable_when,
  is_data_source_loader = excluded.is_data_source_loader,
  enabled = excluded.enabled, is_system = excluded.is_system,
  sort_order = excluded.sort_order, updated_at = timezone('utc'::text, now());

insert into public.lowcode_node_actions (
  node_type, node_label, node_icon, action_code, label, description,
  source_code, parameters, returns, insert_text_template,
  applicable_when, is_data_source_loader, enabled, is_system, sort_order
) values (
  'grid', '表格', 'ri-table-2', 'loadData', '获取表格数据',
  '主表使用查询条件；明细表根据主表当前行构建受保护的关联条件。',
  $action$
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function readString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function readList(value) {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean)
    : [];
}
function hasValue(value) {
  if (value === undefined || value === null || value === '' || value === '__none__') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return hasValue(value.value);
  return true;
}
function isPlaceholder(value) {
  return value === '__none__' ||
    (typeof value === 'string' && /\{\{[\s\S]*?\}\}/.test(value));
}
function currentRow(grid) {
  return grid?.currentRow ?? grid?.selectedRows?.[0] ?? grid?.contextRow ?? null;
}
function firstRecord(value) {
  if (Array.isArray(value)) return value.find(isRecord);
  if (!isRecord(value)) return undefined;
  for (const key of ['rows', 'items', 'records', 'data', 'result']) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const record = firstRecord(value[key]);
      if (record) return record;
    }
  }
  return value;
}
function readDetailRelation(block) {
  const config = isRecord(block?.schema?.detailConfig)
    ? block.schema.detailConfig
    : {};
  const parentSourceKey = readString(config.parentSourceKey ?? config.parent_source_key);
  const foreignKey = readString(config.foreignKey ?? config.foreign_key);
  if (!parentSourceKey || !foreignKey) return undefined;
  return {
    parentSourceKey,
    foreignKey,
    parentKey: readString(config.parentKey ?? config.parent_key, 'id'),
  };
}
function resolveDetailParentRecord(relation, blocks, data, forms, grids) {
  const parentGrid = blocks.find((candidate) => candidate.kind === 'grid' && (
    candidate.id === relation.parentSourceKey || candidate.sourceKey === relation.parentSourceKey
  ));
  const gridRecord = parentGrid ? currentRow(grids[parentGrid.id]) : undefined;
  if (isRecord(gridRecord)) return gridRecord;

  const parentForm = blocks.find((candidate) => candidate.kind === 'form' && (
    candidate.id === relation.parentSourceKey || candidate.sourceKey === relation.parentSourceKey
  ));
  const formRecord = parentForm
    ? firstRecord(forms[parentForm.id])
    : firstRecord(forms[relation.parentSourceKey]);
  if (formRecord) return formRecord;

  return firstRecord(data[relation.parentSourceKey]);
}
function inferFilterMap(filters, requiredFilters, mainRow) {
  const relationFields = Object.entries(filters)
    .filter(([, value]) => isPlaceholder(value))
    .map(([field]) => field);
  const missing = requiredFilters.filter((field) =>
    !hasValue(filters[field]) || isPlaceholder(filters[field]));
  return Object.fromEntries([...new Set([...relationFields, ...missing])].map((detailField) => {
    const configured = filters[detailField];
    const expressionField = typeof configured === 'string'
      ? configured.match(/\{\{\s*(?:(?:data|grids)\.[^.]+(?:\.currentRow)?|event\.row|row)\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/)?.[1] ?? ''
      : '';
    const directField = detailField in mainRow ? detailField : '';
    const conventionalField = detailField.endsWith('_id') && 'id' in mainRow ? 'id' : '';
    return [detailField, expressionField || directField || conventionalField || detailField];
  }));
}
async function main() {
  const action = this.event.payload.nodeAction;
  const { block, options, blocks, dataSources } = action;
  const sourceKey = readString(block.sourceKey);
  const source = dataSources[sourceKey];
  if (!source) throw new Error(`表格 "${block.id}" 没有可用的数据源。`);
  const configuredPostData = isRecord(source.postData) ? source.postData : {};
  const resolvedPostData = await this.$node.call('runtime.resolve', {
    value: configuredPostData,
  });
  const postData = {
    ...(isRecord(resolvedPostData) ? resolvedPostData : {}),
    ...(isRecord(options.postData) ? options.postData : {}),
  };
  let requestPostData;
  let skip = false;
  if (block.tableType !== 'detail') {
    const filters = {
      ...(isRecord(postData.filters) ? postData.filters : {}),
      ...(isRecord(this.searches[sourceKey]) ? this.searches[sourceKey] : {}),
      ...(isRecord(options.filters) ? options.filters : {}),
    };
    requestPostData = {
      ...postData,
      ...(Object.keys(filters).length ? { filters } : {}),
    };
  } else {
    const configuredFilters = isRecord(postData.filters) ? postData.filters : {};
    const rawFilters = isRecord(configuredPostData.filters)
      ? configuredPostData.filters
      : configuredFilters;
    const requiredFilters = readList(postData.requiredFilters ?? postData.required_filters);
    const gridBlocks = blocks.filter((candidate) => candidate.kind === 'grid');
    const requestedMain = readString(options.mainGrid);
    const mainGrid = requestedMain
      ? gridBlocks.find((candidate) => candidate.id === requestedMain)
      : gridBlocks.find((candidate) => candidate.tableType === 'main');
    const mainRow = currentRow(mainGrid ? this.grids[mainGrid.id] : undefined);
    const explicitFilters = isRecord(options.filters) ? options.filters : {};
    const searchFilters = isRecord(this.searches[sourceKey]) ? this.searches[sourceKey] : {};
    const detailRelation = readDetailRelation(block);
    const detailParent = detailRelation
      ? resolveDetailParentRecord(detailRelation, blocks, this.data, this.forms, this.grids)
      : undefined;
    const detailRelationFilters = detailRelation && detailParent
      ? { [detailRelation.foreignKey]: detailParent[detailRelation.parentKey] }
      : {};
    const configuredMap = isRecord(options.filterMap)
      ? Object.fromEntries(Object.entries(options.filterMap)
          .map(([detailField, mainField]) => [detailField, readString(mainField)])
          .filter(([, mainField]) => Boolean(mainField)))
      : {};
    const filterMap = Object.keys(configuredMap).length
      ? configuredMap
      : inferFilterMap(rawFilters, requiredFilters, mainRow ?? {});
    const relationFilters = mainRow
      ? Object.fromEntries(Object.entries(filterMap).map(([detailField, mainField]) =>
          [detailField, mainRow[mainField]]))
      : {};
    const filters = {
      ...configuredFilters,
      ...searchFilters,
      ...relationFilters,
      ...explicitFilters,
      ...detailRelationFilters,
    };
    const runtimeFields = Object.entries({ ...searchFilters, ...explicitFilters })
      .filter(([, value]) => hasValue(value) && !isPlaceholder(value))
      .map(([field]) => field);
    const nextRequired = [...new Set([
      ...requiredFilters,
      ...Object.keys(filterMap),
      ...(detailRelation ? [detailRelation.foreignKey] : []),
      ...runtimeFields,
    ])];
    const missingRequired = nextRequired.some((field) =>
      !hasValue(filters[field]) || isPlaceholder(filters[field]));
    const hasQueryFilters = Object.values(filters).some((value) =>
      hasValue(value) && !isPlaceholder(value));
    skip = !hasQueryFilters || missingRequired;
    requestPostData = {
      ...postData,
      filters,
      ...(nextRequired.length ? { requiredFilters: nextRequired } : {}),
    };
  }

  const version = await this.$node.call('source.begin', { sourceKey });
  await this.$node.call('loading.grid', { loading: true });
  try {
    const value = skip
      ? []
      : await this.$node.call('source.invoke', { sourceKey, postData: requestPostData });
    if (await this.$node.call('source.isCurrent', { sourceKey, version })) {
      await this.$node.call('source.set', {
        sourceKey,
        value,
        resetGridBaseline: true,
      });
    }
    return value;
  } finally {
    const current = await this.$node.call('source.isCurrent', { sourceKey, version });
    await this.$node.call('source.finish', { sourceKey, version });
    if (current) await this.$node.call('loading.grid', { loading: false });
  }
}
  $action$,
  '[{"name":"filters","type":"object","description":"附加过滤条件。"},{"name":"postData","type":"object","description":"附加请求参数。"},{"name":"mainGrid","type":"string","description":"关联主表节点 ID。"},{"name":"filterMap","type":"Record<string, string>","description":"明细字段到主表字段的映射。"}]'::jsonb,
  '返回服务端数据；缺少明细关联条件时返回空数组。',
  'const rows = await this.executeAction({\n  node: {{nodeId}},\n  method: "loadData",\n  filters: {},\n});',
  '{}'::jsonb, true, true, true, 10
)
on conflict (node_type, action_code) do update set
  label = excluded.label, description = excluded.description,
  source_code = excluded.source_code, parameters = excluded.parameters,
  returns = excluded.returns, insert_text_template = excluded.insert_text_template,
  applicable_when = excluded.applicable_when,
  is_data_source_loader = excluded.is_data_source_loader,
  enabled = excluded.enabled, is_system = excluded.is_system,
  sort_order = excluded.sort_order, updated_at = timezone('utc'::text, now());

insert into public.lowcode_node_actions (
  node_type, node_label, node_icon, action_code, label, description,
  source_code, parameters, returns, insert_text_template,
  applicable_when, is_data_source_loader, enabled, is_system, sort_order
) values
(
  'grid', '表格', 'ri-table-2', 'reloadData', '覆盖表格数据',
  '使用 data 数组覆盖当前表格数据。',
  $action$
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
async function main() {
  const input = this.event.payload.nodeAction.options.data;
  const rows = Array.isArray(input)
    ? input.filter(isRecord)
    : isRecord(input) && Array.isArray(input.rows)
      ? input.rows.filter(isRecord)
      : [];
  await this.$node.call('grid.replaceRows', { rows });
  return JSON.parse(JSON.stringify(rows));
}
  $action$,
  '[{"name":"data","type":"object[] | { rows: object[] }","required":true,"description":"新的表格行数据。"}]'::jsonb,
  '返回规范化后的行数组。',
  'await this.executeAction({\n  node: {{nodeId}},\n  method: "reloadData",\n  data: [],\n});',
  '{}'::jsonb, false, true, true, 20
),
(
  'grid', '表格', 'ri-table-2', 'getChanges', '获取表格变更',
  '按行主键返回新增、更新和删除的数据。',
  $action$
async function main() {
  return await this.$node.call('grid.getChanges');
}
  $action$,
  '[]'::jsonb,
  '返回 { created, updated, deleted }。',
  'const changes = await this.executeAction({\n  node: {{nodeId}},\n  method: "getChanges",\n});',
  '{}'::jsonb, false, true, true, 30
),
(
  'grid', '表格', 'ri-table-2', 'validate', '校验表格数据',
  '执行表格 editRules 校验。',
  $action$
async function main() {
  return await this.$node.call('grid.validate');
}
  $action$,
  '[]'::jsonb,
  '校验通过返回 true，否则返回 false。',
  'const valid = await this.executeAction({\n  node: {{nodeId}},\n  method: "validate",\n});',
  '{}'::jsonb, false, true, true, 40
),
(
  'grid', '表格', 'ri-table-2', 'addRow', '新增一行数据',
  '在表格末尾追加一行并设为当前行。',
  $action$
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
async function main() {
  const action = this.event.payload.nodeAction;
  const input = action.options.data;
  if (input !== undefined && !isRecord(input)) {
    throw new Error('Grid addRow 的 data 必须是对象。');
  }
  const row = JSON.parse(JSON.stringify(isRecord(input) ? input : {}));
  const rows = await this.$node.call('grid.rows');
  const nextRows = await this.$node.call('grid.replaceRows', { rows: [...rows, row] });
  const rowConfig = action.block.schema?.grid?.rowConfig;
  const rowKey = isRecord(rowConfig) && typeof rowConfig.keyField === 'string'
    ? rowConfig.keyField
    : 'id';
  const current = row[rowKey] != null
    ? nextRows.find((candidate) => candidate[rowKey] === row[rowKey])
    : nextRows[nextRows.length - 1];
  return await this.$node.call('grid.setCurrentRow', { row: current ?? row });
}
  $action$,
  '[{"name":"data","type":"object","description":"新行初始数据。"}]'::jsonb,
  '返回新增行数据。',
  'const row = await this.executeAction({\n  node: {{nodeId}},\n  method: "addRow",\n  data: {},\n});',
  '{}'::jsonb, false, true, true, 50
),
(
  'grid', '表格', 'ri-table-2', 'deleteCurrentRow', '删除当前行数据',
  '删除当前行、选中行或上下文行。',
  $action$
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
async function main() {
  const action = this.event.payload.nodeAction;
  const state = await this.$node.call('grid.state');
  const current = state.currentRow ?? state.selectedRows?.[0] ?? state.contextRow ?? null;
  if (!isRecord(current)) return null;
  const rows = await this.$node.call('grid.rows');
  const rowConfig = action.block.schema?.grid?.rowConfig;
  const rowKey = state.rowKey || (
    isRecord(rowConfig) && typeof rowConfig.keyField === 'string'
      ? rowConfig.keyField
      : 'id'
  );
  const index = current[rowKey] != null
    ? rows.findIndex((row) => row[rowKey] === current[rowKey])
    : rows.findIndex((row) => JSON.stringify(row) === JSON.stringify(current));
  if (index < 0) return null;
  const deleted = JSON.parse(JSON.stringify(rows[index]));
  await this.$node.call('grid.replaceRows', {
    rows: [...rows.slice(0, index), ...rows.slice(index + 1)],
  });
  await this.$node.call('grid.setCurrentRow', { row: null });
  return deleted;
}
  $action$,
  '[]'::jsonb,
  '返回删除的行；没有当前行时返回 null。',
  'const deleted = await this.executeAction({\n  node: {{nodeId}},\n  method: "deleteCurrentRow",\n});',
  '{}'::jsonb, false, true, true, 60
)
on conflict (node_type, action_code) do update set
  label = excluded.label, description = excluded.description,
  source_code = excluded.source_code, parameters = excluded.parameters,
  returns = excluded.returns, insert_text_template = excluded.insert_text_template,
  applicable_when = excluded.applicable_when,
  is_data_source_loader = excluded.is_data_source_loader,
  enabled = excluded.enabled, is_system = excluded.is_system,
  sort_order = excluded.sort_order, updated_at = timezone('utc'::text, now());

insert into public.lowcode_node_actions (
  node_type, node_label, node_icon, action_code, label, description,
  source_code, parameters, returns, insert_text_template,
  applicable_when, is_data_source_loader, enabled, is_system, sort_order
)
select
  node_type, node_label, node_icon, 'open',
  case when node_type = 'modal' then '打开弹框' else '打开抽屉' end,
  '打开节点，并在确认后返回结果表单数据。',
  $action$
async function main() {
  return await this.$node.call('overlay.open', {
    options: this.event.payload.nodeAction.options,
  });
}
  $action$,
  '[{"name":"data","type":"object","description":"结果表单初始数据。"},{"name":"resultNode","type":"string","description":"结果表单节点 ID。"}]'::jsonb,
  '确认时返回表单对象，取消时返回 null。',
  'const result = await this.executeAction({\n  node: {{nodeId}},\n  method: "open",\n  data: {},\n});',
  '{}'::jsonb, false, true, true, 10
from (values
  ('modal', '弹框', 'ri-window-line'),
  ('drawer', '抽屉', 'ri-layout-right-line')
) as nodes(node_type, node_label, node_icon)
on conflict (node_type, action_code) do update set
  label = excluded.label, description = excluded.description,
  source_code = excluded.source_code, parameters = excluded.parameters,
  returns = excluded.returns, insert_text_template = excluded.insert_text_template,
  applicable_when = excluded.applicable_when,
  is_data_source_loader = excluded.is_data_source_loader,
  enabled = excluded.enabled, is_system = excluded.is_system,
  sort_order = excluded.sort_order, updated_at = timezone('utc'::text, now());

do $validation$
declare
  action_count integer;
  node_type_count integer;
begin
  select count(*), count(distinct node_type)
  into action_count, node_type_count
  from public.lowcode_node_actions
  where enabled and is_system;

  if action_count <> 19 or node_type_count <> 5 then
    raise exception 'Database node action validation failed: actions %, node types %.',
      action_count, node_type_count;
  end if;
end;
$validation$;

comment on table public.lowcode_node_actions is
  'Global database-owned low-code node action metadata and QuickJS source code.';

select pg_notify('pgrst', 'reload schema');

commit;
