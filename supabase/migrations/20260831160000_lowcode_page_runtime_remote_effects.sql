-- Move browser-independent page orchestration into database-owned scripts.
-- The scripts may only return effects listed in their capabilities column;
-- the browser remains a thin adapter for Vue state, navigation, and printing.

begin;

with remote_functions(runtime_key, runtime_spec, capabilities) as (
  values
    ('system:page:list.create',
      '{"operation":"navigateToEdit"}'::jsonb,
      '["page.navigateToEdit"]'::jsonb),
    ('system:page:list.edit',
      '{"operation":"navigateToEdit","singleSelection":true,"operationLabel":"编辑"}'::jsonb,
      '["page.navigateToEdit"]'::jsonb),
    ('system:page:list.delete',
      '{"operation":"deleteSelected","operationLabel":"删除"}'::jsonb,
      '["records.delete","page.refresh","message.show"]'::jsonb),
    ('system:page:list.approve',
      '{"operation":"transitionSelected","operationLabel":"审核","field":"status","value":"approved"}'::jsonb,
      '["records.update","service.invoke","page.refresh","message.show"]'::jsonb),
    ('system:page:list.unapprove',
      '{"operation":"transitionSelected","operationLabel":"反审","field":"status","value":"draft"}'::jsonb,
      '["records.update","service.invoke","page.refresh","message.show"]'::jsonb),
    ('system:page:list.close',
      '{"operation":"transitionSelected","operationLabel":"关闭","field":"status","value":"closed"}'::jsonb,
      '["records.update","service.invoke","page.refresh","message.show"]'::jsonb),
    ('system:page:list.open',
      '{"operation":"transitionSelected","operationLabel":"打开","field":"status","value":"open"}'::jsonb,
      '["records.update","service.invoke","page.refresh","message.show"]'::jsonb),
    ('system:page:list.refresh',
      '{"operation":"refresh"}'::jsonb,
      '["page.refresh"]'::jsonb),
    ('system:page:list.print',
      '{"operation":"print"}'::jsonb,
      '["page.print"]'::jsonb),
    ('system:page:list.exit',
      '{"operation":"exit"}'::jsonb,
      '["page.exit"]'::jsonb),
    ('system:page:edit.copy',
      '{"operation":"prepareForms","mode":"copy","message":"复制数据已准备，请修改后保存。"}'::jsonb,
      '["form.prepare","page.setMode","message.show"]'::jsonb),
    ('system:page:edit.create',
      '{"operation":"prepareForms","mode":"create","message":"已进入新增状态。"}'::jsonb,
      '["form.prepare","page.setMode","message.show"]'::jsonb),
    ('system:page:edit.modify',
      '{"operation":"setMode","mode":"edit","message":"已进入修改状态。"}'::jsonb,
      '["page.setMode","message.show"]'::jsonb),
    ('system:page:edit.save',
      '{"operation":"submitForms"}'::jsonb,
      '["form.submit"]'::jsonb),
    ('system:page:edit.approve',
      '{"operation":"transitionForms","operationLabel":"审核","field":"status","value":"approved"}'::jsonb,
      '["form.patch","form.submit","service.invoke","page.refresh","message.show"]'::jsonb),
    ('system:page:edit.unapprove',
      '{"operation":"transitionForms","operationLabel":"反审","field":"status","value":"draft"}'::jsonb,
      '["form.patch","form.submit","service.invoke","page.refresh","message.show"]'::jsonb),
    ('system:page:edit.close',
      '{"operation":"transitionForms","operationLabel":"关闭","field":"status","value":"closed"}'::jsonb,
      '["form.patch","form.submit","service.invoke","page.refresh","message.show"]'::jsonb),
    ('system:page:edit.open',
      '{"operation":"transitionForms","operationLabel":"打开","field":"status","value":"open"}'::jsonb,
      '["form.patch","form.submit","service.invoke","page.refresh","message.show"]'::jsonb),
    ('system:page:edit.refresh',
      '{"operation":"refresh"}'::jsonb,
      '["page.refresh"]'::jsonb),
    ('system:page:edit.exit',
      '{"operation":"exit"}'::jsonb,
      '["page.exit"]'::jsonb)
), script_source as (
  select $runtime$
function main(input) {
  const args = input.args && typeof input.args === 'object' && !Array.isArray(input.args)
    ? input.args
    : {};
  const context = input.context || {};
  const spec = input.runtimeSpec || {};
  const event = context.event || {};
  const rows = Array.isArray(event.selectedRows) ? event.selectedRows : [];
  const forms = Array.isArray(event.formRecords) ? event.formRecords : [];
  const effects = [];
  const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const readString = (value) => typeof value === 'string' && value.trim() ? value.trim() : '';
  const add = (type, payload) => effects.push({ type, ...(payload || {}) });
  const operationLabel = readString(spec.operationLabel);
  const message = (fallback) => readString(args.message) || fallback;
  const requireRows = (single) => {
    if (!rows.length) throw new Error(`${operationLabel}前请先选择数据。`);
    if (single && rows.length !== 1) throw new Error(`${operationLabel}只能选择一条数据。`);
  };
  const readService = () => {
    const service = isRecord(args.service) ? args.service : {};
    const serviceName = readString(service.name || args.serviceName);
    const serviceMethod = readString(service.method || args.serviceMethod);
    if (!serviceName && !serviceMethod) return null;
    if (!serviceName || !serviceMethod) {
      throw new Error('业务操作必须同时配置 serviceName 和 serviceMethod。');
    }
    return {
      serviceName,
      serviceMethod,
      postData: isRecord(service.postData)
        ? service.postData
        : isRecord(args.postData) ? args.postData : {},
    };
  };
  const transitionValues = (records) => {
    if (isRecord(args.values) && Object.keys(args.values).length) return { ...args.values };
    const requestedField = readString(args.field);
    if (requestedField) {
      return { [requestedField]: Object.prototype.hasOwnProperty.call(args, 'value') ? args.value : spec.value };
    }
    const field = readString(spec.field);
    return field && records.some((record) => isRecord(record) && field in record)
      ? { [field]: spec.value }
      : {};
  };

  switch (spec.operation) {
    case 'navigateToEdit':
      if (spec.singleSelection) requireRows(true);
      add('page.navigateToEdit', rows[0] ? { row: rows[0] } : {});
      return { effects, resultEffect: 0 };
    case 'deleteSelected':
      requireRows(false);
      add('records.delete', { rows });
      add('page.refresh');
      add('message.show', { message: message(`${operationLabel}成功。`), status: 'success' });
      return { effects, resultEffect: 0 };
    case 'transitionSelected': {
      requireRows(false);
      const service = readService();
      if (service) {
        add('service.invoke', {
          serviceName: service.serviceName,
          serviceMethod: service.serviceMethod,
          postData: { ...service.postData, rows },
        });
      } else {
        const values = transitionValues(rows);
        if (!Object.keys(values).length) {
          throw new Error(`${operationLabel}未找到状态字段，请通过 args.values 或 args.field/args.value 指定。`);
        }
        add('records.update', { rows, values });
      }
      add('page.refresh');
      add('message.show', { message: message(`${operationLabel}成功。`), status: 'success' });
      return { effects, resultEffect: 0 };
    }
    case 'prepareForms':
      add('form.prepare', { mode: spec.mode });
      add('page.setMode', { mode: 'add' });
      add('message.show', { message: message(spec.message), status: 'info' });
      return { effects, resultEffect: 0 };
    case 'setMode':
      if (context.page && context.page.mode !== 'scan') return { value: forms, effects };
      add('page.setMode', { mode: spec.mode });
      add('message.show', { message: message(spec.message), status: 'info' });
      return { value: forms, effects };
    case 'submitForms':
      if (context.page && context.page.mode === 'scan') return { value: false, effects };
      add('form.submit');
      return { effects, resultEffect: 0 };
    case 'transitionForms': {
      const service = readService();
      if (service) {
        add('service.invoke', {
          serviceName: service.serviceName,
          serviceMethod: service.serviceMethod,
          postData: { ...service.postData, forms },
        });
        add('page.refresh');
        add('message.show', { message: message(`${operationLabel}成功。`), status: 'success' });
        return { effects, resultEffect: 0 };
      }
      const values = transitionValues(forms);
      if (!Object.keys(values).length) {
        throw new Error(`${operationLabel}未找到状态字段，请通过 args.values 或 args.field/args.value 指定。`);
      }
      add('form.patch', { values });
      add('form.submit', { allowScan: true, required: true, errorMessage: `${operationLabel}保存失败。` });
      add('message.show', { message: message(`${operationLabel}成功。`), status: 'success' });
      return { value: true, effects };
    }
    case 'refresh':
      add('page.refresh');
      return { effects, resultEffect: 0 };
    case 'print':
      add('page.print');
      return { effects, resultEffect: 0 };
    case 'exit':
      add('page.exit');
      return { effects, resultEffect: 0 };
    default:
      throw new Error(`不支持的数据库页面函数操作：${String(spec.operation || '')}`);
  }
}
$runtime$::text as source_code
)
update public.lowcode_page_runtime as runtime
set
  execution_mode = 'script',
  source_code = script_source.source_code,
  native_handler = null,
  runtime_spec = remote_functions.runtime_spec,
  capabilities = remote_functions.capabilities,
  source_hash = md5(script_source.source_code || remote_functions.runtime_spec::text),
  updated_at = timezone('utc'::text, now())
from remote_functions
cross join script_source
where runtime.runtime_key = remote_functions.runtime_key
  and runtime.is_system
  and runtime.function_type = 'page_function';

-- Opening the visual form designer imports Vue components and must remain native.
update public.lowcode_page_runtime
set
  execution_mode = 'native',
  source_code = '',
  native_handler = 'builtin.list.designForm',
  capabilities = '[]'::jsonb,
  source_hash = md5('builtin.list.designForm'),
  updated_at = timezone('utc'::text, now())
where runtime_key = 'system:page:list.designForm';

-- Database button rules are authoritative. "modify" is enabled only in scan mode.
update public.lowcode_page_runtime
set
  runtime_spec = '{"disabledWhen":{"field":"formMode","neq":"scan"}}'::jsonb,
  source_hash = md5('modify:edit:formMode:neq:scan'),
  updated_at = timezone('utc'::text, now())
where runtime_key = 'system:button:edit:modify';

-- Register the effect vocabulary itself so administrators can audit and disable
-- every operation that a remote page function may request.
insert into public.lowcode_page_runtime (
  runtime_key, function_name, function_type, category,
  label, description, execution_mode, runtime_spec,
  status, enabled, is_system, sort_order, source_hash
)
select
  'system:capability:' || code,
  code,
  'capability',
  case when code in ('form.submit', 'page.refresh', 'records.delete', 'records.update', 'service.invoke')
    then 'data' else 'ui' end,
  code,
  '数据库页面函数可返回的受控运行时效果。',
  'rule',
  jsonb_build_object('capability', code),
  'published', true, true,
  row_number() over (order by code),
  md5(code || ':effect-capability')
from unnest(array[
  'form.prepare', 'form.submit', 'message.show', 'page.exit',
  'page.navigateToEdit', 'page.print', 'page.setMode',
  'records.delete', 'records.update', 'service.invoke'
]) as values(code)
on conflict (runtime_key, version) do update set
  function_name = excluded.function_name,
  category = excluded.category,
  label = excluded.label,
  description = excluded.description,
  execution_mode = excluded.execution_mode,
  runtime_spec = excluded.runtime_spec,
  status = excluded.status,
  enabled = excluded.enabled,
  is_system = excluded.is_system,
  source_hash = excluded.source_hash,
  updated_at = timezone('utc'::text, now());

-- Directive aliases select a small native bridge by database configuration.
with directive_handlers(function_name, handler) as (
  values
    ('setDataSource', 'dataSource'), ('updateDataSource', 'dataSource'),
    ('setGridRows', 'gridRows'), ('updateGridRows', 'gridRows'),
    ('setFormValues', 'formValues'), ('updateFormModel', 'formValues'),
    ('setFormData', 'formValues'), ('updateFormData', 'formValues'),
    ('setFormField', 'formField'), ('updateFormField', 'formField'),
    ('setSearchFilters', 'searchFilters'), ('updateSearchFilters', 'searchFilters'),
    ('refreshDataSource', 'refreshSources'), ('refreshDataSources', 'refreshSources'),
    ('refreshPage', 'refreshPage'), ('invokeService', 'invokeService'),
    ('navigate', 'navigate'), ('routePush', 'navigate'),
    ('showMessage', 'showMessage'), ('emitEvent', 'emitEvent'),
    ('dispatchWindowEvent', 'dispatchBrowserEvent'), ('dispatchBrowserEvent', 'dispatchBrowserEvent'),
    ('openBlock', 'openBlock'), ('openModal', 'openBlock'),
    ('closeBlock', 'closeBlock'), ('closeModal', 'closeBlock'),
    ('toggleModal', 'toggleBlock'),
    ('openGlobalDialog', 'openGlobalDialog'), ('openDialog', 'openGlobalDialog'),
    ('openPageReferenceDialog', 'openPageReferenceDialog'),
    ('openLowCodePageReferenceDialog', 'openPageReferenceDialog'),
    ('openReferenceDialog', 'openPageReferenceDialog')
)
update public.lowcode_page_runtime as runtime
set
  runtime_spec = jsonb_build_object('handler', directive_handlers.handler),
  source_hash = md5(runtime.function_name || ':directive:' || directive_handlers.handler),
  updated_at = timezone('utc'::text, now())
from directive_handlers
where runtime.function_type = 'directive'
  and runtime.is_system
  and runtime.function_name = directive_handlers.function_name;

commit;
