-- Shared page pickers used by low-code button scripts.
do $migration$
declare
  lowcode_page_source text := $source$
async function main(input) {
  const args = input.args && typeof input.args === 'object' && !Array.isArray(input.args)
    ? input.args
    : {};
  return await this.$dialog.confirmLowCodePage({
    pageCode: 'lowcode-pages',
    includeData: true,
    title: '选择低代码页面',
    confirmLabel: '选择',
    cancelLabel: '取消',
    requireSelection: true,
    ...args,
  });
}
$source$;
  form_source text := $source$
async function main(input) {
  const args = input.args && typeof input.args === 'object' && !Array.isArray(input.args)
    ? input.args
    : {};
  return await this.$dialog.confirmLowCodePage({
    pageCode: 'form-definetion',
    includeData: true,
    title: '选择系统表单',
    confirmLabel: '选择',
    cancelLabel: '取消',
    requireSelection: true,
    ...args,
  });
}
$source$;
begin
  update public.lowcode_page_runtime
  set
    page_id = null,
    function_name = 'confirmLowCodePage',
    function_type = 'page_function',
    category = 'ui',
    page_type = null,
    node_type = null,
    label = '选择低代码页面',
    description = '使用 confirmLowCodePage 弹出低代码页面，并返回用户选择的数据。',
    execution_mode = 'script',
    source_code = lowcode_page_source,
    native_handler = null,
    runtime_spec = '{"operation":"confirmLowCodePage","defaultPageCode":"lowcode-pages"}'::jsonb,
    parameters = '[{"name":"pageCode","type":"string","description":"要弹出的低代码页面 code。"},{"name":"requireSelection","type":"boolean","description":"是否必须选择一行。"}]'::jsonb,
    result_schema = '{"type":"object","description":"返回 action、row、selectedRows 等弹框结果。"}'::jsonb,
    capabilities = '["dialog.confirmLowCodePage"]'::jsonb,
    applicable_when = '{}'::jsonb,
    limits = '{"timeoutMs":120000,"maxApiCalls":50,"maxPayloadBytes":26214400}'::jsonb,
    status = 'published',
    enabled = true,
    is_system = true,
    sort_order = 10,
    source_hash = md5(lowcode_page_source),
    updated_at = timezone('utc', now())
  where runtime_key = 'system:page:common.confirmLowCodePage'
    and status = 'published';

  if not found then
    insert into public.lowcode_page_runtime (
      page_id, runtime_key, function_name, function_type, category, page_type,
      node_type, label, description, execution_mode, source_code, native_handler,
      runtime_spec, parameters, result_schema, capabilities, applicable_when,
      limits, version, status, enabled, is_system, sort_order, source_hash
    )
    select
      null,
      'system:page:common.confirmLowCodePage',
      'confirmLowCodePage',
      'page_function',
      'ui',
      null,
      null,
      '选择低代码页面',
      '使用 confirmLowCodePage 弹出低代码页面，并返回用户选择的数据。',
      'script',
      lowcode_page_source,
      null,
      '{"operation":"confirmLowCodePage","defaultPageCode":"lowcode-pages"}'::jsonb,
      '[{"name":"pageCode","type":"string","description":"要弹出的低代码页面 code。"},{"name":"requireSelection","type":"boolean","description":"是否必须选择一行。"}]'::jsonb,
      '{"type":"object","description":"返回 action、row、selectedRows 等弹框结果。"}'::jsonb,
      '["dialog.confirmLowCodePage"]'::jsonb,
      '{}'::jsonb,
      '{"timeoutMs":120000,"maxApiCalls":50,"maxPayloadBytes":26214400}'::jsonb,
      coalesce((select max(version) + 1 from public.lowcode_page_runtime where runtime_key = 'system:page:common.confirmLowCodePage'), 1),
      'published',
      true,
      true,
      10,
      md5(lowcode_page_source);
  end if;

  update public.lowcode_page_runtime
  set
    page_id = null,
    function_name = 'confirmForm',
    function_type = 'page_function',
    category = 'ui',
    page_type = null,
    node_type = null,
    label = '选择系统表单',
    description = '弹出系统表单管理页面，并返回用户选择的表单。',
    execution_mode = 'script',
    source_code = form_source,
    native_handler = null,
    runtime_spec = '{"operation":"confirmForm","defaultPageCode":"form-definetion"}'::jsonb,
    parameters = '[{"name":"pageCode","type":"string","description":"可选；覆盖默认的系统表单页面 code。"},{"name":"requireSelection","type":"boolean","description":"是否必须选择一行。"}]'::jsonb,
    result_schema = '{"type":"object","description":"返回 action、row、selectedRows 等弹框结果。"}'::jsonb,
    capabilities = '["dialog.confirmLowCodePage"]'::jsonb,
    applicable_when = '{}'::jsonb,
    limits = '{"timeoutMs":120000,"maxApiCalls":50,"maxPayloadBytes":26214400}'::jsonb,
    status = 'published',
    enabled = true,
    is_system = true,
    sort_order = 20,
    source_hash = md5(form_source),
    updated_at = timezone('utc', now())
  where runtime_key = 'system:page:common.confirmForm'
    and status = 'published';

  if not found then
    insert into public.lowcode_page_runtime (
      page_id, runtime_key, function_name, function_type, category, page_type,
      node_type, label, description, execution_mode, source_code, native_handler,
      runtime_spec, parameters, result_schema, capabilities, applicable_when,
      limits, version, status, enabled, is_system, sort_order, source_hash
    )
    select
      null,
      'system:page:common.confirmForm',
      'confirmForm',
      'page_function',
      'ui',
      null,
      null,
      '选择系统表单',
      '弹出系统表单管理页面，并返回用户选择的表单。',
      'script',
      form_source,
      null,
      '{"operation":"confirmForm","defaultPageCode":"form-definetion"}'::jsonb,
      '[{"name":"pageCode","type":"string","description":"可选；覆盖默认的系统表单页面 code。"},{"name":"requireSelection","type":"boolean","description":"是否必须选择一行。"}]'::jsonb,
      '{"type":"object","description":"返回 action、row、selectedRows 等弹框结果。"}'::jsonb,
      '["dialog.confirmLowCodePage"]'::jsonb,
      '{}'::jsonb,
      '{"timeoutMs":120000,"maxApiCalls":50,"maxPayloadBytes":26214400}'::jsonb,
      coalesce((select max(version) + 1 from public.lowcode_page_runtime where runtime_key = 'system:page:common.confirmForm'), 1),
      'published',
      true,
      true,
      20,
      md5(form_source);
  end if;
end
$migration$;

-- Keep the inactive child data source query valid for its UUID primary key.
-- The page renderer can still resolve this source while loading the dialog,
-- even though it is marked as non-auto-loading.
update public.lowcode_pages
set
  schema = jsonb_set(
    schema,
    '{dataSources,selectedPrintTemplateRows,postData,filters,id}',
    to_jsonb('00000000-0000-0000-0000-000000000000'::text)
  ),
  version = version + 1,
  updated_at = timezone('utc', now())
where code = 'print-templates'
  and schema #>> '{dataSources,selectedPrintTemplateRows,postData,filters,id}' = '__none__';

-- The print designer uses the shared picker and then loads the selected record
-- through the label-designer node's public loadData action.
update public.lowcode_pages as page
set
  schema = jsonb_set(
    page.schema,
    '{blocks}',
    coalesce((
      select jsonb_agg(
        case
          when block.value ->> 'id' = 'label-designer-actions' then jsonb_set(
            block.value,
            '{actions}',
            coalesce((
              select jsonb_agg(
                case
                  when action.value ->> 'code' = 'label-load' then jsonb_set(
                    action.value,
                    '{script}',
                    to_jsonb($script$
async function main() {
  const result = await this.executeFunction({
    name: "confirmLowCodePage",
    args: {
      pageCode: "print-templates",
      includeData: true,
      title: "加载打印模板",
      confirmLabel: "加载",
      cancelLabel: "取消",
      requireSelection: true,
      dialog: { id: "print-template-picker-dialog" },
    },
  });
  if (!result || result.action !== "confirm" || !result.row?.id) return result;
  await this.executeAction({
    node: "label-designer-canvas",
    method: "loadData",
    templateId: result.row.id,
  });
  return result.row;
}
$script$::text)
                  )
                  else action.value
                end
                order by action.ordinality
              )
              from jsonb_array_elements(block.value -> 'actions') with ordinality as action(value, ordinality)
            ), block.value -> 'actions')
          )
          else block.value
        end
        order by block.ordinality
      )
      from jsonb_array_elements(page.schema -> 'blocks') with ordinality as block(value, ordinality)
    ), page.schema -> 'blocks')
  ),
  version = page.version + 1,
  updated_at = timezone('utc', now())
where page.code = 'print-designer'
  and exists (
    select 1
    from jsonb_array_elements(page.schema -> 'blocks') as block(value)
    cross join lateral jsonb_array_elements(block.value -> 'actions') as action(value)
    where block.value ->> 'id' = 'label-designer-actions'
      and action.value ->> 'code' = 'label-load'
      and action.value ->> 'script' is distinct from $script$
async function main() {
  const result = await this.executeFunction({
    name: "confirmLowCodePage",
    args: {
      pageCode: "print-templates",
      includeData: true,
      title: "加载打印模板",
      confirmLabel: "加载",
      cancelLabel: "取消",
      requireSelection: true,
      dialog: { id: "print-template-picker-dialog" },
    },
  });
  if (!result || result.action !== "confirm" || !result.row?.id) return result;
  await this.executeAction({
    node: "label-designer-canvas",
    method: "loadData",
    templateId: result.row.id,
  });
  return result.row;
}
$script$::text
  );
