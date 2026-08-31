-- Database catalog for low-code page runtime functions and business rules.
-- Executable scripts are isolated by the frontend QuickJS runtime. Native entries
-- point to an allow-listed handler implemented by the runtime package.

begin;

create table if not exists public.lowcode_page_runtime (
  id uuid primary key default gen_random_uuid(),
  page_id uuid references public.lowcode_pages(id) on delete cascade,
  runtime_key text not null,
  function_name text not null,
  function_type text not null,
  category text not null,
  page_type text,
  node_type text,
  label text not null,
  description text not null default '',
  execution_mode text not null default 'script',
  source_code text not null default '',
  native_handler text,
  runtime_spec jsonb not null default '{}'::jsonb,
  parameters jsonb not null default '[]'::jsonb,
  result_schema jsonb not null default '{}'::jsonb,
  capabilities jsonb not null default '[]'::jsonb,
  applicable_when jsonb not null default '{}'::jsonb,
  limits jsonb not null default '{"timeoutMs":2000,"maxApiCalls":50,"maxPayloadBytes":26214400}'::jsonb,
  version integer not null default 1,
  status text not null default 'draft',
  enabled boolean not null default true,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  source_hash text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint lowcode_page_runtime_key_check
    check (runtime_key ~ '^[A-Za-z][A-Za-z0-9_.:-]*$'),
  constraint lowcode_page_runtime_name_check
    check (function_name ~ '^[A-Za-z_$][A-Za-z0-9_$.-]*$'),
  constraint lowcode_page_runtime_type_check
    check (function_type in ('page_function', 'button_rule', 'directive', 'capability', 'integration')),
  constraint lowcode_page_runtime_category_check
    check (category in ('page_flow', 'crud', 'document_status', 'data', 'ui', 'validation', 'integration')),
  constraint lowcode_page_runtime_page_type_check
    check (page_type is null or page_type in ('list', 'edit', 'detail', 'custom')),
  constraint lowcode_page_runtime_execution_mode_check
    check (execution_mode in ('script', 'native', 'rule')),
  constraint lowcode_page_runtime_status_check
    check (status in ('draft', 'published', 'archived')),
  constraint lowcode_page_runtime_source_check
    check (
      execution_mode <> 'script'
      or length(btrim(source_code)) > 0
    ),
  constraint lowcode_page_runtime_native_handler_check
    check (
      execution_mode <> 'native'
      or length(btrim(coalesce(native_handler, ''))) > 0
    ),
  constraint lowcode_page_runtime_parameters_check
    check (jsonb_typeof(parameters) = 'array'),
  constraint lowcode_page_runtime_result_schema_check
    check (jsonb_typeof(result_schema) = 'object'),
  constraint lowcode_page_runtime_spec_check
    check (jsonb_typeof(runtime_spec) = 'object'),
  constraint lowcode_page_runtime_capabilities_check
    check (jsonb_typeof(capabilities) = 'array'),
  constraint lowcode_page_runtime_applicable_when_check
    check (jsonb_typeof(applicable_when) = 'object'),
  constraint lowcode_page_runtime_limits_check
    check (jsonb_typeof(limits) = 'object')
);

create unique index if not exists lowcode_page_runtime_version_unique
  on public.lowcode_page_runtime (runtime_key, version);

create unique index if not exists lowcode_page_runtime_published_unique
  on public.lowcode_page_runtime (runtime_key)
  where status = 'published';

create index if not exists lowcode_page_runtime_lookup_idx
  on public.lowcode_page_runtime (page_id, page_type, function_type, function_name)
  where enabled and status = 'published';

drop trigger if exists set_lowcode_page_runtime_updated_at
  on public.lowcode_page_runtime;
create trigger set_lowcode_page_runtime_updated_at
before update on public.lowcode_page_runtime
for each row execute function public.set_updated_at();

alter table public.lowcode_page_runtime enable row level security;

drop policy if exists "Authenticated users can read published page runtime" on public.lowcode_page_runtime;
create policy "Authenticated users can read published page runtime"
on public.lowcode_page_runtime for select to authenticated
using (enabled and status = 'published');

drop policy if exists "Permission holders can manage page runtime" on public.lowcode_page_runtime;
create policy "Permission holders can manage page runtime"
on public.lowcode_page_runtime for all to authenticated
using (public.has_app_permission('lowcode.pages.manage'))
with check (public.has_app_permission('lowcode.pages.manage'));

grant select, insert, update, delete
  on public.lowcode_page_runtime to authenticated, service_role;

-- System page functions. The native_handler is deliberately allow-listed in the
-- runtime implementation; source_code can be added later for a QuickJS version.
insert into public.lowcode_page_runtime (
  runtime_key, function_name, function_type, category, page_type,
  label, description, execution_mode, native_handler, runtime_spec,
  capabilities, status, enabled, is_system, sort_order, source_hash
)
select
  item->>'runtime_key',
  item->>'function_name',
  'page_function',
  item->>'category',
  item->>'page_type',
  item->>'label',
  item->>'description',
  'native',
  item->>'native_handler',
  coalesce(item->'runtime_spec', '{}'::jsonb),
  coalesce(item->'capabilities', '[]'::jsonb),
  'published', true, true,
  (item->>'sort_order')::integer,
  md5(item::text)
from jsonb_array_elements($page_functions$
[
  {"runtime_key":"system:page:list.create","function_name":"create","page_type":"list","category":"crud","label":"新增跳转到编辑页","description":"打开当前列表页关联的编辑页，并携带来源页面。","native_handler":"builtin.list.create","runtime_spec":{"operation":"navigateToEdit"},"sort_order":10},
  {"runtime_key":"system:page:list.edit","function_name":"edit","page_type":"list","category":"crud","label":"编辑跳转到编辑页","description":"将当前选中的一条数据带入关联编辑页。","native_handler":"builtin.list.edit","runtime_spec":{"operation":"navigateToEdit","singleSelection":true},"sort_order":20},
  {"runtime_key":"system:page:list.delete","function_name":"delete","page_type":"list","category":"crud","label":"删除","description":"删除选中数据；需要为当前列表数据源配置 deleteMethod。","native_handler":"builtin.list.delete","runtime_spec":{"operation":"deleteSelected"},"sort_order":30},
  {"runtime_key":"system:page:list.approve","function_name":"approve","page_type":"list","category":"document_status","label":"审核","description":"审核选中数据；可通过 args.values 或 args.field/args.value 覆盖状态字段。","native_handler":"builtin.list.approve","runtime_spec":{"operation":"transitionSelected","field":"status","value":"approved"},"sort_order":40},
  {"runtime_key":"system:page:list.unapprove","function_name":"unapprove","page_type":"list","category":"document_status","label":"反审","description":"反审选中数据；可通过 args.values 或 args.field/args.value 覆盖状态字段。","native_handler":"builtin.list.unapprove","runtime_spec":{"operation":"transitionSelected","field":"status","value":"draft"},"sort_order":50},
  {"runtime_key":"system:page:list.close","function_name":"close","page_type":"list","category":"document_status","label":"关闭","description":"关闭选中数据，默认写入 status=closed。","native_handler":"builtin.list.close","runtime_spec":{"operation":"transitionSelected","field":"status","value":"closed"},"sort_order":60},
  {"runtime_key":"system:page:list.open","function_name":"open","page_type":"list","category":"document_status","label":"打开","description":"重新打开选中数据，默认写入 status=open。","native_handler":"builtin.list.open","runtime_spec":{"operation":"transitionSelected","field":"status","value":"open"},"sort_order":70},
  {"runtime_key":"system:page:list.refresh","function_name":"refresh","page_type":"list","category":"data","label":"刷新","description":"重新加载当前列表页的全部数据源。","native_handler":"builtin.list.refresh","runtime_spec":{"operation":"refresh"},"sort_order":80},
  {"runtime_key":"system:page:list.designForm","function_name":"designForm","page_type":"list","category":"ui","label":"设计表单","description":"打开当前系统表单定义的设计器，保存后刷新列表。","native_handler":"builtin.list.designForm","runtime_spec":{"operation":"openFormDesigner"},"sort_order":90},
  {"runtime_key":"system:page:list.print","function_name":"print","page_type":"list","category":"ui","label":"打印","description":"调用浏览器打印当前页面。","native_handler":"builtin.list.print","runtime_spec":{"operation":"print"},"sort_order":100},
  {"runtime_key":"system:page:list.exit","function_name":"exit","page_type":"list","category":"ui","label":"退出","description":"退出当前列表页；args.route 可指定目标路由。","native_handler":"builtin.list.exit","runtime_spec":{"operation":"exit"},"sort_order":110},
  {"runtime_key":"system:page:edit.copy","function_name":"copy","page_type":"edit","category":"crud","label":"复制","description":"复制当前表单并清除主键、审核和关闭信息。","native_handler":"builtin.edit.copy","runtime_spec":{"operation":"prepareForms","mode":"copy"},"sort_order":10},
  {"runtime_key":"system:page:edit.create","function_name":"create","page_type":"edit","category":"crud","label":"新增","description":"按表单初始值创建一份新的编辑数据。","native_handler":"builtin.edit.create","runtime_spec":{"operation":"prepareForms","mode":"create"},"sort_order":20},
  {"runtime_key":"system:page:edit.modify","function_name":"modify","page_type":"edit","category":"crud","label":"修改","description":"将当前编辑页切换到修改状态，并发布 page.modeChange 事件。","native_handler":"builtin.edit.modify","runtime_spec":{"operation":"setMode","mode":"edit"},"sort_order":30},
  {"runtime_key":"system:page:edit.save","function_name":"save","page_type":"edit","category":"crud","label":"保存","description":"统一保存当前编辑页中绑定了保存数据源的表单。","native_handler":"builtin.edit.save","runtime_spec":{"operation":"submitForms"},"sort_order":40},
  {"runtime_key":"system:page:edit.approve","function_name":"approve","page_type":"edit","category":"document_status","label":"审核","description":"更新审核状态并保存当前编辑页。","native_handler":"builtin.edit.approve","runtime_spec":{"operation":"transitionForms","field":"status","value":"approved"},"sort_order":50},
  {"runtime_key":"system:page:edit.unapprove","function_name":"unapprove","page_type":"edit","category":"document_status","label":"反审","description":"恢复未审核状态并保存当前编辑页。","native_handler":"builtin.edit.unapprove","runtime_spec":{"operation":"transitionForms","field":"status","value":"draft"},"sort_order":60},
  {"runtime_key":"system:page:edit.close","function_name":"close","page_type":"edit","category":"document_status","label":"关闭","description":"更新关闭状态并保存当前编辑页。","native_handler":"builtin.edit.close","runtime_spec":{"operation":"transitionForms","field":"status","value":"closed"},"sort_order":70},
  {"runtime_key":"system:page:edit.open","function_name":"open","page_type":"edit","category":"document_status","label":"打开","description":"恢复打开状态并保存当前编辑页。","native_handler":"builtin.edit.open","runtime_spec":{"operation":"transitionForms","field":"status","value":"open"},"sort_order":80},
  {"runtime_key":"system:page:edit.refresh","function_name":"refresh","page_type":"edit","category":"data","label":"刷新","description":"重新加载当前编辑页的全部数据源。","native_handler":"builtin.edit.refresh","runtime_spec":{"operation":"refresh"},"sort_order":90},
  {"runtime_key":"system:page:edit.exit","function_name":"exit","page_type":"edit","category":"ui","label":"退出","description":"返回来源列表页；args.route 可指定目标路由。","native_handler":"builtin.edit.exit","runtime_spec":{"operation":"exit"},"sort_order":100}
]
$page_functions$::jsonb) as item
on conflict (runtime_key, version) do update set
  function_name = excluded.function_name,
  function_type = excluded.function_type,
  category = excluded.category,
  page_type = excluded.page_type,
  label = excluded.label,
  description = excluded.description,
  execution_mode = excluded.execution_mode,
  native_handler = excluded.native_handler,
  runtime_spec = excluded.runtime_spec,
  capabilities = excluded.capabilities,
  status = excluded.status,
  enabled = excluded.enabled,
  is_system = excluded.is_system,
  sort_order = excluded.sort_order,
  source_hash = excluded.source_hash,
  updated_at = timezone('utc'::text, now());

-- Main page button rules are currently always enabled by default. They are
-- persisted so the admin can later replace them with page-specific conditions.
insert into public.lowcode_page_runtime (
  runtime_key, function_name, function_type, category, page_type,
  label, description, execution_mode, runtime_spec,
  status, enabled, is_system, sort_order, source_hash
)
select
  'system:button:main:' || code,
  code,
  'button_rule',
  'validation',
  'list',
  code,
  '主操作按钮状态规则。',
  'rule',
  '{"alwaysDisabled":false}'::jsonb,
  'published', true, true, row_number() over (order by code), md5(code || ':main')
from unnest(array[
  'back','refresh','getEditFormRow','edit','delete','duplicate','approve',
  'unapprove','close','open','print','exit','import','export','more'
]) as values(code)
on conflict (runtime_key, version) do update set
  runtime_spec = excluded.runtime_spec,
  status = excluded.status,
  enabled = excluded.enabled,
  source_hash = excluded.source_hash,
  updated_at = timezone('utc'::text, now());

insert into public.lowcode_page_runtime (
  runtime_key, function_name, function_type, category, page_type,
  label, description, execution_mode, runtime_spec,
  status, enabled, is_system, sort_order, source_hash
)
select
  'system:button:edit:' || code,
  code,
  'button_rule',
  'validation',
  'edit',
  code,
  '编辑页按钮状态规则。',
  'rule',
  case
    when code = 'create' then '{"alwaysDisabled":false}'::jsonb
    when code = 'copy' then '{"disabledWhen":{"field":"formMode","eq":"add"}}'::jsonb
    else '{"disabledWhen":{"field":"formMode","eq":"scan"}}'::jsonb
  end,
  'published', true, true, row_number() over (order by code), md5(code || ':edit')
from unnest(array[
  'modify','save','submit','saveAndClose','saveAndNew','create','copy',
  'addDetail','addLine','addRow','deleteDetail','deleteLine','deleteRow',
  'removeDetail','removeLine','removeRow','moveDetail','moveLine','moveRow',
  'copyDetail','copyLine','copyRow','detailAdd','lineAdd','rowAdd',
  'detailDelete','lineDelete','rowDelete','detailRemove','lineRemove','rowRemove',
  'detailMove','lineMove','rowMove','detailCopy','lineCopy','rowCopy'
]) as values(code)
on conflict (runtime_key, version) do update set
  runtime_spec = excluded.runtime_spec,
  status = excluded.status,
  enabled = excluded.enabled,
  source_hash = excluded.source_hash,
  updated_at = timezone('utc'::text, now());

-- Runtime directives and aliases. Aliases are stored separately so the admin
-- catalog can search and govern every accepted directive spelling.
insert into public.lowcode_page_runtime (
  runtime_key, function_name, function_type, category,
  label, description, execution_mode, runtime_spec,
  status, enabled, is_system, sort_order, source_hash
)
select
  'system:directive:' || code,
  code,
  'directive',
  case
    when code in (
      'setDataSource','updateDataSource','setGridRows','updateGridRows',
      'setFormValues','updateFormModel','setFormData','updateFormData',
      'setFormField','updateFormField','setSearchFilters','updateSearchFilters',
      'refreshDataSource','refreshDataSources','refreshPage','invokeService'
    ) then 'data'
    else 'ui'
  end,
  code,
  '低代码运行时指令。',
  'rule',
  jsonb_build_object('directive', code),
  'published', true, true, row_number() over (order by code), md5(code || ':directive')
from unnest(array[
  'setDataSource','updateDataSource','setGridRows','updateGridRows',
  'setFormValues','updateFormModel','setFormData','updateFormData',
  'setFormField','updateFormField','setSearchFilters','updateSearchFilters',
  'refreshDataSource','refreshDataSources','refreshPage','invokeService',
  'navigate','routePush','showMessage','emitEvent',
  'dispatchWindowEvent','dispatchBrowserEvent','openBlock','openModal',
  'closeBlock','closeModal','toggleModal','openGlobalDialog','openDialog',
  'openPageReferenceDialog','openLowCodePageReferenceDialog','openReferenceDialog'
]) as values(code)
on conflict (runtime_key, version) do update set
  runtime_spec = excluded.runtime_spec,
  status = excluded.status,
  enabled = excluded.enabled,
  source_hash = excluded.source_hash,
  updated_at = timezone('utc'::text, now());

-- MES command names are persisted as integration capabilities. Their actual
-- invocation remains in the native MES adapter and server-side permission checks.
insert into public.lowcode_page_runtime (
  runtime_key, function_name, function_type, category,
  label, description, execution_mode, native_handler,
  runtime_spec, status, enabled, is_system, sort_order, source_hash
)
select
  'system:integration:mes:' || code,
  code,
  'integration',
  'integration',
  code,
  'MES 桌面端业务命令。',
  'native',
  'mes.command.' || code,
  jsonb_build_object('service', 'mes', 'method', code),
  'published', true, true, row_number() over (order by code), md5(code || ':mes')
from unnest(array[
  'releaseWorkOrder','startOperation','pauseOperation','resumeOperation',
  'reportProduction','issueMaterial','returnMaterial','completeOperation',
  'reverseProduction','reverseProductionReport','undoProductionReport',
  'reverseMaterial','reverseMaterialTransaction','reverseTransaction'
]) as values(code)
on conflict (runtime_key, version) do update set
  native_handler = excluded.native_handler,
  runtime_spec = excluded.runtime_spec,
  status = excluded.status,
  enabled = excluded.enabled,
  source_hash = excluded.source_hash,
  updated_at = timezone('utc'::text, now());

-- Script capabilities exposed through the isolated three-entry runtime.
insert into public.lowcode_page_runtime (
  runtime_key, function_name, function_type, category,
  label, description, execution_mode, runtime_spec,
  status, enabled, is_system, sort_order, source_hash
)
select
  'system:capability:' || code,
  code,
  'capability',
  case
    when code in ('action.execute', 'http.execute', 'api.invoke') then 'data'
    when code in ('form.patch', 'form.replace', 'search.patch', 'search.replace', 'grid.setRows', 'source.set') then 'validation'
    when code in ('source.refresh', 'source.refreshAll', 'page.refresh') then 'data'
    else 'ui'
  end,
  code,
  '低代码脚本受控执行能力。',
  'rule',
  jsonb_build_object('capability', code),
  'published', true, true, row_number() over (order by code), md5(code || ':capability')
from unnest(array[
  'action.execute','api.invoke','dialog.open','event.emit','form.patch',
  'form.replace','grid.setRows','http.execute','pageFunction.execute',
  'message.error','message.info','message.success','message.warning',
  'node.runtime','page.refresh','router.push','search.patch','search.replace',
  'source.refresh','source.refreshAll','source.set'
]) as values(code)
on conflict (runtime_key, version) do update set
  runtime_spec = excluded.runtime_spec,
  status = excluded.status,
  enabled = excluded.enabled,
  source_hash = excluded.source_hash,
  updated_at = timezone('utc'::text, now());

commit;
