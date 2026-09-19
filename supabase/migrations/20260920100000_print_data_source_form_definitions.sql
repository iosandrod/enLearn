alter table public.lowcode_form_definitions
  add column if not exists table_name text;

comment on column public.lowcode_form_definitions.table_name is
  'Primary business table associated with this form definition; used by database-driven form selectors.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lowcode_form_definitions_table_name_check'
      and conrelid = 'public.lowcode_form_definitions'::regclass
  ) then
    alter table public.lowcode_form_definitions
      add constraint lowcode_form_definitions_table_name_check
      check (
        table_name is null
        or table_name ~ '^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$'
      );
  end if;
end
$$;

create index if not exists lowcode_form_definitions_enabled_table_idx
  on public.lowcode_form_definitions (enabled, table_name)
  where table_name is not null;

do $$
begin
  if to_regclass('public.service_resource_metadata') is not null then
    update public.service_resource_metadata
    set
      config = jsonb_set(
        jsonb_set(
          config,
          '{create,allowedFields}',
          case
            when coalesce(config #> '{create,allowedFields}', '[]'::jsonb) ? 'table_name'
              then coalesce(config #> '{create,allowedFields}', '[]'::jsonb)
            else coalesce(config #> '{create,allowedFields}', '[]'::jsonb) || '"table_name"'::jsonb
          end,
          true
        ),
        '{update,allowedFields}',
        case
          when coalesce(config #> '{update,allowedFields}', '[]'::jsonb) ? 'table_name'
            then coalesce(config #> '{update,allowedFields}', '[]'::jsonb)
          else coalesce(config #> '{update,allowedFields}', '[]'::jsonb) || '"table_name"'::jsonb
        end,
        true
      ),
      version = version + 1,
      updated_at = timezone('utc', now())
    where service_name = 'lowcode'
      and resource_name = 'lowcode_form_definitions'
      and (
        not (coalesce(config #> '{create,allowedFields}', '[]'::jsonb) ? 'table_name')
        or not (coalesce(config #> '{update,allowedFields}', '[]'::jsonb) ? 'table_name')
      );
  end if;
end
$$;

create or replace view public.print_data_source_form_definition_options
with (security_invoker = false)
as
select
  definitions.code::text as value,
  (definitions.name || '（' || definitions.table_name || '）')::text as label
from public.lowcode_form_definitions definitions
where definitions.enabled = true
  and definitions.table_name is not null
  and definitions.code like 'print-designer.datasource.%'
order by definitions.name, definitions.code;

comment on view public.print_data_source_form_definition_options is
  'Enabled database-backed low-code form definitions available to the print designer data-source selector.';

grant select on public.print_data_source_form_definition_options to authenticated, service_role;

insert into public.system_option_sources (
  code,
  name,
  description,
  source_type,
  source_config,
  cache_ttl_seconds,
  status,
  sort_order,
  is_system
)
values (
  'print_data_source_form_definition',
  '打印数据源低代码表单',
  '从视图读取已启用且已关联业务表的打印数据源表单。',
  'view',
  '{"view":"public.print_data_source_form_definition_options","labelField":"label","valueField":"value","orderBy":"label","ascending":true,"limit":500}'::jsonb,
  0,
  'active',
  300,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  source_type = excluded.source_type,
  source_config = excluded.source_config,
  cache_ttl_seconds = excluded.cache_ttl_seconds,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = true;

insert into public.lowcode_form_definitions (
  code,
  name,
  description,
  table_name,
  schema,
  enabled,
  updated_at
)
values (
  'print-designer.datasource-selector',
  '打印数据源表单选择器',
  '打印设计器顶部的数据源表单选择器；选项通过视图数据源 code 动态加载。',
  null,
  $$
  {
    "title": "选择打印数据源表单",
    "columns": 1,
    "fields": [
      {
        "field": "formCode",
        "label": "低代码表单",
        "component": "vxe-select",
        "defaultValue": "print-designer.datasource.sales-orders",
        "optionsCode": "print_data_source_form_definition",
        "props": {
          "filterable": true,
          "clearable": false,
          "placeholder": "请选择低代码表单"
        }
      }
    ],
    "layout": [
      {"kind":"field","field":"formCode"}
    ],
    "actions": []
  }
  $$::jsonb,
  true,
  timezone('utc', now())
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  table_name = null,
  schema = excluded.schema,
  enabled = true,
  updated_at = timezone('utc', now());

insert into public.lowcode_form_definitions (
  code,
  name,
  description,
  table_name,
  schema,
  enabled,
  updated_at
)
values (
  'print-designer.datasource.sales-orders',
  '销售订单打印数据源',
  '打印设计器销售订单 Header/Detail 预览表单；主表关联 sales_orders，明细关联 sales_order_lines。',
  'sales_orders',
  $$
  {
    "title": "销售订单打印数据源",
    "columns": 1,
    "fields": [
      {
        "field": "header",
        "label": "Header",
        "component": "lc-sub-form",
        "props": {
          "tableName": "sales_orders",
          "schema": {
            "title": "Header",
            "columns": 2,
            "fields": [
              {"field":"doc_no","label":"单据编号","component":"vxe-input","props":{"placeholder":"请输入销售订单号"}},
              {"field":"customer_name","label":"客户名称","component":"vxe-input","props":{"placeholder":"请输入客户名称"}},
              {"field":"doc_date","label":"单据日期","component":"vxe-input","props":{"type":"date","placeholder":"请选择单据日期"}},
              {"field":"status","label":"状态","component":"vxe-select","defaultValue":"draft","options":[{"label":"草稿","value":"draft"},{"label":"待审核","value":"pending"},{"label":"已审核","value":"approved"},{"label":"已关闭","value":"closed"}]}
            ],
            "layout": [
              {
                "kind": "row",
                "gutter": 12,
                "columns": [
                  {"span":1,"blocks":[{"kind":"field","field":"doc_no"},{"kind":"field","field":"doc_date"}]},
                  {"span":1,"blocks":[{"kind":"field","field":"customer_name"},{"kind":"field","field":"status"}]}
                ]
              }
            ],
            "actions": []
          }
        }
      },
      {
        "field": "detail",
        "label": "Detail",
        "component": "lc-array-table",
        "showTitle": false,
        "props": {
          "tableName": "sales_order_lines",
          "resource": "sales_order_lines",
          "toolbarButtons": [{"code":"add","label":"新增明细","command":"add","status":"primary"}],
          "rowKey": "_rowId",
          "rowConfig": {"keyField":"_rowId"},
          "movable": true,
          "copyable": true,
          "removable": true,
          "columns": [
            {"field":"item_code","title":"物料编码","width":120},
            {"field":"item_name","title":"物料名称","width":160},
            {"field":"ordered_qty","title":"数量","width":72,"component":"lc-number-input","props":{"min":0,"step":1}},
            {"field":"unit_price","title":"单价","width":90,"component":"lc-number-input","props":{"min":0,"step":0.01}},
            {"field":"tax_inclusive_amount","title":"金额","width":100,"component":"lc-number-input","props":{"min":0,"step":0.01}}
          ],
          "defaultRow": {"item_code":"","item_name":"","ordered_qty":1,"unit_price":0,"tax_inclusive_amount":0}
        }
      }
    ],
    "layout": [
      {"kind":"field","field":"header"},
      {"kind":"tabs","defaultKey":"detail","fillRemaining":true,"tabs":[{"key":"detail","label":"Detail","blocks":[{"kind":"field","field":"detail"}]}]}
    ],
    "actions": []
  }
  $$::jsonb,
  true,
  timezone('utc', now())
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  table_name = excluded.table_name,
  schema = excluded.schema,
  enabled = true,
  updated_at = timezone('utc', now());
